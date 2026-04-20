use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime, WindowEvent};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningApp {
    pub name: String,
    pub bundle_id: String,
    pub pid: i32,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenInfo {
    /// Logical width of the full screen
    pub width: f64,
    /// Logical height of the full screen
    pub height: f64,
    pub scale_factor: f64,
    /// Height of the macOS menu bar in logical pixels (0 when hidden/auto-hide active)
    pub menu_bar_height: f64,
    /// Height reserved by the macOS Dock at the bottom (0 when hidden or dock on side)
    pub dock_height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatteryInfo {
    pub percentage: f32,
    pub is_charging: bool,
    pub is_plugged: bool,
    pub available: bool,
}

// --- Commands ---

#[tauri::command]
async fn get_running_apps() -> Vec<RunningApp> {
    #[cfg(target_os = "macos")]
    { macos::get_running_apps() }
    #[cfg(not(target_os = "macos"))]
    { vec![] }
}

#[tauri::command]
async fn launch_app(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::launch_app(&path) }
    #[cfg(not(target_os = "macos"))]
    { let _ = path; Err("Not supported".to_string()) }
}

#[tauri::command]
async fn get_screen_info<R: Runtime>(app: AppHandle<R>) -> ScreenInfo {
    #[cfg(target_os = "macos")]
    {
        let scale = if let Some(window) = app.get_webview_window("main") {
            if let Ok(Some(m)) = window.primary_monitor() {
                m.scale_factor()
            } else {
                1.0
            }
        } else {
            1.0
        };
        macos::get_screen_info(scale)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        ScreenInfo { width: 1920.0, height: 1080.0, scale_factor: 1.0, menu_bar_height: 0.0, dock_height: 0.0 }
    }
}

#[tauri::command]
async fn position_window<R: Runtime>(
    app: AppHandle<R>,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }))
            .map_err(|e| e.to_string())?;
        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))
            .map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn set_window_level<R: Runtime>(app: AppHandle<R>, level: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(window) = app.get_webview_window("main") {
            let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
            let level_clone = level.clone();
            let win_clone = window.clone();
            window
                .run_on_main_thread(move || {
                    let result = macos::set_window_level(&win_clone, &level_clone);
                    let _ = tx.send(result);
                })
                .map_err(|e| e.to_string())?;
            return rx.recv().map_err(|e| e.to_string())?;
        }
    }
    let _ = (app, level);
    Ok(())
}

#[tauri::command]
async fn get_app_icon(bundle_id: String) -> Option<String> {
    #[cfg(target_os = "macos")]
    { macos::get_app_icon_base64(&bundle_id) }
    #[cfg(not(target_os = "macos"))]
    { let _ = bundle_id; None }
}

#[tauri::command]
async fn get_battery_info() -> BatteryInfo {
    #[cfg(target_os = "macos")]
    { macos::get_battery_info() }
    #[cfg(not(target_os = "macos"))]
    { BatteryInfo { percentage: 0.0, is_charging: false, is_plugged: false, available: false } }
}

#[tauri::command]
async fn check_accessibility_permissions() -> bool {
    #[cfg(target_os = "macos")]
    { macos::check_accessibility() }
    #[cfg(not(target_os = "macos"))]
    { true }
}

#[tauri::command]
async fn request_accessibility_permissions() {
    #[cfg(target_os = "macos")]
    { macos::request_accessibility(); }
}

#[tauri::command]
async fn set_screen_inset<R: Runtime>(
    app:             AppHandle<R>,
    position:        String,
    bar_size:        f64,
    menu_bar_height: f64,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(window) = app.get_webview_window("main") {
            let (tx, rx) = std::sync::mpsc::channel::<()>();
            let pos = position.clone();
            window.run_on_main_thread(move || {
                macos::set_screen_inset(&pos, bar_size, menu_bar_height);
                let _ = tx.send(());
            }).map_err(|e| e.to_string())?;
            let _ = rx.recv();
        }
    }
    let _ = (app, position, bar_size, menu_bar_height);
    Ok(())
}

#[tauri::command]
async fn clear_screen_insets<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(window) = app.get_webview_window("main") {
            window.run_on_main_thread(move || {
                macos::clear_screen_insets();
            }).map_err(|e| e.to_string())?;
        }
    }
    let _ = app;
    Ok(())
}

// --- macOS-specific implementation ---

#[cfg(target_os = "macos")]
mod macos {
    use super::{BatteryInfo, RunningApp, ScreenInfo};
    use std::process::Command;
    use tauri::WebviewWindow;

    // C-compatible geometry structs matching CGPoint / CGSize / CGRect layout
    #[repr(C)]
    #[derive(Copy, Clone, Debug, Default)]
    struct CgPoint { x: f64, y: f64 }
    #[repr(C)]
    #[derive(Copy, Clone, Debug, Default)]
    struct CgSize { width: f64, height: f64 }
    #[repr(C)]
    #[derive(Copy, Clone, Debug, Default)]
    struct CgRect { origin: CgPoint, size: CgSize }

    // NSEdgeInsets — matches the C struct layout expected by CGSSetScreenInsets
    #[repr(C)]
    #[derive(Copy, Clone, Debug, Default)]
    struct NSEdgeInsets {
        top:    f64,
        left:   f64,
        bottom: f64,
        right:  f64,
    }

    type CGSConnectionID   = u32;
    type CGDirectDisplayID = u32;

    // CGMainDisplayID is public CoreGraphics API
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGMainDisplayID() -> CGDirectDisplayID;
    }

    // dlsym is in libSystem (always available on macOS) — used to look up private CGS symbols
    extern "C" {
        fn dlsym(
            handle: *mut std::os::raw::c_void,
            symbol: *const std::os::raw::c_char,
        ) -> *mut std::os::raw::c_void;
    }

    /// Must be called from the main thread — CGS connection is main-thread bound.
    pub fn cgs_set_screen_insets(insets: NSEdgeInsets) {
        use cocoa::base::{id, nil};
        use objc::{msg_send, sel, sel_impl};

        // RTLD_DEFAULT on macOS = (void *) -2
        let rtld_default = -2_isize as *mut std::os::raw::c_void;
        unsafe {
            let sym_cid = dlsym(rtld_default, b"CGSMainConnectionID\0".as_ptr().cast());
            let sym_set = dlsym(rtld_default, b"CGSSetScreenInsets\0".as_ptr().cast());
            if sym_cid.is_null() {
                eprintln!("[BetterBar] CGSMainConnectionID not found via dlsym");
                return;
            }
            if sym_set.is_null() {
                eprintln!("[BetterBar] CGSSetScreenInsets not found via dlsym");
                return;
            }
            let get_cid: unsafe extern "C" fn() -> CGSConnectionID = std::mem::transmute(sym_cid);
            let set_insets: unsafe extern "C" fn(CGSConnectionID, CGDirectDisplayID, NSEdgeInsets) =
                std::mem::transmute(sym_set);
            let cid     = get_cid();
            let display = CGMainDisplayID();
            eprintln!("[BetterBar] calling CGSSetScreenInsets cid={cid} display={display} insets={insets:?}");
            set_insets(cid, display, insets);

            // Verify visibleFrame changed
            let screen: id = msg_send![objc::class!(NSScreen), mainScreen];
            if screen != nil {
                let v: CgRect = msg_send![screen, visibleFrame];
                eprintln!("[BetterBar] NSScreen.visibleFrame after: origin=({},{}) size=({},{})",
                    v.origin.x, v.origin.y, v.size.width, v.size.height);
            }
        }
    }

    pub fn get_screen_info(scale: f64) -> ScreenInfo {
        use cocoa::base::{id, nil};
        use objc::{msg_send, sel, sel_impl};

        unsafe {
            let screen: id = msg_send![objc::class!(NSScreen), mainScreen];
            if screen == nil {
                return ScreenInfo { width: 1920.0, height: 1080.0, scale_factor: scale, menu_bar_height: 0.0, dock_height: 0.0 };
            }

            let frame: CgRect = msg_send![screen, frame];
            let visible: CgRect = msg_send![screen, visibleFrame];

            let full_h = frame.size.height;

            // Menu bar is at the top in macOS (origin at bottom-left)
            // visibleFrame top = visible.origin.y + visible.size.height
            // menu_bar_height = full_h - (visible.origin.y + visible.size.height)
            let menu_bar_height = (full_h - (visible.origin.y + visible.size.height)).max(0.0);

            // Dock height is the bottom gap (visibleFrame.origin.y) when dock is at bottom
            let dock_height = visible.origin.y.max(0.0);

            ScreenInfo {
                width: frame.size.width,
                height: frame.size.height,
                scale_factor: scale,
                menu_bar_height,
                dock_height,
            }
        }
    }

    pub fn get_running_apps() -> Vec<RunningApp> {
        let output = Command::new("osascript")
            .arg("-e")
            .arg(
                r#"set appList to ""
tell application "System Events"
    set runningApps to (every application process whose background only is false)
    repeat with anApp in runningApps
        set appName to name of anApp
        set appPID to unix id of anApp
        set appList to appList & appName & "|" & appPID & "\n"
    end repeat
end tell
return appList"#,
            )
            .output();

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                stdout
                    .lines()
                    .filter(|l| l.contains('|'))
                    .map(|line| {
                        let parts: Vec<&str> = line.split('|').collect();
                        let name = parts.first().unwrap_or(&"").trim().to_string();
                        let pid: i32 = parts.get(1).unwrap_or(&"0").trim().parse().unwrap_or(0);
                        RunningApp {
                            bundle_id: name.to_lowercase().replace(' ', "."),
                            name,
                            pid,
                            is_active: false,
                        }
                    })
                    .collect()
            }
            Err(_) => vec![],
        }
    }

    pub fn launch_app(path: &str) -> Result<(), String> {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_app_icon_base64(bundle_id: &str) -> Option<String> {
        let find_output = Command::new("mdfind")
            .arg(format!("kMDItemCFBundleIdentifier == '{}'", bundle_id))
            .output()
            .ok()?;

        let app_path = String::from_utf8_lossy(&find_output.stdout)
            .lines()
            .next()?
            .trim()
            .to_string();

        if app_path.is_empty() {
            return None;
        }

        let icns_path = format!("{}/Contents/Resources/", app_path);
        let find_icns = Command::new("find")
            .args([&icns_path, "-name", "*.icns", "-maxdepth", "1"])
            .output()
            .ok()?;

        let icns = String::from_utf8_lossy(&find_icns.stdout)
            .lines()
            .next()?
            .trim()
            .to_string();

        if icns.is_empty() {
            return None;
        }

        let tmp = format!("/tmp/betterbar_icon_{}.png", bundle_id.replace('.', "_"));
        Command::new("sips")
            .args(["-s", "format", "png", "--resampleWidth", "64", &icns, "--out", &tmp])
            .output()
            .ok()?;

        let b64 = Command::new("base64").arg(&tmp).output().ok()?;
        let encoded = String::from_utf8_lossy(&b64.stdout).replace('\n', "");
        if encoded.is_empty() {
            None
        } else {
            Some(format!("data:image/png;base64,{}", encoded))
        }
    }

    pub fn get_battery_info() -> BatteryInfo {
        let output = match Command::new("pmset").args(["-g", "batt"]).output() {
            Ok(o) => o,
            Err(_) => return BatteryInfo { percentage: 0.0, is_charging: false, is_plugged: false, available: false },
        };

        let text = String::from_utf8_lossy(&output.stdout);
        let is_plugged = text.contains("'AC Power'") || text.contains("AC Power");
        let mut percentage: f32 = 0.0;
        let mut is_charging = false;

        for line in text.lines() {
            if line.contains('%') {
                if let Some(pct_end) = line.find('%') {
                    let before = &line[..pct_end];
                    let start = before
                        .rfind(|c: char| !c.is_ascii_digit())
                        .map(|i| i + 1)
                        .unwrap_or(0);
                    if let Ok(p) = line[start..pct_end].parse::<f32>() {
                        percentage = p;
                    }
                }
                // "charging" but not "discharging" or "charged"
                is_charging = line.contains("charging") && !line.contains("discharging") && !line.contains("charged;");
                break;
            }
        }

        BatteryInfo { percentage, is_charging, is_plugged, available: true }
    }

    pub fn check_accessibility() -> bool {
        // AXIsProcessTrusted from ApplicationServices framework
        #[link(name = "ApplicationServices", kind = "framework")]
        extern "C" {
            fn AXIsProcessTrusted() -> bool;
        }
        unsafe { AXIsProcessTrusted() }
    }

    pub fn request_accessibility() {
        // Open System Settings → Privacy & Security → Accessibility
        let _ = Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
    }

    pub fn set_window_level<R: tauri::Runtime>(window: &WebviewWindow<R>, level: &str) -> Result<(), String> {
        use cocoa::base::id;
        use objc::{msg_send, sel, sel_impl};

        let window_level: i64 = match level {
            "dock"         => 20,
            "floating"     => 3,
            "screen_saver" => 1000,
            _              => 0,
        };

        let ns_window = window.ns_window().map_err(|e| e.to_string())? as id;

        unsafe {
            // CanJoinAllSpaces | Stationary | IgnoresCycle | FullScreenNone
            let behavior: u64 = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 9);
            let _: () = msg_send![ns_window, setLevel: window_level];
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
        }

        Ok(())
    }

    /// Call only from the main thread.
    pub fn set_screen_inset(position: &str, bar_size: f64, menu_bar_height: f64) {
        let insets = match position {
            "left"   => NSEdgeInsets { left: bar_size, ..Default::default() },
            "right"  => NSEdgeInsets { right: bar_size, ..Default::default() },
            "bottom" => NSEdgeInsets { bottom: bar_size, ..Default::default() },
            // Bar sits at y=menuH and extends bar_size pts down, so reserve menuH+bar_size from top
            "top"    => NSEdgeInsets { top: menu_bar_height + bar_size, ..Default::default() },
            _        => return,
        };
        cgs_set_screen_insets(insets);
    }

    /// Call only from the main thread.
    pub fn clear_screen_insets() {
        cgs_set_screen_insets(NSEdgeInsets::default());
    }
}

// --- App entry ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_running_apps,
            launch_app,
            get_screen_info,
            position_window,
            set_window_level,
            get_app_icon,
            get_battery_info,
            check_accessibility_permissions,
            request_accessibility_permissions,
            set_screen_inset,
            clear_screen_insets,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_visible_on_all_workspaces(true);
                    let _ = macos::set_window_level(&window, "floating");
                    window.on_window_event(move |event| {
                        if let WindowEvent::Destroyed = event {
                            macos::clear_screen_insets();
                        }
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BetterBar");
}
