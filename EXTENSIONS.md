# BetterBar Extensions API

Extensions are third-party React components that render directly on the BetterBar dock. They live in `~/.betterbar/extensions/<name>/main.tsx`.

## Quick Start

Create `~/.betterbar/extensions/my-extension/main.tsx`:

```tsx
export const name = "My Extension";

export default function MyExtension() {
  return <span>Hello</span>;
}
```

Enable it in Settings → Extensions, then toggle the extension on.

## Privacy of extension source

Keep extensions reusable: no personal usernames, email addresses, absolute home paths, private service endpoints, access tokens, or private keys in source or bundled examples. Resolve user paths at runtime. Keep user-specific endpoints in local configuration and credentials in the macOS Keychain through a native integration; local storage and configuration exports are not secret storage.

Run `npm run audit:extensions` before sharing extension source. Builds run this check automatically. To also check extensions installed on the current Mac, run `npm run audit:extensions -- --installed`. Findings include file locations and rule names; matching values are withheld. This is a check for common sensitive literals, not a sandbox or a guarantee that arbitrary extension code is trustworthy.

Production builds do not read or bundle the developer's installed extension directory. Extensions are loaded at runtime on the user's Mac. Do not include private Markdown, notes, calendar events, credentials, or local preference files when sharing extension folders. Error messages shown by the bundled extensions omit raw native errors and file contents.

Standup Update reads local Markdown only when its window opens. It renders formatting without raw HTML or embedded images, so a note cannot silently load a tracking image or run HTML. Web links require a click and omit referrers. Content is not copied into extension source or saved in extension preferences.

## File Structure

```
~/.betterbar/extensions/
  my-extension/
    main.tsx        # ← extension entry point (required)
```

## API

### Default Export (required)

Your default export must be a React component. On the bar it receives `isVertical`, `config`, `barSize`, `iconSize`, `slotSize`, `showLabels`, and `showBorder`. In an extension window it receives `isWindowMode: true`.

```tsx
export default function MyWidget() {
  return <div>...</div>;
}
```

### Named Exports

| Export   | Type     | Default | Description                              |
|----------|----------|---------|------------------------------------------|
| `name`   | `string` | dir name | Display name shown in Settings & tooltip |
| `Settings` | React component | — | Optional settings UI; receives `config` and `updateConfig` |

```tsx
export const name = "My Widget";
```

### Styling

Use Tailwind classes. The bar uses a dark theme with these CSS variables:

| Variable         | Purpose                  |
|------------------|--------------------------|
| `--bb-accent`    | Accent color (user-set)   |
| `--bb-text`      | Primary text color        |
| `--bb-dim`       | Dim/muted text            |
| `--bb-mute`      | Very muted text           |
| `--bb-line`      | Border color              |
| `--bb-pane`      | Surface background        |
| `--bb-bg`        | Main background           |
| `--bb-pane-2`    | Raised surface            |
| `--bb-line-2`    | Strong border             |
| `--bb-on-accent` | Text on accent backgrounds |
| `--bb-warn`, `--bb-bad` | Warning and error colors |

Settings → Style controls background opacity, blur, corners, border width, inner shadow, scanlines, and the full palette, with Terminal, Midnight, and Paper presets. These preferences persist in `betterbar_config.appearance`; existing translucent configurations migrate to 35% opacity and 12px blur. Opacity affects the background rather than fading the entire bar.

Every enabled extension has an **Appearance** section in Settings → Extensions. Users can adjust button opacity and content size, inherit the shared palette, or choose custom colors. Overrides persist under `betterbar_config.extensionAppearance[extension-directory]`. Color variables are supplied to both the bar component and extension window and update live. Button opacity and content scale affect the bar only. The host applies content scale to every extension, including text widgets. Use the supplied icon sizing and CSS variables to respect these preferences; hardcoded colors bypass the palette. Apps Drawer can also choose its own accent in its settings.

### Sizing

Your component renders directly in the Extensions section of the bar. Icon buttons should use the supplied `slotSize` for their width and height and `iconSize` for their glyph, matching pinned and running apps. These values update with the bar size; do not hardcode a 28px trigger. `slotSize` includes the same 4px gutter on each side as app icons. The section also exposes `--bb-extension-icon-size` and `--bb-extension-slot-size` for CSS-based sizing. Content scale and section scale are applied by the host; avoid applying them again inside your component. Widgets such as clocks can retain their natural width.

The bar supports thicknesses from **24 to 200 px**. Below 48 px the host scales the same base layout uniformly. It also measures each item's natural cross-axis size and caps its scale to fit the bar, including custom section/extension scales and padding. Keep your layout intrinsic; avoid viewport-sized wrappers on bar components. Extension windows keep their own normal dimensions.

For text, use `fontSize: "max(10px, var(--bb-font-floor, 8px))"` to keep small text readable. The host supplies this floor independently of measurement so content fitting cannot cause a resize loop. Bundled clocks adapt to one line on a compact horizontal bar and split time into digit groups on a compact vertical bar. Monitor and timer readouts also adapt to the bar's orientation. Secondary dates remain in clock accessibility labels and tooltips when space is tight.

### Labels

**Settings → Extensions → Show extension labels** controls optional text for every extension. Each extension's **Appearance → Extension labels** can follow the shared setting, show labels, or hide them. The resolved boolean is passed as `showLabels`. Respect it when rendering captions or secondary details, and mark optional text with `data-bb-extension-label` as a host fallback. Keep an icon or essential value visible when labels are hidden. Keep accessible names and tooltips available; a clock's time or a calendar icon's day number is essential content.

**Show extension borders** controls button frames on the bar. Each extension's **Settings → Appearance → Button border** can follow the shared setting, show its frame, or hide it. The resolved boolean is passed as `showBorder`; respect it when rendering a custom frame. The host also hides border colors on buttons, elements with `role="button"`, and custom wrappers marked `data-bb-extension-button`. Window content and keyboard focus outlines retain their own styles. Extension cards can be filtered by name, purpose, and enabled status; their settings expand on demand or when selected from Settings search.

```tsx
export default function MyExtension({ iconSize, slotSize, showLabels = true }) {
  return <button aria-label="Open my extension" style={{ minWidth: slotSize, height: slotSize }}>
    <svg aria-hidden="true" width={iconSize} height={iconSize} viewBox="0 0 24 24">{/* icon */}</svg>
    {showLabels && <span data-bb-extension-label>My extension</span>}
  </button>;
}
```

```tsx
export default function MyExtension({ iconSize, slotSize }) {
  return <button style={{ width: slotSize, height: slotSize }}>
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24">{/* glyph */}</svg>
  </button>;
}
```

## Sample Extension

See `~/.betterbar/extensions/simple-weather/main.tsx` for a complete example that fetches weather data from Open-Meteo.

## Apps Drawer

The repository includes `extensions/apps-drawer/main.tsx`, a searchable launcher with native icons, recent launches, keyboard navigation, and refresh. Install it with:

```sh
mkdir -p ~/.betterbar/extensions/apps-drawer
cp extensions/apps-drawer/main.tsx ~/.betterbar/extensions/apps-drawer/main.tsx
```

In the dedicated **Settings → Extensions** tab, click **RELOAD**, enable **Apps Drawer**, and turn on **Show extensions**. Click the grid icon on the bar to open it. Type a name and press Enter, or use Down followed by the arrow keys to browse. Escape clears a search, then dismisses the drawer.

The Apps Drawer settings offer two layouts:

- **Library** (default): the original centered icon grid.
- **Launch panel**: a panel beside the bar, with pinned favorites and recent apps, plus a compact All apps list. Use **Edit pins** to choose favorites; the initial selection comes from the active bar set. Search always includes all installed apps.

Both layouts support Comfortable or Compact spacing, grid icon size and columns, app names, header tagline, keyboard hints, a custom accent, alphabetical or recent ordering, recent-app counts, and closing after launch or clicking outside. Launch panel can open to its home view or All apps. Preferences and pins persist under `bb-apps-drawer-settings` in local storage and synchronize between Settings and the drawer.

With **Remember size and position** enabled (the default), each layout restores its own placement across opens and app restarts. Geometry is stored separately under `bb-apps-drawer-geometry`, adapts to display scaling, and stays within the available monitor work area. **Reset window placement** restores defaults on the next open. With remembering disabled, Library centers and Launch panel follows the bar's edge. The **Open drawer** button previews the current selection.

The Apps Drawer requires a BetterBar build with `get_installed_apps` and extension-window permissions (included in this change). Installing the TSX alone on an older release is insufficient.

### Native commands

The runtime injects `React` and `invoke`. Supported imports are `react`, `marked`, `WebviewWindow` from `@tauri-apps/api/webviewWindow`, `LogicalSize` and `PhysicalPosition` from `@tauri-apps/api/dpi`, `availableMonitors` and `currentMonitor` from `@tauri-apps/api/window`, and `homeDir` and `join` from `@tauri-apps/api/path`. Other npm imports and relative files are not supported.

```tsx
declare function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;

const apps = await invoke<{ name: string; path: string; bundle_id: string }[]>("get_installed_apps");
await invoke("launch_app", { path: apps[0].path });
const icon = await invoke<string | null>("get_app_icon", { bundleId: apps[0].bundle_id });
```

`get_installed_apps` scans `/Applications`, `~/Applications`, `/System/Applications`, and `/System/Library/CoreServices/Applications`, including application groups up to three directory levels deep. It stops at each `.app` bundle, skips hidden directories, deduplicates canonical paths, and sorts by display name. It runs off the UI thread and rescans on each call. `path` is the launch target; an empty `bundle_id` means a native icon could not be resolved.

### Extension windows

Use a label beginning with `ext_` and `url: "/?ext=<extension-directory>"`. BetterBar loads the same default component with `isWindowMode: true`. Reuse the window via `WebviewWindow.getByLabel()` instead of creating duplicates. Extension windows can show, focus, hide, close, listen for events, and start dragging.

Extensions receive Tauri's `WebviewWindow` constructor directly. Developers control `decorations`, `closable`, and `titleBarStyle`; the host does not override these options. Native decorations are enabled by default. Set `decorations: false` for a borderless interface and provide an accessible close or dismiss control. Apps Drawer uses its own close button, Escape, and optional outside-click dismissal; Standup Update uses native decorations.

```tsx
const win = new WebviewWindow("ext_my_extension", {
  url: "/?ext=my-extension",
  title: "My Extension",
  decorations: true, // Set false for a custom, borderless window.
});
```

Native close destroys the window by default; extensions should recreate it on the next launch. Apps Drawer handles close requests with `preventDefault()`, saves placement, and hides the window for reuse. Extension windows can read visibility, position, size, scale, and available monitors, and listen for move and resize events. When positioning a window beside the bar, use its actual `outerSize()` so any native frame is included in the screen bounds and spacing calculations.

## BKRD Branch Explorer

`extensions/bkrd/main.tsx` turns the BKRD bar shortcut into a dedicated branch explorer. Install the folder at `~/.betterbar/extensions/bkrd/`, restart BetterBar or reload extensions, and enable **BKRD**. This requires a BetterBar build with `get_bkrd_data` and `bkrd_action`; the TSX alone cannot add the native bridge to an older build.

Click **BKRD** on the bar to browse local BKRD data. Search branches, ticket IDs, versions, commit messages, or notes; filter by clone, activity age, QA status, open MR, or notes; sort by date, branch, version, or clone. Select a branch for its commit, author, version, QA status, MR, tickets, unreleased entries, and notes. Arrow keys move through the branch list; ⌘F focuses search. Duplicate branches in different clones remain separate rows.

Ticket and MR actions open web links. **Open clone in Zed** opens the existing clone without checking out a different branch. Branch names can be copied. Notes use BKRD's existing local store and are shared across clones of a branch; deletion requires an inline confirmation. **Refresh data** requests a fresh snapshot. **Rescan clones** invalidates BKRD's discovery/enrichment caches and reloads the data; it does not fetch remotes or switch branches.

The native bridge talks only to the local BKRD service, starting it through the installed `bkrd list --json` CLI if necessary. BetterBar reads the port from `~/.bkrd/config.json` by default, or uses 1212. A custom port is available in the extension settings. No branch snapshots, tokens, or credentials are stored by BetterBar. Backend errors are shown as generic messages; failed refreshes retain the previous in-memory snapshot. Unavailable MR data is distinguished from a branch without an open MR.

Filters and sort choices persist. Refresh is manual by default; optional 30-second, 1-minute, and 5-minute refreshes run only while the explorer is visible. The previous terminal shortcut remains available in extension settings, including its saved `bb-bkrd-command` and BetterBar's default terminal.

## Owned app shortcuts

`extensions/timesheets/main.tsx` and `extensions/floatnote/main.tsx` provide bar buttons for the locally installed apps. Copy each folder into `~/.betterbar/extensions/`, restart BetterBar or reload extensions, and enable them in Settings → Extensions.

- **Timesheets** uses `invoke("open_timesheets")` to open the entry popup in `/Applications/TimesheetAlertComments.app`. BetterBar starts the app if needed, then immediately delivers its existing `TimesheetTriggerAlert` notification. This avoids the CLI exiting before a queued notification is sent. Opening the popup does not submit an entry.
- **Floatnote** uses `invoke("open_floatnote")` to launch `~/.floatnote/Floatnote.app` and press its existing tray button through macOS Accessibility. Its normal reopen path reveals an existing window; if it has been closed, BetterBar uses the tray action to recreate it. Restoring a closed Floatnote window requires Accessibility access. The shortcut reports that requirement if access is denied.

Both buttons follow the bar's icon sizing and expose launch errors in their tooltips. These shortcuts require a BetterBar build containing `open_timesheets` and `open_floatnote`.

## Replacing native features

The bundled `time`, `media`, and `power` extensions replace the corresponding native clocks, music, and battery widgets whenever their directories are installed. They retain those features' bar positions and section styling and appear only once. Their toggles and settings live in Settings → Extensions; duplicate native switches and clock editing are hidden. Disabling an installed extension hides its feature rather than reactivating the native widget. Native widgets are available only when the replacement is uninstalled.

### Independent placement

Every extension is an independent bar item, including Time, Media, and Power. Settings → Bar items has a single **Bar order** list for extensions, pinned apps, native features, and flexible space. Drag a row, use its arrows, or choose a position. On the bar, hold **⌘** and drag any item; application icons can also be dragged normally. An extension can go before or after any other feature, or between individual pinned app icons. Settings → Extensions → **Arrange bar items** opens this list.

The order persists under `betterbar_config.barOrder`. Stable IDs use `extension:<encoded-directory>` and `app:<encoded-set>:<encoded-item>` alongside native feature IDs. Existing `sectionOrder` layouts seed this list once, expanding the old Extensions and Pinned groups. Replacement extensions start at their former native positions. Hidden items keep their slots, registry reloads do not shuffle them, temporarily uninstalled extensions retain their positions, and new extensions get their own slots. App identities are scoped to their sets so rearranging one set preserves the others.

Legacy per-section padding and scaling continue to apply to their original feature or extension; moving a widget does not change its styling. Per-extension appearance stays keyed by directory. Extensions do not need to implement dragging themselves: the host handles movement and reserves ordinary widget clicks and controls for the extension.

On first discovery, BetterBar carries each native feature's visibility into its extension toggle and records that migration in `betterbar_config.extensionReplacements`. Later choices are respected, including after reloads and restarts. Clock lists, other extensions, and section order are preserved. Reloading extensions updates all BetterBar windows.

### Time

Install `extensions/time/main.tsx` at `~/.betterbar/extensions/time/main.tsx`. Settings → Extensions → Time supports adding, editing, removing, and reordering clocks, with timezone validation and suggestions. The existing `betterbar_config.clocks` list is retained; an empty list stays empty.

Display controls include 12/24-hour time, seconds, AM/PM, labels, dates, adaptive/stacked/inline layout, text sizes, weight, spacing, and separators, with a live preview. They synchronize between windows and persist separately under `bb-time-settings`. Reset display options leaves the user's clock list intact. Colors, opacity, and overall size use the shared extension Appearance controls.

`extensions/media/main.tsx` and `extensions/power/main.tsx` contain the corresponding replacement widgets and use the same shared appearance controls.

## Apple Calendar

Install `extensions/apple-calendar/main.tsx` at `~/.betterbar/extensions/apple-calendar/main.tsx`, reload extensions, and enable **Apple Calendar**. Its button opens a decorated agenda window with today or the next 3, 7, 14, or 31 days, a calendar filter, refresh, and **Open Calendar**. It reuses an existing window and can be closed normally.

Choose **Connect calendars** to request macOS Calendar access. Access is never requested automatically at launch. The extension uses native EventKit through `get_apple_calendar_status`, `request_apple_calendar_access`, `get_apple_calendar_agenda`, and `open_apple_calendar`. It reads times and calendar names; titles are read only when **Show event titles** is enabled. Notes, attendees, locations, meeting links, and account identifiers are not read. Event data is held in memory, never logged or saved in preferences. Only the date range, title visibility, and selected calendar ID are saved locally. The native response is limited to 200 upcoming events and reports when that limit is reached. BetterBar supplies Calendar usage descriptions for both current and older macOS permission APIs.

## Focus Timer

Install `extensions/focus-timer/main.tsx` and enable **Focus Timer**. The decorated timer window has focus/break modes, start/pause/resume/reset, and a next-session action after completion. Configure focus duration from 1–120 minutes and break duration from 1–60 minutes. Duration changes apply to new sessions. Session state is local, uses a wall-clock deadline, and survives sleep, window close, and app restarts. It does not record task names or work history. Optional bar text follows the shared label setting.

## System Monitor

Install `extensions/system-monitor/main.tsx` and enable **System Monitor**. Show CPU, memory, or both; optionally show a CPU graph; choose a 2, 5, 10, or 30 second refresh. Click to open Activity Monitor. Metrics come from local CPU counters and macOS memory statistics; no process names, account data, or app activity are queried. Graph samples stay in memory. Memory is the sum of active, wired, and compressed pages and may differ from other tools' definitions of used memory. Labels follow the shared setting while the graph/icon remains visible.
