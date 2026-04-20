# BetterBar — Changelog

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
