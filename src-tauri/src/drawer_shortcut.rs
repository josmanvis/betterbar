//! Observe a bare Command double tap without consuming normal key events.
#[derive(Default)]
struct Gesture {
    down: bool,
    pressed_at: Option<u64>,
    last_tap: Option<u64>,
}

impl Gesture {
    fn cancel(&mut self) {
        self.pressed_at = None;
        self.last_tap = None;
    }

    fn flags(&mut self, key: u16, command: bool, other: bool, now: u64) -> bool {
        if other || ![54, 55].contains(&key) {
            self.cancel();
            self.down = command;
            return false;
        }
        if command {
            if self.down { self.cancel(); } else { self.pressed_at = Some(now); }
            self.down = true;
            return false;
        }
        let down = std::mem::replace(&mut self.down, false);
        let pressed = self.pressed_at.take();
        if !down || !pressed.and_then(|start| now.checked_sub(start)).is_some_and(|held| held <= 300) {
            self.last_tap = None;
            return false;
        }
        if self.last_tap.take().and_then(|last| now.checked_sub(last)).is_some_and(|gap| gap <= 400) {
            true
        } else {
            self.last_tap = Some(now);
            false
        }
    }
}

#[tauri::command]
pub async fn set_apps_drawer_shortcut(app: tauri::AppHandle, window: tauri::WebviewWindow, enabled: bool) -> Result<bool, String> {
    // Only the mounted bar extension owns the global registration.
    if window.label() != "main" { return Err("Configure the shortcut from the bar.".into()); }
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = std::sync::mpsc::channel();
        let handle = app.clone();
        app.run_on_main_thread(move || { let _ = sender.send(macos::configure(&handle, enabled)); })
            .map_err(|_| "Could not configure the Apps Drawer shortcut.")?;
        tauri::async_runtime::spawn_blocking(move || receiver.recv())
            .await.map_err(|_| "Could not configure the Apps Drawer shortcut.")?
            .map_err(|_| "Could not configure the Apps Drawer shortcut.")?
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = (app, enabled); Ok(false) }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::Gesture;
    use block::ConcreteBlock;
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSString;
    use objc::{class, msg_send, sel, sel_impl};
    use std::sync::Mutex;
    use tauri::Emitter;

    #[derive(Default)]
    struct Monitors {
        global: usize,
        local: usize,
        activation: usize,
        trusted: bool,
        gesture: Gesture,
    }
    static MONITORS: Mutex<Monitors> = Mutex::new(Monitors {
        global: 0, local: 0, activation: 0, trusted: false,
        gesture: Gesture { down: false, pressed_at: None, last_tap: None },
    });

    unsafe fn observe(app: &tauri::AppHandle, event: id) {
        let kind: u64 = msg_send![event, type];
        let toggled = if let Ok(mut state) = MONITORS.lock() {
            if kind == 12 {
                let flags: u64 = msg_send![event, modifierFlags];
                let key: u16 = msg_send![event, keyCode];
                let timestamp: f64 = msg_send![event, timestamp];
                // Ignore Caps Lock's persistent state. Shift, Control, Option,
                // and Fn turn the interaction into a different shortcut.
                let other = flags & ((1 << 17) | (1 << 18) | (1 << 19) | (1 << 23)) != 0;
                state.gesture.flags(key, flags & (1 << 20) != 0, other, (timestamp * 1000.0) as u64)
            } else {
                // Only event type is inspected for keys/clicks; no text is read.
                state.gesture.cancel();
                false
            }
        } else { false };
        if toggled { let _ = app.emit_to("main", "apps-drawer-toggle", ()); }
    }

    pub(super) fn configure(app: &tauri::AppHandle, enabled: bool) -> Result<bool, String> {
        let trusted = crate::macos::check_accessibility();
        let mut state = MONITORS.lock().map_err(|_| "Could not configure the Apps Drawer shortcut.")?;
        if enabled && state.global != 0 && state.local != 0 && state.trusted == trusted { return Ok(trusted); }
        unsafe {
            let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
            let center: id = msg_send![workspace, notificationCenter];
            for token in [state.global, state.local] {
                if token != 0 { let _: () = msg_send![class!(NSEvent), removeMonitor: token as id]; }
            }
            if state.activation != 0 { let _: () = msg_send![center, removeObserver: state.activation as id]; }
            *state = Monitors::default();
            if !enabled { return Ok(false); }
            // flagsChanged, keyDown, and mouseDown cancel command chords and
            // clicks. The local monitor always returns the original event.
            let mask: u64 = (1 << 12) | (1 << 10) | (1 << 1) | (1 << 3) | (1 << 25);
            let handle = app.clone();
            let global = ConcreteBlock::new(move |event: id| { observe(&handle, event); }).copy();
            let handle = app.clone();
            let local = ConcreteBlock::new(move |event: id| -> id { observe(&handle, event); event }).copy();
            let global_token: id = msg_send![class!(NSEvent), addGlobalMonitorForEventsMatchingMask: mask handler: &*global];
            let local_token: id = msg_send![class!(NSEvent), addLocalMonitorForEventsMatchingMask: mask handler: &*local];
            state.global = global_token as usize;
            state.local = local_token as usize;
            state.trusted = trusted;
            // AppKit global monitors cannot see system shortcuts such as
            // Command-Tab. App activation changes also invalidate a tap.
            let activation = ConcreteBlock::new(move |_notification: id| {
                if let Ok(mut state) = MONITORS.lock() { state.gesture.cancel(); }
            }).copy();
            let name = NSString::alloc(nil).init_str("NSWorkspaceDidActivateApplicationNotification");
            let observer: id = msg_send![center, addObserverForName: name object: nil queue: nil usingBlock: &*activation];
            let _: () = msg_send![name, release];
            state.activation = observer as usize;
            // AppKit owns both monitor tokens and copies their blocks. The
            // tokens are removed above when disabled or reconfigured.
            if local_token == nil || trusted && global_token == nil { return Err("Could not register the Apps Drawer shortcut.".into()); }
            Ok(trusted && global_token != nil)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tap(g: &mut Gesture, key: u16, time: u64) -> bool {
        assert!(!g.flags(key, true, false, time));
        g.flags(key, false, false, time + 50)
    }
    #[test]
    fn double_tap_toggles_on_release_and_can_repeat_with_either_command_key() {
        let mut g = Gesture::default();
        assert!(!tap(&mut g, 55, 0));
        assert!(tap(&mut g, 54, 150));
        assert!(!tap(&mut g, 55, 300));
        assert!(tap(&mut g, 55, 450));
    }
    #[test]
    fn typing_clicks_and_modified_shortcuts_cancel_the_gesture() {
        for other_key in [false, true] {
            let mut g = Gesture::default();
            assert!(!tap(&mut g, 55, 0));
            assert!(!g.flags(55, true, false, 100));
            if other_key { g.flags(56, true, true, 120); } else { g.cancel(); }
            assert!(!g.flags(55, false, false, 150));
            assert!(!tap(&mut g, 55, 200));
        }
        let mut g = Gesture::default();
        assert!(!tap(&mut g, 55, 0));
        g.cancel(); // Normal typing or a click between taps.
        assert!(!tap(&mut g, 55, 100));
    }
    #[test]
    fn slow_taps_long_holds_and_overlapping_command_keys_do_not_toggle() {
        let mut g = Gesture::default();
        assert!(!tap(&mut g, 55, 0));
        assert!(!tap(&mut g, 55, 600));
        assert!(!g.flags(55, true, false, 700));
        assert!(!g.flags(55, false, false, 1100));
        assert!(!tap(&mut g, 55, 1200));
        assert!(!g.flags(55, true, false, 1300));
        assert!(!g.flags(54, true, false, 1320));
        assert!(!g.flags(55, false, false, 1400));
        assert!(!tap(&mut g, 55, 1500));
    }
}
