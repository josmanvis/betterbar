fn main() {
    let output = std::process::Command::new("osascript")
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
        .output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if !line.contains('|') { continue; }
        let parts: Vec<&str> = line.split('|').collect();
        let name = parts.first().unwrap_or(&"").trim().to_string();
        let mut parsed_bundle = parts.get(2).unwrap_or(&"").trim().to_string();
        if parsed_bundle.is_empty() {
            parsed_bundle = name.to_lowercase().replace(' ', ".");
        }
        println!("Name: {}, Bundle: {}", name, parsed_bundle);
    }
}
