//! Wi-Fi interface counters are local. Test traffic runs only on explicit request.
use serde::Serialize;
use std::{sync::{atomic::{AtomicBool, Ordering}, Mutex}, time::Instant};

#[derive(Clone, Debug, Default, Serialize)]
pub struct WifiStatus {
    interface: Option<String>,
    ssid: Option<String>,
    ipv4: Option<String>,
    ipv6: Option<String>,
    connected: bool,
    signal_dbm: Option<i64>,
    noise_dbm: Option<i64>,
    link_mbps: Option<f64>,
    download_bps: Option<f64>,
    upload_bps: Option<f64>,
    speed_test: Option<SpeedTest>,
    testing: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct SpeedTest {
    download_mbps: Option<f64>,
    upload_mbps: Option<f64>,
    taken_at: i64,
}

struct Sample { at: Instant, identity: (Option<String>, Option<String>, Option<String>, Option<String>, bool), rx: u64, tx: u64, status: WifiStatus }
static PREVIOUS: Mutex<Option<Sample>> = Mutex::new(None);
static LAST_TEST: Mutex<Option<SpeedTest>> = Mutex::new(None);
static TESTING: AtomicBool = AtomicBool::new(false);

fn rate(previous: u64, current: u64, seconds: f64) -> Option<f64> {
    if seconds <= 0.0 || seconds > 60.0 { return None; }
    // A reset/wrap is a new baseline, never a negative rate or a giant spike.
    current.checked_sub(previous).map(|bytes| bytes as f64 / seconds)
}

#[tauri::command]
pub async fn get_wifi_status() -> Result<WifiStatus, String> {
    tauri::async_runtime::spawn_blocking(snapshot).await.map_err(|_| "Could not read Wi-Fi status.".to_string())?
}

fn snapshot() -> Result<WifiStatus, String> {
    let mut previous = PREVIOUS.lock().map_err(|_| "Could not read Wi-Fi status.".to_string())?;
    let test = LAST_TEST.lock().map_err(|_| "Could not read Wi-Fi status.".to_string())?.clone();
    if let Some(sample) = previous.as_ref() {
        // Bar and details windows share a baseline instead of competing over it.
        if sample.at.elapsed().as_millis() < 250 {
            let mut status = sample.status.clone(); status.speed_test = test; status.testing = TESTING.load(Ordering::SeqCst); return Ok(status);
        }
    }
    let (mut status, rx, tx) = platform::read()?;
    let at = Instant::now();
    let identity = (status.interface.clone(), status.ssid.clone(), status.ipv4.clone(), status.ipv6.clone(), status.connected);
    if status.connected {
        if let Some(old) = previous.as_ref().filter(|old| old.identity == identity) {
            let seconds = at.duration_since(old.at).as_secs_f64();
            status.download_bps = rate(old.rx, rx, seconds);
            status.upload_bps = rate(old.tx, tx, seconds);
        }
    }
    status.speed_test = test;
    status.testing = TESTING.load(Ordering::SeqCst);
    *previous = Some(Sample { at, identity, rx, tx, status: status.clone() });
    Ok(status)
}

#[tauri::command]
pub async fn test_wifi_speed() -> Result<SpeedTest, String> {
    if TESTING.swap(true, Ordering::SeqCst) { return Err("A speed test is already running.".into()); }
    tauri::async_runtime::spawn_blocking(|| {
        struct Reset; impl Drop for Reset { fn drop(&mut self) { TESTING.store(false, Ordering::SeqCst); } }
        let _reset = Reset;
        let result = SpeedTest { download_mbps: transfer(false), upload_mbps: transfer(true), taken_at: chrono::Utc::now().timestamp_millis() };
        if result.download_mbps.is_none() && result.upload_mbps.is_none() { return Err("Speed test failed. Check your connection and try again.".into()); }
        *LAST_TEST.lock().map_err(|_| "Could not save speed test result.".to_string())? = Some(result.clone());
        Ok(result)
    }).await.map_err(|_| "Speed test did not complete.".to_string())?
}

fn transfer(upload: bool) -> Option<f64> {
    use std::{io::Write, process::{Command, Stdio}};
    let mut command = Command::new("curl");
    command.args(["--disable", "--silent", "--show-error", "--fail", "--connect-timeout", "5", "--max-time", "20", "--output", "/dev/null"])
        .stdout(Stdio::piped()).stderr(Stdio::null());
    if upload {
        command.args(["--request", "POST", "--header", "Content-Type: application/octet-stream", "--data-binary", "@-", "--write-out", "%{speed_upload}", "https://speed.cloudflare.com/__up"])
            .stdin(Stdio::piped());
    } else {
        command.args(["--write-out", "%{speed_download}", "https://speed.cloudflare.com/__down?bytes=10000000"]);
    }
    let mut child = command.spawn().ok()?;
    if upload {
        // Synthetic payload only. No files, status data, SSID, or IP are uploaded.
        let wrote = child.stdin.take().map(|mut stdin| stdin.write_all(&vec![0u8; 2_000_000]).is_ok()).unwrap_or(false);
        if !wrote { let _ = child.kill(); let _ = child.wait(); return None; }
    }
    let output = child.wait_with_output().ok()?;
    if !output.status.success() { return None; }
    let bytes_per_second: f64 = std::str::from_utf8(&output.stdout).ok()?.trim().parse().ok()?;
    if bytes_per_second.is_finite() && bytes_per_second > 0.0 { Some(bytes_per_second * 8.0 / 1_000_000.0) } else { None }
}

#[tauri::command]
pub fn open_wifi_status_app() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        return std::process::Command::new("gnome-control-center")
            .arg("wifi")
            .spawn()
            .map(|_| ())
            .or_else(|_| {
                std::process::Command::new("xdg-open")
                    .arg("gnome-control-center://network")
                    .spawn()
                    .map(|_| ())
            })
            .map_err(|_| "Could not open network settings.".to_string());
    }
    #[allow(unreachable_code)]
    std::process::Command::new("/usr/bin/open").args(["-b", "com.joseviscasillas.WifiStatusApp"]).status()
        .map_err(|_| "Could not open WiFiStatusApp.".to_string())
        .and_then(|status| if status.success() { Ok(()) } else { Err("WiFiStatusApp is not installed.".into()) })
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use cocoa::{base::{id, nil}, foundation::NSAutoreleasePool};
    use objc::{class, msg_send, sel, sel_impl};
    use std::ffi::CStr;
    #[link(name = "CoreWLAN", kind = "framework")]
    extern "C" {}

    unsafe fn string(value: id) -> Option<String> {
        if value == nil { return None; }
        let ptr: *const std::os::raw::c_char = msg_send![value, UTF8String];
        if ptr.is_null() { return None; }
        let text = CStr::from_ptr(ptr).to_string_lossy().chars().take(256).collect::<String>();
        if text.is_empty() { None } else { Some(text) }
    }

    pub fn read() -> Result<(WifiStatus, u64, u64), String> { unsafe {
        let pool = NSAutoreleasePool::new(nil);
        let result = read_inner();
        let _: () = msg_send![pool, drain];
        result
    } }

    unsafe fn read_inner() -> Result<(WifiStatus, u64, u64), String> {
        let client: id = msg_send![class!(CWWiFiClient), sharedWiFiClient];
        let interface: id = msg_send![client, interface];
        let mut result = WifiStatus::default();
        if interface == nil { return Ok((result, 0, 0)); }
        result.interface = string(msg_send![interface, interfaceName]);
        result.ssid = string(msg_send![interface, ssid]);
        let signal: i64 = msg_send![interface, rssiValue];
        let noise: i64 = msg_send![interface, noiseMeasurement];
        let link: f64 = msg_send![interface, transmitRate];
        let mut addresses = std::ptr::null_mut();
        if libc::getifaddrs(&mut addresses) != 0 { return Err("Could not read Wi-Fi interfaces.".into()); }
        struct Addresses(*mut libc::ifaddrs); impl Drop for Addresses { fn drop(&mut self) { unsafe { libc::freeifaddrs(self.0); } } }
        let _addresses = Addresses(addresses);
        let (mut rx, mut tx) = (0, 0);
        let mut cursor = addresses;
        while !cursor.is_null() {
            let item = &*cursor; cursor = item.ifa_next;
            if item.ifa_name.is_null() || item.ifa_addr.is_null() { continue; }
            if result.interface.as_deref() != Some(CStr::from_ptr(item.ifa_name).to_string_lossy().as_ref()) { continue; }
            let family = (*item.ifa_addr).sa_family as i32;
            if family == libc::AF_LINK && !item.ifa_data.is_null() {
                let data = &*(item.ifa_data as *const libc::if_data);
                rx = data.ifi_ibytes as u64; tx = data.ifi_obytes as u64;
            } else if family == libc::AF_INET || family == libc::AF_INET6 {
                let mut host = [0i8; 1025];
                if libc::getnameinfo(item.ifa_addr, (*item.ifa_addr).sa_len as u32, host.as_mut_ptr(), host.len() as u32, std::ptr::null_mut(), 0, libc::NI_NUMERICHOST) == 0 {
                    let address = CStr::from_ptr(host.as_ptr()).to_string_lossy().into_owned();
                    if family == libc::AF_INET { result.ipv4 = Some(address); }
                    else if result.ipv6.is_none() || !address.starts_with("fe80:") { result.ipv6 = Some(address); }
                }
            }
        }
        // RSSI/link rate can remain cached after disconnect; IP plus association
        // metrics distinguish a connected interface even when macOS redacts SSID.
        result.connected = (result.ipv4.is_some() || result.ipv6.is_some()) && signal < 0 && link > 0.0;
        if result.connected {
            result.signal_dbm = (signal < 0).then_some(signal);
            result.noise_dbm = (noise < 0).then_some(noise);
            result.link_mbps = (link.is_finite() && link > 0.0).then_some(link);
        }
        Ok((result, rx, tx))
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
mod platform {
    use super::*;
    pub fn read() -> Result<(WifiStatus, u64, u64), String> { Err("Wi-Fi status is not available on this platform.".into()) }
}

/// Wi-Fi state from NetworkManager plus the kernel's own signal figures.
/// nmcli reports signal as a 0-100 quality percentage, so the dBm and noise
/// values come from /proc/net/wireless, which is where they originate.
#[cfg(target_os = "linux")]
mod platform {
    use super::*;
    use std::process::Command;

    fn nmcli(args: &[&str]) -> Option<String> {
        let out = Command::new("nmcli").args(args).env("LC_ALL", "C").output().ok()?;
        out.status
            .success()
            .then(|| String::from_utf8_lossy(&out.stdout).to_string())
    }

    /// nmcli -t escapes literal colons inside values as "\:".
    fn split_terse(line: &str) -> Vec<String> {
        let mut fields = Vec::new();
        let mut current = String::new();
        let mut chars = line.chars().peekable();
        while let Some(c) = chars.next() {
            match c {
                '\\' => {
                    if let Some(next) = chars.next() {
                        current.push(next);
                    }
                }
                ':' => fields.push(std::mem::take(&mut current)),
                _ => current.push(c),
            }
        }
        fields.push(current);
        fields
    }

    fn wifi_device() -> Option<(String, bool)> {
        let out = nmcli(&["-t", "-f", "DEVICE,TYPE,STATE", "device"])?;
        let mut first_wifi = None;
        for line in out.lines() {
            let f = split_terse(line);
            if f.len() >= 3 && f[1] == "wifi" {
                if f[2] == "connected" {
                    return Some((f[0].clone(), true));
                }
                if first_wifi.is_none() {
                    first_wifi = Some((f[0].clone(), false));
                }
            }
        }
        first_wifi
    }

    /// level and noise in dBm for an interface, from /proc/net/wireless.
    fn radio(interface: &str) -> (Option<i64>, Option<i64>) {
        let Ok(text) = std::fs::read_to_string("/proc/net/wireless") else {
            return (None, None);
        };
        for line in text.lines() {
            let Some((iface, rest)) = line.split_once(':') else { continue };
            if iface.trim() != interface {
                continue;
            }
            let values: Vec<&str> = rest.split_whitespace().collect();
            let parse = |raw: Option<&&str>| -> Option<i64> {
                let cleaned = raw?.trim_end_matches('.');
                cleaned.parse::<f64>().ok().map(|v| v as i64)
            };
            let level = parse(values.get(2));
            let noise = parse(values.get(3)).filter(|n| *n > -200);
            return (level, noise);
        }
        (None, None)
    }

    fn active_network(interface: &str) -> (Option<String>, Option<f64>) {
        let Some(out) = nmcli(&["-t", "-f", "ACTIVE,SSID,RATE", "device", "wifi", "list", "ifname", interface]) else {
            return (None, None);
        };
        for line in out.lines() {
            let f = split_terse(line);
            if f.first().map(|a| a == "yes").unwrap_or(false) && f.len() >= 3 {
                let ssid = Some(f[1].clone()).filter(|s| !s.is_empty());
                let rate = f[2]
                    .split_whitespace()
                    .next()
                    .and_then(|n| n.parse::<f64>().ok());
                return (ssid, rate);
            }
        }
        (None, None)
    }

    fn addresses(interface: &str) -> (Option<String>, Option<String>) {
        let Some(out) = nmcli(&["-t", "-f", "IP4.ADDRESS,IP6.ADDRESS", "device", "show", interface]) else {
            return (None, None);
        };
        let mut v4 = None;
        let mut v6 = None;
        for line in out.lines() {
            let Some((key, value)) = line.split_once(':') else { continue };
            let address = value.split('/').next().unwrap_or("").trim().to_string();
            if address.is_empty() {
                continue;
            }
            if key.starts_with("IP4.ADDRESS") && v4.is_none() {
                v4 = Some(address);
            } else if key.starts_with("IP6.ADDRESS") && v6.is_none() {
                v6 = Some(address);
            }
        }
        (v4, v6)
    }

    fn counter(interface: &str, name: &str) -> u64 {
        std::fs::read_to_string(format!("/sys/class/net/{interface}/statistics/{name}"))
            .ok()
            .and_then(|v| v.trim().parse().ok())
            .unwrap_or(0)
    }

    pub fn read() -> Result<(WifiStatus, u64, u64), String> {
        let (interface, connected) =
            wifi_device().ok_or_else(|| "No Wi-Fi interface found.".to_string())?;
        let (ssid, link_mbps) = if connected {
            active_network(&interface)
        } else {
            (None, None)
        };
        let (signal_dbm, noise_dbm) = radio(&interface);
        let (ipv4, ipv6) = if connected {
            addresses(&interface)
        } else {
            (None, None)
        };

        let status = WifiStatus {
            interface: Some(interface.clone()),
            ssid,
            ipv4,
            ipv6,
            connected,
            signal_dbm,
            noise_dbm,
            link_mbps,
            download_bps: None,
            upload_bps: None,
            speed_test: None,
            testing: false,
        };
        Ok((status, counter(&interface, "rx_bytes"), counter(&interface, "tx_bytes")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rates_handle_idle_resets_and_long_gaps() {
        assert_eq!(rate(100, 2100, 2.0), Some(1000.0));
        assert_eq!(rate(100, 100, 1.0), Some(0.0));
        assert_eq!(rate(u32::MAX as u64, 1, 1.0), None);
        assert_eq!(rate(0, 100, 0.0), None);
        assert_eq!(rate(0, 100, 61.0), None);
    }
    #[test]
    #[cfg(target_os = "macos")]
    fn local_wifi_snapshot_serializes_without_starting_a_test() {
        let status = snapshot().expect("macOS interfaces");
        let json = serde_json::to_value(status).unwrap();
        assert!(json["connected"].is_boolean());
        assert!(json["speed_test"].is_null());
        assert!(!TESTING.load(Ordering::SeqCst));
    }
}
