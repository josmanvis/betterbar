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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowThumbnail {
    pub image: String,         // "data:image/png;base64,..."
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalApp {
    pub name: String,
    pub bundle_id: String,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MusicInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub is_playing: bool,
    pub app_name: String,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowDetails {
    pub id: u32,
    pub title: String,
    pub pid: i32,
    pub owner_name: String,
    pub bundle_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceInfo {
    pub id: u32,
    pub name: String,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseInfo {
    pub version: String,
    pub name: String,
    pub published_at: String,
    pub body: String,
    pub html_url: String,
    pub download_url: Option<String>,
    pub has_update: bool,
    pub current_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaffeineStatus {
    pub active: bool,
    pub minutes_remaining: Option<u32>,
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
async fn get_installed_terminals() -> Vec<TerminalApp> {
    #[cfg(target_os = "macos")]
    { macos::get_installed_terminals() }
    #[cfg(not(target_os = "macos"))]
    { vec![] }
}

#[tauri::command]
async fn execute_terminal_command(bundle_id: String, command: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::execute_terminal_command(&bundle_id, &command) }
    #[cfg(not(target_os = "macos"))]
    { let _ = (bundle_id, command); Err("Not supported".to_string()) }
}

#[tauri::command]
async fn focus_app(bundle_id: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::focus_app(&bundle_id) }
    #[cfg(not(target_os = "macos"))]
    { let _ = bundle_id; Ok(()) }
}

#[tauri::command]
async fn launch_app(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::launch_app(&path) }
    #[cfg(not(target_os = "macos"))]
    { let _ = path; Err("Not supported".to_string()) }
}

#[tauri::command]
async fn hide_app(bundle_id: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::hide_app(&bundle_id) }
    #[cfg(not(target_os = "macos"))]
    { let _ = bundle_id; Err("Not supported".to_string()) }
}

#[tauri::command]
async fn quit_app(bundle_id: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::quit_app(&bundle_id) }
    #[cfg(not(target_os = "macos"))]
    { let _ = bundle_id; Err("Not supported".to_string()) }
}

#[tauri::command]
async fn zoom_app_window(bundle_id: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::zoom_app_window(&bundle_id) }
    #[cfg(not(target_os = "macos"))]
    { let _ = bundle_id; Err("Not supported".to_string()) }
}

#[tauri::command]
async fn launch_simulator(simulator_type: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::launch_simulator(&simulator_type) }
    #[cfg(not(target_os = "macos"))]
    { let _ = simulator_type; Err("Not supported".to_string()) }
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
async fn check_screen_recording_permission() -> bool {
    #[cfg(target_os = "macos")]
    { macos::check_screen_recording() }
    #[cfg(not(target_os = "macos"))]
    { true }
}

#[tauri::command]
async fn request_screen_recording_permission() {
    #[cfg(target_os = "macos")]
    { macos::request_screen_recording(); }
}

#[tauri::command]
async fn get_window_thumbnail(pid: i32) -> Option<WindowThumbnail> {
    #[cfg(target_os = "macos")]
    { macos::get_window_thumbnail(pid) }
    #[cfg(not(target_os = "macos"))]
    { let _ = pid; None }
}

#[tauri::command]
async fn get_on_screen_windows() -> Vec<WindowDetails> {
    #[cfg(target_os = "macos")]
    { macos::get_on_screen_windows() }
    #[cfg(not(target_os = "macos"))]
    { vec![] }
}

#[tauri::command]
async fn focus_window(pid: i32, title: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::focus_window(pid, &title) }
    #[cfg(not(target_os = "macos"))]
    { let _ = (pid, title); Ok(()) }
}

#[tauri::command]
async fn get_window_id_thumbnail(window_id: u32) -> Option<WindowThumbnail> {
    #[cfg(target_os = "macos")]
    { macos::get_window_id_thumbnail(window_id) }
    #[cfg(not(target_os = "macos"))]
    { let _ = window_id; None }
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

#[derive(Copy, Clone, Debug)]
struct BarGeometry {
    strict_overlap: bool,
    position: [u8; 16],
    position_len: usize,
    bar_size: f64,
}

static BAR_GEOMETRY: std::sync::Mutex<BarGeometry> = std::sync::Mutex::new(BarGeometry {
    strict_overlap: false,
    position: [0; 16],
    position_len: 0,
    bar_size: 68.0,
});

#[tauri::command]
async fn update_bar_geometry(strict_overlap: bool, position: String, bar_size: f64) {
    if let Ok(mut geom) = BAR_GEOMETRY.lock() {
        geom.strict_overlap = strict_overlap;
        geom.bar_size = bar_size;
        let bytes = position.as_bytes();
        let len = bytes.len().min(15);
        geom.position[..len].copy_from_slice(&bytes[..len]);
        geom.position_len = len;
    }
}

#[tauri::command]
async fn get_music_info() -> MusicInfo {
    #[cfg(target_os = "macos")]
    { macos::get_music_info() }
    #[cfg(not(target_os = "macos"))]
    { MusicInfo { title: String::new(), artist: String::new(), album: String::new(), is_playing: false, app_name: String::new(), available: false } }
}

#[tauri::command]
async fn focus_music_app(app_name: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::focus_music_app(&app_name) }
    #[cfg(not(target_os = "macos"))]
    { let _ = app_name; Err("Not supported".to_string()) }
}

#[tauri::command]
async fn music_play_pause() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::music_play_pause() }
    #[cfg(not(target_os = "macos"))]
    { Err("Not supported".to_string()) }
}

#[tauri::command]
async fn music_next() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::music_next() }
    #[cfg(not(target_os = "macos"))]
    { Err("Not supported".to_string()) }
}

#[tauri::command]
async fn music_previous() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::music_previous() }
    #[cfg(not(target_os = "macos"))]
    { Err("Not supported".to_string()) }
}

#[tauri::command]
async fn get_spaces() -> Vec<SpaceInfo> {
    #[cfg(target_os = "macos")]
    { macos::get_spaces() }
    #[cfg(not(target_os = "macos"))]
    { vec![] }
}

#[tauri::command]
async fn switch_to_space(space_id: u32) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::switch_to_space(space_id) }
    #[cfg(not(target_os = "macos"))]
    { let _ = space_id; Err("Not supported".to_string()) }
}

#[tauri::command]
async fn get_open_on_login() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    { macos::get_open_on_login() }
    #[cfg(not(target_os = "macos"))]
    { Ok(false) }
}

#[tauri::command]
async fn set_open_on_login(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::set_open_on_login(enabled) }
    #[cfg(not(target_os = "macos"))]
    { let _ = enabled; Ok(()) }
}

#[tauri::command]
async fn check_for_updates() -> Result<ReleaseInfo, String> {
    #[cfg(target_os = "macos")]
    { macos::check_for_updates() }
    #[cfg(not(target_os = "macos"))]
    { Err("Not supported".to_string()) }
}

#[tauri::command]
async fn install_update(download_url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { macos::install_update(&download_url) }
    #[cfg(not(target_os = "macos"))]
    { let _ = download_url; Err("Not supported".to_string()) }
}

#[tauri::command]
async fn get_caffeine_status() -> CaffeineStatus {
    #[cfg(target_os = "macos")]
    { macos::get_caffeine_status() }
    #[cfg(not(target_os = "macos"))]
    { CaffeineStatus { active: false, minutes_remaining: None } }
}

#[tauri::command]
async fn set_caffeine(enabled: bool, duration_mins: Option<u32>) -> Result<CaffeineStatus, String> {
    #[cfg(target_os = "macos")]
    { macos::set_caffeine(enabled, duration_mins) }
    #[cfg(not(target_os = "macos"))]
    { let _ = (enabled, duration_mins); Ok(CaffeineStatus { active: false, minutes_remaining: None }) }
}

#[tauri::command]
async fn toggle_caffeine(duration_mins: Option<u32>) -> Result<CaffeineStatus, String> {
    #[cfg(target_os = "macos")]
    { macos::toggle_caffeine(duration_mins) }
    #[cfg(not(target_os = "macos"))]
    { let _ = duration_mins; Ok(CaffeineStatus { active: false, minutes_remaining: None }) }
}

/// Show + focus the settings window. Implemented in Rust so it bypasses any
/// `core:window:allow-show` / `allow-set-focus` capability requirements.
#[tauri::command]
async fn open_settings_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    println!("[BetterBar] open_settings_window command invoked!");
    if let Some(window) = app.get_webview_window("settings") {
        println!("[BetterBar] settings window found, calling show()...");
        window.show().map_err(|e| {
            println!("[BetterBar] failed to show settings window: {}", e);
            e.to_string()
        })?;
        let _ = window.unminimize();
        println!("[BetterBar] settings window unminimized, focusing...");
        window.set_focus().map_err(|e| {
            println!("[BetterBar] failed to focus settings window: {}", e);
            e.to_string()
        })?;
        println!("[BetterBar] settings window opened and focused successfully!");
    } else {
        println!("[BetterBar] settings window NOT found, creating dynamically...");
        let win = tauri::WebviewWindowBuilder::new(
            &app,
            "settings",
            tauri::WebviewUrl::App("index.html#settings".into()),
        )
        .title("BetterBar Settings")
        .inner_size(480.0, 600.0)
        .min_inner_size(420.0, 480.0)
        .decorations(true)
        .transparent(false)
        .always_on_top(false)
        .skip_taskbar(false)
        .resizable(true)
        .center()
        .shadow(true)
        .build()
        .map_err(|e| {
            println!("[BetterBar] failed to build settings window: {}", e);
            e.to_string()
        })?;
        
        let win_clone = win.clone();
        win.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = win_clone.hide();
            }
        });
        
        win.show().map_err(|e| e.to_string())?;
        let _ = win.unminimize();
        win.set_focus().map_err(|e| e.to_string())?;
        println!("[BetterBar] settings window created dynamically and focused!");
    }
    Ok(())
}

/// Returns the floating bar's current outer position in physical pixels.
/// Used to persist `floatPosition` after a native window drag.
#[tauri::command]
async fn get_window_outer_position<R: Runtime>(app: AppHandle<R>) -> Result<(i32, i32), String> {
    if let Some(window) = app.get_webview_window("main") {
        let pos = window.outer_position().map_err(|e| e.to_string())?;
        return Ok((pos.x, pos.y));
    }
    Err("main window not found".to_string())
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
    use super::{BatteryInfo, MusicInfo, RunningApp, ScreenInfo, WindowDetails};
    use core_foundation::base::TCFType;
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

    // ── CoreFoundation raw types (linked transitively via cocoa crate) ────────────
    type CFTypeRef  = *const std::os::raw::c_void;
    type CFArrayRef = CFTypeRef;
    type CFIndex    = isize;

    extern "C" {
        fn CFArrayGetCount(the_array: CFArrayRef) -> CFIndex;
        fn CFArrayGetValueAtIndex(the_array: CFArrayRef, idx: CFIndex) -> CFTypeRef;
        fn CFDictionaryGetValue(the_dict: CFTypeRef, key: CFTypeRef) -> CFTypeRef;
        fn CFStringCreateWithCString(
            alloc:    CFTypeRef,
            c_str:    *const std::os::raw::c_char,
            encoding: u32,
        ) -> CFTypeRef;
        fn CFNumberGetValue(
            number:    CFTypeRef,
            the_type:  i32,
            value_ptr: *mut std::os::raw::c_void,
        ) -> bool;
        fn CFRelease(cf: CFTypeRef);
    }

    const CF_STRING_ENCODING_UTF8: u32            = 0x0800_0100;
    const CF_NUMBER_SINT32_TYPE: i32              = 3;
    const CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: u32    = 1 << 0; // = 1
    const CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS: u32 = 1 << 4; // = 16
    const CG_NULL_WINDOW_ID: u32                  = 0;

    // CGMainDisplayID is public CoreGraphics API
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGMainDisplayID() -> CGDirectDisplayID;
        fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> *const std::os::raw::c_void;
        fn CGPreflightScreenCaptureAccess() -> bool;
        fn CGRequestScreenCaptureAccess() -> bool;
    }

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXUIElementCreateApplication(pid: i32) -> CFTypeRef;
        fn AXUIElementCopyAttributeValue(
            element: CFTypeRef,
            attribute: CFTypeRef,
            value: *mut CFTypeRef,
        ) -> i32;
        fn _AXUIElementGetWindow(element: CFTypeRef, id: *mut u32) -> i32;
    }

    // dlsym is in libSystem (always available on macOS) — used to look up private CGS symbols
    extern "C" {
        fn dlsym(
            handle: *mut std::os::raw::c_void,
            symbol: *const std::os::raw::c_char,
        ) -> *mut std::os::raw::c_void;
    }

    use std::sync::Mutex;
    static ACTIVE_INSETS: Mutex<NSEdgeInsets> = Mutex::new(NSEdgeInsets {
        top: 0.0,
        left: 0.0,
        bottom: 0.0,
        right: 0.0,
    });

    /// Low-level CGS Set Screen Insets call that bypasses state tracking.
    fn cgs_set_screen_insets_raw(insets: NSEdgeInsets) {
        let rtld_default = -2_isize as *mut std::os::raw::c_void;
        unsafe {
            let sym_cid = dlsym(rtld_default, b"CGSMainConnectionID\0".as_ptr().cast());
            let sym_set = dlsym(rtld_default, b"CGSSetScreenInsets\0".as_ptr().cast());
            if sym_cid.is_null() || sym_set.is_null() {
                return;
            }
            let get_cid: unsafe extern "C" fn() -> CGSConnectionID = std::mem::transmute(sym_cid);
            let set_insets: unsafe extern "C" fn(CGSConnectionID, CGDirectDisplayID, NSEdgeInsets) =
                std::mem::transmute(sym_set);
            let cid     = get_cid();
            let display = CGMainDisplayID();
            set_insets(cid, display, insets);
        }
    }

    /// Must be called from the main thread — CGS connection is main-thread bound.
    pub fn cgs_set_screen_insets(insets: NSEdgeInsets) {
        if let Ok(mut active) = ACTIVE_INSETS.lock() {
            *active = insets;
        }
        cgs_set_screen_insets_raw(insets);

        use cocoa::base::{id, nil};
        use objc::{msg_send, sel, sel_impl};
        unsafe {
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
            // 1. Temporarily clear screen insets raw to measure standard system visibleFrame (Dock + Menu Bar)
            cgs_set_screen_insets_raw(NSEdgeInsets::default());

            let screen: id = msg_send![objc::class!(NSScreen), mainScreen];
            if screen == nil {
                // Restore active insets before returning
                if let Ok(active) = ACTIVE_INSETS.lock() {
                    cgs_set_screen_insets_raw(*active);
                }
                return ScreenInfo { width: 1920.0, height: 1080.0, scale_factor: scale, menu_bar_height: 0.0, dock_height: 0.0 };
            }

            let frame: CgRect = msg_send![screen, frame];
            let visible: CgRect = msg_send![screen, visibleFrame];

            let full_h = frame.size.height;

            // Menu bar is at the top in macOS (origin at bottom-left)
            let menu_bar_height = (full_h - (visible.origin.y + visible.size.height)).max(0.0);

            // Dock height is the bottom gap (visibleFrame.origin.y) when dock is at bottom
            let dock_height = visible.origin.y.max(0.0);

            // 2. Restore active insets
            if let Ok(active) = ACTIVE_INSETS.lock() {
                cgs_set_screen_insets_raw(*active);
            }

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
        try
            set appBundle to bundle identifier of anApp
            if appBundle is missing value then
                set appBundle to ""
            end if
        on error
            set appBundle to ""
        end try
        set appList to appList & appName & "|" & appPID & "|" & appBundle & "\n"
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
                        let mut parsed_bundle = parts.get(2).unwrap_or(&"").trim().to_string();
                        if parsed_bundle.is_empty() {
                            parsed_bundle = name.to_lowercase().replace(' ', ".");
                        }
                        RunningApp {
                            bundle_id: parsed_bundle,
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
        let status = Command::new("open")
            .arg(path)
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("open failed for path: {}", path))
        }
    }

    pub fn focus_app(bundle_id: &str) -> Result<(), String> {
        let status = Command::new("open")
            .args(["-b", bundle_id])
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("open failed for bundle_id: {}", bundle_id))
        }
    }

    pub fn hide_app(bundle_id: &str) -> Result<(), String> {
        let script = format!(
            r#"tell application "System Events"
    try
        set visible of (first process whose bundle identifier is "{}") to false
    end try
end tell"#,
            bundle_id
        );
        let output = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("hide_app failed: {}", stderr))
        }
    }

    pub fn quit_app(bundle_id: &str) -> Result<(), String> {
        let script = format!(
            r#"tell application id "{}" to quit"#,
            bundle_id
        );
        let output = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("quit_app failed: {}", stderr))
        }
    }

    pub fn zoom_app_window(bundle_id: &str) -> Result<(), String> {
        let script = format!(
            r#"tell application "System Events"
    try
        tell (first process whose bundle identifier is "{}")
            try
                click (button 1 of window 1)
            end try
        end tell
    end try
end tell"#,
            bundle_id
        );
        let output = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("zoom_app_window failed: {}", stderr))
        }
    }

    pub fn launch_simulator(simulator_type: &str) -> Result<(), String> {
        // Non-iOS simulators (VMs etc.)
        match simulator_type {
            "windows11" => {
                return Command::new("VBoxManage")
                    .args(["startvm", "Windows 11", "--type", "gui"])
                    .status()
                    .map_err(|e| format!("VBoxManage failed: {}", e))
                    .map(|_| ());
            }
            "macos" => {
                return Command::new("open")
                    .args(["-a", "UTM"])
                    .status()
                    .map_err(|e| format!("UTM failed: {}", e))
                    .map(|_| ());
            }
            "androidphone" | "androidtablet" => {
                let script = r#"
EMULATOR=""
for p in "$HOME/Library/Android/sdk/emulator/emulator" "/usr/local/share/android-sdk/emulator/emulator"; do
    if [ -x "$p" ]; then EMULATOR="$p"; break; fi
done
if [ -n "$EMULATOR" ]; then
    AVD=$("$EMULATOR" -list-avds 2>/dev/null | head -1)
    if [ -n "$AVD" ]; then
        "$EMULATOR" -avd "$AVD" &
    fi
fi
open -a "Android Studio" 2>/dev/null
"#;
                let output = Command::new("bash")
                    .args(["-c", script])
                    .output()
                    .map_err(|e| e.to_string())?;
                if output.status.success() {
                    return Ok(());
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    return Err(format!("Android launch failed: {}", stderr));
                }
            }
            _ => {}
        }

        let device_name = match simulator_type {
            "iphone"      => "iPhone 17",
            "iphonepro"   => "iPhone 17 Pro",
            "iphonepromax"=> "iPhone 17 Pro Max",
            "iphoneair"   => "iPhone Air",
            "iphonee"     => "iPhone 17e",
            "ipad"        => "iPad (A16)",
            "ipadpro"     => "iPad Pro 13-inch (M5)",
            "ipadpro11"   => "iPad Pro 11-inch (M5)",
            "ipadmini"    => "iPad mini (A17 Pro)",
            "ipadair"     => "iPad Air 13-inch (M4)",
            "ipadair11"   => "iPad Air 11-inch (M4)",
            _ => return Err(format!("Unknown simulator type: {}", simulator_type)),
        };
        let script = format!(
            r#"set deviceName to "{}"
set deviceInfo to do shell script "xcrun simctl list devices available | grep -F \\"" & deviceName & " (\\" | head -1"
if deviceInfo is "" then error "Device not found: " & deviceName
set AppleScript's text item delimiters to "-"
set udid to ""
try
    set AppleScript's text item delimiters to ""
    set udid to do shell script "echo " & quoted form of deviceInfo & " | grep -oE '[0-9A-F]{{8}}-[0-9A-F]{{4}}-[0-9A-F]{{4}}-[0-9A-F]{{4}}-[0-9A-F]{{12}}'"
end try
if udid is "" then error "Could not parse UDID"
if deviceInfo does not contain "(Booted)" then
    do shell script "xcrun simctl boot " & udid
end if
do shell script "open -a Simulator""#,
            device_name
        );
        let output = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("launch_simulator failed: {}", stderr))
        }
    }

    pub fn get_installed_terminals() -> Vec<super::TerminalApp> {
        let known_terminals = vec![
            ("Terminal", "com.apple.Terminal"),
            ("iTerm2", "com.googlecode.iterm2"),
            ("Warp", "dev.warp.Warp-Official"),
            ("Ghostty", "com.mitchellh.ghostty"),
            ("Kitty", "net.kovidgoyal.kitty"),
            ("Alacritty", "io.alacritty"),
            ("WezTerm", "com.github.wez.wezterm"),
            ("Hyper", "co.zeit.hyper"),
        ];

        let mut installed = Vec::new();
        for (name, bundle_id) in known_terminals {
            if let Some(icon) = get_app_icon_base64(bundle_id) {
                installed.push(super::TerminalApp {
                    name: name.to_string(),
                    bundle_id: bundle_id.to_string(),
                    icon: Some(icon),
                });
            }
        }
        installed
    }

    pub fn execute_terminal_command(bundle_id: &str, command: &str) -> Result<(), String> {
        if bundle_id == "com.apple.Terminal" {
            let script = format!(
                r#"tell application id "com.apple.Terminal"
    do script "{}"
    activate
end tell"#,
                command.replace('"', "\\\"")
            );
            let status = Command::new("osascript").args(["-e", &script]).status().map_err(|e| e.to_string())?;
            if status.success() { return Ok(()); }
        } else if bundle_id == "com.googlecode.iterm2" {
            let script = format!(
                r#"tell application id "com.googlecode.iterm2"
    create window with default profile command "{}"
    activate
end tell"#,
                command.replace('"', "\\\"")
            );
            let status = Command::new("osascript").args(["-e", &script]).status().map_err(|e| e.to_string())?;
            if status.success() { return Ok(()); }
        }
        
        // Fallback using temporary .command file
        let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_micros();
        let tmp_path = format!("/tmp/bb_exec_{}.command", timestamp);
        let script_content = format!(
            "#!/bin/bash\n{}\nrm -- \"$0\"\n",
            command
        );
        std::fs::write(&tmp_path, script_content).map_err(|e| e.to_string())?;
        
        let status = Command::new("chmod").args(["+x", &tmp_path]).status().map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Failed to make script executable".to_string());
        }

        let status = Command::new("open").args(["-b", bundle_id, &tmp_path]).status().map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("open failed for bundle_id: {}", bundle_id))
        }
    }

    /// Resolve a bundle id to its app icon via NSWorkspace, render at 128×128,
    /// PNG-encode it, and return a `data:image/png;base64,…` URL.
    ///
    /// Direct Cocoa replaces the previous shell pipeline (mdfind → find → sips
    /// → base64) which was fragile (PATH issues under Tauri, missing/binary
    /// Info.plists, ambiguous .icns selection).
    pub fn get_app_icon_base64(bundle_id: &str) -> Option<String> {
        use base64::Engine;
        use cocoa::base::{id, nil};
        use cocoa::foundation::NSString;
        use objc::{class, msg_send, sel, sel_impl};

        unsafe {
            let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
            if workspace == nil {
                eprintln!("[BetterBar] NSWorkspace sharedWorkspace returned nil");
                return None;
            }

            let bundle_ns: id = NSString::alloc(nil).init_str(bundle_id);
            let app_url: id = msg_send![workspace, URLForApplicationWithBundleIdentifier: bundle_ns];
            if app_url == nil {
                eprintln!("[BetterBar] No app URL for bundle id: {}", bundle_id);
                return None;
            }

            let app_path_ns: id = msg_send![app_url, path];
            if app_path_ns == nil {
                eprintln!("[BetterBar] No POSIX path for {}", bundle_id);
                return None;
            }

            let icon: id = msg_send![workspace, iconForFile: app_path_ns];
            if icon == nil {
                eprintln!("[BetterBar] No icon for {}", bundle_id);
                return None;
            }

            // Render at a comfortable @2x size — 128 logical px covers up to 128
            // CSS pixels in the bar without blur.
            let size = CgSize { width: 128.0, height: 128.0 };
            let _: () = msg_send![icon, setSize: size];

            let mut proposed = CgRect {
                origin: CgPoint { x: 0.0, y: 0.0 },
                size,
            };
            let cg_image: *mut std::ffi::c_void = msg_send![
                icon,
                CGImageForProposedRect: &mut proposed as *mut CgRect
                context: nil
                hints: nil
            ];
            if cg_image.is_null() {
                eprintln!("[BetterBar] CGImageForProposedRect returned null for {}", bundle_id);
                return None;
            }

            let bitmap: id = msg_send![class!(NSBitmapImageRep), alloc];
            let bitmap: id = msg_send![bitmap, initWithCGImage: cg_image];
            if bitmap == nil {
                eprintln!("[BetterBar] initWithCGImage failed for {}", bundle_id);
                return None;
            }

            // NSBitmapImageFileType: PNG = 4
            let png_type: u64 = 4;
            let png_data: id = msg_send![bitmap, representationUsingType: png_type properties: nil];
            if png_data == nil {
                eprintln!("[BetterBar] PNG representation failed for {}", bundle_id);
                return None;
            }

            let len: usize = msg_send![png_data, length];
            let bytes_ptr: *const u8 = msg_send![png_data, bytes];
            if bytes_ptr.is_null() || len == 0 {
                eprintln!("[BetterBar] PNG buffer empty for {}", bundle_id);
                return None;
            }
            let slice = std::slice::from_raw_parts(bytes_ptr, len);

            let encoded = base64::engine::general_purpose::STANDARD.encode(slice);
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
        use cocoa::base::{id, nil};
        use objc::{msg_send, sel, sel_impl};

        unsafe {
            // 1. Temporarily clear screen insets raw to measure standard system visibleFrame (Dock + Menu Bar)
            cgs_set_screen_insets_raw(NSEdgeInsets::default());

            let screen: id = msg_send![objc::class!(NSScreen), mainScreen];
            if screen == nil {
                // If screen is nil, restore fallback behavior
                let fallback = match position {
                    "left"   => NSEdgeInsets { left: bar_size, ..Default::default() },
                    "right"  => NSEdgeInsets { right: bar_size, ..Default::default() },
                    "bottom" => NSEdgeInsets { bottom: bar_size, ..Default::default() },
                    "top"    => NSEdgeInsets { top: menu_bar_height + bar_size, ..Default::default() },
                    _        => return,
                };
                cgs_set_screen_insets(fallback);
                return;
            }

            let frame: CgRect = msg_send![screen, frame];
            let visible: CgRect = msg_send![screen, visibleFrame];

            let sys_left = visible.origin.x.max(0.0);
            let sys_bottom = visible.origin.y.max(0.0);
            let sys_right = (frame.size.width - (visible.origin.x + visible.size.width)).max(0.0);
            let sys_top = (frame.size.height - (visible.origin.y + visible.size.height)).max(0.0);

            // 2. Combine the default system margins with BetterBar's size on the appropriate edge
            let insets = match position {
                "left"   => NSEdgeInsets {
                    left: sys_left + bar_size,
                    right: sys_right,
                    bottom: sys_bottom,
                    top: sys_top,
                },
                "right"  => NSEdgeInsets {
                    left: sys_left,
                    right: sys_right + bar_size,
                    bottom: sys_bottom,
                    top: sys_top,
                },
                "bottom" => NSEdgeInsets {
                    left: sys_left,
                    right: sys_right,
                    bottom: sys_bottom + bar_size,
                    top: sys_top,
                },
                "top"    => NSEdgeInsets {
                    left: sys_left,
                    right: sys_right,
                    bottom: sys_bottom,
                    top: sys_top + bar_size,
                },
                _        => {
                    NSEdgeInsets {
                        left: sys_left,
                        right: sys_right,
                        bottom: sys_bottom,
                        top: sys_top,
                    }
                }
            };

            // 3. Apply combined insets (this will also update ACTIVE_INSETS and restore state)
            cgs_set_screen_insets(insets);
        }
    }

    /// Call only from the main thread.
    pub fn clear_screen_insets() {
        cgs_set_screen_insets(NSEdgeInsets::default());
    }

    pub fn check_screen_recording() -> bool {
        unsafe { CGPreflightScreenCaptureAccess() }
    }

    pub fn request_screen_recording() {
        let _ = Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn();
    }

    pub fn get_bundle_id_for_pid(pid: i32) -> Option<String> {
        use cocoa::base::{id, nil};
        use objc::{class, msg_send, sel, sel_impl};

        unsafe {
            let app: id = msg_send![class!(NSRunningApplication), runningApplicationWithProcessIdentifier: pid];
            if app == nil {
                return None;
            }
            let bundle_id_ns: id = msg_send![app, bundleIdentifier];
            if bundle_id_ns == nil {
                return None;
            }
            let cf_str = core_foundation::string::CFString::wrap_under_get_rule(bundle_id_ns as _);
            Some(cf_str.to_string())
        }
    }

    fn get_ax_window_title(target_pid: i32, target_window_id: u32) -> Option<String> {
        unsafe {
            let app_ref = AXUIElementCreateApplication(target_pid);
            if app_ref.is_null() { return None; }

            let attr_windows = CFStringCreateWithCString(
                std::ptr::null(),
                b"AXWindows\0".as_ptr() as _,
                CF_STRING_ENCODING_UTF8,
            );

            let mut windows_ref: CFTypeRef = std::ptr::null();
            if AXUIElementCopyAttributeValue(app_ref, attr_windows, &mut windows_ref) != 0 || windows_ref.is_null() {
                CFRelease(app_ref);
                CFRelease(attr_windows);
                return None;
            }

            let count = CFArrayGetCount(windows_ref);
            let attr_title = CFStringCreateWithCString(
                std::ptr::null(),
                b"AXTitle\0".as_ptr() as _,
                CF_STRING_ENCODING_UTF8,
            );

            let mut result = None;

            for i in 0..count {
                let window = CFArrayGetValueAtIndex(windows_ref, i);
                if window.is_null() { continue; }

                let mut cg_win_id: u32 = 0;
                if _AXUIElementGetWindow(window, &mut cg_win_id) == 0 {
                    if cg_win_id == target_window_id {
                        let mut title_ref: CFTypeRef = std::ptr::null();
                        if AXUIElementCopyAttributeValue(window, attr_title, &mut title_ref) == 0 && !title_ref.is_null() {
                            let cf_str = core_foundation::string::CFString::wrap_under_get_rule(title_ref as _);
                            result = Some(cf_str.to_string());
                            CFRelease(title_ref);
                        }
                        break;
                    }
                }
            }

            CFRelease(attr_title);
            CFRelease(windows_ref);
            CFRelease(attr_windows);
            CFRelease(app_ref);

            result
        }
    }

    pub fn get_on_screen_windows() -> Vec<WindowDetails> {
        let option = CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY | CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS;
        unsafe {
            let raw_array = CGWindowListCopyWindowInfo(option, CG_NULL_WINDOW_ID);
            if raw_array.is_null() {
                return vec![];
            }

            let pid_key = CFStringCreateWithCString(
                std::ptr::null(),
                b"kCGWindowOwnerPID\0".as_ptr() as _,
                CF_STRING_ENCODING_UTF8,
            );
            let num_key = CFStringCreateWithCString(
                std::ptr::null(),
                b"kCGWindowNumber\0".as_ptr() as _,
                CF_STRING_ENCODING_UTF8,
            );
            let name_key = CFStringCreateWithCString(
                std::ptr::null(),
                b"kCGWindowName\0".as_ptr() as _,
                CF_STRING_ENCODING_UTF8,
            );
            let owner_key = CFStringCreateWithCString(
                std::ptr::null(),
                b"kCGWindowOwnerName\0".as_ptr() as _,
                CF_STRING_ENCODING_UTF8,
            );
            let layer_key = CFStringCreateWithCString(
                std::ptr::null(),
                b"kCGWindowLayer\0".as_ptr() as _,
                CF_STRING_ENCODING_UTF8,
            );

            if pid_key.is_null() || num_key.is_null() || name_key.is_null() || owner_key.is_null() || layer_key.is_null() {
                if !pid_key.is_null() { CFRelease(pid_key); }
                if !num_key.is_null() { CFRelease(num_key); }
                if !name_key.is_null() { CFRelease(name_key); }
                if !owner_key.is_null() { CFRelease(owner_key); }
                if !layer_key.is_null() { CFRelease(layer_key); }
                CFRelease(raw_array);
                return vec![];
            }

            let count = CFArrayGetCount(raw_array);
            let mut result = Vec::new();

            for i in 0..count {
                let dict = CFArrayGetValueAtIndex(raw_array, i);
                if dict.is_null() {
                    continue;
                }

                // Check layer is 0
                let layer_val = CFDictionaryGetValue(dict, layer_key);
                if !layer_val.is_null() {
                    let mut layer: i32 = 0;
                    if CFNumberGetValue(layer_val, CF_NUMBER_SINT32_TYPE, &mut layer as *mut _ as _) {
                        if layer != 0 {
                            continue;
                        }
                    }
                }

                let pid_val = CFDictionaryGetValue(dict, pid_key);
                if pid_val.is_null() {
                    continue;
                }
                let mut pid: i32 = 0;
                if !CFNumberGetValue(pid_val, CF_NUMBER_SINT32_TYPE, &mut pid as *mut _ as _) {
                    continue;
                }

                let wid_val = CFDictionaryGetValue(dict, num_key);
                if wid_val.is_null() {
                    continue;
                }
                let mut window_id: i64 = 0;
                if !CFNumberGetValue(wid_val, 4 /* kCFNumberSInt64Type */, &mut window_id as *mut _ as _) {
                    continue;
                }

                let mut title = String::new();
                let name_val = CFDictionaryGetValue(dict, name_key);
                if !name_val.is_null() {
                    let cf_str = core_foundation::string::CFString::wrap_under_get_rule(name_val as _);
                    title = cf_str.to_string();
                }

                // If CoreGraphics title is empty (e.g. for Simulator), try to fallback to Accessibility API
                if title.trim().is_empty() {
                    if let Some(fallback) = get_ax_window_title(pid, window_id as u32) {
                        title = fallback;
                    }
                }

                // Filter out empty titles to avoid helper/invisible windows
                if title.trim().is_empty() {
                    continue;
                }

                let mut owner_name = String::new();
                let owner_val = CFDictionaryGetValue(dict, owner_key);
                if !owner_val.is_null() {
                    let cf_str = core_foundation::string::CFString::wrap_under_get_rule(owner_val as _);
                    owner_name = cf_str.to_string();
                }

                let bundle_id = get_bundle_id_for_pid(pid).unwrap_or_else(|| {
                    owner_name.to_lowercase().replace(' ', ".")
                });

                result.push(WindowDetails {
                    id: window_id as u32,
                    title,
                    pid,
                    owner_name,
                    bundle_id,
                });
            }

            CFRelease(pid_key);
            CFRelease(num_key);
            CFRelease(name_key);
            CFRelease(owner_key);
            CFRelease(layer_key);
            CFRelease(raw_array);

            result
        }
    }

    pub fn focus_window(pid: i32, title: &str) -> Result<(), String> {
        let escaped_title = title.replace('"', "\\\"");
        let script = format!(
            r#"tell application "System Events"
    tell (first process whose unix id is {})
        set frontmost to true
        try
            perform action "AXRaise" of (first window whose name is "{}")
        end try
    end tell
end tell"#,
            pid, escaped_title
        );

        let status = Command::new("osascript")
            .args(["-e", &script])
            .status()
            .map_err(|e| e.to_string())?;

        if status.success() {
            Ok(())
        } else {
            Err("Failed to focus window".to_string())
        }
    }

    pub fn get_window_id_thumbnail(window_id: u32) -> Option<super::WindowThumbnail> {
        if !check_screen_recording() {
            return None;
        }

        let tmp_path = format!("/tmp/betterbar_thumb_win_{}.png", window_id);

        let captured = Command::new("screencapture")
            .args(["-l", &window_id.to_string(), "-x", &tmp_path])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);

        if !captured {
            return None;
        }

        // Resize to max 280px wide (in-place)
        let sips_ok = Command::new("sips")
            .args(["--resampleWidth", "280", &tmp_path])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);

        // Encode as base64 — clean up temp file regardless of outcome
        let b64_out = Command::new("base64").arg(&tmp_path).output();
        let _ = std::fs::remove_file(&tmp_path);

        if !sips_ok {
            return None;
        }

        let encoded = String::from_utf8_lossy(&b64_out.ok()?.stdout).replace('\n', "");
        if encoded.is_empty() {
            return None;
        }

        Some(super::WindowThumbnail {
            image: format!("data:image/png;base64,{}", encoded),
            title: None,
        })
    }

    fn get_window_ids_for_pid(target_pid: i32) -> Vec<u32> {
        let option = CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY | CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS;
        unsafe {
            let raw_array = CGWindowListCopyWindowInfo(option, CG_NULL_WINDOW_ID);
            if raw_array.is_null() {
                return vec![];
            }

            let pid_key = CFStringCreateWithCString(
                std::ptr::null(),
                b"kCGWindowOwnerPID\0".as_ptr() as _,
                CF_STRING_ENCODING_UTF8,
            );
            if pid_key.is_null() {
                CFRelease(raw_array);
                return vec![];
            }

            let num_key = CFStringCreateWithCString(
                std::ptr::null(),
                b"kCGWindowNumber\0".as_ptr() as _,
                CF_STRING_ENCODING_UTF8,
            );
            if num_key.is_null() {
                CFRelease(pid_key);
                CFRelease(raw_array);
                return vec![];
            }

            let count = CFArrayGetCount(raw_array);
            let mut result = Vec::new();

            for i in 0..count {
                let dict = CFArrayGetValueAtIndex(raw_array, i);
                if dict.is_null() {
                    continue;
                }

                let pid_val = CFDictionaryGetValue(dict, pid_key);
                if pid_val.is_null() {
                    continue;
                }
                let mut owner_pid: i32 = 0;
                if !CFNumberGetValue(pid_val, CF_NUMBER_SINT32_TYPE, &mut owner_pid as *mut _ as _) {
                    continue;
                }
                if owner_pid != target_pid {
                    continue;
                }

                let wid_val = CFDictionaryGetValue(dict, num_key);
                if wid_val.is_null() {
                    continue;
                }
                // Use SInt64 to safely hold CGWindowID (uint32_t) without sign-bit truncation
                let mut window_id: i64 = 0;
                if CFNumberGetValue(wid_val, 4 /* kCFNumberSInt64Type */, &mut window_id as *mut _ as _) {
                    result.push(window_id as u32);
                }
            }

            CFRelease(pid_key);
            CFRelease(num_key);
            CFRelease(raw_array);

            result
        }
    }

    pub fn get_window_thumbnail(pid: i32) -> Option<super::WindowThumbnail> {
        if !check_screen_recording() {
            return None;
        }

        let window_ids = get_window_ids_for_pid(pid);
        let &window_id = window_ids.first()?;

        let tmp_path = format!("/tmp/betterbar_thumb_{}.png", pid);

        let captured = Command::new("screencapture")
            .args(["-l", &window_id.to_string(), "-x", &tmp_path])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);

        if !captured {
            return None;
        }

        // Resize to max 280px wide (in-place); treat failure as fatal (broken file)
        let sips_ok = Command::new("sips")
            .args(["--resampleWidth", "280", &tmp_path])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);

        // Encode as base64 — clean up temp file regardless of outcome
        let b64_out = Command::new("base64").arg(&tmp_path).output();
        let _ = std::fs::remove_file(&tmp_path);

        if !sips_ok {
            return None;
        }

        let encoded = String::from_utf8_lossy(&b64_out.ok()?.stdout).replace('\n', "");
        if encoded.is_empty() {
            return None;
        }

        Some(super::WindowThumbnail {
            image: format!("data:image/png;base64,{}", encoded),
            title: None,
        })
    }

    #[derive(Debug, Clone)]
    pub struct WindowBounds {
        pub app_name: String,
        pub x: f64,
        pub y: f64,
        pub width: f64,
        pub height: f64,
    }

    pub fn get_front_window_bounds() -> Option<WindowBounds> {
        let script = r#"
    tell application "System Events"
        try
            set frontApp to first application process whose frontmost is true
            set frontAppName to name of frontApp
            if exists (window 1 of frontApp) then
                set {wX, wY} to position of window 1 of frontApp
                set {wW, wH} to size of window 1 of frontApp
                return frontAppName & "|" & wX & "|" & wY & "|" & wW & "|" & wH
            end if
        end try
    end tell
    "#;
        let output = Command::new("osascript")
            .args(["-e", script])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            return None;
        }
        let parts: Vec<&str> = stdout.split('|').collect();
        if parts.len() < 5 {
            return None;
        }
        let app_name = parts[0].to_string();
        let x: f64 = parts[1].parse().ok()?;
        let y: f64 = parts[2].parse().ok()?;
        let width: f64 = parts[3].parse().ok()?;
        let height: f64 = parts[4].parse().ok()?;
        Some(WindowBounds { app_name, x, y, width, height })
    }

    pub fn resize_and_position_front_window(app_name: &str, x: f64, y: f64, w: f64, h: f64) {
        let script = format!(
            r#"tell application "System Events"
        tell process "{}"
            try
                set position of window 1 to {{{}, {}}}
                set size of window 1 to {{{}, {}}}
            end try
        end tell
    end tell"#,
            app_name, x, y, w, h
        );
        let _ = Command::new("osascript").args(["-e", &script]).status();
    }

    pub fn get_music_info() -> super::MusicInfo {
        // Try Spotify first, then Music.app
        let apps = ["Spotify", "Music"];
        for app_name in &apps {
            let script = format!(
                r#"tell application "System Events"
    set isRunning to (count of (every process whose name is "{}")) > 0
end tell
if isRunning then
    tell application "{}"
        set trackName to current track's name
        set artistName to current track's artist
        set albumName to current track's album
        set playerState to player state as string
        return trackName & "|" & artistName & "|" & albumName & "|" & playerState
    end tell
end if"#,
                app_name, app_name
            );

            if let Ok(output) = Command::new("osascript").args(["-e", &script]).output() {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !stdout.is_empty() && stdout.contains('|') {
                        let parts: Vec<&str> = stdout.split('|').collect();
                        let title = parts.first().unwrap_or(&"").to_string();
                        let artist = parts.get(1).unwrap_or(&"").to_string();
                        let album = parts.get(2).unwrap_or(&"").to_string();
                        let state = parts.get(3).unwrap_or(&"").trim().to_lowercase();
                        return super::MusicInfo {
                            title,
                            artist,
                            album,
                            is_playing: state == "playing",
                            app_name: app_name.to_string(),
                            available: true,
                        };
                    }
                }
            }
        }

        super::MusicInfo {
            title: String::new(),
            artist: String::new(),
            album: String::new(),
            is_playing: false,
            app_name: String::new(),
            available: false,
        }
    }

    pub fn music_play_pause() -> Result<(), String> {
        for app in &["Spotify", "Music"] {
            let script = format!(
                r#"tell application "System Events"
    set isRunning to (count of (every process whose name is "{}")) > 0
end tell
if isRunning then
    tell application "{}" to playpause
    return "ok"
end if
return "skip""#,
                app, app
            );
            if let Ok(output) = Command::new("osascript").args(["-e", &script]).output() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if stdout == "ok" {
                    return Ok(());
                }
            }
        }
        Err("No music app found".to_string())
    }

    pub fn music_next() -> Result<(), String> {
        for app in &["Spotify", "Music"] {
            let script = format!(
                r#"tell application "System Events"
    set isRunning to (count of (every process whose name is "{}")) > 0
end tell
if isRunning then
    tell application "{}" to next track
    return "ok"
end if
return "skip""#,
                app, app
            );
            if let Ok(output) = Command::new("osascript").args(["-e", &script]).output() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if stdout == "ok" {
                    return Ok(());
                }
            }
        }
        Err("No music app found".to_string())
    }

    pub fn music_previous() -> Result<(), String> {
        for app in &["Spotify", "Music"] {
            let script = format!(
                r#"tell application "System Events"
    set isRunning to (count of (every process whose name is "{}")) > 0
end tell
if isRunning then
    tell application "{}" to previous track
    return "ok"
end if
return "skip""#,
                app, app
            );
            if let Ok(output) = Command::new("osascript").args(["-e", &script]).output() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if stdout == "ok" {
                    return Ok(());
                }
            }
        }
        Err("No music app found".to_string())
    }

    pub fn get_spaces() -> Vec<super::SpaceInfo> {
        unsafe {
            let rtld_default = -2_isize as *mut std::os::raw::c_void;

            let sym_conn = dlsym(rtld_default, b"CGSMainConnectionID\0".as_ptr().cast());
            if sym_conn.is_null() {
                return vec![];
            }
            let get_conn: unsafe extern "C" fn() -> u32 = std::mem::transmute(sym_conn);
            let cid = get_conn();

            // Try CGSCopyManagedDisplaySpaces first — returns actual space IDs
            let sym_copy = dlsym(rtld_default, b"CGSCopyManagedDisplaySpaces\0".as_ptr().cast());
            if !sym_copy.is_null() {
                let copy_spaces: unsafe extern "C" fn(u32) -> CFArrayRef = std::mem::transmute(sym_copy);
                let displays = copy_spaces(cid);
                if !displays.is_null() {
                    let mut spaces: Vec<super::SpaceInfo> = Vec::new();
                    let disp_count = CFArrayGetCount(displays);
                    let sp_key = CFStringCreateWithCString(std::ptr::null(), b"Spaces\0".as_ptr() as _, CF_STRING_ENCODING_UTF8);
                    let cur_key = CFStringCreateWithCString(std::ptr::null(), b"Current Space\0".as_ptr() as _, CF_STRING_ENCODING_UTF8);
                    let id64_key = CFStringCreateWithCString(std::ptr::null(), b"id64\0".as_ptr() as _, CF_STRING_ENCODING_UTF8);
                    let name_key = CFStringCreateWithCString(std::ptr::null(), b"name\0".as_ptr() as _, CF_STRING_ENCODING_UTF8);

                    let mut current_space_id: u64 = 0;
                    for i in 0..disp_count {
                        let display = CFArrayGetValueAtIndex(displays, i);
                        if display.is_null() { continue; }

                        // Get current space ID for this display
                        let cur = CFDictionaryGetValue(display, cur_key);
                        if !cur.is_null() {
                            let id_val = CFDictionaryGetValue(cur, id64_key);
                            if !id_val.is_null() {
                                CFNumberGetValue(id_val, 4 /* kCFNumberSInt64Type */, &mut current_space_id as *mut _ as _);
                            }
                        }

                        // Get spaces array
                        let arr = CFDictionaryGetValue(display, sp_key);
                        if arr.is_null() { continue; }
                        let count = CFArrayGetCount(arr);
                        for j in 0..count {
                            let dict = CFArrayGetValueAtIndex(arr, j);
                            if dict.is_null() { continue; }

                            let mut sid: u64 = 0;
                            let id_val = CFDictionaryGetValue(dict, id64_key);
                            if !id_val.is_null() {
                                CFNumberGetValue(id_val, 4 /* kCFNumberSInt64Type */, &mut sid as *mut _ as _);
                            }

                            let name = {
                                let name_val = CFDictionaryGetValue(dict, name_key);
                                if !name_val.is_null() {
                                    let cf_str = core_foundation::string::CFString::wrap_under_get_rule(name_val as _);
                                    cf_str.to_string()
                                } else {
                                    format!("Space {}", spaces.len() + 1)
                                }
                            };

                            spaces.push(super::SpaceInfo {
                                id: sid as u32,
                                name,
                                is_current: sid == current_space_id,
                            });
                        }
                    }

                    CFRelease(sp_key);
                    CFRelease(cur_key);
                    CFRelease(id64_key);
                    CFRelease(name_key);
                    CFRelease(displays);

                    if !spaces.is_empty() {
                        return spaces;
                    }
                }
            }

            // Fallback: old CGS workspace API
            let sym_count = dlsym(rtld_default, b"CGSGetWorkspaceCount\0".as_ptr().cast());
            let sym_current = dlsym(rtld_default, b"CGSGetWorkspace\0".as_ptr().cast());

            let mut total: u32 = 1;
            if !sym_count.is_null() {
                let get_count: unsafe extern "C" fn(u32, *mut u32) -> i32 = std::mem::transmute(sym_count);
                if get_count(cid, &mut total) != 0 || total == 0 {
                    total = 1;
                }
            }

            let mut current: u32 = 1;
            if !sym_current.is_null() {
                let get_current: unsafe extern "C" fn(u32, *mut u32) -> i32 = std::mem::transmute(sym_current);
                let _ = get_current(cid, &mut current);
            }

            let mut spaces = Vec::new();
            for i in 1..=total {
                spaces.push(super::SpaceInfo {
                    id: i,
                    name: format!("Space {}", i),
                    is_current: i == current,
                });
            }
            spaces
        }
    }

    pub fn switch_to_space(space_id: u32) -> Result<(), String> {
        unsafe {
            let rtld_default = -2_isize as *mut std::os::raw::c_void;
            let sym_conn = dlsym(rtld_default, b"CGSMainConnectionID\0".as_ptr().cast());
            if sym_conn.is_null() {
                return Err("CGS not available".to_string());
            }
            let get_conn: unsafe extern "C" fn() -> u32 = std::mem::transmute(sym_conn);
            let cid = get_conn();

            // Try CGSGoToSpace first (64-bit workspace IDs)
            let sym_go = dlsym(rtld_default, b"CGSGoToSpace\0".as_ptr().cast());
            if !sym_go.is_null() {
                let go_space: unsafe extern "C" fn(u32, u64) -> i32 = std::mem::transmute(sym_go);
                if go_space(cid, space_id as u64) == 0 {
                    return Ok(());
                }
            }

            // Fallback to CGSSetWorkspace (32-bit workspace numbers)
            let sym_set = dlsym(rtld_default, b"CGSSetWorkspace\0".as_ptr().cast());
            if !sym_set.is_null() {
                let set_ws: unsafe extern "C" fn(u32, u32) -> i32 = std::mem::transmute(sym_set);
                let _ = set_ws(cid, space_id);
            }

            // AppleScript fallback: use keyboard shortcut to navigate
            let script = format!(
                r#"tell application "System Events"
                    key code 124 using control down
                end tell"#
            );
            let _ = Command::new("osascript").args(["-e", &script]).output();
            Ok(())
        }
    }

    pub fn focus_music_app(app_name: &str) -> Result<(), String> {
        let script = format!(
            r#"tell application "System Events"
    set isRunning to (count of (every process whose name is "{}")) > 0
end tell
if isRunning then
    tell application "{}" to activate
    return "ok"
end if
return "skip""#,
            app_name, app_name
        );
        let output = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout == "ok" {
            Ok(())
        } else {
            Err(format!("Music app \"{}\" not running", app_name))
        }
    }

    pub fn get_app_bundle_path() -> String {
        if let Ok(exe) = std::env::current_exe() {
            let mut path = exe.as_path();
            while let Some(parent) = path.parent() {
                if parent.extension().and_then(|e| e.to_str()) == Some("app") {
                    return parent.to_string_lossy().to_string();
                }
                path = parent;
            }
        }
        "/Applications/BetterBar.app".to_string()
    }

    pub fn get_open_on_login() -> Result<bool, String> {
        let script = r#"tell application "System Events" to get name of every login item"#;
        let output = Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            let names = String::from_utf8_lossy(&output.stdout);
            let is_member = names
                .split(',')
                .any(|item| item.trim().eq_ignore_ascii_case("BetterBar"));
            Ok(is_member)
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    pub fn set_open_on_login(enabled: bool) -> Result<(), String> {
        if enabled {
            let app_path = get_app_bundle_path();
            let script = format!(
                r#"tell application "System Events"
                    if not (exists login item "BetterBar") then
                        make login item at end with properties {{path:"{}", hidden:false, name:"BetterBar"}}
                    end if
                end tell"#,
                app_path
            );
            let status = Command::new("osascript")
                .args(["-e", &script])
                .status()
                .map_err(|e| e.to_string())?;
            if !status.success() {
                return Err("Failed to create login item".to_string());
            }
        } else {
            let script = r#"tell application "System Events"
                if exists login item "BetterBar" then
                    delete (every login item whose name is "BetterBar")
                end if
            end tell"#;
            let status = Command::new("osascript")
                .args(["-e", script])
                .status()
                .map_err(|e| e.to_string())?;
            if !status.success() {
                return Err("Failed to delete login item".to_string());
            }
        }
        Ok(())
    }

    pub fn check_for_updates() -> Result<super::ReleaseInfo, String> {
        let current_version = env!("CARGO_PKG_VERSION").to_string();
        let url = "https://api.github.com/repos/josmanvis/betterbar/releases/latest";
        let output = Command::new("curl")
            .args(["-s", "-H", "User-Agent: BetterBar-App", url])
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err("Failed to query GitHub API".to_string());
        }

        let json_str = String::from_utf8_lossy(&output.stdout);
        let val: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;

        if let Some(msg) = val.get("message").and_then(|m| m.as_str()) {
            if msg.contains("API rate limit") {
                return Err("GitHub API rate limit reached. Please check back later.".to_string());
            }
        }

        let tag_name = val.get("tag_name").and_then(|t| t.as_str()).unwrap_or("").to_string();
        let name = val.get("name").and_then(|t| t.as_str()).unwrap_or(&tag_name).to_string();
        let published_at = val.get("published_at").and_then(|t| t.as_str()).unwrap_or("").to_string();
        let body = val.get("body").and_then(|t| t.as_str()).unwrap_or("").to_string();
        let html_url = val.get("html_url").and_then(|t| t.as_str()).unwrap_or("https://github.com/josmanvis/betterbar/releases").to_string();

        let remote_ver = tag_name.trim_start_matches('v').trim();
        let curr_ver = current_version.trim_start_matches('v').trim();
        let has_update = is_newer_version(remote_ver, curr_ver);

        let mut download_url = None;
        if let Some(assets) = val.get("assets").and_then(|a| a.as_array()) {
            for asset in assets {
                if let Some(aname) = asset.get("name").and_then(|n| n.as_str()) {
                    if aname.ends_with(".tar.gz") {
                        download_url = asset.get("browser_download_url").and_then(|u| u.as_str()).map(|s| s.to_string());
                        break;
                    }
                }
            }
            if download_url.is_none() {
                for asset in assets {
                    if let Some(aname) = asset.get("name").and_then(|n| n.as_str()) {
                        if aname.ends_with(".dmg") {
                            download_url = asset.get("browser_download_url").and_then(|u| u.as_str()).map(|s| s.to_string());
                            break;
                        }
                    }
                }
            }
        }

        Ok(super::ReleaseInfo {
            version: tag_name,
            name,
            published_at,
            body,
            html_url,
            download_url,
            has_update,
            current_version: format!("v{}", current_version),
        })
    }

    fn is_newer_version(remote: &str, current: &str) -> bool {
        let r_parts: Vec<u32> = remote.split('.').filter_map(|s| s.parse::<u32>().ok()).collect();
        let c_parts: Vec<u32> = current.split('.').filter_map(|s| s.parse::<u32>().ok()).collect();
        for (r, c) in r_parts.iter().zip(c_parts.iter()) {
            if r > c { return true; }
            if r < c { return false; }
        }
        r_parts.len() > c_parts.len()
    }

    pub fn install_update(download_url: &str) -> Result<(), String> {
        let app_target = get_app_bundle_path();
        let tmp_dir = "/tmp/betterbar_update";
        let _ = std::fs::remove_dir_all(tmp_dir);
        std::fs::create_dir_all(tmp_dir).map_err(|e| e.to_string())?;

        let archive_path = format!("{}/update_pkg", tmp_dir);
        let output = Command::new("curl")
            .args(["-L", "-f", "-o", &archive_path, download_url])
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err("Failed to download update file".to_string());
        }

        // Check if tar.gz or dmg
        if download_url.ends_with(".tar.gz") {
            let untar = Command::new("tar")
                .args(["-xzf", &archive_path, "-C", tmp_dir])
                .output()
                .map_err(|e| e.to_string())?;

            if !untar.status.success() {
                return Err("Failed to extract update archive".to_string());
            }
        } else if download_url.ends_with(".dmg") {
            let mount_point = format!("{}/mount", tmp_dir);
            let _ = std::fs::create_dir_all(&mount_point);
            let attach = Command::new("hdiutil")
                .args(["attach", &archive_path, "-nobrowse", "-mountpoint", &mount_point])
                .output()
                .map_err(|e| e.to_string())?;

            if !attach.status.success() {
                return Err("Failed to mount update DMG".to_string());
            }

            let _ = Command::new("cp")
                .args(["-R", &format!("{}/BetterBar.app", mount_point), tmp_dir])
                .status();

            let _ = Command::new("hdiutil")
                .args(["detach", &mount_point])
                .status();
        }

        let new_app = format!("{}/BetterBar.app", tmp_dir);
        if !std::path::Path::new(&new_app).exists() {
            return Err("Extracted update does not contain BetterBar.app".to_string());
        }

        let _ = Command::new("xattr")
            .args(["-dr", "com.apple.quarantine", &new_app])
            .status();

        // Copy over target
        let cp_res = Command::new("cp")
            .args(["-R", &new_app, &app_target])
            .status()
            .map_err(|e| e.to_string())?;

        if !cp_res.success() {
            return Err("Failed to replace application bundle with update".to_string());
        }

        // Spawn detached relaunch script and exit
        let restart_script = format!("sleep 1 && open -n \"{}\"", app_target);
        let _ = Command::new("sh")
            .args(["-c", &restart_script])
            .spawn();

        std::process::exit(0);
    }

    struct CaffeineState {
        child: Option<std::process::Child>,
        end_time: Option<std::time::Instant>,
    }

    static CAFFEINE_STATE: std::sync::Mutex<CaffeineState> = std::sync::Mutex::new(CaffeineState {
        child: None,
        end_time: None,
    });

    pub fn get_caffeine_status() -> crate::CaffeineStatus {
        let mut state = CAFFEINE_STATE.lock().unwrap();
        if let Some(ref mut child) = state.child {
            match child.try_wait() {
                Ok(Some(_)) => {
                    state.child = None;
                    state.end_time = None;
                    crate::CaffeineStatus { active: false, minutes_remaining: None }
                }
                Ok(None) => {
                    let mins_remaining = state.end_time.map(|end| {
                        let now = std::time::Instant::now();
                        if end > now {
                            let secs = (end - now).as_secs();
                            ((secs + 59) / 60) as u32
                        } else {
                            0
                        }
                    });
                    crate::CaffeineStatus { active: true, minutes_remaining: mins_remaining }
                }
                Err(_) => {
                    state.child = None;
                    state.end_time = None;
                    crate::CaffeineStatus { active: false, minutes_remaining: None }
                }
            }
        } else {
            crate::CaffeineStatus { active: false, minutes_remaining: None }
        }
    }

    pub fn set_caffeine(enabled: bool, duration_mins: Option<u32>) -> Result<crate::CaffeineStatus, String> {
        let mut state = CAFFEINE_STATE.lock().unwrap();
        if let Some(mut child) = state.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        state.end_time = None;

        if enabled {
            let mut cmd = std::process::Command::new("/usr/bin/caffeinate");
            cmd.arg("-d").arg("-i").arg("-m");
            if let Some(mins) = duration_mins {
                if mins > 0 {
                    let secs = mins * 60;
                    cmd.arg("-t").arg(secs.to_string());
                    state.end_time = Some(std::time::Instant::now() + std::time::Duration::from_secs(secs as u64));
                }
            }
            match cmd.spawn() {
                Ok(child) => {
                    state.child = Some(child);
                    let mins_rem = duration_mins.filter(|&m| m > 0);
                    Ok(crate::CaffeineStatus { active: true, minutes_remaining: mins_rem })
                }
                Err(e) => Err(format!("Failed to spawn caffeinate: {}", e)),
            }
        } else {
            Ok(crate::CaffeineStatus { active: false, minutes_remaining: None })
        }
    }

    pub fn toggle_caffeine(duration_mins: Option<u32>) -> Result<crate::CaffeineStatus, String> {
        let status = get_caffeine_status();
        if status.active {
            set_caffeine(false, None)
        } else {
            set_caffeine(true, duration_mins)
        }
    }
}

// --- App entry ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_running_apps,
            get_installed_terminals,
            execute_terminal_command,
            launch_app,
            focus_app,
            get_screen_info,
            position_window,
            set_window_level,
            get_app_icon,
            get_battery_info,
            check_accessibility_permissions,
            request_accessibility_permissions,
            check_screen_recording_permission,
            request_screen_recording_permission,
            get_window_thumbnail,
            get_on_screen_windows,
            focus_window,
            get_window_id_thumbnail,
            set_screen_inset,
            clear_screen_insets,
            open_settings_window,
            get_window_outer_position,
            update_bar_geometry,
            get_music_info,
            focus_music_app,
            music_play_pause,
            music_next,
            music_previous,
            get_spaces,
            switch_to_space,
            get_open_on_login,
            set_open_on_login,
            check_for_updates,
            install_update,
            get_caffeine_status,
            set_caffeine,
            toggle_caffeine,
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
                if let Some(settings_win) = app.get_webview_window("settings") {
                    let settings_clone = settings_win.clone();
                    settings_win.on_window_event(move |event| {
                        if let WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = settings_clone.hide();
                        }
                    });
                }

                // Spawn background strict overlap prevention thread
                std::thread::spawn(move || {
                    loop {
                        std::thread::sleep(std::time::Duration::from_millis(1200));

                        let geom = match BAR_GEOMETRY.lock() {
                            Ok(g) => *g,
                            Err(_) => continue,
                        };

                        if !geom.strict_overlap {
                            continue;
                        }

                        let position_str = match std::str::from_utf8(&geom.position[..geom.position_len]) {
                            Ok(s) => s,
                            Err(_) => "left",
                        };

                        if !macos::check_accessibility() {
                            continue;
                        }

                        if let Some(wnd) = macos::get_front_window_bounds() {
                            if wnd.app_name.to_lowercase().contains("betterbar") {
                                continue;
                            }

                            let screen = macos::get_screen_info(1.0);
                            let sw = screen.width;
                            let sh = screen.height;
                            let menu_bar_height = screen.menu_bar_height;
                            let dock_height = screen.dock_height;
                            let bar_size = geom.bar_size;

                            let mut new_x = wnd.x;
                            let mut new_y = wnd.y;
                            let mut new_w = wnd.width;
                            let mut new_h = wnd.height;
                            let mut changed = false;

                            match position_str {
                                "left" => {
                                    let limit = 0.0 + bar_size;
                                    if wnd.x < limit {
                                        new_x = limit;
                                        new_w = (wnd.x + wnd.width - limit).max(200.0);
                                        changed = true;
                                    }
                                }
                                "right" => {
                                    let limit = sw - bar_size;
                                    if wnd.x + wnd.width > limit {
                                        new_w = (limit - wnd.x).max(200.0);
                                        changed = true;
                                    }
                                }
                                "bottom" => {
                                    let limit = sh - bar_size - dock_height;
                                    if wnd.y + wnd.height > limit {
                                        new_h = (limit - wnd.y).max(200.0);
                                        changed = true;
                                    }
                                }
                                "top" => {
                                    let limit = menu_bar_height + bar_size;
                                    if wnd.y < limit {
                                        new_y = limit;
                                        new_h = (wnd.y + wnd.height - limit).max(200.0);
                                        changed = true;
                                    }
                                }
                                _ => {}
                            }

                            if changed {
                                macos::resize_and_position_front_window(&wnd.app_name, new_x, new_y, new_w, new_h);
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BetterBar");
}
