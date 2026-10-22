//! Minimal, local data for the calendar and system-monitor extensions.
use serde::Serialize;

#[derive(Serialize)]
pub struct CalendarSource { id: String, title: String }
#[derive(Serialize)]
pub struct CalendarEvent { title: Option<String>, start: i64, end: i64, all_day: bool, calendar_id: String }
#[derive(Serialize)]
pub struct CalendarAgenda { status: String, calendars: Vec<CalendarSource>, events: Vec<CalendarEvent>, truncated: bool }
#[derive(Serialize)]
pub struct SystemStats { cpu_percent: Option<f64>, memory_percent: f64, memory_used: u64, memory_total: u64 }

#[tauri::command]
pub fn get_apple_calendar_status() -> String {
    #[cfg(target_os = "macos")] { macos::calendar_status().into() }
    #[cfg(not(target_os = "macos"))] { "unavailable".into() }
}

#[tauri::command]
pub async fn request_apple_calendar_access(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || macos::request_calendar_access(sender))
            .map_err(|_| "Could not start the Calendar permission request.".to_string())?;
        tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(std::time::Duration::from_secs(180))
            .map_err(|_| "Calendar access request did not complete. Try again.".to_string())?)
            .await.map_err(|_| "Could not request calendar access.".to_string())?
    }
    #[cfg(not(target_os = "macos"))] { let _ = app; Err("Calendar access is available on macOS.".into()) }
}

#[tauri::command]
pub async fn get_apple_calendar_agenda(days: u32, show_titles: bool) -> Result<CalendarAgenda, String> {
    #[cfg(target_os = "macos")]
    { tauri::async_runtime::spawn_blocking(move || macos::agenda(days.clamp(1, 31), show_titles)).await.map_err(|_| "Could not load the calendar agenda.".to_string())? }
    #[cfg(not(target_os = "macos"))] { let _ = (days, show_titles); Err("Calendar access is available on macOS.".into()) }
}

#[tauri::command]
pub fn open_apple_calendar() -> Result<(), String> {
    std::process::Command::new("/usr/bin/open").args(["-b", "com.apple.iCal"]).status()
        .map_err(|_| "Could not open Calendar.".to_string()).and_then(|status| if status.success() { Ok(()) } else { Err("Could not open Calendar.".into()) })
}

#[tauri::command]
pub async fn get_system_stats() -> Result<SystemStats, String> {
    #[cfg(target_os = "macos")]
    { tauri::async_runtime::spawn_blocking(macos::system_stats).await.map_err(|_| "Could not read system metrics.".to_string())? }
    #[cfg(not(target_os = "macos"))] { Err("System metrics are available on macOS.".into()) }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use cocoa::{base::{id, nil, BOOL, NO}, foundation::NSAutoreleasePool};
    use objc::{class, msg_send, sel, sel_impl};
    use std::{ffi::CStr, sync::Mutex};

    #[link(name = "EventKit", kind = "framework")]
    extern "C" {}
    extern "C" {
        fn mach_host_self() -> u32;
        fn host_statistics(host: u32, flavor: i32, info: *mut i32, count: *mut u32) -> i32;
        fn mach_port_deallocate(task: u32, name: u32) -> i32;
        static mach_task_self_: u32;
    }
    static CPU_PREVIOUS: Mutex<Option<[u32; 4]>> = Mutex::new(None);

    unsafe fn string(value: id, limit: usize) -> String {
        if value == nil { return String::new(); }
        let ptr: *const std::os::raw::c_char = msg_send![value, UTF8String];
        if ptr.is_null() { String::new() } else { CStr::from_ptr(ptr).to_string_lossy().chars().take(limit).collect() }
    }
    unsafe fn with_store<T>(f: impl FnOnce(id) -> T) -> T {
        let pool = NSAutoreleasePool::new(nil);
        let store: id = msg_send![class!(EKEventStore), new];
        let result = f(store);
        let _: () = msg_send![store, release];
        let _: () = msg_send![pool, drain];
        result
    }
    pub fn calendar_status() -> &'static str {
        let status: i64 = unsafe { msg_send![class!(EKEventStore), authorizationStatusForEntityType: 0i64] };
        calendar_status_name(status)
    }
    fn calendar_status_name(status: i64) -> &'static str {
        match status { 0 => "not-determined", 1 => "restricted", 2 => "denied", 3 => "authorized", 4 => "write-only", _ => "unavailable" }
    }
    unsafe fn calendar_access_result(granted: BOOL, error: id) -> Result<String, String> {
        if error != nil {
            let description: id = msg_send![error, localizedDescription];
            let domain: id = msg_send![error, domain];
            let code: i64 = msg_send![error, code];
            Err(format!("Calendar access: {} ({} {code}).", string(description, 500), string(domain, 100)))
        } else if granted != NO { Ok("authorized".to_string()) }
        else if calendar_status() == "not-determined" { Err("macOS did not complete the Calendar permission request. Try again.".into()) }
        else { Ok(calendar_status().into()) }
    }
    pub fn request_calendar_access(sender: std::sync::mpsc::Sender<Result<String, String>>) {
        let current = calendar_status();
        if current == "denied" || current == "restricted" {
            let _ = std::process::Command::new("/usr/bin/open").arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars").status();
            let _ = sender.send(Ok(current.into()));
            return;
        }
        if current == "authorized" { let _ = sender.send(Ok(current.into())); return; }
        unsafe {
            // Start the consent UI on AppKit's main thread. Keep the store alive
            // in the copied completion block until EventKit finishes the request.
            struct RequestStore(id);
            impl Drop for RequestStore {
                fn drop(&mut self) { unsafe { let _: () = msg_send![self.0, release]; } }
            }
            let pool = NSAutoreleasePool::new(nil);
            let store: id = msg_send![class!(EKEventStore), new];
            let retained_store = RequestStore(store);
            let completion = block::ConcreteBlock::new(move |granted: BOOL, error: id| {
                let _keep_alive = &retained_store;
                let _ = sender.send(calendar_access_result(granted, error));
            }).copy();
            let modern: BOOL = msg_send![store, respondsToSelector: sel!(requestFullAccessToEventsWithCompletion:)];
            if modern != NO { let _: () = msg_send![store, requestFullAccessToEventsWithCompletion: &*completion]; }
            else { let _: () = msg_send![store, requestAccessToEntityType: 0i64 completion: &*completion]; }
            let _: () = msg_send![pool, drain];
        }
    }
    pub fn agenda(days: u32, show_titles: bool) -> Result<CalendarAgenda, String> {
        let status = calendar_status().to_string();
        let mut result = CalendarAgenda { status, calendars: vec![], events: vec![], truncated: false };
        if result.status != "authorized" { return Ok(result); }
        unsafe { with_store(|store| {
            let calendars: id = msg_send![store, calendarsForEntityType: 0i64];
            let count: usize = msg_send![calendars, count];
            for index in 0..count.min(256) {
                let source: id = msg_send![calendars, objectAtIndex: index];
                let identifier: id = msg_send![source, calendarIdentifier];
                let title: id = msg_send![source, title];
                result.calendars.push(CalendarSource { id: string(identifier, 256), title: string(title, 120) });
            }
            let now = chrono::Local::now();
            let start = now.date_naive().and_hms_opt(0, 0, 0).unwrap().and_local_timezone(chrono::Local).earliest().unwrap_or(now);
            let end = start.checked_add_days(chrono::Days::new(days as u64)).unwrap_or(start + chrono::Duration::days(days as i64));
            let from: id = msg_send![class!(NSDate), dateWithTimeIntervalSince1970: start.timestamp() as f64];
            let to: id = msg_send![class!(NSDate), dateWithTimeIntervalSince1970: end.timestamp() as f64];
            let predicate: id = msg_send![store, predicateForEventsWithStartDate: from endDate: to calendars: nil];
            let events: id = msg_send![store, eventsMatchingPredicate: predicate];
            let count: usize = msg_send![events, count];
            // No notes, attendees, locations, URLs, or account identifiers are read.
            for index in 0..count {
                let event: id = msg_send![events, objectAtIndex: index];
                let start_date: id = msg_send![event, startDate];
                let end_date: id = msg_send![event, endDate];
                let start_seconds: f64 = msg_send![start_date, timeIntervalSince1970];
                let end_seconds: f64 = msg_send![end_date, timeIntervalSince1970];
                let all_day: BOOL = msg_send![event, isAllDay];
                if all_day == NO && end_seconds <= now.timestamp() as f64 { continue; }
                let calendar: id = msg_send![event, calendar];
                let identifier: id = msg_send![calendar, calendarIdentifier];
                let title = if show_titles { let title: id = msg_send![event, title]; Some(string(title, 500)) } else { None };
                result.events.push(CalendarEvent { title, start: (start_seconds * 1000.0) as i64, end: (end_seconds * 1000.0) as i64, all_day: all_day != NO, calendar_id: string(identifier, 256) });
            }
            result.events.sort_by_key(|event| event.start);
            result.truncated = result.events.len() > 200;
            result.events.truncate(200);
            result.calendars.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
            Ok(result)
        }) }
    }

    pub fn system_stats() -> Result<SystemStats, String> {
        let mut ticks = [0u32; 4];
        let mut count = 4u32;
        unsafe {
            let host = mach_host_self();
            let status = host_statistics(host, 3, ticks.as_mut_ptr() as *mut i32, &mut count);
            mach_port_deallocate(mach_task_self_, host);
            if status != 0 || count != 4 { return Err("Could not read CPU usage.".into()); }
        }
        let mut previous = CPU_PREVIOUS.lock().map_err(|_| "Could not read CPU usage.")?;
        let cpu_percent = previous.map(|last| cpu_usage(last, ticks));
        *previous = Some(ticks);
        drop(previous);
        let total = std::process::Command::new("/usr/sbin/sysctl").args(["-n", "hw.memsize"]).output().map_err(|_| "Could not read memory usage.")?;
        let total: u64 = String::from_utf8_lossy(&total.stdout).trim().parse().map_err(|_| "Could not read memory usage.")?;
        let memory = std::process::Command::new("/usr/bin/vm_stat").output().map_err(|_| "Could not read memory usage.")?;
        let used = memory_used(&String::from_utf8_lossy(&memory.stdout)).ok_or("Could not read memory usage.")?.min(total);
        Ok(SystemStats { cpu_percent, memory_percent: if total > 0 { used as f64 / total as f64 * 100.0 } else { 0.0 }, memory_used: used, memory_total: total })
    }
    fn cpu_usage(previous: [u32; 4], current: [u32; 4]) -> f64 {
        let delta = std::array::from_fn::<_, 4, _>(|i| current[i].wrapping_sub(previous[i]) as u64);
        let total: u64 = delta.iter().sum();
        if total == 0 { 0.0 } else { ((total - delta[2]) as f64 / total as f64 * 100.0).clamp(0.0, 100.0) }
    }
    fn memory_used(output: &str) -> Option<u64> {
        let page_size: u64 = output.lines().next()?.split_whitespace().find_map(|part| part.parse().ok())?;
        let pages = ["Pages active", "Pages wired down", "Pages occupied by compressor"].iter().map(|name| {
            output.lines().find_map(|line| line.strip_prefix(&format!("{name}:")))?.trim().trim_end_matches('.').parse::<u64>().ok()
        }).collect::<Option<Vec<_>>>()?;
        pages.iter().sum::<u64>().checked_mul(page_size)
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        #[test] fn calendar_status_does_not_request_access() {
            assert!(["not-determined", "restricted", "denied", "authorized", "write-only", "unavailable"].contains(&calendar_status()));
        }
        #[test] fn calendar_authorization_states_and_native_errors_are_preserved() {
            assert_eq!((0..=5).map(calendar_status_name).collect::<Vec<_>>(), vec!["not-determined", "restricted", "denied", "authorized", "write-only", "unavailable"]);
            unsafe {
                with_store(|_| {
                    use cocoa::foundation::NSString;
                    let domain = NSString::alloc(nil).init_str("EKErrorDomain");
                    let error: id = msg_send![class!(NSError), errorWithDomain: domain code: 29i64 userInfo: nil];
                    assert!(calendar_access_result(NO, error).unwrap_err().contains("EKErrorDomain 29"));
                    assert_eq!(calendar_access_result(cocoa::base::YES, nil).unwrap(), "authorized");
                    let _: () = msg_send![domain, release];
                });
            }
        }
        #[test] fn cpu_and_memory_metrics_are_bounded() {
            assert_eq!(cpu_usage([10, 10, 10, 0], [20, 20, 40, 0]), 40.0);
            assert_eq!(cpu_usage([0;4], [0;4]), 0.0);
            assert_eq!(cpu_usage([u32::MAX,0,0,0], [9,0,10,0]), 50.0);
            assert_eq!(memory_used("Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages active: 10.\nPages wired down: 20.\nPages occupied by compressor: 5."), Some(35 * 16384));
            assert_eq!(memory_used("invalid"), None);
        }
    }
}
