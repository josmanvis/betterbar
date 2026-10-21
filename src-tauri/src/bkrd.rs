//! A bounded bridge to the user's local BKRD service. No shell, credentials,
//! repository checkout, or branch data persisted by BetterBar.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{io::Write, process::{Command, Stdio}, sync::Mutex, time::{Duration, Instant}};

static CONNECTION: Mutex<()> = Mutex::new(());
const UNAVAILABLE: &str = "BKRD is unavailable. Check its installation and local service port, then try again.";

fn port_number(port: Option<u16>) -> Result<u16, String> {
    let port = port.or_else(|| {
        let path = dirs::home_dir()?.join(".bkrd/config.json");
        let config: Value = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
        u16::try_from(config.get("port")?.as_u64()?).ok()
    }).unwrap_or(1212);
    if port == 0 { return Err("Choose a local service port between 1 and 65535.".into()); }
    Ok(port)
}

fn request(port: u16, endpoint: &str, body: Option<Value>, seconds: u16) -> Result<Value, String> {
    let mut command = Command::new("/usr/bin/curl");
    command.args(["--silent", "--fail", "--noproxy", "*", "--proto", "=http", "--connect-timeout", "2", "--max-time"])
        .arg(seconds.to_string()).args(["--max-filesize", "16777216", "--url"])
        .arg(format!("http://127.0.0.1:{port}/api/{endpoint}"))
        .stdin(if body.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped()).stderr(Stdio::null());
    if body.is_some() { command.args(["--header", "Content-Type: application/json", "--data-binary", "@-"]); }
    let mut child = command.spawn().map_err(|_| UNAVAILABLE.to_string())?;
    if let Some(body) = body {
        if let Some(mut input) = child.stdin.take() {
            if input.write_all(body.to_string().as_bytes()).is_err() {
                let _ = child.kill(); let _ = child.wait(); return Err(UNAVAILABLE.into());
            }
        }
    }
    let output = child.wait_with_output().map_err(|_| UNAVAILABLE.to_string())?;
    if !output.status.success() || output.stdout.len() > 16 * 1024 * 1024 { return Err(UNAVAILABLE.into()); }
    let value: Value = serde_json::from_slice(&output.stdout).map_err(|_| "BKRD returned invalid data.".to_string())?;
    if value.get("ok").and_then(Value::as_bool) != Some(true) { return Err("BKRD could not complete this request.".into()); }
    Ok(value)
}

fn connect(port: u16) -> Result<(), String> {
    let _guard = CONNECTION.lock().map_err(|_| UNAVAILABLE.to_string())?;
    if request(port, "ping", None, 2).is_ok() { return Ok(()); }
    // Finder-launched apps do not inherit the interactive shell's PATH.
    let mut paths = vec![std::path::PathBuf::from("/opt/homebrew/bin"), "/usr/local/bin".into(), "/usr/bin".into(), "/bin".into()];
    if let Some(home) = dirs::home_dir() { paths.insert(0, home.join(".local/bin")); paths.insert(0, home.join("bin")); }
    if let Some(path) = std::env::var_os("PATH") { paths.extend(std::env::split_paths(&path)); }
    let executable = paths.iter().map(|path| path.join("bkrd")).find(|path| path.is_file())
        .ok_or_else(|| "Install the bkrd CLI before opening Branch Explorer.".to_string())?;
    let mut child = Command::new(executable).args(["list", "--json"])
        .env("PATH", std::env::join_paths(paths).map_err(|_| UNAVAILABLE.to_string())?)
        .env("PORT", port.to_string()).env("BKR_PORT", port.to_string())
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .spawn().map_err(|_| UNAVAILABLE.to_string())?;
    // The CLI starts and detaches its own service. Reap the one-shot CLI even
    // if startup or a later scan fails, without blocking the UI thread.
    std::thread::spawn(move || {
        let start = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(_)) | Err(_) => break,
                _ if start.elapsed() > Duration::from_secs(120) => { let _ = child.kill(); let _ = child.wait(); break; },
                _ => std::thread::sleep(Duration::from_millis(200)),
            }
        }
    });
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(20) {
        if request(port, "ping", None, 2).is_ok() { return Ok(()); }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err(UNAVAILABLE.into())
}

fn load(port: u16, fresh: bool) -> Result<Value, String> {
    connect(port)?;
    let mut value = request(port, if fresh { "branches?fresh=1" } else { "branches" }, None, 90)?;
    if !value.get("branches").is_some_and(Value::is_array) { return Err("BKRD returned invalid branch data.".into()); }
    value["port"] = json!(port);
    Ok(value)
}

#[tauri::command]
pub async fn get_bkrd_data(port: Option<u16>, fresh: bool) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || load(port_number(port)?, fresh))
        .await.map_err(|_| UNAVAILABLE.to_string())?
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action { Rescan, AddNote, DeleteNote, OpenRepo, OpenLink, CopyBranch }

fn checked_link(value: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(value).map_err(|_| "Invalid link.".to_string())?;
    if !["https", "http"].contains(&url.scheme()) || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() {
        return Err("Only web links are supported.".into());
    }
    Ok(url)
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionArgs { pub repo: Option<String>, pub branch: Option<String>, pub text: Option<String>, pub note_id: Option<String>, pub url: Option<String> }

fn perform(port: u16, action: Action, args: ActionArgs) -> Result<Value, String> {
    match action {
        Action::OpenLink => {
            let url = checked_link(args.url.as_deref().unwrap_or(""))?;
            let status = Command::new("/usr/bin/open").arg("--").arg(url.as_str()).stdout(Stdio::null()).stderr(Stdio::null()).status();
            if !status.is_ok_and(|status| status.success()) { return Err("Could not open this link.".into()); }
            Ok(json!({"ok": true}))
        },
        Action::CopyBranch => {
            let branch = args.branch.filter(|value| !value.is_empty() && value.len() <= 4096).ok_or("Choose a branch first.")?;
            let mut child = Command::new("/usr/bin/pbcopy").stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|_| "Could not copy branch name.")?;
            let result = child.stdin.take().ok_or("Could not copy branch name.")?.write_all(branch.as_bytes());
            let status = child.wait();
            if result.is_err() || !status.is_ok_and(|status| status.success()) { return Err("Could not copy branch name.".into()); }
            Ok(json!({"ok": true}))
        },
        Action::OpenRepo => {
            let data = load(port, false)?;
            let repo = data["repos"].as_array().and_then(|repos| repos.iter().find(|repo| repo["name"].as_str() == args.repo.as_deref())).ok_or("Repository is no longer available.")?;
            let path = repo["path"].as_str().ok_or("Repository is no longer available.")?;
            if !std::path::Path::new(path).is_dir() { return Err("Repository is no longer available.".into()); }
            let status = Command::new("/usr/bin/open").args(["-a", "Zed", "--", path]).stdout(Stdio::null()).stderr(Stdio::null()).status();
            if !status.is_ok_and(|status| status.success()) { return Err("Could not open the repository in Zed.".into()); }
            Ok(json!({"ok": true}))
        },
        Action::Rescan => { connect(port)?; request(port, "rescan", Some(json!({})), 90) },
        Action::AddNote | Action::DeleteNote => {
            let branch = args.branch.filter(|value| !value.is_empty() && value.len() <= 4096).ok_or("Choose a branch first.")?;
            let (endpoint, body) = match action {
                Action::AddNote => {
                    let text = args.text.unwrap_or_default();
                    if text.trim().is_empty() || text.len() > 10_000 { return Err("Enter a note of up to 10000 bytes.".into()); }
                    ("notes", json!({"branch": branch, "text": text.trim()}))
                },
                _ => ("notes/delete", json!({"branch": branch, "id": args.note_id.filter(|id| !id.is_empty()).ok_or("Choose a note first.")?})),
            };
            connect(port)?; request(port, endpoint, Some(body), 30)
        },
    }
}

#[tauri::command]
pub async fn bkrd_action(port: Option<u16>, action: Action, args: ActionArgs) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || perform(port_number(port)?, action, args))
        .await.map_err(|_| UNAVAILABLE.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn service(body: &'static str) -> (u16, std::thread::JoinHandle<String>) {
        use std::{io::Read, net::TcpListener};
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let worker = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            let mut buffer = [0; 4096];
            let count = stream.read(&mut buffer).unwrap();
            let response = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{}", body.len(), body);
            stream.write_all(response.as_bytes()).unwrap();
            String::from_utf8_lossy(&buffer[..count]).into_owned()
        });
        (port, worker)
    }
    #[test]
    fn reads_local_service_payload_without_exposing_backend_errors() {
        let (port, worker) = service(r#"{"ok":true,"branches":[],"mrAvailable":false}"#);
        let value = request(port, "branches?fresh=1", None, 5).unwrap();
        assert_eq!(value["mrAvailable"], false);
        assert!(worker.join().unwrap().starts_with("GET /api/branches?fresh=1 HTTP/1.1"));
        let (port, worker) = service(r#"{"ok":false,"error":"private backend details"}"#);
        let error = request(port, "branches", None, 5).unwrap_err();
        assert!(!error.contains("private")); worker.join().unwrap();
    }
    #[test]
    fn validates_connection_and_external_links() {
        assert!(port_number(Some(0)).is_err());
        assert_eq!(port_number(Some(1212)).unwrap(), 1212);
        assert!(checked_link("https://example.com/review/42").is_ok());
        for value in ["file:///tmp/note", "javascript:alert(1)", "https://user:secret@example.com", "zed://repo", "--help"] { assert!(checked_link(value).is_err()); }
    }
    #[test]
    fn rejects_unknown_actions_and_empty_notes_before_connecting() {
        assert!(serde_json::from_str::<Action>("\"checkout\"").is_err());
        assert!(perform(1, Action::AddNote, ActionArgs { branch: Some("feature/test".into()), text: Some(" ".into()), ..Default::default() }).is_err());
        assert!(perform(1, Action::DeleteNote, ActionArgs { branch: Some("feature/test".into()), ..Default::default() }).is_err());
    }
}
