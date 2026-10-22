//! Local bundle repair. Never changes TCC grants or replaces a certificate signature.
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Manager, Runtime};

const IDENTIFIER: &str = "com.betterbar.app";
static REPAIRING: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureStatus {
    valid: bool,
    identifier: Option<String>,
    kind: String,
    repair_available: bool,
    reason: Option<String>,
    last_result: Option<String>,
    log_path: String,
}

fn run(program: &str, args: &[&std::ffi::OsStr]) -> Result<std::process::Output, String> {
    Command::new(program)
        .args(args)
        .env("LC_ALL", "C")
        .output()
        .map_err(|e| e.to_string())
}

fn checked(program: &str, args: &[&std::ffi::OsStr]) -> Result<(), String> {
    let output = run(program, args)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn bundle_for_executable(executable: &Path) -> Result<PathBuf, String> {
    let macos = executable
        .parent()
        .ok_or("Cannot locate the application bundle.")?;
    let contents = macos
        .parent()
        .ok_or("Cannot locate the application bundle.")?;
    let bundle = contents
        .parent()
        .ok_or("Cannot locate the application bundle.")?;
    if macos.file_name() != Some("MacOS".as_ref())
        || contents.file_name() != Some("Contents".as_ref())
        || bundle.extension() != Some("app".as_ref())
    {
        return Err(
            "Repair is available in the installed BetterBar.app, not the development server."
                .into(),
        );
    }
    let plist = contents.join("Info.plist");
    let output = run(
        "/usr/libexec/PlistBuddy",
        &[
            "-c".as_ref(),
            "Print :CFBundleIdentifier".as_ref(),
            plist.as_os_str(),
        ],
    )?;
    if !output.status.success() || String::from_utf8_lossy(&output.stdout).trim() != IDENTIFIER {
        return Err("The running bundle is not com.betterbar.app.".into());
    }
    Ok(bundle.to_path_buf())
}

fn own_bundle() -> Result<PathBuf, String> {
    bundle_for_executable(
        &std::env::current_exe()
            .map_err(|e| e.to_string())?
            .canonicalize()
            .map_err(|e| e.to_string())?,
    )
}

fn signing_details(bundle: &Path) -> Result<(String, Option<String>), String> {
    let output = run(
        "/usr/bin/codesign",
        &[
            "--display".as_ref(),
            "--verbose=4".as_ref(),
            bundle.as_os_str(),
        ],
    )?;
    let details = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        return if details.contains("not signed at all") {
            Ok(("unsigned".into(), None))
        } else {
            Err(details.trim().to_string())
        };
    }
    let identifier = details
        .lines()
        .find_map(|line| line.strip_prefix("Identifier="))
        .map(str::to_owned);
    let kind = if details.lines().any(|line| line == "Signature=adhoc") {
        "local"
    } else {
        "certificate"
    };
    Ok((kind.into(), identifier))
}

fn verify(bundle: &Path) -> Result<(), String> {
    checked(
        "/usr/bin/codesign",
        &[
            "--verify".as_ref(),
            "--deep".as_ref(),
            "--strict".as_ref(),
            bundle.as_os_str(),
        ],
    )
}

#[tauri::command]
pub async fn get_app_signature_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<SignatureStatus, String> {
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let log_path = cache.join("signature-repair.log").display().to_string();
        let last_result = std::fs::read_to_string(cache.join("signature-repair-result")).ok().map(|s| s.trim().to_string());
        let bundle = match own_bundle() {
            Ok(bundle) => bundle,
            Err(reason) => return Ok(SignatureStatus { valid: false, identifier: None, kind: "development".into(), repair_available: false, reason: Some(reason), last_result, log_path }),
        };
        let (kind, identifier) = signing_details(&bundle)?;
        let repair_available = kind != "certificate";
        Ok(SignatureStatus {
            valid: verify(&bundle).is_ok(), identifier, kind, repair_available,
            reason: if repair_available { None } else { Some("This app uses a signing certificate. Reinstall a build signed by the same developer to preserve its identity.".into()) },
            last_result, log_path,
        })
    }).await.map_err(|e| e.to_string())?
}

// Constant shell source; all paths are separate positional arguments, never interpolated.
// The staged copy is already signed and verified before BetterBar exits.
const RESTART_HELPER: &str = include_str!("signature-restart.sh");

fn prepare_repair(bundle: &Path, cache: &Path) -> Result<(), String> {
    use std::os::unix::{fs::DirBuilderExt, process::CommandExt};
    if signing_details(bundle)?.0 == "certificate" {
        return Err("Cannot replace a certificate signature with a local signature. Reinstall a build signed by the same developer.".into());
    }
    std::fs::create_dir_all(cache).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let work = bundle
        .parent()
        .ok_or("Cannot locate the app folder.")?
        .join(format!(
            ".betterbar-signature-repair-{}-{stamp}",
            std::process::id()
        ));
    std::fs::DirBuilder::new().mode(0o700).create(&work).map_err(|e| format!("Cannot write beside BetterBar.app: {e}. Move it to a writable Applications folder and try again."))?;
    let stage = work.join("BetterBar.app");
    let prepared = (|| {
        checked("/usr/bin/ditto", &[bundle.as_os_str(), stage.as_os_str()])?;
        checked(
            "/usr/bin/codesign",
            &[
                "--force".as_ref(),
                "--sign".as_ref(),
                "-".as_ref(),
                "--identifier".as_ref(),
                IDENTIFIER.as_ref(),
                "--preserve-metadata=entitlements,flags,runtime".as_ref(),
                stage.as_os_str(),
            ],
        )?;
        verify(&stage)?;
        let log =
            std::fs::File::create(cache.join("signature-repair.log")).map_err(|e| e.to_string())?;
        std::fs::write(cache.join("signature-repair-result"), "pending\n")
            .map_err(|e| e.to_string())?;
        let mut command = Command::new("/bin/sh");
        command
            .args(["-c", RESTART_HELPER, "betterbar-signature-repair"])
            .arg(std::process::id().to_string())
            .arg(bundle)
            .arg(&work)
            .arg(cache)
            .stdin(Stdio::null())
            .stdout(log.try_clone().map_err(|e| e.to_string())?)
            .stderr(log);
        // A separate session survives the app exiting; no terminal or parent pipe is inherited.
        unsafe {
            command.pre_exec(|| {
                if setsid() < 0 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
        command.spawn().map_err(|e| e.to_string())?;
        Ok(())
    })();
    if let Err(error) = &prepared {
        let _ = std::fs::remove_dir_all(&work);
        let _ = std::fs::write(cache.join("signature-repair-result"), "failed\n");
        let _ = std::fs::write(cache.join("signature-repair.log"), error);
    }
    prepared
}

unsafe extern "C" {
    fn setsid() -> i32;
}

#[tauri::command]
pub async fn repair_app_signature<R: Runtime>(
    app: AppHandle<R>,
    window: tauri::WebviewWindow<R>,
) -> Result<(), String> {
    if window.label() != "settings" {
        return Err("Open Settings → Permissions to repair the app signature.".into());
    }
    if REPAIRING.swap(true, Ordering::SeqCst) {
        return Err("Signature repair is already running.".into());
    }
    let result = async {
        let bundle = own_bundle()?;
        let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn_blocking(move || prepare_repair(&bundle, &cache))
            .await
            .map_err(|e| e.to_string())?
    }
    .await;
    if result.is_ok() {
        // Let the IPC reply reach the settings window before the app exits.
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(500));
            app.exit(0);
        });
    } else {
        REPAIRING.store(false, Ordering::SeqCst);
    }
    result
}

pub fn reopen_after_repair<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(cache) = app.path().app_cache_dir() {
        let marker = cache.join("signature-repair-reopen");
        if marker.exists() {
            let _ = std::fs::remove_file(marker);
            if let Some(window) = app.get_webview_window("settings") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_executables_outside_an_app_bundle() {
        for path in [
            "/tmp/betterbar",
            "/tmp/Other.app/betterbar",
            "/tmp/Other.app/Contents/Helpers/betterbar",
        ] {
            assert!(bundle_for_executable(Path::new(path)).is_err());
        }
    }

    #[test]
    fn helper_installs_verified_copy_and_rolls_back_invalid_copy() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("betterbar repair ' $ ; {stamp}"));
        std::fs::create_dir(&root).unwrap();
        let cache = root.join("cache");
        std::fs::create_dir(&cache).unwrap();
        let bundle = root.join("BetterBar.app");
        let contents = bundle.join("Contents");
        std::fs::create_dir_all(contents.join("MacOS")).unwrap();
        std::fs::write(contents.join("Info.plist"), r#"<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.betterbar.app</string><key>CFBundleExecutable</key><string>betterbar</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>"#).unwrap();
        std::fs::copy("/usr/bin/true", contents.join("MacOS/betterbar")).unwrap();
        let entitlements = root.join("Entitlements.plist");
        std::fs::write(&entitlements, include_str!("../Entitlements.plist")).unwrap();
        checked(
            "/usr/bin/codesign",
            &[
                "--force".as_ref(),
                "--sign".as_ref(),
                "-".as_ref(),
                "--options=runtime".as_ref(),
                "--entitlements".as_ref(),
                entitlements.as_os_str(),
                bundle.as_os_str(),
            ],
        )
        .unwrap();
        assert_eq!(
            bundle_for_executable(&contents.join("MacOS/betterbar")).unwrap(),
            bundle
        );
        assert_eq!(
            signing_details(&bundle).unwrap(),
            ("local".into(), Some(IDENTIFIER.into()))
        );

        // Test the actual replacement/rollback script, without launching a GUI app.
        let helper = RESTART_HELPER.replace("/usr/bin/open -n \"$bundle\"", "/usr/bin/true");
        for corrupt in [false, true] {
            let work = root.join("staging");
            std::fs::create_dir(&work).unwrap();
            let stage = work.join("BetterBar.app");
            checked("/usr/bin/ditto", &[bundle.as_os_str(), stage.as_os_str()]).unwrap();
            checked("/usr/bin/codesign", &[
                "--force".as_ref(), "--sign".as_ref(), "-".as_ref(),
                "--preserve-metadata=entitlements,flags,runtime".as_ref(), stage.as_os_str(),
            ]).unwrap();
            if corrupt {
                std::fs::write(stage.join("Contents/Info.plist"), "invalid").unwrap();
            }
            let output = Command::new("/bin/sh")
                .args(["-c", &helper, "repair-test", "99999999"])
                .arg(&bundle)
                .arg(&work)
                .arg(&cache)
                .output()
                .unwrap();
            assert_eq!(
                output.status.success(),
                !corrupt,
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            assert_eq!(
                std::fs::read_to_string(cache.join("signature-repair-result"))
                    .unwrap()
                    .trim(),
                if corrupt { "failed" } else { "success" }
            );
            verify(&bundle).unwrap();
            let signed = run("/usr/bin/codesign", &["--display".as_ref(), "--entitlements".as_ref(), "-".as_ref(), bundle.as_os_str()]).unwrap();
            assert!(signed.status.success());
            assert!(String::from_utf8_lossy(&signed.stdout).contains("com.apple.security.personal-information.calendars"));
            assert!(!work.exists());
            assert!(cache.join("signature-repair-reopen").exists());
        }
        // Certificate signatures cannot be replaced by the local repair path.
        let certificate_bundle = root.join("certificate.app");
        let contents = certificate_bundle.join("Contents");
        std::fs::create_dir_all(contents.join("MacOS")).unwrap();
        std::fs::copy("/usr/bin/true", contents.join("MacOS/betterbar")).unwrap();
        std::fs::write(
            contents.join("Info.plist"),
            std::fs::read(bundle.join("Contents/Info.plist")).unwrap(),
        )
        .unwrap();
        assert_eq!(
            signing_details(&certificate_bundle).unwrap().0,
            "certificate"
        );
        assert!(prepare_repair(&certificate_bundle, &cache)
            .unwrap_err()
            .contains("certificate"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
