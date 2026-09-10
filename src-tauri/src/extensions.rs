use serde::Serialize;

#[derive(Serialize)]
pub struct ExtensionFile {
    pub name: String,
    pub display_name: String,
    pub content: String,
}

#[tauri::command]
pub fn fetch_extension_files_from_disk() -> Vec<ExtensionFile> {
    let mut extensions = Vec::new();
    let home = std::env::var("HOME").unwrap_or_else(|_| "".to_string());
    if home.is_empty() { return extensions; }
    let ext_dir = std::path::Path::new(&home).join(".betterbar").join("extensions");
    
    if let Ok(entries) = std::fs::read_dir(ext_dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let main_tsx = entry.path().join("main.tsx");
                if main_tsx.exists() {
                    if let Ok(content) = std::fs::read_to_string(main_tsx) {
                        let name = entry.file_name().to_string_lossy().into_owned();
                        let display_name = name.replace("-", " ");
                        extensions.push(ExtensionFile {
                            name,
                            display_name,
                            content,
                        });
                    }
                }
            }
        }
    }
    extensions
}

#[tauri::command]
pub fn read_standup_file() -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "".to_string());
    if home.is_empty() { return Err("No home dir".into()); }
    let dir = std::path::Path::new(&home).join(".prep-standup");
    
    // Find today's file, e.g. YYYY-MM-DD.md
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut file_path = dir.join(format!("{}.md", today));
    
    if !file_path.exists() {
        // Just find the latest .md file
        if let Ok(entries) = std::fs::read_dir(&dir) {
            let mut latest: Option<(std::path::PathBuf, std::time::SystemTime)> = None;
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |e| e == "md") {
                    if let Ok(metadata) = path.metadata() {
                        if let Ok(modified) = metadata.modified() {
                            if latest.is_none() || modified > latest.as_ref().unwrap().1 {
                                latest = Some((path, modified));
                            }
                        }
                    }
                }
            }
            if let Some((path, _)) = latest {
                file_path = path;
            } else {
                return Err("No standup files found".into());
            }
        } else {
            return Err("Could not read directory".into());
        }
    }
    
    std::fs::read_to_string(file_path).map_err(|e| e.to_string())
}
