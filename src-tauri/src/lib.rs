use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningApp {
    pub name: String,
    pub bundle_id: String,
    pub pid: i32,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenInfo {
    pub width: f64,
    pub height: f64,
    pub scale_factor: f64,
}

// --- Commands ---

#[tauri::command]
async fn get_running_apps() -> Vec<RunningApp> {
    #[cfg(target_os = "macos")]
    {
        macos::get_running_apps()
    }
    #[cfg(not(target_os = "macos"))]
    {
        vec![]
    }
}

#[tauri::command]
async fn launch_app(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::launch_app(&path)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("Not supported on this platform".to_string())
    }
}

#[tauri::command]
async fn get_screen_info<R: Runtime>(app: AppHandle<R>) -> ScreenInfo {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(Some(m)) = window.primary_monitor() {
            let size = m.size();
            let scale = m.scale_factor();
            return ScreenInfo {
                width: size.width as f64 / scale,
                height: size.height as f64 / scale,
                scale_factor: scale,
            };
        }
    }
    ScreenInfo {
        width: 1920.0,
        height: 1080.0,
        scale_factor: 1.0,
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
            macos::set_window_level(&window, &level)?;
        }
    }
    let _ = (app, level);
    Ok(())
}

#[tauri::command]
async fn get_app_icon(bundle_id: String) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        macos::get_app_icon_base64(&bundle_id)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = bundle_id;
        None
    }
}

// --- macOS-specific implementation ---

#[cfg(target_os = "macos")]
mod macos {
    use super::RunningApp;
    use std::process::Command;
    use tauri::WebviewWindow;

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
                        let pid: i32 = parts
                            .get(1)
                            .unwrap_or(&"0")
                            .trim()
                            .parse()
                            .unwrap_or(0);
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

        let tmp = format!(
            "/tmp/betterbar_icon_{}.png",
            bundle_id.replace('.', "_")
        );
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

    pub fn set_window_level<R: tauri::Runtime>(window: &WebviewWindow<R>, level: &str) -> Result<(), String> {
        use cocoa::base::id;
        use objc::{msg_send, sel, sel_impl};

        // Raw NSWindowLevel constants (AppKit)
        let window_level: i64 = match level {
            "dock"         => 20,   // NSDockWindowLevel
            "floating"     => 3,    // NSFloatingWindowLevel
            "screen_saver" => 1000, // NSScreenSaverWindowLevel
            _              => 0,    // NSNormalWindowLevel
        };

        let ns_window = window.ns_window().map_err(|e| e.to_string())? as id;

        unsafe {
            // NSWindowCollectionBehaviorCanJoinAllSpaces (1<<3) | NSWindowCollectionBehaviorStationary (1<<4)
            let collection_behavior: u64 = (1 << 3) | (1 << 4);
            let _: () = msg_send![ns_window, setLevel: window_level];
            let _: () = msg_send![ns_window, setCollectionBehavior: collection_behavior];
        }

        Ok(())
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
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                // Run as accessory — no Dock icon, no menu bar
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_visible_on_all_workspaces(true);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BetterBar");
}
