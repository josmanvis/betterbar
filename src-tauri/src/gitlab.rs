//! Read-only GitLab counts through the user's authenticated glab CLI.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{io::Read, path::PathBuf, process::{Command, Stdio}, time::{Duration, Instant}};

const ERROR: &str = "Could not read GitLab. Check glab authentication and your GitLab host.";
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Scope { Authored, Assigned, Review }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Count { count: u64, url: String, checked_at: String }

pub(super) fn executable() -> Result<PathBuf, String> {
    let mut paths = vec![PathBuf::from("/opt/homebrew/bin"), "/usr/local/bin".into(), "/usr/bin".into()];
    if let Some(home) = dirs::home_dir() { paths.push(home.join(".local/bin")); paths.push(home.join("bin")); }
    if let Some(path) = std::env::var_os("PATH") { paths.extend(std::env::split_paths(&path)); }
    paths.into_iter().map(|path| path.join("glab")).find(|path| path.is_file())
        .ok_or_else(|| "Install and authenticate the glab CLI to show GitLab counts.".into())
}

pub(super) fn run(binary: &PathBuf, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new(binary);
    command.args(args).env("NO_COLOR", "1").env("GLAB_CHECK_UPDATE", "false")
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    if let Some(home) = dirs::home_dir() { command.current_dir(home); }
    let mut child = command.spawn().map_err(|_| ERROR.to_string())?;
    let stdout = child.stdout.take().ok_or(ERROR)?;
    // Drain concurrently so a full stdout pipe cannot deadlock the timeout.
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout.take(4 * 1024 * 1024 + 1).read_to_end(&mut bytes).map(|_| bytes)
    });
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) if start.elapsed() < Duration::from_secs(20) => std::thread::sleep(Duration::from_millis(50)),
            _ => { let _ = child.kill(); let _ = child.wait(); break Err(ERROR.to_string()); }
        }
    };
    let bytes = reader.join().map_err(|_| ERROR)?.map_err(|_| ERROR)?;
    if !status?.success() || bytes.len() > 4 * 1024 * 1024 { return Err(ERROR.into()); }
    String::from_utf8(bytes).map_err(|_| ERROR.into())
}

pub(super) fn checked_host(input: &str) -> Result<String, String> {
    let host = input.trim();
    let url = tauri::Url::parse(&format!("https://{host}")).map_err(|_| "Enter a GitLab hostname, without a URL path.".to_string())?;
    if host.is_empty() || host.contains(['/', '?', '#', '@', '\\']) || host.chars().any(char::is_whitespace)
        || url.host_str().is_none_or(|name| name.split('.').any(|part| part.is_empty() || part.starts_with('-') || part.ends_with('-'))) || !url.username().is_empty() || url.password().is_some() {
        return Err("Enter a GitLab hostname, without a URL path.".into());
    }
    Ok(host.to_string())
}

// HTTP headers are not guaranteed on every GitLab installation. Missing totals
// fall back to counting pages, rather than presenting the first page as a total.
fn page(response: &str) -> Result<(Option<u64>, bool, usize), String> {
    let (headers, body) = response.split_once("\r\n\r\n").or_else(|| response.split_once("\n\n")).ok_or(ERROR)?;
    if !headers.lines().next().is_some_and(|line| line.starts_with("HTTP/") && line.split_whitespace().nth(1) == Some("200")) { return Err(ERROR.into()); }
    let mut total = None;
    let mut next = false;
    for line in headers.lines() {
        if let Some((key, value)) = line.split_once(':') {
            if key.eq_ignore_ascii_case("x-total") { total = Some(value.trim().parse::<u64>().map_err(|_| ERROR)?); }
            if key.eq_ignore_ascii_case("x-next-page") { next = !value.trim().is_empty(); }
        }
    }
    let rows: Vec<Value> = serde_json::from_str(body).map_err(|_| ERROR)?;
    Ok((total, next, rows.len()))
}

fn load(host: String, scope: Scope) -> Result<Count, String> {
    let binary = executable()?;
    let host = if host.trim().is_empty() { checked_host(run(&binary, &["config", "get", "host"])?.trim())? } else { checked_host(&host)? };
    let user: Value = serde_json::from_str(&run(&binary, &["api", "user", "--hostname", &host])?).map_err(|_| ERROR)?;
    let id = user["id"].as_u64().ok_or(ERROR)?;
    let username = user["username"].as_str().filter(|name| !name.is_empty()).ok_or(ERROR)?;
    let (filter, web_filter) = match scope {
        Scope::Authored => (format!("scope=created_by_me"), "author_username"),
        Scope::Assigned => (format!("scope=all&assignee_id={id}"), "assignee_username"),
        Scope::Review => (format!("scope=all&reviewer_id={id}"), "reviewer_username"),
    };
    let mut count = 0;
    for number in 1..=200 {
        let endpoint = format!("merge_requests?state=opened&{filter}&per_page=100&page={number}&view=simple");
        let response = run(&binary, &["api", &endpoint, "--hostname", &host, "--include"])?;
        let (total, next, length) = page(&response)?;
        count += length as u64;
        if let Some(total) = total { count = total; break; }
        if !next && length < 100 { break; }
        if number == 200 { return Err(ERROR.into()); }
    }
    let mut url = tauri::Url::parse(&format!("https://{host}/dashboard/merge_requests")).map_err(|_| ERROR)?;
    url.query_pairs_mut().append_pair("scope", "all").append_pair("state", "opened").append_pair(web_filter, username);
    Ok(Count { count, url: url.to_string(), checked_at: chrono::Utc::now().to_rfc3339() })
}

#[tauri::command]
pub async fn get_gitlab_mr_count(host: String, scope: Scope) -> Result<Count, String> {
    tauri::async_runtime::spawn_blocking(move || load(host, scope)).await.map_err(|_| ERROR.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_hosts_and_parses_counts_without_first_page_truncation() {
        assert!(checked_host("gitlab.com:443").is_ok());
        for host in ["", "https://example.com", "example.com/path", "user:secret@example.com", "--help", "a b", "example.com?token=x"] { assert!(checked_host(host).is_err(), "{host}"); }
        assert_eq!(page("HTTP/2.0 200 OK\r\nX-Total: 213\r\n\r\n[]").unwrap(), (Some(213), false, 0));
        assert_eq!(page("HTTP/2.0 200 OK\nX-Next-Page: 2\n\n[{},{}]").unwrap(), (None, true, 2));
        assert_eq!(page("HTTP/2.0 200 OK\nX-Next-Page: \n\n[]").unwrap(), (None, false, 0));
        assert!(page("HTTP/2.0 401 Unauthorized\n\n[]").is_err());
        assert!(page("HTTP/2.0 200 OK\n\n{\"message\":\"private\"}").is_err());
    }
    #[test]
    #[ignore = "Uses the local user's authenticated GitLab account, read-only"]
    fn live_authenticated_count() {
        for scope in [Scope::Authored, Scope::Assigned, Scope::Review] {
            let result = load(String::new(), scope).unwrap();
            println!("Authenticated GitLab MR count: {}", result.count);
            assert!(result.url.starts_with("https://"));
        }
    }
}
