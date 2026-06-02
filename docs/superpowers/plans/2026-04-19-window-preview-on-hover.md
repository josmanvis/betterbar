# Window Preview on Hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live window thumbnail when hovering over a running app's icon in BetterBar, falling back to the plain name tooltip when no permission or no visible windows.

**Architecture:** The Rust backend uses `CGWindowListCopyWindowInfo` (CoreGraphics, already linked) to find window IDs for a given PID, then shells out to `screencapture -l <windowID>` to capture a PNG (consistent with existing CLI patterns), shrinks it with `sips`, and returns it as a base64 data URL. A new `WindowPreview` React component renders the thumbnail inside an expanded hover card; if Screen Recording permission is missing it shows an "Open Settings" button instead.

**Tech Stack:** Rust (raw CoreFoundation/CoreGraphics FFI, existing CLI tools), React 19 + framer-motion, Tauri 2 invoke bridge.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src-tauri/src/lib.rs` | Add `WindowThumbnail` struct, CF FFI declarations, 3 new Tauri commands |
| Modify | `src/types.ts` | Add `WindowThumbnail` interface |
| Modify | `src/tauri-bridge.ts` | Add 3 new invoke wrappers |
| Create | `src/components/WindowPreview.tsx` | Fetch + display thumbnail, handle permission state |
| Modify | `src/components/DockBar.tsx` | Find running app by item, pass `runningPid` to `DockIcon` |
| Modify | `src/components/DockIcon.tsx` | Accept `runningPid` prop, show `WindowPreview` instead of plain tooltip |

---

## Task 1: Rust — Screen Recording Permission Commands

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add Screen Recording permission functions to the macOS module**

In `src-tauri/src/lib.rs`, inside the `mod macos` block (around line 184), add the following after the existing `CGDirectDisplayID` type alias and the existing `#[link(name = "CoreGraphics", kind = "framework")]` block:

```rust
// ── CoreFoundation raw types (CoreFoundation is linked transitively via cocoa) ──
type CFTypeRef  = *const std::os::raw::c_void;
type CFArrayRef = CFTypeRef;
type CFIndex    = isize;

extern "C" {
    fn CFArrayGetCount(the_array: CFArrayRef) -> CFIndex;
    fn CFArrayGetValueAtIndex(the_array: CFArrayRef, idx: CFIndex) -> CFTypeRef;
    fn CFDictionaryGetValue(the_dict: CFTypeRef, key: CFTypeRef) -> CFTypeRef;
    fn CFStringCreateWithCString(
        alloc:    CFTypeRef,
        c_str:    *const std::os::raw::c_char,
        encoding: u32,
    ) -> CFTypeRef;
    fn CFNumberGetValue(
        number:    CFTypeRef,
        the_type:  i32,
        value_ptr: *mut std::os::raw::c_void,
    ) -> bool;
    fn CFRelease(cf: CFTypeRef);
}

const CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
const CF_NUMBER_SINT32_TYPE: i32   = 3;
const CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: u32       = 1 << 0; // 1
const CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS: u32    = 1 << 4; // 16
const CG_NULL_WINDOW_ID: u32 = 0;
```

- [ ] **Step 2: Add CGWindowListCopyWindowInfo and permission functions to the existing CoreGraphics extern block**

Find the existing block (around lib.rs line 214):
```rust
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGMainDisplayID() -> CGDirectDisplayID;
}
```

Replace it with:
```rust
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGMainDisplayID() -> CGDirectDisplayID;
    fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> CFArrayRef;
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}
```

- [ ] **Step 3: Add `check_screen_recording` and `request_screen_recording` public functions to the `macos` module**

Inside `mod macos`, add after the existing `clear_screen_insets` function (around line 476):

```rust
pub fn check_screen_recording() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() }
}

pub fn request_screen_recording() {
    let _ = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .spawn();
}
```

- [ ] **Step 4: Add `check_screen_recording_permission` and `request_screen_recording_permission` Tauri commands**

In `src-tauri/src/lib.rs`, add after the `request_accessibility_permissions` command (around line 143):

```rust
#[tauri::command]
async fn check_screen_recording_permission() -> bool {
    #[cfg(target_os = "macos")]
    { macos::check_screen_recording() }
    #[cfg(not(target_os = "macos"))]
    { true }
}

#[tauri::command]
async fn request_screen_recording_permission() {
    #[cfg(target_os = "macos")]
    { macos::request_screen_recording(); }
}
```

- [ ] **Step 5: Register the two new commands in the invoke_handler**

Find the `invoke_handler` call (around line 487) and add the new commands:

```rust
.invoke_handler(tauri::generate_handler![
    get_running_apps,
    launch_app,
    get_screen_info,
    position_window,
    set_window_level,
    get_app_icon,
    get_battery_info,
    check_accessibility_permissions,
    request_accessibility_permissions,
    check_screen_recording_permission,
    request_screen_recording_permission,
    set_screen_inset,
    clear_screen_insets,
])
```

- [ ] **Step 6: Verify it compiles**

```bash
cd /Users/jose.viscasillas/Developer/betterbar/src-tauri
cargo check 2>&1 | tail -20
```

Expected: no errors. Warnings about unused functions are fine.

- [ ] **Step 7: Commit**

```bash
cd /Users/jose.viscasillas/Developer/betterbar
git add src-tauri/src/lib.rs
git commit -m "feat: add screen recording permission check/request commands"
```

---

## Task 2: Rust — Window Thumbnail Capture Command

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the `WindowThumbnail` struct**

In `src-tauri/src/lib.rs`, after the `BatteryInfo` struct (around line 31), add:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowThumbnail {
    pub image: String,         // "data:image/png;base64,..."
    pub title: Option<String>,
}
```

- [ ] **Step 2: Add `get_window_ids_for_pid` helper inside the `macos` module**

Inside `mod macos`, add after the `request_screen_recording` function added in Task 1:

```rust
fn get_window_ids_for_pid(target_pid: i32) -> Vec<u32> {
    unsafe {
        let option = CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY | CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS;
        let raw_array = CGWindowListCopyWindowInfo(option, CG_NULL_WINDOW_ID);
        if raw_array.is_null() {
            return vec![];
        }

        let count = CFArrayGetCount(raw_array);

        let pid_key = CFStringCreateWithCString(
            std::ptr::null(),
            b"kCGWindowOwnerPID\0".as_ptr() as _,
            CF_STRING_ENCODING_UTF8,
        );
        let num_key = CFStringCreateWithCString(
            std::ptr::null(),
            b"kCGWindowNumber\0".as_ptr() as _,
            CF_STRING_ENCODING_UTF8,
        );

        let mut result = Vec::new();

        for i in 0..count {
            let dict = CFArrayGetValueAtIndex(raw_array, i);
            if dict.is_null() {
                continue;
            }

            let pid_val = CFDictionaryGetValue(dict, pid_key);
            if pid_val.is_null() {
                continue;
            }
            let mut owner_pid: i32 = 0;
            if !CFNumberGetValue(pid_val, CF_NUMBER_SINT32_TYPE, &mut owner_pid as *mut _ as _) {
                continue;
            }
            if owner_pid != target_pid {
                continue;
            }

            let wid_val = CFDictionaryGetValue(dict, num_key);
            if wid_val.is_null() {
                continue;
            }
            let mut window_id: i32 = 0;
            if CFNumberGetValue(wid_val, CF_NUMBER_SINT32_TYPE, &mut window_id as *mut _ as _) {
                result.push(window_id as u32);
            }
        }

        CFRelease(pid_key);
        CFRelease(num_key);
        CFRelease(raw_array);

        result
    }
}
```

- [ ] **Step 3: Add `get_window_thumbnail` function inside the `macos` module**

Inside `mod macos`, add after `get_window_ids_for_pid`:

```rust
pub fn get_window_thumbnail(pid: i32) -> Option<super::WindowThumbnail> {
    if !check_screen_recording() {
        return None;
    }

    let window_ids = get_window_ids_for_pid(pid);
    let &window_id = window_ids.first()?;

    let tmp_path = format!("/tmp/betterbar_thumb_{}.png", pid);

    let captured = Command::new("screencapture")
        .args(["-l", &window_id.to_string(), "-x", &tmp_path])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    if !captured {
        return None;
    }

    // Resize to max 280px wide (in-place)
    let _ = Command::new("sips")
        .args(["--resampleWidth", "280", &tmp_path])
        .output();

    // Encode as base64
    let b64_out = Command::new("base64").arg(&tmp_path).output().ok()?;
    let _ = std::fs::remove_file(&tmp_path);

    let encoded = String::from_utf8_lossy(&b64_out.stdout).replace('\n', "");
    if encoded.is_empty() {
        return None;
    }

    Some(super::WindowThumbnail {
        image: format!("data:image/png;base64,{}", encoded),
        title: None,
    })
}
```

- [ ] **Step 4: Add the `get_window_thumbnail` Tauri command**

In `src-tauri/src/lib.rs`, add after `request_screen_recording_permission` command:

```rust
#[tauri::command]
async fn get_window_thumbnail(pid: i32) -> Option<WindowThumbnail> {
    #[cfg(target_os = "macos")]
    { macos::get_window_thumbnail(pid) }
    #[cfg(not(target_os = "macos"))]
    { let _ = pid; None }
}
```

- [ ] **Step 5: Register `get_window_thumbnail` in the invoke_handler**

```rust
.invoke_handler(tauri::generate_handler![
    get_running_apps,
    launch_app,
    get_screen_info,
    position_window,
    set_window_level,
    get_app_icon,
    get_battery_info,
    check_accessibility_permissions,
    request_accessibility_permissions,
    check_screen_recording_permission,
    request_screen_recording_permission,
    get_window_thumbnail,
    set_screen_inset,
    clear_screen_insets,
])
```

- [ ] **Step 6: Verify it compiles**

```bash
cd /Users/jose.viscasillas/Developer/betterbar/src-tauri
cargo check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/jose.viscasillas/Developer/betterbar
git add src-tauri/src/lib.rs
git commit -m "feat: add get_window_thumbnail command using CGWindowListCopyWindowInfo"
```

---

## Task 3: TypeScript Bridge Updates

**Files:**
- Modify: `src/types.ts`
- Modify: `src/tauri-bridge.ts`

- [ ] **Step 1: Add `WindowThumbnail` interface to `src/types.ts`**

After the `BatteryInfo` interface (around line 32), add:

```ts
export interface WindowThumbnail {
  image: string;         // "data:image/png;base64,..."
  title: string | null;
}
```

- [ ] **Step 2: Add the three new invoke wrappers to `src/tauri-bridge.ts`**

At the end of `src/tauri-bridge.ts`, add:

```ts
export async function checkScreenRecordingPermission(): Promise<boolean> {
  return invoke<boolean>("check_screen_recording_permission");
}

export async function requestScreenRecordingPermission(): Promise<void> {
  return invoke("request_screen_recording_permission");
}

export async function getWindowThumbnail(pid: number): Promise<WindowThumbnail | null> {
  return invoke<WindowThumbnail | null>("get_window_thumbnail", { pid });
}
```

Add `WindowThumbnail` to the import at the top of `tauri-bridge.ts`:

```ts
import { BatteryInfo, RunningApp, ScreenInfo, WindowThumbnail } from "./types";
```

- [ ] **Step 3: Commit**

```bash
cd /Users/jose.viscasillas/Developer/betterbar
git add src/types.ts src/tauri-bridge.ts
git commit -m "feat: add window thumbnail types and tauri bridge wrappers"
```

---

## Task 4: WindowPreview Component

**Files:**
- Create: `src/components/WindowPreview.tsx`

- [ ] **Step 1: Create `src/components/WindowPreview.tsx`**

```tsx
import { useState, useEffect } from "react";
import { DockPosition } from "../types";
import {
  checkScreenRecordingPermission,
  requestScreenRecordingPermission,
  getWindowThumbnail,
} from "../tauri-bridge";

interface WindowPreviewProps {
  appName: string;
  pid: number;
  position: DockPosition;
}

export function WindowPreview({ appName, pid }: WindowPreviewProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [permitted, setPermitted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ok = await checkScreenRecordingPermission();
      if (cancelled) return;
      setPermitted(ok);
      if (!ok) return;

      const result = await getWindowThumbnail(pid);
      if (cancelled) return;
      setThumbnail(result?.image ?? null);
    })();

    return () => { cancelled = true; };
  }, [pid]);

  return (
    <div className="flex flex-col items-center gap-2 min-w-[100px]">
      {permitted === false ? (
        <div className="text-center space-y-2">
          <p className="text-[11px] text-zinc-400 leading-tight">
            Screen Recording<br />required for previews
          </p>
          <button
            className="text-[11px] bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-md text-white transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              requestScreenRecordingPermission();
            }}
          >
            Open Settings
          </button>
        </div>
      ) : thumbnail ? (
        <img
          src={thumbnail}
          alt={appName}
          className="rounded-lg object-contain shadow-inner max-w-[280px]"
          draggable={false}
        />
      ) : null}
      <span className="text-xs font-medium text-white">{appName}</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jose.viscasillas/Developer/betterbar
git add src/components/WindowPreview.tsx
git commit -m "feat: add WindowPreview component with permission handling"
```

---

## Task 5: Wire Up DockBar and DockIcon

**Files:**
- Modify: `src/components/DockBar.tsx`
- Modify: `src/components/DockIcon.tsx`

- [ ] **Step 1: Add `runningPid` prop to `DockIconProps` in `DockIcon.tsx`**

Find the `DockIconProps` interface (line 8) and add the new prop:

```ts
interface DockIconProps {
  item: DockItem;
  isRunning: boolean;
  runningPid?: number;      // ← add this line
  iconSize: number;
  showLabel: boolean;
  position: DockPosition;
  onRemove?: (id: string) => void;
  editMode: boolean;
}
```

Update the function signature to destructure the new prop:

```tsx
export function DockIcon({
  item,
  isRunning,
  runningPid,               // ← add this
  iconSize,
  showLabel,
  position,
  onRemove,
  editMode,
}: DockIconProps) {
```

- [ ] **Step 2: Replace the simple tooltip with `WindowPreview` in `DockIcon.tsx`**

Add the import at the top of `DockIcon.tsx`:

```ts
import { WindowPreview } from "./WindowPreview";
```

Find the existing `<AnimatePresence>` tooltip block (around line 164) and replace it:

```tsx
{/* Tooltip / Window Preview */}
<AnimatePresence>
  {showTooltip && !editMode && (
    <motion.div
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      transition={{ duration: 0.1 }}
      className={`absolute z-50 rounded-xl bg-zinc-800 border border-white/[0.08] shadow-xl ${tooltipClass(position)} ${
        isRunning && runningPid !== undefined
          ? "p-2.5"
          : "px-2.5 py-1 pointer-events-none whitespace-nowrap"
      }`}
    >
      {isRunning && runningPid !== undefined ? (
        <WindowPreview appName={item.name} pid={runningPid} position={position} />
      ) : (
        <span className="text-xs font-medium text-white">{item.name}</span>
      )}
    </motion.div>
  )}
</AnimatePresence>
```

- [ ] **Step 3: Pass `runningPid` from `DockBar.tsx`**

In `DockBar.tsx`, find the `isRunning` function (around line 79):

```ts
function isRunning(item: DockItem) {
  return runningApps.some(
    (app) =>
      app.name.toLowerCase() === item.name.toLowerCase() ||
      (item.bundleId && app.bundle_id.includes(item.name.toLowerCase()))
  );
}
```

Add a companion `findRunningApp` function directly after it:

```ts
function findRunningApp(item: DockItem) {
  return runningApps.find(
    (app) =>
      app.name.toLowerCase() === item.name.toLowerCase() ||
      (item.bundleId && app.bundle_id.includes(item.name.toLowerCase()))
  );
}
```

Find where `DockIcon` is rendered in `DockBar.tsx` (look for `<DockIcon`) and add the `runningPid` prop:

```tsx
<DockIcon
  key={item.id}
  item={item}
  isRunning={isRunning(item)}
  runningPid={findRunningApp(item)?.pid}
  iconSize={config.iconSize}
  showLabel={config.showLabels}
  position={config.position}
  onRemove={editMode ? onRemove : undefined}
  editMode={editMode}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/jose.viscasillas/Developer/betterbar
npm run build 2>&1 | tail -30
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/jose.viscasillas/Developer/betterbar
git add src/components/DockBar.tsx src/components/DockIcon.tsx
git commit -m "feat: show window preview on hover for running apps"
```

---

## Task 6: End-to-End Smoke Test

- [ ] **Step 1: Run the dev build**

```bash
cd /Users/jose.viscasillas/Developer/betterbar
npm run tauri dev
```

- [ ] **Step 2: Manual test checklist**

1. Hover over a running app icon — after 500ms, the preview card should appear
2. If Screen Recording permission is NOT granted: the card shows "Screen Recording required for previews" and an "Open Settings" button
3. After granting permission in System Settings and returning to BetterBar, hover again — should show the window thumbnail
4. Hover over a non-running app — should show the plain text name tooltip (no preview card, no permission prompt)
5. Move cursor away — tooltip/preview should animate out

- [ ] **Step 3: Bump version and update history.md, then commit**

In `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`, bump the version from `0.2.0` to `0.3.0`.

Update `history.md` (create it if it doesn't exist) with:

```markdown
## 0.3.0
- Window preview thumbnails on hover for running apps (requires Screen Recording permission)
```

```bash
cd /Users/jose.viscasillas/Developer/betterbar
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json history.md
git commit -m "chore: bump to 0.3.0 — window preview on hover"
```

---

## Self-Review

**Spec coverage:**
- ✅ Screen Recording permission check + graceful fallback → Tasks 1, 4
- ✅ Find window ID by PID → Task 2 (`get_window_ids_for_pid`)
- ✅ Capture window thumbnail → Task 2 (`screencapture -l`)
- ✅ Resize to 280px → Task 2 (`sips --resampleWidth`)
- ✅ Base64 encode + return → Task 2
- ✅ TypeScript bridge → Task 3
- ✅ WindowPreview component → Task 4
- ✅ Plumb pid from DockBar → Task 5
- ✅ Replace tooltip for running apps → Task 5
- ✅ Plain text fallback for non-running apps → Task 5 (the `else` branch)
- ✅ Version bump + history → Task 6

**No placeholders:** All steps contain actual code.

**Type consistency:**
- `WindowThumbnail.image: string` — defined in types.ts (Task 3), used in WindowPreview.tsx (Task 4) ✅
- `runningPid?: number` — defined in DockIconProps (Task 5), passed in DockBar (Task 5) ✅
- `getWindowThumbnail(pid: number)` — bridge function in tauri-bridge.ts (Task 3), called in WindowPreview.tsx (Task 4) ✅
- `checkScreenRecordingPermission()` — bridge function (Task 3), called in WindowPreview.tsx (Task 4) ✅
