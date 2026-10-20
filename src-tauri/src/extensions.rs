use serde::Serialize;

/// Open the owned timesheet app through its distributed-notification bridge.
#[tauri::command]
pub async fn open_timesheets() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(|| {
            use std::process::{Command, Stdio};
            let app = "/Applications/TimesheetAlertComments.app";
            let binary = format!("{}/Contents/MacOS/timesheet-alert-comments", app);
            if !std::path::Path::new(&binary).is_file() {
                return Err("Timesheet Alert Comments is not installed in Applications".to_string());
            }
            let running = Command::new("/usr/bin/pgrep")
                .args(["-f", &format!("^{binary}$")])
                .stdout(Stdio::null()).stderr(Stdio::null())
                .status().map(|status| status.success()).unwrap_or(false);
            if !running {
                let status = Command::new("/usr/bin/open").arg(app).status().map_err(|err| err.to_string())?;
                if !status.success() { return Err("Could not launch Timesheet Alert Comments".to_string()); }
                // Its distributed-notification listener is registered during startup.
                std::thread::sleep(std::time::Duration::from_millis(1000));
            }
            // Post from the long-lived host with immediate delivery. The app's
            // short-lived CLI can exit before its queued notification is sent.
            use cocoa::base::{id, nil, YES};
            use cocoa::foundation::{NSAutoreleasePool, NSString};
            use objc::{class, msg_send, sel, sel_impl};
            unsafe {
                let pool = NSAutoreleasePool::new(nil);
                let center: id = msg_send![class!(NSDistributedNotificationCenter), defaultCenter];
                let name = NSString::alloc(nil).init_str("TimesheetTriggerAlert");
                let _: () = msg_send![center, postNotificationName: name object: nil userInfo: nil deliverImmediately: YES];
                let _: () = msg_send![name, release];
                let _: () = msg_send![pool, drain];
            }
            Ok(())
        }).await.map_err(|err| err.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    { Err("Timesheets is only supported on macOS".to_string()) }
}

#[derive(Serialize)]
pub struct ExtensionFile {
    pub name: String,
    pub display_name: String,
    pub content: String,
}

#[tauri::command]
pub fn fetch_extension_files_from_disk() -> Vec<ExtensionFile> {
    let mut extensions = Vec::new();
    let home = std::env::var("HOME").unwrap_or_else(|_| "".to_string());
    if home.is_empty() { return extensions; }
    let ext_dir = std::path::Path::new(&home).join(".betterbar").join("extensions");

    if let Ok(entries) = std::fs::read_dir(ext_dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let main_tsx = entry.path().join("main.tsx");
                if main_tsx.exists() {
                    if let Ok(content) = std::fs::read_to_string(main_tsx) {
                        let name = entry.file_name().to_string_lossy().into_owned();
                        let display_name = name.replace("-", " ");
                        extensions.push(ExtensionFile {
                            name,
                            display_name,
                            content,
                        });
                    }
                }
            }
        }
    }
    extensions
}

#[tauri::command]
pub fn read_standup_file() -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "".to_string());
    if home.is_empty() { return Err("No home dir".into()); }
    let dir = std::path::Path::new(&home).join(".prep-standup");

    // Find today's file, e.g. YYYY-MM-DD.md
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut file_path = dir.join(format!("{}.md", today));

    if !file_path.exists() {
        // Just find the latest .md file
        if let Ok(entries) = std::fs::read_dir(&dir) {
            let mut latest: Option<(std::path::PathBuf, std::time::SystemTime)> = None;
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |e| e == "md") {
                    if let Ok(metadata) = path.metadata() {
                        if let Ok(modified) = metadata.modified() {
                            if latest.is_none() || modified > latest.as_ref().unwrap().1 {
                                latest = Some((path, modified));
                            }
                        }
                    }
                }
            }
            if let Some((path, _)) = latest {
                file_path = path;
            } else {
                return Err("No standup files found".into());
            }
        } else {
            return Err("Could not read directory".into());
        }
    }

    std::fs::read_to_string(file_path).map_err(|e| e.to_string())
}

/// Floatnote's tray action creates or reveals its window, including after close.
#[tauri::command]
pub async fn open_floatnote() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(|| {
            use std::process::Command;
            let home = dirs::home_dir().ok_or("Could not resolve home directory")?;
            let app = home.join(".floatnote/Floatnote.app");
            if !app.is_dir() { return Err("Floatnote is not installed in ~/.floatnote".into()); }
            let status = Command::new("/usr/bin/open").arg("-n").arg(&app).status().map_err(|e| e.to_string())?;
            if !status.success() { return Err("Could not launch Floatnote".into()); }
            let binary = app.join("Contents/MacOS/Floatnote");
            for _ in 0..20 {
                // Read the app PID without matching helper processes.
                if let Ok(output) = Command::new("/usr/bin/pgrep").args(["-f", &format!("^{}$", binary.display())]).output() {
                    if let Some(pid) = String::from_utf8_lossy(&output.stdout).lines().find_map(|line| line.parse::<i32>().ok()) {
                        if floatnote_window_visible(pid) || press_floatnote_tray(pid) { return Ok(()); }
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err("Could not show Floatnote. Allow BetterBar in System Settings → Privacy & Security → Accessibility.".into())
        }).await.map_err(|err| err.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    { Err("Floatnote is only supported on macOS".into()) }
}

#[cfg(target_os = "macos")]
fn press_floatnote_tray(pid: i32) -> bool {
    use core_foundation::base::{CFType, CFTypeRef, TCFType};
    use core_foundation::string::CFString;
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXUIElementCreateApplication(pid: i32) -> CFTypeRef;
        fn AXUIElementCopyAttributeValue(element: CFTypeRef, name: CFTypeRef, value: *mut CFTypeRef) -> i32;
        fn AXUIElementPerformAction(element: CFTypeRef, action: CFTypeRef) -> i32;
    }
    extern "C" {
        fn CFArrayGetCount(array: CFTypeRef) -> isize;
        fn CFArrayGetValueAtIndex(array: CFTypeRef, index: isize) -> CFTypeRef;
    }
    unsafe fn attribute(element: CFTypeRef, name: &str) -> Option<CFType> {
        let name = CFString::new(name);
        let mut value = std::ptr::null();
        if AXUIElementCopyAttributeValue(element, name.as_CFTypeRef(), &mut value) != 0 || value.is_null() { return None; }
        Some(CFType::wrap_under_create_rule(value))
    }
    unsafe {
        if !AXIsProcessTrusted() { return false; }
        let raw = AXUIElementCreateApplication(pid);
        if raw.is_null() { return false; }
        let app = CFType::wrap_under_create_rule(raw);
        let Some(bar) = attribute(app.as_CFTypeRef(), "AXExtrasMenuBar") else { return false; };
        let Some(children) = attribute(bar.as_CFTypeRef(), "AXChildren") else { return false; };
        if CFArrayGetCount(children.as_CFTypeRef()) < 1 { return false; }
        let button = CFArrayGetValueAtIndex(children.as_CFTypeRef(), 0);
        let press = CFString::new("AXPress");
        AXUIElementPerformAction(button, press.as_CFTypeRef()) == 0
    }
}

#[cfg(target_os = "macos")]
fn floatnote_window_visible(pid: i32) -> bool {
    use core_foundation::base::{CFType, CFTypeRef, TCFType};
    use core_foundation::string::CFString;
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" { fn CGWindowListCopyWindowInfo(options: u32, window: u32) -> CFTypeRef; }
    extern "C" {
        fn CFArrayGetCount(array: CFTypeRef) -> isize;
        fn CFArrayGetValueAtIndex(array: CFTypeRef, index: isize) -> CFTypeRef;
        fn CFDictionaryGetValue(dict: CFTypeRef, key: CFTypeRef) -> CFTypeRef;
        fn CFNumberGetValue(number: CFTypeRef, kind: i32, value: *mut i32) -> bool;
    }
    unsafe {
        let raw = CGWindowListCopyWindowInfo(1 | 16, 0);
        if raw.is_null() { return false; }
        let windows = CFType::wrap_under_create_rule(raw);
        let owner = CFString::new("kCGWindowOwnerPID");
        let layer = CFString::new("kCGWindowLayer");
        for i in 0..CFArrayGetCount(windows.as_CFTypeRef()) {
            let dict = CFArrayGetValueAtIndex(windows.as_CFTypeRef(), i);
            let owner_value = CFDictionaryGetValue(dict, owner.as_CFTypeRef());
            let layer_value = CFDictionaryGetValue(dict, layer.as_CFTypeRef());
            let (mut owner_pid, mut window_layer) = (0, 100);
            if !owner_value.is_null() && !layer_value.is_null()
                && CFNumberGetValue(owner_value, 3, &mut owner_pid) && CFNumberGetValue(layer_value, 3, &mut window_layer)
                && owner_pid == pid && window_layer < 20 { return true; }
        }
        false
    }
}
