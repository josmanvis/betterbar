//! Local drop installation. Preparing a source never evaluates it or changes an installation.
use serde::Serialize;
use std::{collections::HashMap, fs, io::{Read, Write}, path::{Path, PathBuf}, sync::{Mutex, atomic::{AtomicU64, Ordering}}, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};

const MAX_SOURCE: usize = 2 * 1024 * 1024;
const MAX_PENDING: usize = 32;
const PLAN_LIFETIME: Duration = Duration::from_secs(15 * 60);
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub token: String,
    pub name: String,
    pub display_name: String,
    pub incoming_version: Option<String>,
    pub installed_version: Option<String>,
    pub existing: bool,
    pub change: String,
    pub content: String,
}
struct Pending { plan: InstallPlan, previous: Option<String>, created: Instant }
#[derive(Default)]
pub struct InstallerState { pending: Mutex<HashMap<String, Pending>> }
#[derive(Serialize)]
pub struct BarDrop { items: Vec<crate::dock_targets::DockTarget>, extensions: Vec<InstallPlan> }

fn root() -> Result<PathBuf, String> { Ok(dirs::home_dir().ok_or("Could not find the extension directory.")?.join(".betterbar/extensions")) }
fn read_source(path: &Path) -> Result<String, String> {
    let mut bytes = Vec::new();
    fs::File::open(path).map_err(|_| "Could not read this extension file.")?.take((MAX_SOURCE + 1) as u64).read_to_end(&mut bytes).map_err(|_| "Could not read this extension file.")?;
    if bytes.len() > MAX_SOURCE { return Err("Extension files must be smaller than 2 MB.".into()); }
    String::from_utf8(bytes).map_err(|_| "Extension files must contain UTF-8 text.".into())
}

/// Metadata uses literal exports so reading versions does not execute unapproved code.
pub fn literal_export(source: &str, key: &str) -> Option<String> {
    let pattern = format!(r#"^export\s+const\s+{}(?:\s*:\s*string)?\s*=\s*(?:"([^"\r\n\\]+)"|'([^'\r\n\\]+)')"#, regex::escape(key));
    let expression = regex::Regex::new(&pattern).ok()?;
    let bytes = source.as_bytes();
    let (mut index, mut depth) = (0, 0usize);
    while index < bytes.len() {
        match bytes[index] {
            b'"' | b'\'' | b'`' => {
                let quote = bytes[index]; index += 1;
                while index < bytes.len() {
                    if bytes[index] == b'\\' { index = (index + 2).min(bytes.len()); }
                    else if bytes[index] == quote { index += 1; break; }
                    else { index += 1; }
                }
            }
            b'/' if bytes.get(index + 1) == Some(&b'/') => {
                while index < bytes.len() && bytes[index] != b'\n' { index += 1; }
            }
            b'/' if bytes.get(index + 1) == Some(&b'*') => {
                index += 2;
                while index + 1 < bytes.len() && &bytes[index..index + 2] != b"*/" { index += 1; }
                index = (index + 2).min(bytes.len());
            }
            b'{' => { depth += 1; index += 1; }
            b'}' => { depth = depth.saturating_sub(1); index += 1; }
            letter if letter.is_ascii_alphabetic() || letter == b'_' || letter == b'$' => {
                let start = index; index += 1;
                while index < bytes.len() && (bytes[index].is_ascii_alphanumeric() || matches!(bytes[index], b'_' | b'$')) { index += 1; }
                if depth == 0 && &source[start..index] == "export" {
                    if let Some(captures) = expression.captures(&source[start..]) {
                        return captures.get(1).or_else(|| captures.get(2)).map(|value| value.as_str().trim().to_string());
                    }
                }
            }
            _ => index += 1,
        }
    }
    None
}

fn version(source: &str) -> Result<Option<String>, String> {
    literal_export(source, "version").map(|value| semver::Version::parse(&value).map(|_| value).map_err(|_| "Use a semantic extension version such as 1.2.3.".to_string())).transpose()
}
fn valid_name(name: &str) -> bool {
    !name.trim().is_empty() && name.trim() == name && name.len() <= 100 && name != "." && name != ".." && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ' ' | '.'))
}
fn slug(name: &str) -> String {
    name.to_ascii_lowercase().split(|c: char| !c.is_ascii_alphanumeric()).filter(|part| !part.is_empty()).collect::<Vec<_>>().join("-")
}
fn change(previous: Option<&str>, incoming: Option<&str>, existing: bool) -> String {
    if !existing { return "install".into(); }
    match (previous.and_then(|v| semver::Version::parse(v).ok()), incoming.and_then(|v| semver::Version::parse(v).ok())) {
        (Some(old), Some(new)) => match new.cmp_precedence(&old) { std::cmp::Ordering::Greater => "upgrade", std::cmp::Ordering::Less => "downgrade", std::cmp::Ordering::Equal => "same" },
        _ => "replace",
    }.into()
}
fn target_name(root: &Path, source: &Path, content: &str, display: &str) -> Result<String, String> {
    if let Some(id) = literal_export(content, "id") {
        return if valid_name(&id) { Ok(id) } else { Err("This extension has an invalid id.".into()) };
    }
    let suggested = if source.file_name().is_some_and(|name| name == "main.tsx") && source.parent().is_some_and(|parent| parent.join("main.tsx") == source) {
        // Prefer installed metadata over a download directory named e.g. Downloads.
        slug(display)
    } else { slug(&source.file_stem().unwrap_or_default().to_string_lossy().replace(".betterbar", "")) };
    let mut matches = Vec::new();
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten().filter(|entry| entry.path().is_dir()) {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !valid_name(&name) { continue; }
            if name == suggested || read_source(&entry.path().join("main.tsx")).ok().and_then(|s| literal_export(&s, "name")).is_some_and(|name| name.eq_ignore_ascii_case(display)) { matches.push(name); }
        }
    }
    matches.sort(); matches.dedup();
    if matches.len() > 1 { return Err("More than one installed extension matches. Add an explicit extension id.".into()); }
    let name = matches.pop().unwrap_or(suggested);
    if valid_name(&name) { Ok(name) } else { Err("Give the extension a name or a valid id.".into()) }
}
fn safe_destination(root: &Path, name: &str) -> Result<PathBuf, String> {
    if !valid_name(name) { return Err("Invalid extension id.".into()); }
    let directory = root.join(name);
    if directory.exists() && fs::symlink_metadata(&directory).map_err(|_| "Could not inspect the extension directory.")?.file_type().is_symlink() { return Err("Install into a regular extension directory, not a symbolic link.".into()); }
    let destination = directory.join("main.tsx");
    if destination.is_symlink() { return Err("The installed extension source is a symbolic link.".into()); }
    Ok(destination)
}

impl InstallerState {
    fn prepare(&self, root: &Path, path: &Path) -> Result<InstallPlan, String> {
        let content = read_source(path)?;
        let display_name = literal_export(&content, "name").filter(|name| !name.is_empty()).ok_or("An extension needs a literal export const name.")?;
        if !content.contains("export default ") && !content.contains("export default\n") { return Err("An extension must export a default component.".into()); }
        let incoming_version = version(&content)?;
        let name = target_name(root, path, &content, &display_name)?;
        let destination = safe_destination(root, &name)?;
        let previous = if destination.exists() { Some(read_source(&destination)?) } else { None };
        let installed_version = previous.as_deref().and_then(|source| literal_export(source, "version"));
        let existing = previous.is_some();
        let token = format!("{}-{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos(), SEQUENCE.fetch_add(1, Ordering::Relaxed));
        let plan = InstallPlan { token: token.clone(), name, display_name, change: change(installed_version.as_deref(), incoming_version.as_deref(), existing), installed_version, incoming_version, existing, content };
        let mut pending = self.pending.lock().map_err(|_| "Could not prepare this extension.")?;
        pending.retain(|_, item| item.created.elapsed() < PLAN_LIFETIME);
        if pending.len() >= MAX_PENDING { return Err("Finish the pending extension installs before dropping more files.".into()); }
        pending.insert(token, Pending { plan: plan.clone(), previous, created: Instant::now() });
        Ok(plan)
    }
    fn install(&self, root: &Path, token: &str, confirm: bool) -> Result<String, String> {
        let mut pending = self.pending.lock().map_err(|_| "Could not install the extension.")?;
        let item = pending.get(token).ok_or("This install request expired. Drop the extension again.")?;
        if item.created.elapsed() >= PLAN_LIFETIME { return Err("This install request expired. Drop the extension again.".into()); }
        if item.plan.existing && !confirm { return Err("Confirm the version change before replacing this extension.".into()); }
        let destination = safe_destination(root, &item.plan.name)?;
        let current = if destination.exists() { Some(read_source(&destination)?) } else { None };
        if current != item.previous { return Err("The installed extension changed. Drop the file again to review the latest version.".into()); }
        fs::create_dir_all(destination.parent().unwrap()).map_err(|_| "Could not create the extension directory.")?;
        if let Some(previous) = &item.previous {
            let backup = root.parent().ok_or("Could not locate extension backups.")?.join("backups/extension-installs").join(format!("{}-{}", item.plan.name, token));
            let mut directories = fs::DirBuilder::new(); directories.recursive(true);
            #[cfg(unix)] { use std::os::unix::fs::DirBuilderExt; directories.mode(0o700); }
            directories.create(&backup).map_err(|_| "Could not back up the installed extension.")?;
            let mut options = fs::OpenOptions::new(); options.write(true).create_new(true);
            #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
            options.open(backup.join("main.tsx")).and_then(|mut file| file.write_all(previous.as_bytes())).map_err(|_| "Could not back up the installed extension.")?;
        }
        let temporary = destination.with_file_name(format!(".install-{}.tsx", token));
        let result = (|| {
            let mut options = fs::OpenOptions::new(); options.write(true).create_new(true);
            #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
            let mut file = options.open(&temporary).map_err(|_| "Could not stage the extension.")?;
            file.write_all(item.plan.content.as_bytes()).and_then(|_| file.sync_all()).map_err(|_| "Could not save the extension.")?;
            let current = if destination.exists() { Some(read_source(&destination)?) } else { None };
            if current != item.previous { return Err("The installed extension changed. Drop the file again to review the latest version.".into()); }
            fs::rename(&temporary, &destination).map_err(|_| "Could not replace the extension.")?;
            Ok::<_, String>(item.plan.name.clone())
        })();
        if result.is_err() { let _ = fs::remove_file(&temporary); }
        if result.is_ok() { pending.remove(token); }
        result
    }
}

#[tauri::command]
pub async fn inspect_bar_drop(paths: Vec<String>, state: tauri::State<'_, InstallerState>) -> Result<BarDrop, String> {
    let root = root()?;
    let mut pins = Vec::new(); let mut extensions = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for input in paths {
        let path = PathBuf::from(input);
        if !path.is_absolute() { return Err("Drop an existing local item.".into()); }
        let path = path.canonicalize().map_err(|_| "A dropped item is no longer available.")?;
        if !seen.insert(path.clone()) { continue; }
        let source = if path.is_dir() { path.join("main.tsx") } else { path.clone() };
        let app = path.is_dir() && path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("app"));
        let extension = !app && source.extension().is_some_and(|value| value == "tsx") && source.is_file()
            && read_source(&source).ok().is_some_and(|source| literal_export(&source, "name").is_some());
        if extension { extensions.push(state.prepare(&root, &source)?); } else { pins.push(path.to_string_lossy().into_owned()); }
    }
    Ok(BarDrop { items: crate::dock_targets::inspect(pins)?, extensions })
}
#[tauri::command]
pub async fn install_dropped_extension(token: String, confirm: bool, state: tauri::State<'_, InstallerState>) -> Result<String, String> { state.install(&root()?, &token, confirm) }
#[tauri::command]
pub fn discard_dropped_extension(token: String, state: tauri::State<'_, InstallerState>) { if let Ok(mut pending) = state.pending.lock() { pending.remove(&token); } }

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(version: &str) -> String { format!("export const id = 'sample';\nexport const name = 'Sample';\nexport const version = '{version}';\nexport default function Sample() {{ return <button>Sample</button>; }}") }
    #[test]
    fn versions_handle_numeric_precedence_prereleases_builds_and_legacy() {
        assert_eq!(change(Some("1.9.0"), Some("1.10.0"), true), "upgrade");
        assert_eq!(change(Some("2.0.0"), Some("1.9.0"), true), "downgrade");
        assert_eq!(change(Some("1.0.0-beta.1"), Some("1.0.0"), true), "upgrade");
        assert_eq!(change(Some("1.0.0+first"), Some("1.0.0+second"), true), "same");
        assert_eq!(change(None, Some("1.0.0"), true), "replace");
        assert_eq!(change(None, None, false), "install");
        assert!(version(&fixture("not-a-version")).is_err());
        let source = "/*\nexport const version = '9.0.0';\n*/\nconst text = `export const version = '8.0.0';`;\nexport const version = '1.2.3';";
        assert_eq!(literal_export(source, "version").as_deref(), Some("1.2.3"));
        assert!(!valid_name("../escape")); assert!(!valid_name(".hidden"));
    }
    #[test]
    fn new_installs_replacements_cancel_backups_and_conflicts_preserve_sources() {
        let base = std::env::temp_dir().join(format!("betterbar-install-{}", std::process::id()));
        let root = base.join("extensions"); fs::create_dir_all(&root).unwrap();
        let source = base.join("sample.tsx"); fs::write(&source, fixture("1.0.0")).unwrap();
        let state = InstallerState::default(); let plan = state.prepare(&root, &source).unwrap();
        assert!(!root.join("sample/main.tsx").exists());
        assert_eq!(state.install(&root, &plan.token, false).unwrap(), "sample");
        fs::write(&source, fixture("0.9.0")).unwrap(); let plan = state.prepare(&root, &source).unwrap();
        assert_eq!(plan.change, "downgrade"); assert!(state.install(&root, &plan.token, false).is_err());
        assert!(fs::read_to_string(root.join("sample/main.tsx")).unwrap().contains("1.0.0"));
        state.install(&root, &plan.token, true).unwrap();
        assert!(fs::read_to_string(root.join("sample/main.tsx")).unwrap().contains("0.9.0"));
        assert!(fs::read_dir(base.join("backups/extension-installs")).unwrap().next().is_some());
        let conflict = state.prepare(&root, &source).unwrap(); fs::write(root.join("sample/main.tsx"), fixture("3.0.0")).unwrap();
        assert!(state.install(&root, &conflict.token, true).is_err());
        assert!(fs::read_to_string(root.join("sample/main.tsx")).unwrap().contains("3.0.0"));
        let cancel = state.prepare(&root, &source).unwrap(); state.pending.lock().unwrap().remove(&cancel.token);
        assert!(state.install(&root, &cancel.token, true).is_err());
        fs::remove_dir_all(base).unwrap();
    }
}
