# BetterBar — Changelog

## 0.11.0
- **Settings window redesign** — replaced the wrapping top tab-pills with a left **sidebar** nav (Layout / Style / Icons / Sets & Items / Sections / Behaviour / Permissions / About) and de-noised the panel chrome: dropped the `[01]` section numbers and `:: HINT` suffixes, the multi-block header stripe, and the decorative footer stats line. `[X] / [ ]` text checkboxes are now real **switch** toggles; the `< A | B >` pill selectors are a single bordered **segmented** control; sliders gained an editable numeric readout. Section-visibility toggles are grouped under Dock / Indicators / Extras sub-heads (`src/SettingsApp.tsx`, `src/index.css` untouched). Settings window default size bumped to 720×660 / min 560 wide for the sidebar (`src-tauri/tauri.conf.json`).
- **Customizable icon box** — new `IconChrome` model (background fill, border color + width, corner radius, inner padding) for the box behind every dock icon. Set a **global default** under *Icons → Icon Box* (with `NONE / OUTLINE / TILE / SOFT / CONTRAST` presets and a live preview), or override it **per pinned item** from an expander in *Sets & Items → Items*. Rendering is shared between the live bar and the settings preview via `src/iconChrome.ts` (`iconChromeStyle` / `hasChrome` / `mergeChrome`). New `BetterBarConfig.iconChrome` and `DockItem.chrome` fields with `setIconChrome` / `resetIconChrome` / `setItemChrome` / `resetItemChrome` store operations and `sanitizeIconChrome` clamping; applied in `src/components/DockIcon.tsx` and `RunningAppIcon` (`src/components/DockBar.tsx`, `src/types.ts`, `src/store.ts`). Config export/import and *Reset All Settings* round-trip the new fields.

## 0.10.0
- **Per-Section Padding & Custom Scale Controls** — configure top, right, bottom, and left padding and zoom scale per section, supporting pixel-perfect layout alignment across all bar items (`src/components/DockBar.tsx`, `src/types.ts`, `src/store.ts`).
- **Caffeine Component Scaling Integration** — updated caffeine indicator styling to respect global and custom bar scaling seamlessly (`src/components/DockBar.tsx`).

## 0.9.0
- **Caffeine / Keep Awake sleep prevention indicator** — keep macOS display and system awake with native \`caffeinate\` integration; left-click to toggle, right-click to pick durations (15m, 30m, 1h, 2h, 5h, or indefinite); customizable in \`SECTIONS\` settings (\`src/components/CaffeineIndicator.tsx\`, \`src/hooks/useCaffeine.ts\`, \`src-tauri/src/lib.rs\`).
- **Transparent & Detailed Changelog & Release Viewer** — integrated in-app markdown changelog parser with headings, highlighted code badges, and bullet items; browse current and historical release notes right in the UI (\`src/SettingsApp.tsx\`).
- **Release Notes Archive** — new tab in \`SOFTWARE_UPDATE\` to inspect past versions and what was changed across every release without leaving BetterBar (\`src/SettingsApp.tsx\`, \`src-tauri/src/lib.rs\`).
- **Multi-step Update Progress Feedback** — step-by-step progress status during download, package extraction, quarantine clearing, and app relaunch (\`src/SettingsApp.tsx\`).

## 0.8.0
- **Universal Binary & Intel Mac Support** — compiled as a Universal Mach-O binary (`x86_64` + `arm64`) to run smoothly on all Intel Macs and Apple Silicon Macs natively.
- **Open on Login setting** — automatically launch BetterBar on system startup, managed via macOS System Events under the `BEHAVIOUR` tab.
- **GitHub Auto-Update & In-App Updater** — check for updates directly against GitHub Releases, review release notes, and install updates with one-click restart under `HELP` → `SOFTWARE_UPDATE`.
- **Export & Import Configurations** — export full BetterBar configuration (sets, items, layout, custom icons) to `.json` files or clipboard, and import across different Macs under `HELP` → `BACKUP_AND_SHARE`.
- **Extension API** — third-party React components as bar sections; Vite plugin scans `~/.betterbar/extensions/<name>/main.tsx`, transpiles with esbuild, and serves via virtual module (`EXTENSIONS.md`, `vite.config.ts`, `src/extensions-runtime.ts`).
- **macOS Spaces integration** — `SpacesIndicator` with landscape-thumbnail rectangles; polls via `get_spaces` (uses `CGSCopyManagedDisplaySpaces` for reliable enumeration with actual workspace IDs); switching via `CGSGoToSpace`/`CGSSetWorkspace`/AppleScript fallback (`src/components/SpacesIndicator.tsx`, `src-tauri/src/lib.rs`).
- **Bar right-click context menu** — right-click anywhere on the bar to open *BetterBar Settings…* (`src/components/DockBar.tsx`).
- **Settings tab panels scroll fix** — `h-screen` on root + `min-h-0 overflow-y-auto` on `<main>` so tall content scrolls instead of overflowing (`src/SettingsApp.tsx`).
- **Bug fix: `isVertical` scope** — moved `isVertical` from `useEffect`-local to component top level so all render branches can reference it (`src/components/DockBar.tsx`).
- **Bug fix: `useWindowPosition` hook missing** — restored accidentally dropped hook call that was preventing the OS window from being resized in docked mode (`src/components/DockBar.tsx`).

## 0.7.0
- **Now-playing music indicator** — new `MusicIndicator` component and `useMusic` polling hook (2s) show the current track with play/pause and prev/next controls; click opens the player, right-click opens settings (`src/components/MusicIndicator.tsx`, `src/hooks/useMusic.ts`). Backed by new Rust commands `get_music_info`, `focus_music_app`, `music_play_pause`, `music_next`, `music_previous` and a `MusicInfo` type (`src-tauri/src/lib.rs`, `src/types.ts`, `src/tauri-bridge.ts`).
- **Per-icon customization** — right-click an app icon → `Change Icon` to pick the native macOS icon (`Default (native)`), a 2-letter glyph, a built-in device icon (iPad/iPhone/Watch/Windows/macOS/Linux), or a custom image. New `DockItem` fields `deviceIcon`, `forceGlyph`, `displayType`, plus `setItemDeviceIcon` / `setItemForceGlyph` / `setItemDisplayType` operations (`src/components/DockIcon.tsx`, `src/store.ts`, `src/types.ts`).
- **Display Type submenu** — choose App Icon / App Icon + Label / Label per item, replacing the per-item `showLabel` toggle (`src/components/DockIcon.tsx`).
- **Running-app actions** — icon context menu gains Show All Windows, Maximize, Hide, and Quit for running apps, backed by new Rust commands `hide_app`, `quit_app`, `zoom_app_window` (`src-tauri/src/lib.rs`, `src/tauri-bridge.ts`).
- **Simulator quick-launch** — new `launch_simulator` Rust command and `launchSimulator` bridge for the simulator icons row.
- **Bar section toggles** — settings now lets you show/hide each bar region independently: `showMusic`, `showSimIcons`, `showClocks`, `showBattery`, `showSetSwitcher`, `showSimDropdown`, `showTerminalIcon`, `showDockArea` (`src/types.ts`, `src/SettingsApp.tsx`, `src/components/DockBar.tsx`).
- **Accra clock** — added GHA (Africa/Accra) to the default world-clock set (`src/types.ts`).
- Bumped `@tauri-apps/api` to `^2.10.1` and `@tauri-apps/cli` to `^2.11.2`.

## 0.6.0
- **Always-on edge drag handles** — the 10px hover bands on all four bar edges now work regardless of `FREE_FLOAT`. Left-click drag repositions the bar via `getCurrentWindow().startDragging()`; if the bar was docked, dragging auto-engages free-float mode at the new position (`src/components/DockBar.tsx`, new `setFreeFloat` setter in `src/store.ts`). The window-move listener is now always active and writes back to `floatPosition` on every native drag.
- **Right-click drag = resize** — the dedicated inner-edge `ResizeHandle` is gone. Right-click + drag on any edge stripe now resizes the bar: perpendicular edges adjust thickness (`barSize`), parallel edges adjust length (`barLength`, only in free-float + custom mode). Direction follows the grabbed edge's outward normal. Implementation uses pointer capture for smooth tracking.
- **Icon context menu** — right-click an app icon to open a custom menu with `Edit Display` (inline rename, persisted to `DockItem.name`) and `Hide`. Hidden items are kept in the active set but filtered out of the bar (`src/components/DockIcon.tsx`).
- **New `DockItem.hidden` field** + `renameItem` / `setItemHidden` operations in `src/store.ts`.
- **Settings `ITEMS` section** — new section lists every item in the active set with rename and show/hide toggles, so hides done from the bar can be undone here (`src/SettingsApp.tsx`).
- **Cursor restore for Tailwind v4** — added a global `button:not(:disabled) { cursor: pointer; }` rule in `src/index.css` since Tailwind v4 dropped this from its preflight stylesheet. Buttons across the settings window now feel clickable on hover.

## 0.5.0
- **Free-floating mode** — new `FREE_FLOAT` toggle in settings lets the user drag BetterBar anywhere on screen instead of pinning it to an edge (`src/SettingsApp.tsx`, `src/store.ts`, `src/types.ts`).
- **Bar length modes** — the `BAR_LENGTH` settings section now offers three modes via a segmented control: `EDGE` (full screen-edge length), `AUTO` (shrink-wrap to icons + indicators, measured via `ResizeObserver` in `src/components/DockBar.tsx`), `CUSTOM` (pixel-precise slider). `useWindowPosition` resolves the long-axis length from the mode and passes a measured `autoLength` through from `DockBar`. In auto mode the bar drops its `flex-1` spacer and shrink-wraps so the OS window can be sized to fit (`src/hooks/useWindowPosition.ts`, `src/components/DockBar.tsx`).
  - `useWindowPosition` now branches: docked path is unchanged; the float path computes a finite rect (`barSize` × `barLength`) at `floatPosition`, clamps to the screen's visibleFrame (avoids the menu bar / system Dock), and clears the screen reservation via the existing `clear_screen_insets` Rust command (newly registered in `invoke_handler` and wrapped in `src/tauri-bridge.ts`).
  - Bar orientation in float mode is inherited from the configured `position` (left/right → vertical, top/bottom → horizontal).
  - New `BAR_LENGTH` slider in settings (200–1400px, disabled/dimmed when free-float is off).
  - Hover-edge drag handle: when within 10px of any of the bar's four edges, a 2px chartreuse stripe appears on that edge and acts as the native drag handle via `getCurrentWindow().startDragging()` (`src/components/DockBar.tsx`). Clicks on the interior (icons, buttons) still work normally.
  - Position is persisted: `tauri://moved` fires after a drag → we read `outer_position()` via the new `get_window_outer_position` Rust command, convert physical→logical pixels with the screen scale factor, and save to `config.floatPosition` (`src-tauri/src/lib.rs`).
  - Toggling off snaps the bar back to whatever `position` is configured and re-reserves the screen inset (handled automatically by the reactive effect).
  - Added `core:window:allow-start-dragging` capability (`src-tauri/capabilities/default.json`).

## 0.4.0
- **Bar geometry**: Left/right bars now subtract `dock_height` in addition to `menu_bar_height`, so they stop cleanly above the system Dock instead of running underneath it (`src/hooks/useWindowPosition.ts`). Bottom bar likewise stacks above the system Dock.
- **Settings cog**: Replaced the JS-side `getAllWindows().show()` path with a dedicated Rust command `open_settings_window` (`src-tauri/src/lib.rs`, `src/tauri-bridge.ts`). Custom commands don't require window-permission capabilities, so the cog works without any capability fiddling. The redundant `core:window:allow-*` permissions added previously can stay or go — they're no longer load-bearing.
- **Defensive load**: `loadConfig` now clamps `barSize` to `[48, 200]` and substitutes defaults for non-finite numbers, recovering gracefully from corrupted persisted state (`src/store.ts`).
- **Brutalist Terminal redesign** of the bar and settings window — pure black canvas, IBM Plex Mono throughout, chartreuse (#c5f500) accent on a single semantic state (active/running). 1px hard borders, no radii, no glows.
  - New CSS palette in `src/index.css` (CSS variables, scanline overlay utility, blinking caret, brutalist range styling).
  - `src/components/DockBar.tsx` — `RailStamp` terminal-style header (`BB▍` blinking caret), micro-labelled dividers (`TIME` / `PWR` / `SET`), hard-edged `RailButton`s with bracketed framing.
  - `src/components/DockIcon.tsx` — square slots, full-color desaturated when not running, chartreuse 2px stripe on the inner edge for running apps; tooltip rendered as a black box with `>` prompt prefix.
  - `src/components/BatteryIndicator.tsx` — segmented bar (8 bars), tonal color (chartreuse charging / amber low / red critical), Phosphor `Lightning` glyph for charging.
  - `src/components/WorldClock.tsx` — 24h tabular numerals, monospace columns.
  - `src/SettingsApp.tsx` — terminal-window layout with numbered sections (`[01] POSITION`, etc.), bracketed segmented control for position, ASCII-fill range slider, `[X] / [ ]` toggles, status footer reading `pos=… bar=…px icon=…px`.
  - Iconography: `@phosphor-icons/react` (Bold weight) replacing all unicode glyphs.
- Settings cog now opens a dedicated, native-decorated settings window (`src-tauri/tauri.conf.json`, `src/SettingsApp.tsx`, `src/main.tsx`).
  - Removed the inline `SettingsPanel` popover; the main bar is no longer crowded by a popover and can stay clipped (`overflow-hidden`) without conflicts.
  - Cross-window state sync via `storage` events in `src/store.ts` — changes in either window propagate immediately.
  - Added the explicit window permissions (`core:window:allow-show`, `allow-set-focus`, `allow-unminimize`, `allow-get-all-windows`) to `src-tauri/capabilities/default.json` — without these, the cog click silently no-ops in Tauri 2 (`core:default` does not include them).
- Resizable bar thickness via inner-edge drag handle (`src/components/DockBar.tsx`) — drag the inner edge to grow/shrink the bar (clamped 48–200px). New `barSize` field on `BetterBarConfig`; `useWindowPosition` now resizes the OS window and updates the screen inset accordingly. Also exposed as a slider in the settings window.
- Removed scroll/overflow on the icon container (`src/components/DockBar.tsx`); excess icons are clipped by the bar's existing `overflow-hidden`.

## 0.3.0
- Window preview thumbnails on hover for running apps (requires Screen Recording permission)

## [0.2.0] — in development

### Added
- **Screen space reservation** (`src-tauri/src/lib.rs`, `src/hooks/useWindowPosition.ts`, `src/tauri-bridge.ts`)
  - BetterBar now reserves its 68pt edge via `CGSSetScreenInsets` (the same private CoreGraphics API the macOS Dock uses), modifying `NSScreen.visibleFrame` system-wide so other apps zoom/maximize into the remaining space rather than the full screen.
  - Insets are dispatched on the main thread and automatically cleared when BetterBar quits (`WindowEvent::Destroyed`).
  - Diagnostic logging (`[BetterBar]` prefix) added to stdout to verify symbol resolution and visible-frame changes during development.
- **Battery indicator** (`src/components/BatteryIndicator.tsx`, `src/hooks/useBattery.ts`) — shows battery percentage and charging state in the bar.
- **World clock** (`src/components/WorldClock.tsx`) — displays current time in the bar.
- Major rework of `DockBar`, `DockIcon`, `SettingsPanel`, `store`, and `types` — refined layout, icon behaviour, and settings management.

### Changed
- `set_screen_inset` and `clear_screen_insets` Tauri commands now dispatch to the main thread (CGS connection is main-thread bound).
- Private CGS symbols (`CGSMainConnectionID`, `CGSSetScreenInsets`) resolved via `dlsym` at runtime to avoid link-time failures on symbols not in the public CoreGraphics export table.

---

## [0.1.0] — initial save point

- Initial Tauri 2 + React scaffold for a macOS dock alternative.
- Floating, frameless, transparent window with `ActivationPolicy::Accessory`.
- Window positioned and sized dynamically based on `NSScreen` metrics (menu bar height, dock height).
- Running apps list, app launching, app icon fetching.
- Configurable position (left / right / top / bottom), icon size, auto-hide toggle, labels toggle.
- AppKit window level dispatched to main thread.
