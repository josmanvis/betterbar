use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockTarget {
    name: String,
    path: String,
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    bundle_id: Option<String>,
}

pub(crate) fn inspect(paths: Vec<String>) -> Result<Vec<DockTarget>, String> {
    let mut targets = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for input in paths {
        let path = Path::new(&input);
        if !path.is_absolute() { return Err("Choose an absolute file or folder path.".into()); }
        let path = path.canonicalize().map_err(|_| "A selected item is no longer available.")?;
        if !seen.insert(path.clone()) { continue; }
        let metadata = path.metadata().map_err(|_| "Could not read a selected item.")?;
        if !metadata.is_file() && !metadata.is_dir() { return Err("Choose a file, folder, or application.".into()); }
        let is_app = metadata.is_dir() && path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("app"));
        let kind = if is_app { "app" } else if metadata.is_dir() { "folder" } else { "file" };
        let name = if is_app { path.file_stem() } else { path.file_name() }.unwrap_or_default().to_string_lossy().into_owned();
        let path = path.to_string_lossy().into_owned();
        let bundle_id = if is_app { bundle_id(&path) } else { None };
        targets.push(DockTarget { name, path, kind: kind.into(), bundle_id });
    }
    Ok(targets)
}

#[cfg(target_os = "macos")]
fn bundle_id(path: &str) -> Option<String> {
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSString;
    use objc::{class, msg_send, sel, sel_impl};
    objc::rc::autoreleasepool(|| unsafe {
        let ns_path = NSString::alloc(nil).init_str(path);
        let bundle: id = msg_send![class!(NSBundle), bundleWithPath: ns_path];
        let _: () = msg_send![ns_path, release];
        if bundle == nil { return None; }
        let value: id = msg_send![bundle, bundleIdentifier];
        if value == nil { return None; }
        let ptr: *const std::os::raw::c_char = msg_send![value, UTF8String];
        if ptr.is_null() { None } else { Some(std::ffi::CStr::from_ptr(ptr).to_string_lossy().into_owned()) }
    })
}
#[cfg(not(target_os = "macos"))]
fn bundle_id(_: &str) -> Option<String> { None }

#[tauri::command]
pub async fn inspect_dock_paths(paths: Vec<String>) -> Result<Vec<DockTarget>, String> {
    tauri::async_runtime::spawn_blocking(move || inspect(paths)).await.map_err(|_| "Could not inspect selected items.".to_string())?
}

#[tauri::command]
pub async fn pick_dock_items(app: tauri::AppHandle, kind: String) -> Result<Vec<DockTarget>, String> {
    if !["app", "file", "folder", "attachment"].contains(&kind.as_str()) { return Err("Unknown item type.".into()); }
    #[cfg(target_os = "macos")]
    {
        let (send, receive) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            use cocoa::base::{id, nil, YES, NO};
            use cocoa::foundation::{NSAutoreleasePool, NSString};
            use objc::{class, msg_send, sel, sel_impl};
            unsafe {
                let pool = NSAutoreleasePool::new(nil);
                let panel: id = msg_send![class!(NSOpenPanel), openPanel];
                let directories = if kind == "folder" { YES } else { NO };
                let files = if kind == "folder" { NO } else { YES };
                let _: () = msg_send![panel, setCanChooseDirectories: directories];
                let _: () = msg_send![panel, setCanChooseFiles: files];
                let _: () = msg_send![panel, setAllowsMultipleSelection: YES];
                let _: () = msg_send![panel, setTreatsFilePackagesAsDirectories: NO];
                let prompt = NSString::alloc(nil).init_str(if kind == "attachment" { "Attach files" } else { "Dock selected items" });
                let _: () = msg_send![panel, setPrompt: prompt];
                let _: () = msg_send![prompt, release];
                if kind == "app" {
                    let ext = NSString::alloc(nil).init_str("app");
                    let allowed: id = msg_send![class!(NSArray), arrayWithObject: ext];
                    let _: () = msg_send![panel, setAllowedFileTypes: allowed];
                    let _: () = msg_send![ext, release];
                } else {
                    let _: () = msg_send![panel, setAllowedFileTypes: nil];
                }
                // Keep the host event loop running while the native panel is open.
                let _: id = msg_send![panel, retain];
                let completion = block::ConcreteBlock::new(move |result: i64| {
                    let mut paths = Vec::new();
                    if result == 1 {
                        let urls: id = msg_send![panel, URLs];
                        let count: usize = msg_send![urls, count];
                        for index in 0..count {
                            let url: id = msg_send![urls, objectAtIndex: index];
                            let path: id = msg_send![url, path];
                            let ptr: *const std::os::raw::c_char = msg_send![path, UTF8String];
                            if !ptr.is_null() { paths.push(std::ffi::CStr::from_ptr(ptr).to_string_lossy().into_owned()); }
                        }
                    }
                    let _ = send.send(paths);
                    let _: () = msg_send![panel, release];
                }).copy();
                let _: () = msg_send![panel, beginWithCompletionHandler: &*completion];
                let _: () = msg_send![pool, drain];
            }
        }).map_err(|_| "Could not open the file picker.".to_string())?;
        tauri::async_runtime::spawn_blocking(move || {
            let paths = receive.recv().map_err(|_| "The file picker closed unexpectedly.".to_string())?;
            inspect(paths)
        }).await.map_err(|_| "Could not read selected items.".to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = app; Err("File picking requires macOS.".into()) }
}

#[tauri::command]
pub async fn get_path_icon(path: String) -> Option<String> {
    #[cfg(target_os = "macos")]
    { tauri::async_runtime::spawn_blocking(move || objc::rc::autoreleasepool(|| crate::macos::get_path_icon_base64(&path))).await.ok().flatten() }
    #[cfg(not(target_os = "macos"))]
    { let _ = path; None }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[cfg(target_os = "macos")]
    fn running_app_inventory_uses_native_records_and_active_state() {
        let start = std::time::Instant::now();
        let apps = crate::macos::get_running_apps();
        assert!(!apps.is_empty());
        assert!(apps.iter().all(|app| app.pid > 0 && !app.name.is_empty()));
        assert!(apps.iter().filter(|app| app.is_active).count() <= 1);
        assert!(start.elapsed() < std::time::Duration::from_secs(2));
    }
    #[test]
    #[cfg(target_os = "macos")]
    fn renders_native_folder_and_document_icons() {
        let root = std::env::temp_dir().join(format!("betterbar-icons-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("example.txt"), "fixture").unwrap();
        objc::rc::autoreleasepool(|| {
            for path in [&root, &root.join("example.txt")] {
                let icon = crate::macos::get_path_icon_base64(&path.to_string_lossy()).unwrap();
                assert!(icon.starts_with("data:image/png;base64,iVBOR"));
            }
        });
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn distinguishes_apps_folders_and_files_and_deduplicates() {
        let root = std::env::temp_dir().join(format!("betterbar-dock-{}", std::process::id()));
        std::fs::create_dir_all(root.join("Example.app")).unwrap();
        std::fs::create_dir_all(root.join("A folder")).unwrap();
        std::fs::write(root.join("a file $(literal).txt"), "fixture").unwrap();
        let paths: Vec<String> = ["Example.app", "A folder", "a file $(literal).txt", "A folder"].iter().map(|name| root.join(name).to_string_lossy().into_owned()).collect();
        let targets = inspect(paths).unwrap();
        assert_eq!(targets.len(), 3);
        assert_eq!(targets.iter().map(|target| target.kind.as_str()).collect::<Vec<_>>(), vec!["app", "folder", "file"]);
        assert_eq!(targets[2].name, "a file $(literal).txt");
        assert!(inspect(vec!["relative/path".into()]).is_err());
        assert!(inspect(vec![root.join("missing").to_string_lossy().into_owned()]).is_err());
        assert!(inspect(vec![]).unwrap().is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }
}
