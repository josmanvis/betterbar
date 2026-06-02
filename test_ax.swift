import Cocoa
import ApplicationServices

let pid: pid_t = 21703
let appRef = AXUIElementCreateApplication(pid)
var value: CFTypeRef?
AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute as CFString, &value)
if let windows = value as? [AXUIElement] {
    for window in windows {
        var title: CFTypeRef?
        AXUIElementCopyAttributeValue(window, kAXTitleAttribute as CFString, &title)
        print("Window: \(title as? String ?? "NO_TITLE")")
        
        var identifier: CFTypeRef?
        AXUIElementCopyAttributeValue(window, kAXIdentifierAttribute as CFString, &identifier)
        print(" Identifier: \(identifier as? String ?? "NO_ID")")
    }
}
