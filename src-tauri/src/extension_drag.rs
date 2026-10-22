//! Native copy-only drags from extension windows to the bar or other applications.
use std::path::PathBuf;

/// Keep a drop destination open while a drag starts in another application.
/// This reads button state only; it does not install a global event monitor.
#[tauri::command]
pub fn is_primary_mouse_button_down() -> bool {
    #[cfg(target_os = "macos")]
    {
        use objc::{class, msg_send, sel, sel_impl};
        let buttons: u64 = unsafe { msg_send![class!(NSEvent), pressedMouseButtons] };
        buttons & 1 != 0
    }
    #[cfg(not(target_os = "macos"))]
    { false }
}

fn drag_paths(inputs: Vec<String>) -> Result<Vec<PathBuf>, String> {
    if inputs.is_empty() || inputs.len() > 64 {
        return Err("Choose between 1 and 64 items to drag.".into());
    }
    let mut paths = Vec::new();
    for input in inputs {
        let path = PathBuf::from(input);
        if !path.is_absolute() { return Err("Choose an absolute file or folder path.".into()); }
        let path = path.canonicalize().map_err(|_| "A dragged item is no longer available.")?;
        let metadata = path.metadata().map_err(|_| "Could not read a dragged item.")?;
        if !metadata.is_file() && !metadata.is_dir() { return Err("Choose a file, folder, or application.".into()); }
        if !paths.contains(&path) { paths.push(path); }
    }
    Ok(paths)
}

#[tauri::command]
pub async fn start_extension_drag(window: tauri::WebviewWindow, paths: Vec<String>) -> Result<String, String> {
    let paths = drag_paths(paths)?;
    #[cfg(target_os = "macos")]
    {
        use std::sync::atomic::{AtomicBool, Ordering};
        static ACTIVE: AtomicBool = AtomicBool::new(false);
        if ACTIVE.swap(true, Ordering::SeqCst) { return Err("A drag is already in progress.".into()); }
        struct Reset;
        impl Drop for Reset { fn drop(&mut self) { ACTIVE.store(false, Ordering::SeqCst); } }
        let _reset = Reset;
        let (send, mut receive) = tauri::async_runtime::channel(1);
        let source = window.clone();
        window.run_on_main_thread(move || {
            use objc::{class, msg_send, sel, sel_impl};
            // IPC may arrive after a quick release. Never begin a detached drag.
            let buttons: u64 = unsafe { msg_send![class!(NSEvent), pressedMouseButtons] };
            if buttons & 1 == 0 { let _ = send.try_send(Ok("cancelled".into())); return; }
            let image = objc::rc::autoreleasepool(|| preview(&paths[0]));
            let Some(image) = image else { let _ = send.try_send(Err("Could not create the drag preview.".into())); return; };
            let complete = send.clone();
            let result = drag::start_drag(&source, drag::DragItem::Files(paths), drag::Image::Raw(image), move |result, _| {
                let _ = complete.try_send(Ok(match result { drag::DragResult::Dropped => "dropped", drag::DragResult::Cancel => "cancelled" }.into()));
            }, drag::Options { mode: drag::DragMode::Copy, ..Default::default() });
            if result.is_err() { let _ = send.try_send(Err("Could not start the drag.".into())); }
        }).map_err(|_| "Could not start the drag.".to_string())?;
        receive.recv().await.ok_or_else(|| "The drag ended unexpectedly.".to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = (window, paths); Err("Native extension dragging requires macOS.".into()) }
}

#[cfg(target_os = "macos")]
fn preview(path: &std::path::Path) -> Option<Vec<u8>> {
    use cocoa::{base::{id, nil}, foundation::{NSSize, NSString}};
    use objc::{class, msg_send, sel, sel_impl};
    unsafe {
        let path = NSString::alloc(nil).init_str(&path.to_string_lossy());
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        let image: id = msg_send![workspace, iconForFile: path];
        let _: () = msg_send![path, release];
        if image == nil { return None; }
        let image: id = msg_send![image, copy];
        let _: () = msg_send![image, setSize: NSSize::new(48.0, 48.0)];
        let data: id = msg_send![image, TIFFRepresentation];
        let result = if data == nil { None } else {
            let len: usize = msg_send![data, length];
            let bytes: *const u8 = msg_send![data, bytes];
            if bytes.is_null() || len == 0 { None } else { Some(std::slice::from_raw_parts(bytes, len).to_vec()) }
        };
        let _: () = msg_send![image, release];
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_and_deduplicates_drag_paths() {
        let root = std::env::temp_dir().join(format!("betterbar-drag-{}", std::process::id()));
        std::fs::create_dir_all(root.join("Example.app")).unwrap();
        std::fs::write(root.join("a file.txt"), "fixture").unwrap();
        let app = root.join("Example.app").to_string_lossy().into_owned();
        let file = root.join("a file.txt").to_string_lossy().into_owned();
        assert_eq!(drag_paths(vec![app.clone(), file.clone(), app]).unwrap().len(), 2);
        assert!(drag_paths(vec![]).is_err());
        assert!(drag_paths(vec![file; 65]).is_err());
        assert!(drag_paths(vec!["relative.app".into()]).is_err());
        assert!(drag_paths(vec![root.join("missing").to_string_lossy().into_owned()]).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
