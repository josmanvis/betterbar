use std::os::raw::c_void;

type CFTypeRef = *const c_void;
type CFArrayRef = CFTypeRef;
type CFIndex = isize;

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFArrayGetCount(the_array: CFArrayRef) -> CFIndex;
    fn CFArrayGetValueAtIndex(the_array: CFArrayRef, idx: CFIndex) -> CFTypeRef;
    fn CFStringCreateWithCString(
        alloc: CFTypeRef,
        c_str: *const std::os::raw::c_char,
        encoding: u32,
    ) -> CFTypeRef;
    fn CFRelease(cf: CFTypeRef);
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

const CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;

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
                        // Using a dummy way to print CFString for test
                        // In real code we use core_foundation crate
                        result = Some("Found it".to_string());
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

fn main() {
    println!("{:?}", get_ax_window_title(21703, 85893));
}
