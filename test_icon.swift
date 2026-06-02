import Cocoa

let bundleId = "com.google.Chrome"
if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) {
    print("Found Chrome at: \(url.path)")
} else {
    print("Failed to find Chrome")
}

let bundleId2 = "dev.zed.Zed"
if let url2 = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId2) {
    print("Found Zed at: \(url2.path)")
} else {
    print("Failed to find Zed")
}
