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

## File Structure

```
~/.betterbar/extensions/
  my-extension/
    main.tsx        # ← extension entry point (required)
```

## API

### Default Export (required)

Your default export must be a React component. On the bar it receives `isVertical`, `config`, `barSize`, `iconSize`, and `slotSize`. In an extension window it receives `isWindowMode: true`.

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

## Owned app shortcuts

`extensions/timesheets/main.tsx` and `extensions/floatnote/main.tsx` provide bar buttons for the locally installed apps. Copy each folder into `~/.betterbar/extensions/`, restart BetterBar or reload extensions, and enable them in Settings → Extensions.

- **Timesheets** uses `invoke("open_timesheets")` to open the entry popup in `/Applications/TimesheetAlertComments.app`. BetterBar starts the app if needed, then immediately delivers its existing `TimesheetTriggerAlert` notification. This avoids the CLI exiting before a queued notification is sent. Opening the popup does not submit an entry.
- **Floatnote** uses `invoke("open_floatnote")` to launch `~/.floatnote/Floatnote.app` and press its existing tray button through macOS Accessibility. Its normal reopen path reveals an existing window; if it has been closed, BetterBar uses the tray action to recreate it. Restoring a closed Floatnote window requires Accessibility access. The shortcut reports that requirement if access is denied.

Both buttons follow the bar's icon sizing and expose launch errors in their tooltips. These shortcuts require a BetterBar build containing `open_timesheets` and `open_floatnote`.

## Replacing native features

The bundled `time`, `media`, and `power` extensions replace the corresponding native clocks, music, and battery widgets whenever their directories are installed. They retain those features' bar positions and section styling and appear only once. Their toggles and settings live in Settings → Extensions; duplicate native switches and clock editing are hidden. Disabling an installed extension hides its feature rather than reactivating the native widget. Native widgets are available only when the replacement is uninstalled.

On first discovery, BetterBar carries each native feature's visibility into its extension toggle and records that migration in `betterbar_config.extensionReplacements`. Later choices are respected, including after reloads and restarts. Clock lists, other extensions, and section order are preserved. Reloading extensions updates all BetterBar windows.

### Time

Install `extensions/time/main.tsx` at `~/.betterbar/extensions/time/main.tsx`. Settings → Extensions → Time supports adding, editing, removing, and reordering clocks, with timezone validation and suggestions. The existing `betterbar_config.clocks` list is retained; an empty list stays empty.

Display controls include 12/24-hour time, seconds, AM/PM, labels, dates, adaptive/stacked/inline layout, text sizes, weight, spacing, and separators, with a live preview. They synchronize between windows and persist separately under `bb-time-settings`. Reset display options leaves the user's clock list intact. Colors, opacity, and overall size use the shared extension Appearance controls.

`extensions/media/main.tsx` and `extensions/power/main.tsx` contain the corresponding replacement widgets and use the same shared appearance controls.
