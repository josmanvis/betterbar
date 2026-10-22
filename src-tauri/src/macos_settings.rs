//! System-owned window material and display preferences; no extra dependencies.
use serde::Serialize;
use std::collections::BTreeMap;

const SYMBOLS: &[(&str, &str)] = &[
    ("layout", "rectangle.bottomthird.inset.filled"), ("appearance", "paintpalette"),
    ("icons", "square.grid.3x3"), ("sets", "app.badge"), ("order", "line.3.horizontal"),
    ("extensions", "puzzlepiece.extension"), ("behavior", "slider.horizontal.3"),
    ("permissions", "hand.raised"), ("about", "info.circle"), ("settings", "gearshape"),
    ("apps", "square.grid.2x2"), ("calendar", "calendar"), ("timer", "timer"),
    ("monitor", "waveform.path.ecg"), ("caffeine", "cup.and.saucer"), ("terminal", "terminal"),
];

/// Render the symbols supplied by this Mac; no symbol font or artwork is bundled.
#[tauri::command]
pub fn get_system_symbols() -> BTreeMap<String, String> {
    let mut result = BTreeMap::new();
    #[cfg(target_os = "macos")]
    unsafe {
        use base64::Engine;
        use cocoa::{base::{id, nil}, foundation::NSString};
        use objc::{class, msg_send, sel, sel_impl};
        let properties: id = msg_send![class!(NSDictionary), dictionary];
        for (key, name) in SYMBOLS {
            let name = NSString::alloc(nil).init_str(name);
            let image: id = msg_send![class!(NSImage), imageWithSystemSymbolName: name accessibilityDescription: nil];
            let _: () = msg_send![name, release];
            if image.is_null() { continue; }
            let configuration: id = msg_send![class!(NSImageSymbolConfiguration), configurationWithPointSize: 36.0_f64 weight: 0.0_f64];
            let configured: id = msg_send![image, imageWithSymbolConfiguration: configuration];
            let rendered = if configured.is_null() { image } else { configured };
            let tiff: id = msg_send![rendered, TIFFRepresentation];
            if tiff.is_null() { continue; }
            let bitmap: id = msg_send![class!(NSBitmapImageRep), imageRepWithData: tiff];
            if bitmap.is_null() { continue; }
            let data: id = msg_send![bitmap, representationUsingType: 4_usize properties: properties];
            if data.is_null() { continue; }
            let length: usize = msg_send![data, length];
            let bytes: *const u8 = msg_send![data, bytes];
            if bytes.is_null() || length == 0 { continue; }
            let encoded = base64::engine::general_purpose::STANDARD.encode(std::slice::from_raw_parts(bytes, length));
            result.insert((*key).into(), format!("data:image/png;base64,{encoded}"));
        }
    }
    result
}

#[derive(Debug, Serialize)]
pub struct MacosPreferences {
    accent: String,
    reduce_transparency: bool,
    increase_contrast: bool,
    reduce_motion: bool,
}

#[tauri::command]
pub fn get_macos_preferences() -> MacosPreferences {
    #[cfg(target_os = "macos")]
    unsafe {
        use cocoa::base::id;
        use objc::{class, msg_send, sel, sel_impl};
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        let color: id = msg_send![class!(NSColor), controlAccentColor];
        let space: id = msg_send![class!(NSColorSpace), sRGBColorSpace];
        let rgb: id = msg_send![color, colorUsingColorSpace: space];
        let accent = if rgb.is_null() { "#007aff".into() } else {
            let red: f64 = msg_send![rgb, redComponent];
            let green: f64 = msg_send![rgb, greenComponent];
            let blue: f64 = msg_send![rgb, blueComponent];
            let channel = |value: f64| (value.clamp(0.0, 1.0) * 255.0).round() as u8;
            format!("#{:02x}{:02x}{:02x}", channel(red), channel(green), channel(blue))
        };
        MacosPreferences {
            accent,
            reduce_transparency: msg_send![workspace, accessibilityDisplayShouldReduceTransparency],
            increase_contrast: msg_send![workspace, accessibilityDisplayShouldIncreaseContrast],
            reduce_motion: msg_send![workspace, accessibilityDisplayShouldReduceMotion],
        }
    }
    #[cfg(not(target_os = "macos"))]
    MacosPreferences { accent: "#007aff".into(), reduce_transparency: false, increase_contrast: false, reduce_motion: false }
}

/// Called on AppKit's main thread during setup. The webview's opaque content
/// panels cover this view; the translucent sidebar reveals the native material.
#[cfg(target_os = "macos")]
pub fn install_settings_material(window: &tauri::WebviewWindow) {
    use cocoa::{base::{id, NO, nil}, foundation::NSRect};
    use objc::{class, msg_send, sel, sel_impl};
    if let Ok(pointer) = window.ns_window() {
        unsafe {
            let ns_window = pointer as id;
            let content: id = msg_send![ns_window, contentView];
            let bounds: NSRect = msg_send![content, bounds];
            let effect: id = msg_send![class!(NSVisualEffectView), alloc];
            let effect: id = msg_send![effect, initWithFrame: bounds];
            if effect.is_null() { return; }
            // NSVisualEffectMaterialSidebar, BehindWindow, FollowsWindowActiveState.
            let _: () = msg_send![effect, setMaterial: 7_isize];
            let _: () = msg_send![effect, setBlendingMode: 0_isize];
            let _: () = msg_send![effect, setState: 0_isize];
            let _: () = msg_send![effect, setAutoresizingMask: 18_usize];
            let _: () = msg_send![content, addSubview: effect positioned: -1_isize relativeTo: nil];
            let _: () = msg_send![effect, release];
            let clear: id = msg_send![class!(NSColor), clearColor];
            let _: () = msg_send![ns_window, setBackgroundColor: clear];
            let _: () = msg_send![ns_window, setOpaque: NO];
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    #[cfg(target_os = "macos")]
    fn system_symbols_render_pngs_from_appkit() {
        let images = super::get_system_symbols();
        for key in ["settings", "apps", "appearance", "about"] {
            assert!(images.get(key).is_some_and(|image| image.starts_with("data:image/png;base64,iVBOR")), "{key}");
        }
    }
    #[test]
    fn system_preferences_are_safe_to_render() {
        let value = super::get_macos_preferences();
        assert_eq!(value.accent.len(), 7);
        assert!(value.accent.starts_with('#'));
        assert!(value.accent[1..].chars().all(|c| c.is_ascii_hexdigit()));
    }
}
