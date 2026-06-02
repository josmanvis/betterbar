import Cocoa

let options = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
if let windowListInfo = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as NSArray? {
    for case let dict as NSDictionary in windowListInfo {
        if let owner = dict[kCGWindowOwnerName as String] as? String, owner.contains("Simulator") {
            let title = dict[kCGWindowName as String] as? String ?? "NO_TITLE"
            let layer = dict[kCGWindowLayer as String] as? Int ?? -1
            let pid = dict[kCGWindowOwnerPID as String] as? Int ?? -1
            print("Owner: \(owner), Title: \(title), Layer: \(layer), PID: \(pid)")
        }
    }
}
