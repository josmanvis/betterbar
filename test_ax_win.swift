import Cocoa
import ApplicationServices

@_silgen_name("_AXUIElementGetWindow")
func _AXUIElementGetWindow(_ element: AXUIElement, _ id: inout CGWindowID) -> AXError

let pid: pid_t = 21703
let appRef = AXUIElementCreateApplication(pid)
var value: CFTypeRef?
AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute as CFString, &value)
if let windows = value as? [AXUIElement] {
    for window in windows {
        var title: CFTypeRef?
        AXUIElementCopyAttributeValue(window, kAXTitleAttribute as CFString, &title)
        
        var windowID: CGWindowID = 0
        let err = _AXUIElementGetWindow(window, &windowID)
        
        print("Window: \(title as? String ?? "NO_TITLE"), ID: \(windowID), Err: \(err.rawValue)")
    }
}
