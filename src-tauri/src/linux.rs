//! Linux platform backend.
//!
//! Mirrors the API surface of the `macos` module in `lib.rs` so the Tauri
//! command wrappers can dispatch to either platform. Where macOS uses private
//! CoreGraphics/AppKit APIs, this module uses the freedesktop.org equivalents:
//! XDG desktop entries, the icon theme spec, MPRIS over D-Bus, sysfs, and
//! NetworkManager. Features that require compositor privileges (window
//! enumeration, raising, thumbnails) work on X11 and are reported as
//! unavailable on Wayland, where no unprivileged protocol exists for them.
#![allow(dead_code)]

use base64::Engine;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

use crate::{
    BatteryInfo, MusicInfo, RunningApp, ScreenInfo, SpaceInfo, TerminalApp, WindowDetails,
};

// --- Small utilities ---

/// Look a binary up on PATH without shelling out.
fn tool(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
}

fn has_tool(name: &str) -> bool {
    tool(name).is_some()
}

/// Whether the app's own windows are Wayland surfaces.
///
/// `XDG_SESSION_TYPE` describes the session, not this process: under XWayland
/// the session is still "wayland" while X11 positioning, struts and window
/// management all work. The GDK backend is what decides, so it wins here.
fn is_wayland() -> bool {
    if let Ok(backend) = std::env::var("GDK_BACKEND") {
        let backend = backend.to_lowercase();
        if backend.split(',').any(|b| b.trim() == "x11") {
            return false;
        }
        if backend.split(',').any(|b| b.trim() == "wayland") {
            return true;
        }
    }
    std::env::var("XDG_SESSION_TYPE")
        .map(|t| t.eq_ignore_ascii_case("wayland"))
        .unwrap_or(false)
}

/// Run a command and return stdout, or an error string built from stderr.
fn output_of(program: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new(program)
        .args(args)
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("{program}: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if err.is_empty() {
            format!("{program} exited with {}", out.status)
        } else {
            err
        })
    }
}

fn run_detached(program: &str, args: &[&str]) -> Result<(), String> {
    Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("{program}: {e}"))
}

const WAYLAND_WINDOW_HINT: &str =
    "Window control needs an X11 session, or a GNOME Shell extension on Wayland.";

// --- Desktop entries (the Linux stand-in for macOS app bundles) ---

#[derive(Debug, Clone)]
pub struct DesktopEntry {
    /// Desktop file ID without the extension, e.g. `org.gnome.Nautilus`.
    /// Used wherever macOS uses a bundle identifier.
    pub id: String,
    pub name: String,
    pub exec: String,
    pub icon: Option<String>,
    pub path: PathBuf,
    pub no_display: bool,
    pub terminal: bool,
    pub startup_wm_class: Option<String>,
    pub categories: Vec<String>,
}

impl DesktopEntry {
    /// The bare executable name from Exec=, with field codes and env prefixes
    /// stripped. This is what we match against /proc to find running apps.
    pub fn exec_binary(&self) -> Option<String> {
        for token in self.exec.split_whitespace() {
            if token.starts_with('%') || token.contains('=') {
                continue;
            }
            let token = token.trim_matches('"');
            if token == "env" || token == "sh" || token == "bash" || token == "-c" {
                continue;
            }
            let base = Path::new(token).file_name()?.to_string_lossy().to_string();
            if !base.is_empty() {
                return Some(base);
            }
        }
        None
    }

    /// Exec= with field codes (%U, %f, …) removed, ready to spawn.
    pub fn exec_command(&self) -> Vec<String> {
        self.exec
            .split_whitespace()
            .filter(|t| !t.starts_with('%'))
            .map(|t| t.trim_matches('"').to_string())
            .collect()
    }
}

fn xdg_application_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(data_home) = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from) {
        dirs.push(data_home.join("applications"));
    } else if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".local/share/applications"));
    }
    let data_dirs = std::env::var("XDG_DATA_DIRS")
        .unwrap_or_else(|_| "/usr/local/share:/usr/share".to_string());
    for dir in data_dirs.split(':').filter(|d| !d.is_empty()) {
        dirs.push(PathBuf::from(dir).join("applications"));
    }
    // Flatpak exports, which are not always in XDG_DATA_DIRS for a non-login shell.
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".local/share/flatpak/exports/share/applications"));
    }
    dirs.push(PathBuf::from("/var/lib/flatpak/exports/share/applications"));
    dirs.push(PathBuf::from("/var/lib/snapd/desktop/applications"));
    dirs
}

/// Parse the `[Desktop Entry]` group of a .desktop file.
fn parse_desktop_file(path: &Path) -> Option<DesktopEntry> {
    let text = std::fs::read_to_string(path).ok()?;
    let mut in_entry = false;
    let mut fields: HashMap<String, String> = HashMap::new();

    for raw in text.lines() {
        let line = raw.trim();
        if line.starts_with('[') {
            in_entry = line == "[Desktop Entry]";
            continue;
        }
        if !in_entry || line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim();
            // Skip localised variants such as Name[de]; the C locale value wins.
            if key.contains('[') {
                continue;
            }
            fields.insert(key.to_string(), value.trim().to_string());
        }
    }

    if fields.get("Type").map(|t| t != "Application").unwrap_or(false) {
        return None;
    }
    let exec = fields.get("Exec")?.clone();
    let id = path.file_stem()?.to_string_lossy().to_string();
    let name = fields.get("Name").cloned().unwrap_or_else(|| id.clone());

    // Honour TryExec: entries whose binary is absent are not installed.
    if let Some(try_exec) = fields.get("TryExec") {
        let present = if try_exec.contains('/') {
            Path::new(try_exec).is_file()
        } else {
            has_tool(try_exec)
        };
        if !present {
            return None;
        }
    }

    let truthy = |key: &str| {
        fields
            .get(key)
            .map(|v| v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
    };

    Some(DesktopEntry {
        id,
        name,
        exec,
        icon: fields.get("Icon").cloned(),
        path: path.to_path_buf(),
        no_display: truthy("NoDisplay") || truthy("Hidden"),
        terminal: truthy("Terminal"),
        startup_wm_class: fields.get("StartupWMClass").cloned(),
        categories: fields
            .get("Categories")
            .map(|c| {
                c.split(';')
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default(),
    })
}

/// All installed desktop entries, earlier XDG dirs shadowing later ones.
pub fn desktop_entries() -> Vec<DesktopEntry> {
    let mut by_id: HashMap<String, DesktopEntry> = HashMap::new();
    for dir in xdg_application_dirs() {
        let Ok(read) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in read.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("desktop") {
                continue;
            }
            if let Some(parsed) = parse_desktop_file(&path) {
                by_id.entry(parsed.id.clone()).or_insert(parsed);
            }
        }
    }
    let mut entries: Vec<DesktopEntry> = by_id.into_values().collect();
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    entries
}

fn entry_by_id(id: &str) -> Option<DesktopEntry> {
    let id = id.trim_end_matches(".desktop");
    desktop_entries().into_iter().find(|e| e.id == id)
}

// --- Icon theme resolution ---

fn icon_theme_name() -> String {
    output_of(
        "gsettings",
        &["get", "org.gnome.desktop.interface", "icon-theme"],
    )
    .ok()
    .map(|s| s.trim().trim_matches('\'').to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| "Adwaita".to_string())
}

fn icon_search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".icons"));
        roots.push(home.join(".local/share/icons"));
    }
    let data_dirs = std::env::var("XDG_DATA_DIRS")
        .unwrap_or_else(|_| "/usr/local/share:/usr/share".to_string());
    for dir in data_dirs.split(':').filter(|d| !d.is_empty()) {
        roots.push(PathBuf::from(dir).join("icons"));
    }
    roots.push(PathBuf::from("/usr/share/icons"));
    roots.push(PathBuf::from("/var/lib/flatpak/exports/share/icons"));
    roots
}

/// Resolve an Icon= value to a file, preferring large raster sizes then SVG.
fn find_icon_file(icon: &str) -> Option<PathBuf> {
    if icon.contains('/') {
        let direct = PathBuf::from(icon);
        return direct.is_file().then_some(direct);
    }

    let themes = [icon_theme_name(), "Adwaita".to_string(), "hicolor".to_string()];
    // Prefer sizes a dock actually displays, biggest first.
    let sizes = [
        "256x256", "scalable", "192x192", "128x128", "96x96", "64x64", "512x512", "48x48",
        "32x32",
    ];
    let exts = ["png", "svg", "xpm"];

    for root in icon_search_roots() {
        for theme in &themes {
            for size in sizes {
                for category in ["apps", "devices", "places", "mimetypes"] {
                    for ext in exts {
                        let candidate = root
                            .join(theme)
                            .join(size)
                            .join(category)
                            .join(format!("{icon}.{ext}"));
                        if candidate.is_file() {
                            return Some(candidate);
                        }
                    }
                }
            }
        }
    }

    // Flat legacy locations.
    for dir in ["/usr/share/pixmaps", "/usr/share/icons"] {
        for ext in exts {
            let candidate = PathBuf::from(dir).join(format!("{icon}.{ext}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn icon_file_to_data_uri(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    // Cap at a few MB so a pathological icon cannot stall the IPC channel.
    if bytes.len() > 4 * 1024 * 1024 {
        return None;
    }
    let mime = match path.extension().and_then(|e| e.to_str()) {
        Some("svg") => "image/svg+xml",
        Some("xpm") => "image/x-xpixmap",
        _ => "image/png",
    };
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{mime};base64,{encoded}"))
}

/// Icon for an app, addressed by desktop ID (the macOS bundle-ID analogue).
pub fn get_app_icon_base64(bundle_id: &str) -> Option<String> {
    let entry = entry_by_id(bundle_id)?;
    let icon = entry.icon.as_deref().unwrap_or(&entry.id);
    let file = find_icon_file(icon)?;
    icon_file_to_data_uri(&file)
}

/// Icon for an arbitrary filesystem path, via its MIME type.
pub fn get_path_icon_base64(path: &str) -> Option<String> {
    let p = Path::new(path);
    if p.extension().and_then(|e| e.to_str()) == Some("desktop") {
        if let Some(entry) = parse_desktop_file(p) {
            if let Some(icon) = entry.icon.as_deref() {
                if let Some(file) = find_icon_file(icon) {
                    return icon_file_to_data_uri(&file);
                }
            }
        }
    }

    if p.is_dir() {
        return find_icon_file("folder").and_then(|f| icon_file_to_data_uri(&f));
    }

    // Ask shared-mime-info for the type, then map it to a themed icon name.
    if let Ok(mime) = output_of("gio", &["info", "-a", "standard::content-type", path]) {
        if let Some(line) = mime.lines().find(|l| l.contains("content-type:")) {
            if let Some((_, value)) = line.split_once("content-type:") {
                let mime = value.trim();
                let themed = mime.replace('/', "-");
                if let Some(file) = find_icon_file(&themed) {
                    return icon_file_to_data_uri(&file);
                }
                if let Some((major, _)) = mime.split_once('/') {
                    if let Some(file) = find_icon_file(&format!("{major}-x-generic")) {
                        return icon_file_to_data_uri(&file);
                    }
                }
            }
        }
    }
    find_icon_file("text-x-generic").and_then(|f| icon_file_to_data_uri(&f))
}

// --- Processes and running apps ---

/// (pid, comm, cmdline-first-token) for every readable process.
fn process_table() -> Vec<(i32, String, String)> {
    let mut rows = Vec::new();
    let Ok(read) = std::fs::read_dir("/proc") else {
        return rows;
    };
    for entry in read.flatten() {
        let name = entry.file_name();
        let Some(pid) = name.to_str().and_then(|n| n.parse::<i32>().ok()) else {
            continue;
        };
        let dir = entry.path();
        let comm = std::fs::read_to_string(dir.join("comm"))
            .map(|c| c.trim().to_string())
            .unwrap_or_default();
        let cmdline = std::fs::read(dir.join("cmdline")).unwrap_or_default();
        let first = cmdline
            .split(|b| *b == 0)
            .next()
            .map(|b| String::from_utf8_lossy(b).to_string())
            .unwrap_or_default();
        let first = Path::new(&first)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or(first);
        if comm.is_empty() && first.is_empty() {
            continue;
        }
        rows.push((pid, comm, first));
    }
    rows
}

/// PIDs belonging to an app, matched by desktop-entry executable.
fn pids_for_entry(entry: &DesktopEntry) -> Vec<i32> {
    let Some(binary) = entry.exec_binary() else {
        return Vec::new();
    };
    // /proc/<pid>/comm is truncated to 15 bytes, so compare on that prefix too.
    let truncated: String = binary.chars().take(15).collect();
    process_table()
        .into_iter()
        .filter(|(_, comm, argv0)| {
            *comm == binary || *comm == truncated || *argv0 == binary
        })
        .map(|(pid, _, _)| pid)
        .collect()
}

/// X11 only: WM_CLASS of the focused window, used to flag the active app.
fn active_wm_class() -> Option<String> {
    if is_wayland() || !has_tool("xprop") {
        return None;
    }
    let root = output_of("xprop", &["-root", "_NET_ACTIVE_WINDOW"]).ok()?;
    let id = root.split("# ").nth(1)?.trim().split(',').next()?.trim().to_string();
    if id.is_empty() || id == "0x0" {
        return None;
    }
    let props = output_of("xprop", &["-id", &id, "WM_CLASS"]).ok()?;
    let class = props.split('=').nth(1)?.trim();
    class
        .split(',')
        .last()
        .map(|c| c.trim().trim_matches('"').to_lowercase())
}

pub fn get_running_apps() -> Vec<RunningApp> {
    let table = process_table();
    let active = active_wm_class();
    let mut apps: Vec<RunningApp> = Vec::new();

    for entry in desktop_entries() {
        if entry.no_display || entry.terminal {
            continue;
        }
        let Some(binary) = entry.exec_binary() else {
            continue;
        };
        let truncated: String = binary.chars().take(15).collect();
        let pid = table
            .iter()
            .find(|(_, comm, argv0)| *comm == binary || *comm == truncated || *argv0 == binary)
            .map(|(pid, _, _)| *pid);
        let Some(pid) = pid else { continue };

        let wm_class = entry
            .startup_wm_class
            .clone()
            .unwrap_or_else(|| entry.id.clone())
            .to_lowercase();
        let is_active = active
            .as_deref()
            .map(|a| a == wm_class || wm_class.ends_with(a) || a.ends_with(&wm_class))
            .unwrap_or(false);

        apps.push(RunningApp {
            name: entry.name.clone(),
            bundle_id: entry.id.clone(),
            pid,
            is_active,
        });
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

pub fn get_bundle_id_for_pid(pid: i32) -> Option<String> {
    let comm = std::fs::read_to_string(format!("/proc/{pid}/comm"))
        .ok()?
        .trim()
        .to_string();
    desktop_entries()
        .into_iter()
        .find(|e| {
            e.exec_binary()
                .map(|b| b == comm || b.chars().take(15).collect::<String>() == comm)
                .unwrap_or(false)
        })
        .map(|e| e.id)
}

// --- Launching and app control ---

pub fn launch_app(path: &str) -> Result<(), String> {
    // Accept a desktop ID, a .desktop path, or a plain executable/file path.
    if let Some(entry) = entry_by_id(path) {
        return launch_entry(&entry);
    }
    let p = Path::new(path);
    if p.extension().and_then(|e| e.to_str()) == Some("desktop") {
        if let Some(entry) = parse_desktop_file(p) {
            return launch_entry(&entry);
        }
    }
    if p.is_file() || p.is_dir() {
        if has_tool("gio") {
            return run_detached("gio", &["open", path]);
        }
        return run_detached("xdg-open", &[path]);
    }
    run_detached(path, &[])
}

fn launch_entry(entry: &DesktopEntry) -> Result<(), String> {
    // gio honours the full desktop-entry contract (Terminal=, DBusActivatable,
    // startup notification), so prefer it over spawning Exec= ourselves.
    if has_tool("gio") {
        let path = entry.path.to_string_lossy().to_string();
        if run_detached("gio", &["launch", &path]).is_ok() {
            return Ok(());
        }
    }
    let argv = entry.exec_command();
    let (program, args) = argv
        .split_first()
        .ok_or_else(|| format!("{} has no runnable Exec= line", entry.id))?;
    let args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_detached(program, &args)
}

/// X11 window IDs for an app, via its WM_CLASS.
fn x11_windows_for_class(wm_class: &str) -> Vec<String> {
    if is_wayland() || !has_tool("wmctrl") {
        return Vec::new();
    }
    let Ok(list) = output_of("wmctrl", &["-lx"]) else {
        return Vec::new();
    };
    let needle = wm_class.to_lowercase();
    list.lines()
        .filter(|line| {
            line.split_whitespace()
                .nth(2)
                .map(|class| {
                    let class = class.to_lowercase();
                    class.contains(&needle) || needle.contains(class.split('.').last().unwrap_or(""))
                })
                .unwrap_or(false)
        })
        .filter_map(|line| line.split_whitespace().next().map(|s| s.to_string()))
        .collect()
}

fn wm_class_for(bundle_id: &str) -> String {
    entry_by_id(bundle_id)
        .and_then(|e| e.startup_wm_class.clone().or_else(|| e.exec_binary()))
        .unwrap_or_else(|| bundle_id.to_string())
}

pub fn focus_app(bundle_id: &str) -> Result<(), String> {
    let class = wm_class_for(bundle_id);
    if !is_wayland() && has_tool("wmctrl") {
        for id in x11_windows_for_class(&class) {
            if output_of("wmctrl", &["-ia", &id]).is_ok() {
                return Ok(());
            }
        }
    }
    // Re-activating via the desktop entry is the only portable path: on Wayland
    // the compositor decides, and GTK/Qt apps raise their existing window.
    if let Some(entry) = entry_by_id(bundle_id) {
        return launch_entry(&entry);
    }
    Err(format!("Could not focus {bundle_id}. {WAYLAND_WINDOW_HINT}"))
}

pub fn hide_app(bundle_id: &str) -> Result<(), String> {
    if is_wayland() {
        return Err(format!("Hiding windows is unavailable. {WAYLAND_WINDOW_HINT}"));
    }
    if !has_tool("xdotool") {
        return Err("Hiding windows needs xdotool installed.".into());
    }
    let class = wm_class_for(bundle_id);
    let ids = x11_windows_for_class(&class);
    if ids.is_empty() {
        return Err(format!("No windows found for {bundle_id}."));
    }
    for id in ids {
        let _ = output_of("xdotool", &["windowminimize", &id]);
    }
    Ok(())
}

pub fn quit_app(bundle_id: &str) -> Result<(), String> {
    let entry = entry_by_id(bundle_id).ok_or_else(|| format!("Unknown app {bundle_id}"))?;
    let pids = pids_for_entry(&entry);
    if pids.is_empty() {
        return Err(format!("{} is not running.", entry.name));
    }
    // Ask politely: SIGTERM lets the toolkit run its normal shutdown path.
    for pid in pids {
        unsafe {
            libc_kill(pid, 15);
        }
    }
    Ok(())
}

// SIGTERM without pulling in the libc crate for one call.
unsafe extern "C" {
    #[link_name = "kill"]
    fn libc_kill(pid: i32, sig: i32) -> i32;
}

pub fn zoom_app_window(bundle_id: &str) -> Result<(), String> {
    if is_wayland() {
        return Err(format!("Maximizing windows is unavailable. {WAYLAND_WINDOW_HINT}"));
    }
    if !has_tool("wmctrl") {
        return Err("Maximizing windows needs wmctrl installed.".into());
    }
    let class = wm_class_for(bundle_id);
    let ids = x11_windows_for_class(&class);
    if ids.is_empty() {
        return Err(format!("No windows found for {bundle_id}."));
    }
    for id in ids {
        let _ = output_of("wmctrl", &["-ir", &id, "-b", "toggle,maximized_vert,maximized_horz"]);
    }
    Ok(())
}

// --- Terminals ---

/// How to hand a shell command to each known terminal emulator.
fn terminal_exec_flag(id: &str) -> &'static str {
    match id {
        // These take everything after the flag as the command line.
        "org.gnome.Terminal" | "org.gnome.Console" | "kgx" | "org.gnome.Ptyxis"
        | "ptyxis" | "com.raggesilver.BlackBox" | "org.wezfurlong.wezterm" => "--",
        // Classic -e single-argument form.
        "konsole" | "org.kde.konsole" | "xterm" | "uxterm" | "lxterminal"
        | "mate-terminal" | "io.elementary.terminal" | "qterminal" => "-e",
        // xfce4-terminal uses -x for "execute the rest".
        "xfce4-terminal" => "-x",
        // Alacritty, kitty, foot, urxvt: -e then argv.
        "Alacritty" | "alacritty" | "kitty" | "foot" | "footclient" | "urxvt"
        | "rxvt-unicode" => "-e",
        _ => "-e",
    }
}

const KNOWN_TERMINALS: &[&str] = &[
    "org.gnome.Terminal",
    "org.gnome.Console",
    "kgx",
    "org.gnome.Ptyxis",
    "ptyxis",
    "konsole",
    "org.kde.konsole",
    "xfce4-terminal",
    "lxterminal",
    "mate-terminal",
    "io.elementary.terminal",
    "qterminal",
    "Alacritty",
    "alacritty",
    "kitty",
    "foot",
    "footclient",
    "org.wezfurlong.wezterm",
    "com.raggesilver.BlackBox",
    "xterm",
    "uxterm",
    "urxvt",
    "rxvt-unicode",
    "com.mitchellh.ghostty",
    "ghostty",
];

pub fn get_installed_terminals() -> Vec<TerminalApp> {
    let mut terminals: Vec<TerminalApp> = desktop_entries()
        .into_iter()
        .filter(|e| {
            KNOWN_TERMINALS.contains(&e.id.as_str())
                || e.categories.iter().any(|c| c == "TerminalEmulator")
        })
        .map(|e| {
            let icon = e
                .icon
                .as_deref()
                .and_then(find_icon_file)
                .and_then(|f| icon_file_to_data_uri(&f));
            TerminalApp {
                name: e.name.clone(),
                bundle_id: e.id.clone(),
                icon,
            }
        })
        .collect();
    terminals.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    terminals.dedup_by(|a, b| a.bundle_id == b.bundle_id);
    terminals
}

pub fn execute_terminal_command(bundle_id: &str, command: &str) -> Result<(), String> {
    let entry = entry_by_id(bundle_id)
        .ok_or_else(|| format!("Terminal {bundle_id} is not installed."))?;
    let argv = entry.exec_command();
    let (program, base_args) = argv
        .split_first()
        .ok_or_else(|| format!("{} has no runnable Exec= line", entry.id))?;

    let flag = terminal_exec_flag(&entry.id);
    let mut args: Vec<String> = base_args.to_vec();
    args.push(flag.to_string());

    // Keep the shell alive after the command so output stays readable, matching
    // the macOS behaviour of running inside an interactive terminal tab.
    let script = format!("{command}; exec ${{SHELL:-/bin/bash}}");
    if flag == "-e" || flag == "-x" {
        // Single-argument forms want one string.
        args.push(format!("{} -lc {}", shell_path(), shell_quote(&script)));
    } else {
        args.push(shell_path());
        args.push("-lc".to_string());
        args.push(script);
    }

    let args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_detached(program, &args)
}

fn shell_path() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

// --- Simulators ---

pub fn launch_simulator(simulator_type: &str) -> Result<(), String> {
    match simulator_type.to_lowercase().as_str() {
        "android" => {
            let emulator = android_emulator_binary()
                .ok_or_else(|| "Android emulator not found. Install Android Studio or set ANDROID_HOME.".to_string())?;
            let list = Command::new(&emulator)
                .arg("-list-avds")
                .output()
                .map_err(|e| format!("emulator: {e}"))?;
            let avds = String::from_utf8_lossy(&list.stdout);
            let avd = avds
                .lines()
                .map(|l| l.trim())
                .find(|l| !l.is_empty())
                .ok_or_else(|| "No Android virtual devices are configured.".to_string())?;
            Command::new(&emulator)
                .args(["-avd", avd])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("emulator: {e}"))
        }
        "ios" | "ipados" | "watchos" | "tvos" => Err(format!(
            "{simulator_type} simulators require Xcode and are only available on macOS."
        )),
        "windows" => Err("Windows simulators are not available on Linux.".into()),
        other => Err(format!("Unknown simulator type: {other}")),
    }
}

fn android_emulator_binary() -> Option<PathBuf> {
    if let Some(found) = tool("emulator") {
        return Some(found);
    }
    let roots = ["ANDROID_HOME", "ANDROID_SDK_ROOT"]
        .iter()
        .filter_map(|k| std::env::var_os(k).map(PathBuf::from))
        .chain(dirs::home_dir().map(|h| h.join("Android/Sdk")))
        .chain(dirs::home_dir().map(|h| h.join(".local/share/Android/Sdk")));
    for root in roots {
        let candidate = root.join("emulator/emulator");
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

// --- Windows, thumbnails, workspaces ---

pub fn get_on_screen_windows() -> Vec<WindowDetails> {
    if is_wayland() || !has_tool("wmctrl") {
        // No unprivileged window list exists on Wayland: GNOME's
        // org.gnome.Shell.Introspect.GetWindows denies non-allowlisted callers.
        return Vec::new();
    }
    let Ok(list) = output_of("wmctrl", &["-lpx"]) else {
        return Vec::new();
    };
    list.lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let id_hex = parts.next()?;
            let _desktop = parts.next()?;
            let pid: i32 = parts.next()?.parse().ok()?;
            let class = parts.next()?;
            // Remaining fields: host then the title, which may contain spaces.
            let rest: Vec<&str> = parts.collect();
            let title = if rest.len() > 1 {
                rest[1..].join(" ")
            } else {
                rest.first().map(|s| s.to_string()).unwrap_or_default()
            };
            let id = u32::from_str_radix(id_hex.trim_start_matches("0x"), 16).ok()?;
            let owner = class.split('.').last().unwrap_or(class).to_string();
            Some(WindowDetails {
                id,
                title,
                pid,
                owner_name: owner,
                bundle_id: get_bundle_id_for_pid(pid).unwrap_or_else(|| class.to_string()),
            })
        })
        .collect()
}

pub fn focus_window(pid: i32, title: &str) -> Result<(), String> {
    if is_wayland() {
        return Err(format!("Focusing a window is unavailable. {WAYLAND_WINDOW_HINT}"));
    }
    if !has_tool("wmctrl") {
        return Err("Focusing a window needs wmctrl installed.".into());
    }
    let target = get_on_screen_windows()
        .into_iter()
        .find(|w| w.pid == pid && w.title == title)
        .or_else(|| get_on_screen_windows().into_iter().find(|w| w.pid == pid))
        .ok_or_else(|| format!("No window found for pid {pid}."))?;
    let id = format!("0x{:08x}", target.id);
    output_of("wmctrl", &["-ia", &id]).map(|_| ())
}

/// Window thumbnails need a screen-capture path. On Wayland that means the
/// xdg-desktop-portal ScreenCast API with an interactive consent prompt per
/// frame, which is unusable for hover previews, so previews stay off on Linux.
pub fn get_window_thumbnail(_pid: i32) -> Option<crate::WindowThumbnail> {
    None
}

pub fn get_window_id_thumbnail(_window_id: u32) -> Option<crate::WindowThumbnail> {
    None
}

pub fn get_spaces() -> Vec<SpaceInfo> {
    // X11: the EWMH desktop list is authoritative.
    if !is_wayland() && has_tool("wmctrl") {
        if let Ok(list) = output_of("wmctrl", &["-d"]) {
            let spaces: Vec<SpaceInfo> = list
                .lines()
                .filter_map(|line| {
                    let mut parts = line.split_whitespace();
                    let id: u32 = parts.next()?.parse().ok()?;
                    let current = parts.next()? == "*";
                    Some(SpaceInfo {
                        id: id + 1,
                        name: format!("{}", id + 1),
                        is_current: current,
                    })
                })
                .collect();
            if !spaces.is_empty() {
                return spaces;
            }
        }
    }

    // Wayland/GNOME: the workspace count is readable from settings even though
    // the active index is not exposed to unprivileged clients.
    let dynamic = output_of(
        "gsettings",
        &["get", "org.gnome.mutter", "dynamic-workspaces"],
    )
    .map(|v| v.trim() == "true")
    .unwrap_or(false);
    let count = if dynamic {
        0
    } else {
        output_of(
            "gsettings",
            &["get", "org.gnome.desktop.wm.preferences", "num-workspaces"],
        )
        .ok()
        .and_then(|v| v.trim().parse::<u32>().ok())
        .unwrap_or(0)
    };
    (1..=count)
        .map(|i| SpaceInfo {
            id: i,
            name: format!("{i}"),
            is_current: false,
        })
        .collect()
}

pub fn switch_to_space(space_id: u32) -> Result<(), String> {
    if !is_wayland() && has_tool("wmctrl") {
        let index = space_id.saturating_sub(1).to_string();
        return output_of("wmctrl", &["-s", &index]).map(|_| ());
    }
    Err(format!(
        "Switching workspaces is unavailable. {WAYLAND_WINDOW_HINT}"
    ))
}

// --- Screen geometry and bar window behaviour ---

/// `physical` is the primary monitor's pixel size as the toolkit reports it,
/// which is authoritative; the sysfs/xrandr probe is only a fallback for when
/// no window exists yet.
pub fn get_screen_info(scale: f64, physical: Option<(f64, f64)>) -> ScreenInfo {
    let (width, height) = physical
        .filter(|(w, h)| *w > 0.0 && *h > 0.0)
        .or_else(primary_resolution)
        .unwrap_or((1920.0, 1080.0));
    ScreenInfo {
        width: width / if scale > 0.0 { scale } else { 1.0 },
        height: height / if scale > 0.0 { scale } else { 1.0 },
        scale_factor: if scale > 0.0 { scale } else { 1.0 },
        // Linux has no fixed system menu bar, and the "dock" is whatever panel
        // the desktop runs; both are zero so the bar can use the full edge.
        menu_bar_height: 0.0,
        dock_height: 0.0,
    }
}

fn primary_resolution() -> Option<(f64, f64)> {
    if !is_wayland() {
        // xdotool asks the X server directly and is already a recommended
        // dependency; under XWayland this is the scaled screen size, which is
        // the coordinate space struts and window positions use.
        if has_tool("xdotool") {
            if let Ok(out) = output_of("xdotool", &["getdisplaygeometry"]) {
                let mut parts = out.split_whitespace();
                if let (Some(w), Some(h)) = (parts.next(), parts.next()) {
                    if let (Ok(w), Ok(h)) = (w.parse::<f64>(), h.parse::<f64>()) {
                        if w > 0.0 && h > 0.0 {
                            return Some((w, h));
                        }
                    }
                }
            }
        }
    }
    if !is_wayland() && has_tool("xrandr") {
        if let Ok(out) = output_of("xrandr", &["--current"]) {
            // The line for a connected output carries its current mode as WxH+X+Y.
            let re = regex::Regex::new(r"\bconnected\b.*?(\d{3,5})x(\d{3,5})\+").ok()?;
            let mut best: Option<(f64, f64)> = None;
            for line in out.lines() {
                if let Some(caps) = re.captures(line) {
                    let w: f64 = caps[1].parse().ok()?;
                    let h: f64 = caps[2].parse().ok()?;
                    let primary = line.contains(" primary");
                    if primary {
                        return Some((w, h));
                    }
                    if best.map(|(bw, bh)| w * h > bw * bh).unwrap_or(true) {
                        best = Some((w, h));
                    }
                }
            }
            if best.is_some() {
                return best;
            }
        }
    }

    // Wayland has no client-visible output list, so read the modes the kernel
    // reports. The largest enabled connector is the real panel: a MacBook's
    // Touch Bar shows up here too, as a tiny DSI output.
    let mut best: Option<(f64, f64)> = None;
    let entries = std::fs::read_dir("/sys/class/drm").ok()?;
    for entry in entries.flatten() {
        let dir = entry.path();
        let enabled = std::fs::read_to_string(dir.join("enabled"))
            .map(|v| v.trim() == "enabled")
            .unwrap_or(false);
        if !enabled {
            continue;
        }
        let modes = std::fs::read_to_string(dir.join("modes")).unwrap_or_default();
        let Some(first) = modes.lines().next() else { continue };
        let Some((w, h)) = first.trim().split_once('x') else { continue };
        let (Ok(w), Ok(h)) = (w.parse::<f64>(), h.parse::<f64>()) else { continue };
        // Ignore implausibly narrow strips such as the Touch Bar panel.
        if w < 640.0 || h < 480.0 {
            continue;
        }
        if best.map(|(bw, bh)| w * h > bw * bh).unwrap_or(true) {
            best = Some((w, h));
        }
    }
    best
}

/// macOS maps this onto NSWindow levels; the X11/Wayland equivalent available
/// to a toolkit window is the always-on-top hint.
pub fn set_window_level<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    level: &str,
) -> Result<(), String> {
    let on_top = !matches!(level, "normal" | "below" | "desktop");
    window.set_always_on_top(on_top).map_err(|e| e.to_string())
}

static RESERVED_STRUT: Mutex<Option<String>> = Mutex::new(None);

/// Reserve screen edge space so maximized windows do not cover the bar.
///
/// X11 has a standard for this: `_NET_WM_STRUT_PARTIAL` (EWMH), which is what
/// every Linux panel uses and what macOS's private `CGSSetScreenInsets` is the
/// analogue of. Wayland has no equivalent a regular client may use; only
/// `wlr-layer-shell` can reserve space, and GNOME's Mutter does not implement
/// it, so on GNOME Wayland the bar floats above windows instead.
pub fn set_screen_inset(position: &str, bar_size: f64, _menu_bar_height: f64) {
    if is_wayland() {
        eprintln!(
            "[betterbar] Screen-space reservation is unavailable on Wayland \
             (no layer-shell in Mutter); the bar will overlap maximized windows."
        );
        return;
    }
    let Some(window_id) = own_x11_window_id() else {
        eprintln!("[betterbar] Could not find own X11 window; skipping strut.");
        return;
    };
    let (screen_w, screen_h) = primary_resolution().unwrap_or((1920.0, 1080.0));
    let size = bar_size.max(0.0).round() as i64;

    // left, right, top, bottom, then the start/end extent of each edge.
    let strut = match position {
        "top" => format!("0,0,{size},0,0,0,0,0,0,{},0,0", screen_w as i64),
        "bottom" => format!("0,0,0,{size},0,0,0,0,0,0,0,{}", screen_w as i64),
        "left" => format!("{size},0,0,0,0,{},0,0,0,0,0,0", screen_h as i64),
        "right" => format!("0,{size},0,0,0,0,0,{},0,0,0,0", screen_h as i64),
        _ => return,
    };

    if !has_tool("xprop") {
        eprintln!("[betterbar] xprop is not installed; cannot reserve screen space.");
        return;
    }
    let _ = output_of(
        "xprop",
        &[
            "-id",
            &window_id,
            "-f",
            "_NET_WM_STRUT_PARTIAL",
            "32c",
            "-set",
            "_NET_WM_STRUT_PARTIAL",
            &strut,
        ],
    );
    // Older window managers only read the 4-value form.
    let legacy: Vec<&str> = strut.split(',').take(4).collect();
    let _ = output_of(
        "xprop",
        &[
            "-id",
            &window_id,
            "-f",
            "_NET_WM_STRUT",
            "32c",
            "-set",
            "_NET_WM_STRUT",
            &legacy.join(","),
        ],
    );
    *RESERVED_STRUT.lock().unwrap() = Some(window_id);
}

pub fn clear_screen_insets() {
    let id = RESERVED_STRUT.lock().unwrap().clone().or_else(own_x11_window_id);
    let Some(id) = id else { return };
    if !has_tool("xprop") {
        return;
    }
    let _ = output_of("xprop", &["-id", &id, "-remove", "_NET_WM_STRUT_PARTIAL"]);
    let _ = output_of("xprop", &["-id", &id, "-remove", "_NET_WM_STRUT"]);
    *RESERVED_STRUT.lock().unwrap() = None;
}

/// Pick the bar window from the candidates a process owns.
///
/// GTK creates more than one X window per process — alongside the bar there is
/// a small hidden helper window — so matching on PID alone can land on the
/// wrong one and the strut is then written somewhere the window manager
/// ignores. The bar is always the largest.
fn largest_window(candidates: &[(u64, u64, u64)]) -> Option<u64> {
    candidates
        .iter()
        .filter(|(_, w, h)| *w > 1 && *h > 1)
        .max_by_key(|(_, w, h)| w * h)
        .map(|(id, _, _)| *id)
}

fn parse_geometry(output: &str) -> Option<(u64, u64)> {
    let line = output.lines().find(|l| l.trim_start().starts_with("Geometry:"))?;
    let value = line.split(':').nth(1)?.trim();
    let (w, h) = value.split_once('x')?;
    Some((w.trim().parse().ok()?, h.trim().parse().ok()?))
}

/// Find our own bar window on X11 by matching this process's PID.
fn own_x11_window_id() -> Option<String> {
    if is_wayland() {
        return None;
    }
    let pid = std::process::id().to_string();

    if has_tool("xdotool") {
        if let Ok(out) = output_of("xdotool", &["search", "--onlyvisible", "--pid", &pid])
            .or_else(|_| output_of("xdotool", &["search", "--pid", &pid]))
        {
            let mut candidates = Vec::new();
            for line in out.lines() {
                let Ok(id) = line.trim().parse::<u64>() else {
                    continue;
                };
                let geometry = output_of("xdotool", &["getwindowgeometry", &id.to_string()])
                    .ok()
                    .and_then(|g| parse_geometry(&g));
                if let Some((w, h)) = geometry {
                    candidates.push((id, w, h));
                }
            }
            if let Some(id) = largest_window(&candidates) {
                return Some(format!("0x{id:x}"));
            }
        }
    }

    // wmctrl only lists managed top-level windows, so its first PID match is
    // already the right one.
    if has_tool("wmctrl") {
        if let Ok(list) = output_of("wmctrl", &["-lp"]) {
            for line in list.lines() {
                let mut parts = line.split_whitespace();
                let Some(id) = parts.next() else { continue };
                let _desktop = parts.next();
                if parts.next() == Some(pid.as_str()) {
                    return Some(id.to_string());
                }
            }
        }
    }
    None
}

/// Linux has no TCC-style permission gate for input or window control.
pub fn check_accessibility() -> bool {
    true
}

pub fn request_accessibility() {}

/// Screen capture requires per-session portal consent, so hover previews are
/// reported as unavailable rather than prompting repeatedly.
pub fn check_screen_recording() -> bool {
    false
}

pub fn request_screen_recording() {}

pub fn get_app_bundle_path() -> String {
    std::env::current_exe()
        .map(|p| p.display().to_string())
        .unwrap_or_default()
}

// --- Battery (sysfs, the same source upower reads) ---

pub fn get_battery_info() -> BatteryInfo {
    let unavailable = BatteryInfo {
        percentage: 0.0,
        is_charging: false,
        is_plugged: false,
        available: false,
    };

    let Ok(entries) = std::fs::read_dir("/sys/class/power_supply") else {
        return unavailable;
    };

    let mut battery: Option<PathBuf> = None;
    let mut plugged = false;

    for entry in entries.flatten() {
        let dir = entry.path();
        let kind = std::fs::read_to_string(dir.join("type"))
            .map(|t| t.trim().to_string())
            .unwrap_or_default();
        match kind.as_str() {
            "Battery" if battery.is_none() => battery = Some(dir),
            "Mains" | "USB" | "USB_PD_DRP" | "Wireless" => {
                if std::fs::read_to_string(dir.join("online"))
                    .map(|v| v.trim() == "1")
                    .unwrap_or(false)
                {
                    plugged = true;
                }
            }
            _ => {}
        }
    }

    let Some(battery) = battery else {
        // A desktop with no battery: report plugged-in but unavailable.
        return BatteryInfo {
            is_plugged: plugged,
            ..unavailable
        };
    };

    let read_num = |name: &str| -> Option<f64> {
        std::fs::read_to_string(battery.join(name))
            .ok()?
            .trim()
            .parse::<f64>()
            .ok()
    };

    // capacity is the kernel's own percentage; fall back to charge/energy ratio.
    let percentage = read_num("capacity")
        .or_else(|| {
            let now = read_num("charge_now").or_else(|| read_num("energy_now"))?;
            let full = read_num("charge_full").or_else(|| read_num("energy_full"))?;
            (full > 0.0).then(|| now / full * 100.0)
        })
        .unwrap_or(0.0);

    let status = std::fs::read_to_string(battery.join("status"))
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    BatteryInfo {
        percentage: percentage.clamp(0.0, 100.0) as f32,
        is_charging: status == "Charging",
        is_plugged: plugged || status == "Charging" || status == "Full",
        available: true,
    }
}

// --- Music via MPRIS (the cross-desktop equivalent of AppleScript players) ---

fn mpris_players() -> Vec<String> {
    let Ok(out) = output_of(
        "gdbus",
        &[
            "call",
            "--session",
            "-d",
            "org.freedesktop.DBus",
            "-o",
            "/org/freedesktop/DBus",
            "-m",
            "org.freedesktop.DBus.ListNames",
        ],
    ) else {
        return Vec::new();
    };
    let Ok(re) = regex::Regex::new(r"org\.mpris\.MediaPlayer2\.[A-Za-z0-9._\-]+") else {
        return Vec::new();
    };
    let mut names: Vec<String> = re
        .find_iter(&out)
        .map(|m| m.as_str().to_string())
        .collect();
    names.sort();
    names.dedup();
    // Prefer the players BetterBar surfaces on macOS, then anything else.
    names.sort_by_key(|n| {
        let lower = n.to_lowercase();
        if lower.contains("spotify") {
            0
        } else if lower.contains("music") || lower.contains("rhythmbox") {
            1
        } else {
            2
        }
    });
    names
}

fn mpris_get(player: &str, interface: &str, property: &str) -> Option<String> {
    output_of(
        "gdbus",
        &[
            "call",
            "--session",
            "-d",
            player,
            "-o",
            "/org/mpris/MediaPlayer2",
            "-m",
            "org.freedesktop.DBus.Properties.Get",
            interface,
            property,
        ],
    )
    .ok()
}

fn gvariant_string(raw: &str, key: &str) -> Option<String> {
    // Matches  'xesam:title': <'Song name'>  and the array form for artists.
    let pattern = format!(r"'{}': <\[?'((?:[^'\\]|\\.)*)'", regex::escape(key));
    let re = regex::Regex::new(&pattern).ok()?;
    let caps = re.captures(raw)?;
    Some(caps[1].replace(r"\'", "'").replace(r"\\", r"\"))
}

fn mpris_call(player: &str, method: &str) -> Result<(), String> {
    output_of(
        "gdbus",
        &[
            "call",
            "--session",
            "-d",
            player,
            "-o",
            "/org/mpris/MediaPlayer2",
            "-m",
            &format!("org.mpris.MediaPlayer2.Player.{method}"),
        ],
    )
    .map(|_| ())
}

/// The player we act on: whichever is playing, else the first available.
fn active_player() -> Option<(String, bool)> {
    let players = mpris_players();
    let mut fallback = None;
    for player in players {
        let playing = mpris_get(&player, "org.mpris.MediaPlayer2.Player", "PlaybackStatus")
            .map(|s| s.contains("Playing"))
            .unwrap_or(false);
        if playing {
            return Some((player, true));
        }
        if fallback.is_none() {
            fallback = Some((player, false));
        }
    }
    fallback
}

pub fn get_music_info() -> MusicInfo {
    let unavailable = MusicInfo {
        title: String::new(),
        artist: String::new(),
        album: String::new(),
        is_playing: false,
        app_name: String::new(),
        available: false,
    };

    if !has_tool("gdbus") {
        return unavailable;
    }
    let Some((player, is_playing)) = active_player() else {
        return unavailable;
    };

    let identity = mpris_get(&player, "org.mpris.MediaPlayer2", "Identity")
        .and_then(|raw| {
            regex::Regex::new(r"<'((?:[^'\\]|\\.)*)'>")
                .ok()?
                .captures(&raw)
                .map(|c| c[1].to_string())
        })
        .unwrap_or_else(|| {
            player
                .trim_start_matches("org.mpris.MediaPlayer2.")
                .to_string()
        });

    let metadata = mpris_get(&player, "org.mpris.MediaPlayer2.Player", "Metadata")
        .unwrap_or_default();

    MusicInfo {
        title: gvariant_string(&metadata, "xesam:title").unwrap_or_default(),
        artist: gvariant_string(&metadata, "xesam:artist").unwrap_or_default(),
        album: gvariant_string(&metadata, "xesam:album").unwrap_or_default(),
        is_playing,
        app_name: identity,
        available: true,
    }
}

pub fn music_play_pause() -> Result<(), String> {
    let (player, _) = active_player().ok_or_else(|| "No media player is running.".to_string())?;
    mpris_call(&player, "PlayPause")
}

pub fn music_next() -> Result<(), String> {
    let (player, _) = active_player().ok_or_else(|| "No media player is running.".to_string())?;
    mpris_call(&player, "Next")
}

pub fn music_previous() -> Result<(), String> {
    let (player, _) = active_player().ok_or_else(|| "No media player is running.".to_string())?;
    mpris_call(&player, "Previous")
}

pub fn focus_music_app(app_name: &str) -> Result<(), String> {
    // MPRIS exposes Raise() for exactly this, and it works on Wayland because
    // the player itself asks the compositor to activate its window.
    let players = mpris_players();
    let needle = app_name.to_lowercase();
    let target = players
        .iter()
        .find(|p| p.to_lowercase().contains(&needle))
        .cloned()
        .or_else(|| active_player().map(|(p, _)| p))
        .ok_or_else(|| "No media player is running.".to_string())?;

    output_of(
        "gdbus",
        &[
            "call",
            "--session",
            "-d",
            &target,
            "-o",
            "/org/mpris/MediaPlayer2",
            "-m",
            "org.mpris.MediaPlayer2.Raise",
        ],
    )
    .map(|_| ())
    .or_else(|_| focus_app(&needle))
}

// --- Caffeine (systemd-inhibit, the logind equivalent of `caffeinate`) ---

struct CaffeineState {
    child: Option<std::process::Child>,
    end_time: Option<std::time::Instant>,
}

static CAFFEINE: Mutex<CaffeineState> = Mutex::new(CaffeineState {
    child: None,
    end_time: None,
});

pub fn get_caffeine_status() -> crate::CaffeineStatus {
    let mut state = CAFFEINE.lock().unwrap();
    let Some(child) = state.child.as_mut() else {
        return crate::CaffeineStatus {
            active: false,
            minutes_remaining: None,
        };
    };
    match child.try_wait() {
        Ok(Some(_)) | Err(_) => {
            state.child = None;
            state.end_time = None;
            crate::CaffeineStatus {
                active: false,
                minutes_remaining: None,
            }
        }
        Ok(None) => {
            let minutes_remaining = state.end_time.map(|end| {
                let now = std::time::Instant::now();
                if end > now {
                    (((end - now).as_secs() + 59) / 60) as u32
                } else {
                    0
                }
            });
            crate::CaffeineStatus {
                active: true,
                minutes_remaining,
            }
        }
    }
}

pub fn set_caffeine(
    enabled: bool,
    duration_mins: Option<u32>,
) -> Result<crate::CaffeineStatus, String> {
    {
        let mut state = CAFFEINE.lock().unwrap();
        if let Some(mut child) = state.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        state.end_time = None;
    }

    if !enabled {
        return Ok(crate::CaffeineStatus {
            active: false,
            minutes_remaining: None,
        });
    }
    if !has_tool("systemd-inhibit") {
        return Err("systemd-inhibit is not available on this system.".into());
    }

    // Holding an idle+sleep inhibitor for as long as the child lives mirrors
    // how `caffeinate` behaves on macOS.
    let sleep_arg = duration_mins
        .map(|m| format!("{}", m as u64 * 60))
        .unwrap_or_else(|| "infinity".to_string());

    let child = Command::new("systemd-inhibit")
        .args([
            "--what=idle:sleep",
            "--who=BetterBar",
            "--why=Caffeine enabled in BetterBar",
            "--mode=block",
            "sleep",
            &sleep_arg,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("systemd-inhibit: {e}"))?;

    let mut state = CAFFEINE.lock().unwrap();
    state.child = Some(child);
    state.end_time = duration_mins
        .map(|m| std::time::Instant::now() + std::time::Duration::from_secs(m as u64 * 60));

    Ok(crate::CaffeineStatus {
        active: true,
        minutes_remaining: duration_mins,
    })
}

pub fn toggle_caffeine(duration_mins: Option<u32>) -> Result<crate::CaffeineStatus, String> {
    if get_caffeine_status().active {
        set_caffeine(false, None)
    } else {
        set_caffeine(true, duration_mins)
    }
}

// --- Open at login (XDG autostart) ---

fn autostart_file() -> Option<PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|h| h.join(".config")))?;
    Some(base.join("autostart/betterbar.desktop"))
}

pub fn get_open_on_login() -> Result<bool, String> {
    let path = autostart_file().ok_or_else(|| "No config directory available.".to_string())?;
    if !path.is_file() {
        return Ok(false);
    }
    // Respect a disabled-but-present entry, which is how GNOME Tweaks marks it.
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let disabled = text.lines().any(|l| {
        let l = l.trim();
        l.eq_ignore_ascii_case("Hidden=true") || l.eq_ignore_ascii_case("X-GNOME-Autostart-enabled=false")
    });
    Ok(!disabled)
}

pub fn set_open_on_login(enabled: bool) -> Result<(), String> {
    let path = autostart_file().ok_or_else(|| "No config directory available.".to_string())?;
    if !enabled {
        if path.is_file() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let parent = path.parent().ok_or_else(|| "Bad autostart path".to_string())?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let exe = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .display()
        .to_string();
    let entry = format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=BetterBar\n\
         Comment=Customizable dock\n\
         Exec={exe}\n\
         Icon=betterbar\n\
         Terminal=false\n\
         Categories=Utility;\n\
         X-GNOME-Autostart-enabled=true\n"
    );
    std::fs::write(&path, entry).map_err(|e| e.to_string())
}

// --- Updates ---

fn github_release_json(url: &str) -> Result<serde_json::Value, String> {
    let out = Command::new("curl")
        .args(["-sfL", "-H", "User-Agent: BetterBar-App", url])
        .output()
        .map_err(|e| format!("curl: {e}"))?;
    if !out.status.success() {
        return Err("Failed to query GitHub API".to_string());
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if let Some(msg) = value.get("message").and_then(|m| m.as_str()) {
        if msg.contains("API rate limit") {
            return Err("GitHub API rate limit reached. Please check back later.".to_string());
        }
    }
    Ok(value)
}

/// Pick the asset matching this machine: prefer the native package for the
/// running distro family, then AppImage, then any tarball.
fn linux_asset_url(release: &serde_json::Value) -> Option<String> {
    let assets = release.get("assets")?.as_array()?;
    let arch = if cfg!(target_arch = "aarch64") {
        ["aarch64", "arm64"]
    } else {
        ["x86_64", "amd64"]
    };
    let os_release = std::fs::read_to_string("/etc/os-release").unwrap_or_default();
    let rpm_based = ["fedora", "rhel", "centos", "suse", "opensuse"]
        .iter()
        .any(|d| os_release.to_lowercase().contains(d));

    let preferred: &[&str] = if rpm_based {
        &[".rpm", ".AppImage", ".deb", ".tar.gz"]
    } else {
        &[".deb", ".AppImage", ".rpm", ".tar.gz"]
    };

    for ext in preferred {
        for asset in assets {
            let name = asset.get("name").and_then(|n| n.as_str()).unwrap_or("");
            if !name.ends_with(ext) {
                continue;
            }
            let lower = name.to_lowercase();
            // An arch-tagged asset must match; an untagged one is assumed portable.
            let tagged = ["x86_64", "amd64", "aarch64", "arm64"]
                .iter()
                .any(|a| lower.contains(a));
            if tagged && !arch.iter().any(|a| lower.contains(a)) {
                continue;
            }
            if let Some(url) = asset.get("browser_download_url").and_then(|u| u.as_str()) {
                return Some(url.to_string());
            }
        }
    }
    None
}

fn release_info(release: &serde_json::Value) -> crate::ReleaseInfo {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let tag_name = release
        .get("tag_name")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();
    let remote = tag_name.trim_start_matches('v').trim().to_string();
    let has_update = newer_than(&remote, current_version.trim_start_matches('v').trim());

    crate::ReleaseInfo {
        version: tag_name.clone(),
        name: release
            .get("name")
            .and_then(|t| t.as_str())
            .unwrap_or(&tag_name)
            .to_string(),
        published_at: release
            .get("published_at")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string(),
        body: release
            .get("body")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string(),
        html_url: release
            .get("html_url")
            .and_then(|t| t.as_str())
            .unwrap_or("https://github.com/josmanvis/betterbar/releases")
            .to_string(),
        download_url: linux_asset_url(release),
        has_update,
        current_version,
    }
}

fn newer_than(remote: &str, current: &str) -> bool {
    match (semver::Version::parse(remote), semver::Version::parse(current)) {
        (Ok(r), Ok(c)) => r > c,
        _ => false,
    }
}

pub fn check_for_updates() -> Result<crate::ReleaseInfo, String> {
    let release =
        github_release_json("https://api.github.com/repos/josmanvis/betterbar/releases/latest")?;
    Ok(release_info(&release))
}

pub fn get_release_history() -> Result<Vec<crate::ReleaseInfo>, String> {
    let releases = github_release_json(
        "https://api.github.com/repos/josmanvis/betterbar/releases?per_page=20",
    )?;
    let list = releases
        .as_array()
        .ok_or_else(|| "Unexpected response from GitHub".to_string())?;
    Ok(list.iter().map(release_info).collect())
}

/// Linux installs go through the package manager or the AppImage the user
/// keeps, so hand the download to the desktop rather than swapping files in
/// place under a running binary.
pub fn install_update(download_url: &str) -> Result<(), String> {
    if has_tool("xdg-open") {
        return run_detached("xdg-open", &[download_url]);
    }
    if has_tool("gio") {
        return run_detached("gio", &["open", download_url]);
    }
    Err("No desktop opener available; download the update manually.".into())
}

// --- Desktop appearance preferences ---

/// Accent colour and accessibility preferences from the GNOME/GTK desktop,
/// the Linux counterparts of `NSColor.controlAccentColor` and the
/// `accessibilityDisplayShould*` flags.
pub struct DesktopPreferences {
    pub accent: String,
    pub reduce_transparency: bool,
    pub increase_contrast: bool,
    pub reduce_motion: bool,
    /// "dark", "light", or "default" when the desktop expresses no preference.
    pub color_scheme: String,
}

fn gsetting(schema: &str, key: &str) -> Option<String> {
    output_of("gsettings", &["get", schema, key])
        .ok()
        .map(|v| v.trim().trim_matches('\'').to_string())
        .filter(|v| !v.is_empty())
}

/// GNOME names its accent colours; these are the hexes it ships for them.
fn accent_hex(name: &str) -> Option<&'static str> {
    Some(match name {
        "blue" => "#3584e4",
        "teal" => "#2190a4",
        "green" => "#3a944a",
        "yellow" => "#c88800",
        "orange" => "#ed5b00",
        "red" => "#e62d42",
        "pink" => "#d56199",
        "purple" => "#9141ac",
        "slate" => "#6f8396",
        _ => return None,
    })
}

pub fn desktop_preferences() -> DesktopPreferences {
    let accent = gsetting("org.gnome.desktop.interface", "accent-color")
        .and_then(|name| accent_hex(&name).map(|hex| hex.to_string()))
        .unwrap_or_else(|| "#3584e4".to_string());

    // GNOME has no "reduce transparency" switch of its own; high contrast is
    // the setting that asks for flat, opaque surfaces.
    let high_contrast = gsetting("org.gnome.desktop.a11y.interface", "high-contrast")
        .map(|v| v == "true")
        .unwrap_or(false);

    // enable-animations is the inverse of "reduce motion".
    let reduce_motion = gsetting("org.gnome.desktop.interface", "enable-animations")
        .map(|v| v == "false")
        .unwrap_or(false);

    // WebKitGTK does not pick GNOME's preference up on its own, so the window
    // would render light on a dark desktop unless we read it here.
    let color_scheme = match gsetting("org.gnome.desktop.interface", "color-scheme").as_deref() {
        Some("prefer-dark") => "dark",
        Some("prefer-light") => "light",
        _ => "default",
    }
    .to_string();

    DesktopPreferences {
        accent,
        reduce_transparency: high_contrast,
        increase_contrast: high_contrast,
        reduce_motion,
        color_scheme,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_entry(dir: &Path, name: &str, body: &str) -> PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, body).unwrap();
        path
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "betterbar-linux-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn parses_a_desktop_entry_and_ignores_localised_keys() {
        let dir = temp_dir("parse");
        let path = write_entry(
            &dir,
            "org.example.Editor.desktop",
            "[Desktop Entry]\n\
             Type=Application\n\
             Name=Editor\n\
             Name[de]=Bearbeiter\n\
             Exec=editor-bin %U\n\
             Icon=editor\n\
             StartupWMClass=EditorClass\n\
             Categories=Utility;TextEditor;\n\
             [Desktop Action New]\n\
             Name=New Window\n",
        );
        let entry = parse_desktop_file(&path).expect("entry parses");
        assert_eq!(entry.id, "org.example.Editor");
        assert_eq!(entry.name, "Editor", "the C-locale Name must win");
        assert_eq!(entry.icon.as_deref(), Some("editor"));
        assert_eq!(entry.startup_wm_class.as_deref(), Some("EditorClass"));
        assert_eq!(entry.categories, vec!["Utility", "TextEditor"]);
        assert!(!entry.no_display);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn strips_field_codes_and_env_prefixes_from_exec() {
        let dir = temp_dir("exec");
        let path = write_entry(
            &dir,
            "app.desktop",
            "[Desktop Entry]\nType=Application\nName=App\nExec=env GDK_BACKEND=x11 /usr/bin/my-app %U\n",
        );
        let entry = parse_desktop_file(&path).unwrap();
        assert_eq!(entry.exec_binary().as_deref(), Some("my-app"));
        assert_eq!(
            entry.exec_command(),
            vec!["env", "GDK_BACKEND=x11", "/usr/bin/my-app"]
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn skips_entries_whose_tryexec_binary_is_missing() {
        let dir = temp_dir("tryexec");
        let path = write_entry(
            &dir,
            "ghost.desktop",
            "[Desktop Entry]\nType=Application\nName=Ghost\nExec=ghost\nTryExec=/nonexistent/ghost\n",
        );
        assert!(parse_desktop_file(&path).is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn honours_nodisplay_and_hidden() {
        let dir = temp_dir("hidden");
        let path = write_entry(
            &dir,
            "hidden.desktop",
            "[Desktop Entry]\nType=Application\nName=Hidden\nExec=x\nNoDisplay=true\n",
        );
        assert!(parse_desktop_file(&path).unwrap().no_display);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rejects_non_application_entries() {
        let dir = temp_dir("link");
        let path = write_entry(
            &dir,
            "link.desktop",
            "[Desktop Entry]\nType=Link\nName=Site\nExec=x\nURL=https://example.com\n",
        );
        assert!(parse_desktop_file(&path).is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reads_mpris_metadata_out_of_gvariant_output() {
        let raw = "(<{'mpris:trackid': <'/track/1'>, 'xesam:title': <'Blue Monday'>, \
                   'xesam:artist': <['New Order', 'Remixer']>, 'xesam:album': <'Substance'>}>,)";
        assert_eq!(
            gvariant_string(raw, "xesam:title").as_deref(),
            Some("Blue Monday")
        );
        assert_eq!(
            gvariant_string(raw, "xesam:artist").as_deref(),
            Some("New Order"),
            "the first artist of the array is used"
        );
        assert_eq!(
            gvariant_string(raw, "xesam:album").as_deref(),
            Some("Substance")
        );
        assert_eq!(gvariant_string(raw, "xesam:missing"), None);
    }

    #[test]
    fn unescapes_quotes_in_track_titles() {
        let raw = r"(<{'xesam:title': <'Don\'t Stop'>}>,)";
        assert_eq!(
            gvariant_string(raw, "xesam:title").as_deref(),
            Some("Don't Stop")
        );
    }

    #[test]
    fn quotes_shell_arguments_safely() {
        assert_eq!(shell_quote("plain"), "'plain'");
        assert_eq!(shell_quote("it's"), r"'it'\''s'");
        assert!(shell_quote("; rm -rf /").starts_with('\''));
    }

    #[test]
    fn picks_the_native_package_for_this_machine() {
        let release = serde_json::json!({
            "assets": [
                { "name": "betterbar-x86_64.AppImage", "browser_download_url": "https://x/appimage-intel" },
                { "name": "betterbar-aarch64.AppImage", "browser_download_url": "https://x/appimage-arm" },
                { "name": "betterbar-aarch64.rpm", "browser_download_url": "https://x/rpm-arm" },
                { "name": "betterbar.dmg", "browser_download_url": "https://x/dmg" }
            ]
        });
        let url = linux_asset_url(&release).expect("an asset matches");
        assert!(
            !url.contains("dmg"),
            "a macOS disk image is never a Linux download"
        );
        // Architecture must match whatever this test is compiled for.
        if cfg!(target_arch = "aarch64") {
            assert!(url.contains("arm"), "got {url}");
        } else {
            assert!(url.contains("intel"), "got {url}");
        }
    }

    #[test]
    fn ignores_assets_for_other_architectures() {
        let other = if cfg!(target_arch = "aarch64") { "x86_64" } else { "aarch64" };
        let release = serde_json::json!({
            "assets": [
                { "name": format!("betterbar-{other}.AppImage"), "browser_download_url": "https://x/wrong" }
            ]
        });
        assert_eq!(linux_asset_url(&release), None);
    }

    #[test]
    fn compares_versions_semantically() {
        assert!(newer_than("0.12.0", "0.11.1"));
        assert!(newer_than("1.0.0", "0.99.99"));
        assert!(!newer_than("0.11.1", "0.11.1"));
        assert!(!newer_than("0.11.0", "0.11.1"));
        assert!(!newer_than("not-a-version", "0.11.1"));
    }

    #[test]
    fn picks_the_bar_window_over_gtks_hidden_helper_window() {
        // The helper window really is 20x20; the bar spans the screen edge.
        let candidates = [(10485761, 20, 20), (10485763, 3072, 400)];
        assert_eq!(largest_window(&candidates), Some(10485763));
        // Order must not matter.
        let reversed = [(10485763, 3072, 400), (10485761, 20, 20)];
        assert_eq!(largest_window(&reversed), Some(10485763));
        assert_eq!(largest_window(&[]), None);
        // 1x1 placeholders are never the bar.
        assert_eq!(largest_window(&[(7, 1, 1)]), None);
    }

    #[test]
    fn reads_window_geometry_from_xdotool_output() {
        let out = "Window 10485763\n  Position: 0,1520 (screen: 0)\n  Geometry: 3072x400\n";
        assert_eq!(parse_geometry(out), Some((3072, 400)));
        assert_eq!(parse_geometry("no geometry here"), None);
    }

    #[test]
    fn maps_gnome_accent_names_and_falls_back_for_unknown_ones() {
        assert_eq!(accent_hex("purple"), Some("#9141ac"));
        assert_eq!(accent_hex("slate"), Some("#6f8396"));
        assert_eq!(accent_hex("chartreuse"), None);
    }

    #[test]
    fn desktop_preferences_report_a_known_colour_scheme() {
        let prefs = desktop_preferences();
        assert!(
            ["dark", "light", "default"].contains(&prefs.color_scheme.as_str()),
            "got {}",
            prefs.color_scheme
        );
    }

    #[test]
    fn desktop_preferences_always_yield_a_usable_accent() {
        let prefs = desktop_preferences();
        assert_eq!(prefs.accent.len(), 7, "got {}", prefs.accent);
        assert!(prefs.accent.starts_with('#'));
        assert!(prefs.accent[1..].chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn battery_reports_a_percentage_in_range_without_panicking() {
        let info = get_battery_info();
        assert!((0.0..=100.0).contains(&info.percentage));
        if !info.available {
            assert_eq!(info.percentage, 0.0);
        }
    }

    #[test]
    fn screen_info_is_positive_and_scale_aware() {
        let info = get_screen_info(2.0, Some((2560.0, 1600.0)));
        assert_eq!(info.width, 1280.0, "pixels are divided by the scale factor");
        assert_eq!(info.height, 800.0);
        assert_eq!(info.scale_factor, 2.0);
        // With no size supplied it must still find this machine's panel.
        let probed = get_screen_info(1.0, None);
        assert!(probed.width >= 640.0 && probed.height >= 480.0);
        // Linux has no system menu bar to avoid.
        assert_eq!(info.menu_bar_height, 0.0);
    }


    /// Diagnostic probe against the live desktop. Ignored by default because it
    /// depends on what this machine actually has installed and running.
    /// Run with: cargo test --lib linux::tests::probe -- --ignored --nocapture
    #[test]
    #[ignore = "Reports live desktop state; depends on the host"]
    fn probe_live_desktop() {
        let entries = desktop_entries();
        println!("session:        {}", if is_wayland() { "wayland" } else { "x11" });
        println!("desktop entries: {}", entries.len());
        for e in entries.iter().take(5) {
            println!("  - {} ({})", e.name, e.id);
        }
        println!("running apps:   {}", get_running_apps().len());
        for a in get_running_apps().iter().take(5) {
            println!("  - {} pid={} active={}", a.name, a.pid, a.is_active);
        }
        println!("terminals:      {:?}", get_installed_terminals().iter().map(|t| t.bundle_id.clone()).collect::<Vec<_>>());
        println!("battery:        {:?}", get_battery_info());
        println!("screen:         {:?}", get_screen_info(1.0, None));
        println!("music:          {:?}", get_music_info());
        println!("spaces:         {:?}", get_spaces());
        println!("on-screen wins: {}", get_on_screen_windows().len());
        println!("autostart:      {:?}", get_open_on_login());
        let icon = get_app_icon_base64(&entries.first().map(|e| e.id.clone()).unwrap_or_default());
        println!("first app icon: {} bytes", icon.map(|i| i.len()).unwrap_or(0));
        println!("tools: wmctrl={} xdotool={} xprop={} nmcli={} gdbus={} systemd-inhibit={}",
            has_tool("wmctrl"), has_tool("xdotool"), has_tool("xprop"),
            has_tool("nmcli"), has_tool("gdbus"), has_tool("systemd-inhibit"));
    }

    #[test]
    fn desktop_entry_scan_finds_real_applications() {
        // Any functioning desktop install has applications registered; if this
        // machine has none, the scan must still return cleanly.
        let entries = desktop_entries();
        for entry in entries.iter().take(50) {
            assert!(!entry.id.is_empty());
            assert!(!entry.name.is_empty());
        }
    }
}
