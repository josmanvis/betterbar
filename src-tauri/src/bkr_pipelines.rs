//! Read-only monitoring of the latest BKR branch and tag pipelines.
use crate::gitlab::{checked_host, executable, run};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const PROJECT: &str = "on24/videoservices/conf_client_opentok_react";
const ENCODED_PROJECT: &str = "on24%2Fvideoservices%2Fconf_client_opentok_react";
const ERROR: &str = "Could not check BKR pipelines. Check your connection and glab login.";

#[derive(Deserialize)]
struct ApiPipeline {
    id: u64,
    #[serde(rename = "ref")]
    reference: String,
    status: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Failure {
    id: u64,
    reference: String,
    kind: String,
    updated_at: String,
    url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    failed: Vec<Failure>,
    url: String,
    checked_at: String,
}

fn parse_page(response: &str) -> Result<(Vec<ApiPipeline>, bool), String> {
    let (headers, body) = response.split_once("\r\n\r\n")
        .or_else(|| response.split_once("\n\n")).ok_or(ERROR)?;
    if !headers.lines().next().is_some_and(|line| line.starts_with("HTTP/") && line.split_whitespace().nth(1) == Some("200")) {
        return Err(ERROR.into());
    }
    let rows: Vec<ApiPipeline> = serde_json::from_str(body).map_err(|_| ERROR)?;
    let next = headers.lines().find_map(|line| line.split_once(':')
        .filter(|(key, _)| key.eq_ignore_ascii_case("x-next-page"))
        .map(|(_, value)| !value.trim().is_empty()));
    // Without pagination headers, request another page when this one is full.
    let more = next.unwrap_or(rows.len() == 100);
    Ok((rows, more))
}

fn load(host: String, days: u16) -> Result<Snapshot, String> {
    if ![0, 1, 7, 30, 90].contains(&days) { return Err(ERROR.into()); }
    let binary = executable()?;
    let host = if host.trim().is_empty() {
        checked_host(run(&binary, &["config", "get", "host"])?.trim())?
    } else { checked_host(&host)? };
    let base = format!("https://{host}/{PROJECT}/-/pipelines");
    let mut failed = Vec::new();
    let mut seen = HashSet::new();
    let cutoff = if days == 0 { String::new() } else {
        // Apply the date filter to the latest pipeline, rather than selecting
        // an older failure after a successful replacement. GitLab's latest
        // branch/tag scopes are evaluated before status/date filters.
        format!("&updated_after={}", (chrono::Utc::now() - chrono::Duration::days(days.into())).to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
    };
    for (scope, kind) in [("branches", "branch"), ("tags", "tag")] {
        for number in 1..=200 {
            let endpoint = format!("projects/{ENCODED_PROJECT}/pipelines?scope={scope}&status=failed&order_by=id&sort=desc&per_page=100&page={number}{cutoff}");
            let response = run(&binary, &["api", &endpoint, "--hostname", &host, "--include"])?;
            let (rows, more) = parse_page(&response)?;
            for row in rows {
                if row.id == 0 || row.reference.is_empty() || row.status != "failed"
                    || chrono::DateTime::parse_from_rfc3339(&row.updated_at).is_err() { return Err(ERROR.into()); }
                if seen.insert(row.id) {
                    failed.push(Failure { id: row.id, reference: row.reference, kind: kind.into(), updated_at: row.updated_at, url: format!("{base}/{}", row.id) });
                }
            }
            if !more { break; }
            if number == 200 { return Err(ERROR.into()); }
        }
    }
    failed.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(Snapshot { failed, url: format!("{base}?scope=branches&status=failed"), checked_at: chrono::Utc::now().to_rfc3339() })
}

#[tauri::command]
pub async fn get_bkr_pipeline_status(host: String, days: u16) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || load(host, days)).await.map_err(|_| ERROR.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pagination_is_complete_and_errors_cannot_look_healthy() {
        let row = r#"{"id":12,"ref":"qa","status":"failed","updated_at":"2026-10-21T12:00:00Z"}"#;
        let response = format!("HTTP/2.0 200 OK\r\nX-Next-Page: 2\r\n\r\n[{row}]");
        let (rows, more) = parse_page(&response).unwrap();
        assert!(more);
        assert_eq!(rows[0].id, 12);
        assert_eq!(rows[0].reference, "qa");
        assert!(!parse_page("HTTP/2.0 200 OK\nX-Next-Page: \n\n[]").unwrap().1);
        let full = format!("HTTP/2.0 200 OK\n\n[{}]", vec![row; 100].join(","));
        assert!(parse_page(&full).unwrap().1);
        for response in ["HTTP/2.0 401 Unauthorized\n\n[]", "HTTP/2.0 200 OK\n\n{}", "[]", "HTTP/2.0 200 OK\n\n[{\"id\":1}]"] {
            assert!(parse_page(response).is_err());
        }
    }

    #[test]
    #[ignore = "Uses the local user's authenticated GitLab account, read-only"]
    fn live_authenticated_bkr_pipelines() {
        for days in [0, 1] {
            let snapshot = load(String::new(), days).unwrap();
            println!("BKR failures (days={days}): {}", snapshot.failed.len());
            assert!(snapshot.failed.iter().all(|row| row.url.contains(PROJECT)));
        }
    }
}
