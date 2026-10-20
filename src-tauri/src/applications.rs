//! Installed application discovery for launcher extensions.
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
pub struct InstalledApp {
    pub name: String,
    pub path: String,
    pub bundle_id: String,
}

// Stop at app bundles so helpers inside Xcode, browsers, etc. never become entries.
fn collect_bundles(root: &Path, depth: usize, paths: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        if path.extension().is_some_and(|ext| ext == "app") && path.is_dir() {
            paths.push(path);
        } else if depth > 0 && entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            collect_bundles(&path, depth - 1, paths);
        }
    }
}

#[cfg(target_os = "macos")]
fn discover() -> Vec<InstalledApp> {
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSAutoreleasePool, NSString};
    use objc::{class, msg_send, sel, sel_impl};
    use std::ffi::CStr;

    unsafe fn string(value: id) -> Option<String> {
        if value == nil {
            return None;
        }
        let is_string: bool = msg_send![value, isKindOfClass: class!(NSString)];
        if !is_string {
            return None;
        }
        let ptr: *const std::os::raw::c_char = msg_send![value, UTF8String];
        if ptr.is_null() {
            None
        } else {
            Some(CStr::from_ptr(ptr).to_string_lossy().into_owned())
        }
    }

    let mut paths = Vec::new();
    let mut roots = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Library/CoreServices/Applications"),
    ];
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join("Applications"));
    }
    for root in roots {
        collect_bundles(&root, 3, &mut paths);
    }
    let mut seen = HashSet::new();
    let mut apps = Vec::new();
    unsafe {
        let pool = NSAutoreleasePool::new(nil);
        for path in paths {
            let canonical = path.canonicalize().unwrap_or_else(|_| path.clone());
            if !seen.insert(canonical) {
                continue;
            }
            let path_string = path.to_string_lossy().into_owned();
            let ns_path = NSString::alloc(nil).init_str(&path_string);
            let bundle: id = msg_send![class!(NSBundle), bundleWithPath: ns_path];
            let _: () = msg_send![ns_path, release];
            if bundle == nil {
                continue;
            }
            let bundle_id: id = msg_send![bundle, bundleIdentifier];
            let bundle_id = string(bundle_id).unwrap_or_default();
            let mut name = None;
            for key in ["CFBundleDisplayName", "CFBundleName"] {
                let ns_key = NSString::alloc(nil).init_str(key);
                let value: id = msg_send![bundle, objectForInfoDictionaryKey: ns_key];
                let _: () = msg_send![ns_key, release];
                name = string(value).filter(|s| !s.trim().is_empty());
                if name.is_some() {
                    break;
                }
            }
            let name = name.unwrap_or_else(|| {
                path.file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned()
            });
            apps.push(InstalledApp {
                name,
                path: path_string,
                bundle_id,
            });
        }
        let _: () = msg_send![pool, drain];
    }
    apps.sort_by_cached_key(|app| (app.name.to_lowercase(), app.path.clone()));
    apps
}

#[tauri::command]
pub async fn get_installed_apps() -> Result<Vec<InstalledApp>, String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(discover)
            .await
            .map_err(|err| err.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(Vec::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_grouped_apps_without_helpers_or_hidden_apps() {
        let root = std::env::temp_dir().join(format!("betterbar-apps-{}", std::process::id()));
        std::fs::create_dir_all(root.join("Editor.app/Contents/Helper.app")).unwrap();
        std::fs::create_dir_all(root.join("Utilities/Terminal.app")).unwrap();
        std::fs::create_dir_all(root.join(".hidden/Secret.app")).unwrap();
        let mut paths = Vec::new();
        collect_bundles(&root, 3, &mut paths);
        paths.sort();
        assert_eq!(
            paths,
            vec![root.join("Editor.app"), root.join("Utilities/Terminal.app")]
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn discovers_real_macos_apps() {
        let apps = discover();
        assert!(apps.iter().any(|app| app.bundle_id == "com.apple.Terminal"));
        assert!(apps
            .iter()
            .all(|app| !app.name.is_empty() && Path::new(&app.path).is_dir()));
        assert!(apps
            .windows(2)
            .all(|pair| pair[0].name.to_lowercase() <= pair[1].name.to_lowercase()));
    }
}
