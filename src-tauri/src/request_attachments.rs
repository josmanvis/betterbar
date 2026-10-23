//! Private, bounded snapshots for files explicitly attached to App Requests.
use serde::Serialize;
use std::{collections::HashSet, fs, io::{Read, Write}, path::{Path, PathBuf}};
#[cfg(unix)]
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};

const MAX_FILES: usize = 10;
const MAX_FILE: u64 = 20 * 1024 * 1024;
const MAX_TOTAL: u64 = 50 * 1024 * 1024;

#[derive(Debug, Serialize)]
pub struct Attachment {
    path: String,
    name: String,
    size: u64,
}
#[derive(Serialize)]
pub struct Snapshot {
    id: String,
    files: Vec<Attachment>,
}

fn inspect(paths: Vec<String>) -> Result<Vec<Attachment>, String> {
    if paths.len() > MAX_FILES { return Err("Attach up to 10 files.".into()); }
    let mut seen = HashSet::new();
    let mut files = Vec::new();
    let mut total = 0;
    for input in paths {
        let path = Path::new(&input);
        if !path.is_absolute() || input.contains('\0') { return Err("Choose an absolute file path.".into()); }
        let path = path.canonicalize().map_err(|_| "An attachment is no longer available. Remove it and choose it again.")?;
        if !seen.insert(path.clone()) { continue; }
        let metadata = path.metadata().map_err(|_| "Could not read an attachment. Check its permissions.")?;
        if !metadata.is_file() { return Err("Attach individual files. Folders and applications are not supported.".into()); }
        total += metadata.len();
        if metadata.len() > MAX_FILE || total > MAX_TOTAL { return Err("Attachments allow 20 MB per file and 50 MB in total.".into()); }
        files.push(Attachment { name: path.file_name().unwrap_or_default().to_string_lossy().into_owned(), path: path.to_string_lossy().into_owned(), size: metadata.len() });
    }
    Ok(files)
}

fn private_directory(path: &Path) -> Result<(), String> {
    let mut builder = fs::DirBuilder::new();
    #[cfg(unix)]
    builder.mode(0o700);
    builder.create(path).map_err(|_| "Could not create private attachment storage.".into())
}

fn snapshot(root: &Path, paths: Vec<String>) -> Result<Snapshot, String> {
    let files = inspect(paths)?;
    if files.is_empty() { return Err("Choose at least one attachment.".into()); }
    if !root.exists() { private_directory(root)?; }
    let id = format!("{}-{}", chrono::Utc::now().format("%Y%m%d-%H%M%S-%f"), std::process::id());
    let directory = root.join(&id);
    private_directory(&directory)?;
    let result = (|| {
        let mut copied = Vec::new();
        let mut total = 0;
        for (index, file) in files.into_iter().enumerate() {
            let mut options = fs::OpenOptions::new();
            options.read(true);
            // Never block on a FIFO substituted after validation, or follow a substituted link.
            #[cfg(target_os = "macos")]
            options.custom_flags(libc::O_NONBLOCK | libc::O_NOFOLLOW);
            let source = options.open(&file.path).map_err(|_| "Could not open an attachment. Choose it again.")?;
            if !source.metadata().map_err(|_| "Could not read an attachment.")?.is_file() { return Err("Attach individual files.".into()); }
            let item_directory = directory.join(format!("{:02}", index + 1));
            private_directory(&item_directory)?;
            let path = item_directory.join(&file.name);
            let mut options = fs::OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            options.mode(0o600);
            let mut destination = options.open(&path).map_err(|_| "Could not save an attachment.")?;
            let size = std::io::copy(&mut source.take(MAX_FILE + 1), &mut destination).map_err(|_| "Could not copy an attachment. Check its permissions.")?;
            total += size;
            if size > MAX_FILE || total > MAX_TOTAL { return Err("Attachments allow 20 MB per file and 50 MB in total.".into()); }
            destination.flush().map_err(|_| "Could not save an attachment.")?;
            copied.push(Attachment { path: path.to_string_lossy().into_owned(), name: file.name, size });
        }
        Ok(Snapshot { id, files: copied })
    })();
    if result.is_err() { let _ = fs::remove_dir_all(directory); }
    result
}

fn root() -> Result<PathBuf, String> {
    Ok(dirs::home_dir().ok_or("Home folder is unavailable.")?.join(".betterbar/app-request-attachments"))
}
fn authorize(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "ext_app_requests" { Ok(()) } else { Err("Open App Requests to attach files.".into()) }
}

#[tauri::command]
pub async fn inspect_request_attachments(window: tauri::WebviewWindow, paths: Vec<String>) -> Result<Vec<Attachment>, String> {
    authorize(&window)?;
    tauri::async_runtime::spawn_blocking(move || inspect(paths)).await.map_err(|_| "Could not inspect attachments.".to_string())?
}
#[tauri::command]
pub async fn snapshot_request_attachments(window: tauri::WebviewWindow, paths: Vec<String>) -> Result<Snapshot, String> {
    authorize(&window)?;
    tauri::async_runtime::spawn_blocking(move || snapshot(&root()?, paths)).await.map_err(|_| "Could not save attachments.".to_string())?
}
#[tauri::command]
pub async fn discard_request_attachments(window: tauri::WebviewWindow, id: String) -> Result<(), String> {
    authorize(&window)?;
    if id.is_empty() || id.len() > 80 || !id.bytes().all(|byte| byte.is_ascii_digit() || byte == b'-') { return Err("Invalid attachment snapshot.".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let path = root()?.join(id);
        match fs::remove_dir_all(path) { Ok(()) => Ok(()), Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()), Err(_) => Err("Could not remove unused attachments.".into()) }
    }).await.map_err(|_| "Could not remove unused attachments.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> PathBuf {
        let path = std::env::temp_dir().join(format!("request-attachments-{}-{}", std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        fs::create_dir(&path).unwrap(); path
    }
    #[test]
    fn validates_and_deduplicates_files() {
        let directory = fixture();
        let file = directory.join("a 'quoted' $(literal).txt");
        fs::write(&file, b"hello").unwrap();
        let path = file.to_string_lossy().into_owned();
        assert_eq!(inspect(vec![path.clone(), path.clone()]).unwrap().len(), 1);
        assert!(inspect(vec!["relative.txt".into()]).is_err());
        assert!(inspect(vec![directory.to_string_lossy().into_owned()]).is_err());
        assert!(inspect(vec![directory.join("missing").to_string_lossy().into_owned()]).is_err());
        assert!(inspect(vec![path; 11]).is_err());
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn snapshots_survive_original_changes_and_preserve_names_privately() {
        let directory = fixture();
        fs::create_dir_all(directory.join("a")).unwrap();
        fs::create_dir_all(directory.join("b")).unwrap();
        fs::write(directory.join("a/image.png"), b"first").unwrap();
        fs::write(directory.join("b/image.png"), b"second").unwrap();
        let result = snapshot(&directory.join("snapshots"), ["a/image.png", "b/image.png"].iter().map(|name| directory.join(name).to_string_lossy().into_owned()).collect()).unwrap();
        fs::remove_file(directory.join("a/image.png")).unwrap();
        assert_eq!(result.files[0].name, "image.png");
        assert_eq!(fs::read(&result.files[0].path).unwrap(), b"first");
        assert_eq!(fs::read(&result.files[1].path).unwrap(), b"second");
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(fs::metadata(&result.files[0].path).unwrap().permissions().mode() & 0o777, 0o600);
            assert_eq!(fs::metadata(directory.join("snapshots").join(result.id)).unwrap().permissions().mode() & 0o777, 0o700);
        }
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn bounds_file_and_total_sizes() {
        let directory = fixture();
        let mut paths = Vec::new();
        for index in 0..3 {
            let path = directory.join(format!("{index}.bin"));
            fs::File::create(&path).unwrap().set_len(MAX_FILE).unwrap();
            paths.push(path.to_string_lossy().into_owned());
        }
        assert!(inspect(paths.clone()).is_err());
        fs::OpenOptions::new().write(true).open(&paths[0]).unwrap().set_len(MAX_FILE + 1).unwrap();
        assert!(snapshot(&directory.join("snapshots"), vec![paths[0].clone()]).is_err());
        assert!(!directory.join("snapshots").exists());
        fs::remove_dir_all(directory).unwrap();
    }
}
