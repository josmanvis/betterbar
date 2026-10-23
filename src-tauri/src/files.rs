//! Files extension: bounded reads and native, non-overwriting file operations.
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    path: String,
    name: String,
    directory: bool,
    package: bool,
    symlink: bool,
    size: u64,
    modified: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    path: String,
    entries: Vec<Entry>,
    truncated: bool,
    skipped: usize,
}
#[derive(Serialize)]
pub struct Place {
    name: String,
    path: String,
}

fn absolute(input: &str) -> Result<PathBuf, String> {
    if input.contains('\0') || !Path::new(input).is_absolute() {
        return Err("Choose an absolute path.".into());
    }
    Ok(PathBuf::from(input))
}
fn child(directory: &Path, name: &str) -> Result<PathBuf, String> {
    if name.trim().is_empty() || name == "." || name == ".." || name.contains(['/', ':', '\0']) {
        return Err("Use a name without slashes or colons.".into());
    }
    Ok(directory.join(name))
}
fn entry(path: &Path) -> Result<Entry, String> {
    let link = path
        .symlink_metadata()
        .map_err(|_| "Could not read this item. Check its permissions.")?;
    let meta = path.metadata().unwrap_or_else(|_| link.clone());
    let extension = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let package = meta.is_dir()
        && [
            "app",
            "bundle",
            "framework",
            "photoslibrary",
            "pages",
            "numbers",
            "key",
            "rtfd",
        ]
        .contains(&extension.as_str());
    Ok(Entry {
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .unwrap_or(path.as_os_str())
            .to_string_lossy()
            .into_owned(),
        directory: meta.is_dir(),
        package,
        symlink: link.file_type().is_symlink(),
        size: meta.len(),
        modified: meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |t| t.as_secs()),
    })
}
fn list(input: &str, hidden: bool) -> Result<Listing, String> {
    let path = absolute(input)?
        .canonicalize()
        .map_err(|_| "Folder unavailable. Check the path and macOS Files and Folders access.")?;
    let children = path.read_dir().map_err(|_| {
        "Could not open this folder. Check macOS Files and Folders access for BetterBar."
    })?;
    let mut result = Listing {
        path: path.to_string_lossy().into_owned(),
        entries: Vec::new(),
        truncated: false,
        skipped: 0,
    };
    for item in children {
        let Ok(item) = item else {
            result.skipped += 1;
            continue;
        };
        if !hidden && item.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        if result.entries.len() == 10_000 {
            result.truncated = true;
            break;
        }
        match entry(&item.path()) {
            Ok(item) => result.entries.push(item),
            Err(_) => result.skipped += 1,
        }
    }
    Ok(result)
}
#[tauri::command]
pub async fn files_list(path: String, hidden: bool) -> Result<Listing, String> {
    tauri::async_runtime::spawn_blocking(move || list(&path, hidden))
        .await
        .map_err(|_| "Could not read this folder.".to_string())?
}
#[tauri::command]
pub async fn files_places() -> Result<Vec<Place>, String> {
    let home = dirs::home_dir().ok_or("Could not locate your home folder.")?;
    let mut places = vec![Place {
        name: "Home".into(),
        path: home.to_string_lossy().into_owned(),
    }];
    for (name, path) in [
        ("Desktop", home.join("Desktop")),
        ("Documents", home.join("Documents")),
        ("Downloads", home.join("Downloads")),
        ("Pictures", home.join("Pictures")),
        ("Music", home.join("Music")),
        ("Movies", home.join("Movies")),
        (
            "iCloud Drive",
            home.join("Library/Mobile Documents/com~apple~CloudDocs"),
        ),
        ("Applications", PathBuf::from("/Applications")),
        ("Trash", home.join(".Trash")),
    ] {
        if path.is_dir() {
            places.push(Place {
                name: name.into(),
                path: path.to_string_lossy().into_owned(),
            });
        }
    }
    if let Ok(volumes) = Path::new("/Volumes").read_dir() {
        for volume in volumes.flatten().take(64) {
            places.push(Place {
                name: volume.file_name().to_string_lossy().into_owned(),
                path: volume.path().to_string_lossy().into_owned(),
            });
        }
    }
    Ok(places)
}

fn spotlight_literal(query: &str) -> String {
    // Escape Spotlight's query language, independently of process argument quoting.
    query
        .chars()
        .flat_map(|c| {
            if ['\\', '"', '*', '?'].contains(&c) {
                vec!['\\', c]
            } else {
                vec![c]
            }
        })
        .collect()
}
#[tauri::command]
pub async fn files_search(path: String, query: String, hidden: bool) -> Result<Listing, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let root = absolute(&path)?
            .canonicalize()
            .map_err(|_| "Search folder unavailable.")?;
        if query.trim().is_empty() || query.len() > 256 {
            return Err("Enter a search of 1–256 characters.".into());
        }
        let expression = format!("kMDItemFSName == \"*{}*\"cd", spotlight_literal(&query));
        let mut process = Command::new("/usr/bin/mdfind")
            .arg("-0")
            .arg("-onlyin")
            .arg(&root)
            .arg(expression)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|_| "Could not start Spotlight search.")?;
        let stdout = process
            .stdout
            .take()
            .ok_or("Could not read Spotlight results.")?;
        let (send, receive) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut data = Vec::new();
            let read = stdout.take(2_000_000).read_to_end(&mut data);
            let _ = send.send((read, data));
        });
        let output = receive.recv_timeout(std::time::Duration::from_secs(10));
        if output.is_err()
            || output
                .as_ref()
                .is_ok_and(|(_, data)| data.len() == 2_000_000)
        {
            let _ = process.kill();
        }
        let status = process.wait();
        let (read, data) =
            output.map_err(|_| "Spotlight search timed out. Try a smaller folder.")?;
        read.map_err(|_| "Could not read Spotlight results.")?;
        // A killed process is expected only if the bounded reader filled up.
        if data.len() < 2_000_000 && !status.is_ok_and(|s| s.success()) {
            return Err("Spotlight search failed. Check that indexing is enabled.".into());
        }
        let mut result = Listing {
            path: root.to_string_lossy().into_owned(),
            entries: Vec::new(),
            truncated: data.len() == 2_000_000,
            skipped: 0,
        };
        for raw in data.split(|b| *b == 0).filter(|p| !p.is_empty()) {
            let Ok(text) = std::str::from_utf8(raw) else {
                result.skipped += 1;
                continue;
            };
            let path = Path::new(text);
            if !path.starts_with(&root) {
                continue;
            }
            if !hidden
                && path
                    .strip_prefix(&root)
                    .unwrap()
                    .components()
                    .any(|p| p.as_os_str().to_string_lossy().starts_with('.'))
            {
                continue;
            }
            if result.entries.len() >= 500 {
                result.truncated = true;
                break;
            }
            match entry(path) {
                Ok(item) => result.entries.push(item),
                Err(_) => result.skipped += 1,
            }
        }
        Ok(result)
    })
    .await
    .map_err(|_| "Could not search files.".to_string())?
}

#[cfg(target_os = "macos")]
fn native_operation(
    action: &str,
    source: &Path,
    destination: Option<&Path>,
) -> Result<String, String> {
    use cocoa::base::{id, nil, BOOL, NO, YES};
    use cocoa::foundation::NSString;
    use objc::{class, msg_send, sel, sel_impl};
    objc::rc::autoreleasepool(|| unsafe {
        let manager: id = msg_send![class!(NSFileManager), defaultManager];
        let src = NSString::alloc(nil).init_str(&source.to_string_lossy());
        let dst = destination
            .map(|p| NSString::alloc(nil).init_str(&p.to_string_lossy()))
            .unwrap_or(nil);
        let mut error: id = nil;
        let mut resulting_url: id = nil;
        let success: BOOL = match action {
            "copy" => msg_send![manager, copyItemAtPath: src toPath: dst error: &mut error],
            "move" => msg_send![manager, moveItemAtPath: src toPath: dst error: &mut error],
            "trash" => {
                let url: id = msg_send![class!(NSURL), fileURLWithPath: src];
                msg_send![manager, trashItemAtURL: url resultingItemURL: &mut resulting_url error: &mut error]
            }
            _ => NO,
        };
        let mut result = destination
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
        if resulting_url != nil {
            let path: id = msg_send![resulting_url, path];
            let ptr: *const std::os::raw::c_char = msg_send![path, UTF8String];
            if !ptr.is_null() {
                result = std::ffi::CStr::from_ptr(ptr).to_string_lossy().into_owned();
            }
        }
        let _: () = msg_send![src, release];
        if dst != nil {
            let _: () = msg_send![dst, release];
        }
        if success == YES {
            Ok(result)
        } else {
            Err("The operation failed. The destination may already exist, the item may be locked, or macOS may deny access. No existing item was replaced.".into())
        }
    })
}
#[cfg(not(target_os = "macos"))]
fn native_operation(_: &str, _: &Path, _: Option<&Path>) -> Result<String, String> {
    Err("File operations require macOS.".into())
}

fn destination(source: &Path, directory: &Path, name: &str) -> Result<PathBuf, String> {
    let directory = directory
        .canonicalize()
        .map_err(|_| "Destination folder unavailable.")?;
    if !directory.is_dir() {
        return Err("Choose a destination folder.".into());
    }
    let target = child(&directory, name)?;
    if target.symlink_metadata().is_ok() {
        return Err(
            "An item with this name already exists. Choose another name; nothing was replaced."
                .into(),
        );
    }
    if source.is_dir() && !source.is_symlink() {
        let canonical = source
            .canonicalize()
            .map_err(|_| "Source folder unavailable.")?;
        if directory.starts_with(canonical) {
            return Err("A folder cannot be copied or moved into itself.".into());
        }
    }
    Ok(target)
}
fn unique_copy(source: &Path, suffix: &str) -> Result<PathBuf, String> {
    let parent = source.parent().ok_or("This item cannot be duplicated.")?;
    let stem = source.file_stem().unwrap_or_default().to_string_lossy();
    let extension = source
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for number in 1..10_000 {
        let index = if number == 1 {
            String::new()
        } else {
            format!(" {number}")
        };
        let name = format!("{stem}{suffix}{index}{extension}");
        let target = child(parent, &name)?;
        if target.symlink_metadata().is_err() {
            return Ok(target);
        }
    }
    Err("Could not choose an unused name.".into())
}
fn action(
    action: &str,
    path: &str,
    target: Option<&str>,
    name: Option<&str>,
) -> Result<String, String> {
    let source = absolute(path)?;
    // Never act on a volume root, home, or system root through a destructive action.
    if ["move", "rename", "trash"].contains(&action) {
        let resolved = if source.is_symlink() {
            source.clone()
        } else {
            source.canonicalize().map_err(|_| "Item unavailable.")?
        };
        if resolved.parent().is_none()
            || dirs::home_dir().as_ref() == Some(&resolved)
            || ["/Applications", "/System", "/Library", "/Users", "/Volumes"]
                .iter()
                .any(|p| resolved == Path::new(p))
            || resolved.parent() == Some(Path::new("/Volumes"))
        {
            return Err("Manage this special folder in Finder.".into());
        }
    }
    match action {
        "mkdir" => {
            let path = child(&source, name.ok_or("Enter a folder name.")?)?;
            std::fs::create_dir(&path).map_err(|_| {
                "Could not create the folder. Its name may already exist or access may be denied."
            })?;
            Ok(path.to_string_lossy().into_owned())
        }
        "copy" | "move" | "rename" => {
            let parent = source.parent().ok_or("This item has no parent folder.")?;
            let directory = if action == "rename" {
                parent.to_path_buf()
            } else {
                absolute(target.ok_or("Choose a destination folder.")?)?
            };
            let file_name = source
                .file_name()
                .ok_or("This item cannot be copied or moved.")?
                .to_string_lossy();
            let target = destination(&source, &directory, name.unwrap_or(&file_name))?;
            native_operation(
                if action == "copy" { "copy" } else { "move" },
                &source,
                Some(&target),
            )
        }
        "duplicate" => native_operation("copy", &source, Some(&unique_copy(&source, " copy")?)),
        "trash" => native_operation("trash", &source, None),
        "open" | "reveal" | "preview" => {
            if source.symlink_metadata().is_err() {
                return Err("This item is no longer available.".into());
            }
            let mut command = if action == "preview" {
                Command::new("/usr/bin/qlmanage")
            } else {
                Command::new("/usr/bin/open")
            };
            if action == "preview" {
                command.arg("-p");
            }
            if action == "reveal" {
                command.arg("-R");
            }
            command
                .arg(&source)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());
            // Quick Look stays alive until dismissed. Reap it on a worker thread.
            if action == "preview" {
                let mut process = command.spawn().map_err(|_| "Could not start Quick Look.")?;
                std::thread::spawn(move || {
                    let _ = process.wait();
                });
            } else if !command
                .status()
                .map_err(|_| "Could not open this item.")?
                .success()
            {
                return Err("Could not open this item.".into());
            }
            Ok(String::new())
        }
        "compress" => {
            let filename = format!(
                "{}.zip",
                source
                    .file_name()
                    .ok_or("Choose an item to compress.")?
                    .to_string_lossy()
            );
            let target = destination(
                &source,
                source.parent().ok_or("Choose an item to compress.")?,
                &filename,
            )?;
            let temporary = std::env::temp_dir().join(format!(
                "bb-files-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos()
            ));
            std::fs::create_dir(&temporary).map_err(|_| "Could not prepare the archive.")?;
            let archive = temporary.join("archive.zip");
            let status = Command::new("/usr/bin/ditto")
                .args(["-c", "-k", "--sequesterRsrc", "--keepParent"])
                .arg(&source)
                .arg(&archive)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
            let result = if status.is_ok_and(|s| s.success()) {
                native_operation("move", &archive, Some(&target))
            } else {
                Err("Could not compress this item.".into())
            };
            let _ = std::fs::remove_dir_all(&temporary);
            result
        }
        _ => Err("Unknown file action.".into()),
    }
}
#[tauri::command]
pub async fn files_action(
    action: String,
    path: String,
    target: Option<String>,
    name: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        self::action(&action, &path, target.as_deref(), name.as_deref())
    })
    .await
    .map_err(|_| "The file operation could not finish.".to_string())?
}

#[cfg(target_os = "macos")]
fn tags(path: &str, values: Option<Vec<String>>) -> Result<Vec<String>, String> {
    use cocoa::base::{id, nil, BOOL, YES};
    use cocoa::foundation::NSString;
    use objc::{class, msg_send, sel, sel_impl};
    let path = absolute(path)?;
    objc::rc::autoreleasepool(|| unsafe {
        let ns_path = NSString::alloc(nil).init_str(&path.to_string_lossy());
        let url: id = msg_send![class!(NSURL), fileURLWithPath: ns_path];
        let _: () = msg_send![ns_path, release];
        let key = NSString::alloc(nil).init_str("NSURLTagNamesKey");
        let mut error: id = nil;
        if let Some(values) = values {
            if values.len() > 32
                || values
                    .iter()
                    .any(|v| v.len() > 128 || v.contains(['\0', '\n']))
            {
                let _: () = msg_send![key, release];
                return Err("Use up to 32 short tags without line breaks.".into());
            }
            let array: id = msg_send![class!(NSMutableArray), array];
            for value in values {
                let string = NSString::alloc(nil).init_str(&value);
                let _: () = msg_send![array, addObject: string];
                let _: () = msg_send![string, release];
            }
            let success: BOOL =
                msg_send![url, setResourceValue: array forKey: key error: &mut error];
            if success != YES {
                let _: () = msg_send![key, release];
                return Err(
                    "Could not save tags. Check that this volume supports Finder tags.".into(),
                );
            }
        }
        let mut value: id = nil;
        let success: BOOL =
            msg_send![url, getResourceValue: &mut value forKey: key error: &mut error];
        let _: () = msg_send![key, release];
        if success != YES {
            return Err("Could not read Finder tags.".into());
        }
        let mut result = Vec::new();
        if value != nil {
            let count: usize = msg_send![value, count];
            for i in 0..count {
                let string: id = msg_send![value, objectAtIndex: i];
                let ptr: *const std::os::raw::c_char = msg_send![string, UTF8String];
                if !ptr.is_null() {
                    result.push(std::ffi::CStr::from_ptr(ptr).to_string_lossy().into_owned());
                }
            }
        }
        Ok(result)
    })
}
#[tauri::command]
pub async fn files_tags(path: String, values: Option<Vec<String>>) -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(move || tags(&path, values))
            .await
            .map_err(|_| "Could not access Finder tags.".to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, values);
        Err("Finder tags require macOS.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(label: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("bb-files-test-{label}-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        root
    }
    #[test]
    fn listing_distinguishes_packages_links_hidden_and_unicode() {
        let root = fixture("list");
        std::fs::create_dir_all(root.join("Example.app")).unwrap();
        std::fs::write(root.join(".hidden"), "hidden").unwrap();
        std::fs::write(root.join("Résumé $(literal).txt"), "hello").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(root.join("missing"), root.join("broken link")).unwrap();
        let items = list(root.to_str().unwrap(), false).unwrap();
        assert!(items
            .entries
            .iter()
            .any(|e| e.name == "Example.app" && e.package && e.directory));
        assert!(items
            .entries
            .iter()
            .any(|e| e.name == "Résumé $(literal).txt" && e.size == 5));
        assert!(!items.entries.iter().any(|e| e.name == ".hidden"));
        assert!(list(root.to_str().unwrap(), true)
            .unwrap()
            .entries
            .iter()
            .any(|e| e.name == ".hidden"));
        assert!(absolute("relative").is_err());
        assert!(list(root.join("missing").to_str().unwrap(), true).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn destinations_reject_collisions_traversal_and_recursive_copies() {
        let root = fixture("dest");
        let source = root.join("folder");
        std::fs::create_dir_all(source.join("inside")).unwrap();
        std::fs::write(root.join("exists"), "keep").unwrap();
        assert!(child(&root, "../escape").is_err());
        assert!(child(&root, "..").is_err());
        assert!(destination(&source, &root, "exists").is_err());
        assert!(destination(&source, &source.join("inside"), "nested").is_err());
        assert!(action("trash", "/", None, None).is_err());
        assert!(action("unknown", root.to_str().unwrap(), None, None).is_err());
        assert_eq!(
            std::fs::read_to_string(root.join("exists")).unwrap(),
            "keep"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn spotlight_query_escapes_metacharacters() {
        assert_eq!(spotlight_literal("a\"*?\\b"), "a\\\"\\*\\?\\\\b");
    }
    #[test]
    #[cfg(target_os = "macos")]
    fn native_operations_preserve_data_tags_and_refuse_overwrite() {
        let root = fixture("native");
        let path = root.join("Résumé ' $(literal).txt");
        std::fs::write(&path, "original").unwrap();
        let copy = action("duplicate", path.to_str().unwrap(), None, None).unwrap();
        assert_eq!(std::fs::read_to_string(&copy).unwrap(), "original");
        assert!(native_operation("copy", &path, Some(&PathBuf::from(&copy))).is_err());
        assert!(native_operation("move", &path, Some(&PathBuf::from(&copy))).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "original");
        let renamed = action("rename", &copy, None, Some("renamed.txt")).unwrap();
        assert!(!Path::new(&copy).exists());
        assert_eq!(
            tags(&renamed, Some(vec!["Files Test".into()])).unwrap(),
            vec!["Files Test"]
        );
        assert_eq!(tags(&renamed, None).unwrap(), vec!["Files Test"]);
        assert!(tags(&renamed, Some(Vec::new())).unwrap().is_empty());
        let archive = action("compress", &renamed, None, None).unwrap();
        assert!(Path::new(&archive).is_file());
        assert!(action("compress", &renamed, None, None).is_err());
        // Trash/restore only the disposable fixture, never user data.
        let trashed = action("trash", &renamed, None, None).unwrap();
        assert!(!Path::new(&renamed).exists());
        assert!(Path::new(&trashed).exists());
        action("move", &trashed, root.to_str(), Some("restored.txt")).unwrap();
        assert_eq!(
            std::fs::read_to_string(root.join("restored.txt")).unwrap(),
            "original"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}

#[tauri::command]
pub async fn files_clipboard(
    app: tauri::AppHandle,
    paths: Option<Vec<String>>,
) -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    {
        if paths.as_ref().is_some_and(|p| p.len() > 500) {
            return Err("Copy up to 500 items at a time.".into());
        }
        if let Some(paths) = &paths {
            for path in paths {
                absolute(path)?;
            }
        }
        let (send, receive) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            use cocoa::base::{id, nil, BOOL, YES};
            use cocoa::foundation::NSString;
            use objc::{class, msg_send, sel, sel_impl};
            let result = objc::rc::autoreleasepool(|| unsafe {
                let board: id = msg_send![class!(NSPasteboard), generalPasteboard];
                if let Some(paths) = paths {
                    let array: id = msg_send![class!(NSMutableArray), array];
                    for path in &paths {
                        let string = NSString::alloc(nil).init_str(path);
                        let url: id = msg_send![class!(NSURL), fileURLWithPath: string];
                        let _: () = msg_send![string, release];
                        let _: () = msg_send![array, addObject: url];
                    }
                    let _: isize = msg_send![board, clearContents];
                    let success: BOOL = msg_send![board, writeObjects: array];
                    if success != YES {
                        return Err("Could not copy file references to the clipboard.".to_string());
                    }
                    Ok(paths)
                } else {
                    let classes: id = msg_send![class!(NSArray), arrayWithObject: class!(NSURL)];
                    let key =
                        NSString::alloc(nil).init_str("NSPasteboardURLReadingFileURLsOnlyKey");
                    let yes: id = msg_send![class!(NSNumber), numberWithBool: YES];
                    let options: id =
                        msg_send![class!(NSDictionary), dictionaryWithObject: yes forKey: key];
                    let urls: id =
                        msg_send![board, readObjectsForClasses: classes options: options];
                    let _: () = msg_send![key, release];
                    let mut paths = Vec::new();
                    if urls != nil {
                        let count: usize = msg_send![urls, count];
                        if count > 500 {
                            return Err("Paste up to 500 items at a time.".to_string());
                        }
                        for index in 0..count {
                            let url: id = msg_send![urls, objectAtIndex: index];
                            let path: id = msg_send![url, path];
                            let ptr: *const std::os::raw::c_char = msg_send![path, UTF8String];
                            if !ptr.is_null() {
                                paths.push(
                                    std::ffi::CStr::from_ptr(ptr).to_string_lossy().into_owned(),
                                );
                            }
                        }
                    }
                    Ok(paths)
                }
            });
            let _ = send.send(result);
        })
        .map_err(|_| "Clipboard unavailable.".to_string())?;
        tauri::async_runtime::spawn_blocking(move || {
            receive
                .recv()
                .map_err(|_| "Clipboard unavailable.".to_string())?
        })
        .await
        .map_err(|_| "Clipboard unavailable.".to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, paths);
        Err("File clipboard requires macOS.".into())
    }
}
