use cocoa::base::{id, nil};
use cocoa::foundation::NSString;
use objc::{class, msg_send, sel, sel_impl};

fn get_app_icon_base64(bundle_id: &str) -> Option<String> {
    unsafe {
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        if workspace == nil {
            eprintln!("NSWorkspace sharedWorkspace returned nil");
            return None;
        }

        let bundle_ns: id = NSString::alloc(nil).init_str(bundle_id);
        let app_url: id = msg_send![workspace, URLForApplicationWithBundleIdentifier: bundle_ns];
        if app_url == nil {
            eprintln!("No app URL for bundle id: {}", bundle_id);
            return None;
        }

        let app_path_ns: id = msg_send![app_url, path];
        if app_path_ns == nil {
            eprintln!("No POSIX path for {}", bundle_id);
            return None;
        }

        let icon: id = msg_send![workspace, iconForFile: app_path_ns];
        if icon == nil {
            eprintln!("No icon for {}", bundle_id);
            return None;
        }
        println!("Got icon!");
        Some("base64_data".to_string())
    }
}

fn main() {
    let bundle_id = "com.google.Chrome";
    let res = get_app_icon_base64(bundle_id);
    println!("Res length: {:?}", res.map(|s| s.len()));
}
