# BetterBar

A customizable macOS dock alternative. Brutalist terminal aesthetic, native performance.

Replace your macOS Dock with a minimal, monospace bar that shows pinned apps, running apps, music controls, world clocks, battery status, simulator launchers, macOS Spaces, and third-party extensions — all in a frameless window that respects your screen real estate via the same private CoreGraphics API the system Dock uses.

## Features

**App Dock**
- Pinned app icons with drag-reorder, hide/rename, and per-icon display modes (icon, icon+label, label-only)
- Running apps section showing unpinned apps with rich right-click actions (focus, hide, quit, show all windows, maximize)
- Native app icons, 2-letter glyphs, or built-in device icon set
- Window preview thumbnails on hover (requires Screen Recording permission)

**Bar Customization**
- **Position**: top, bottom, left, or right edge
- **Thickness**: 48–200px slider
- **Free-floating mode**: detach from edge and position anywhere on screen
- **Bar length**: edge-span, auto shrink-wrap, or custom pixel length
- **Section order**: drag-reorder any bar section (pinned, running, music, clock, etc.)
- **Per-section toggles**: show/hide each section independently
- **Transparent background** with backdrop blur
- **Content scale**: 0.5–2.0x for all UI text and indicators

**Music Controls**
- Now-playing display for Spotify and Music.app
- Play/pause, next, previous controls
- Click to focus the player

**World Clock**
- Multi-timezone display (configurable, up to 6 zones)
- 24-hour tabular numerals, automatic 1-minute tick

**Battery Indicator**
- Percentage with charging state
- Color-coded: accent (>20%), amber (11–20%), red (≤10%)

**Simulator Launcher**
- Quick-launch iOS, iPadOS, Android, and Windows simulators
- Configurable which devices appear

**macOS Spaces**
- Enumerate and switch between macOS Spaces
- Landscape rectangle indicators with active-space highlight

**Extension API**
- Third-party React components as bar sections
- Place a `.tsx` file in `~/.betterbar/extensions/<name>/main.tsx` — no build step required
- Access to CSS custom properties for consistent styling

**Settings Window**
- Native macOS window with all configuration options
- Changes sync live between settings and bar
- Item management (rename, hide/show, reorder)

**Screen Space Reservation**
- Uses `CGSSetScreenInsets` (the same private API the Dock uses) so maximized windows don't overlap the bar
- Automatic cleanup on quit

## Installation

### Via Homebrew (Recommended)

```bash
brew install josmanvis/betterbar/betterbar
```

Or via two-step tap:

```bash
brew tap josmanvis/betterbar
brew install --cask betterbar
```

### From Release

Download the latest `.dmg` or `.tar.gz` from the [GitHub Releases](https://github.com/josmanvis/betterbar/releases) page.

### From Source

#### Prerequisites

- macOS 13.0+
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) with the macOS target (`rustup target add aarch64-apple-darwin` or `rustup target add x86_64-apple-darwin`)

```bash
git clone https://github.com/josmanvis/betterbar.git
cd betterbar
npm install
npm run tauri dev
```

### Build for Production

```bash
npm run tauri build
# Installs to /Applications:
npm run build-and-install
```

## Configuration

The bar is configured entirely through the **Settings** window (click the `[BB]` cog on the bar, or right-click the bar and select *BetterBar Settings…*).

Key configuration is persisted to `localStorage` and synced across windows via `StorageEvent`.

### Bar Position & Appearance

| Setting | Options | Default |
|---------|---------|---------|
| Position | bottom, left, right, top | left |
| Bar Size | 48–200px | 68px |
| Free Float | on/off | off |
| Bar Length Mode | edge, auto, custom | custom |
| Icon Style | auto (native), glyph | auto |
| Transparent BG | on/off | off |
| Accent Color | hex color | `#c5f500` |
| Content Scale | 0.5–2.0 | 1.0 |

### Section Toggles

Each bar region can be independently enabled/disabled and reordered via drag:

- **Terminal** — inline command launcher
- **Pinned Apps** — your pinned dock items
- **Running Apps** — unpinned running apps (requires Accessibility permission)
- **Extensions** — third-party extension components
- **Spaces** — macOS Spaces switcher
- **World Clock** — multi-timezone clocks
- **Music** — now-playing indicator and controls
- **Battery** — battery percentage indicator
- **Set Switcher** — app set tabs
- **Simulators** — device simulator quick-launch
- **Cog** — settings button

### Permissions

- **Accessibility** — required for running apps section (focus/hide/zoom windows)
- **Screen Recording** — required for window preview thumbnails on hover

BetterBar will prompt for these automatically when needed.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Tauri v2                        │
│  ┌──────────────────────┐  ┌──────────────────┐  │
│  │   React (Vite + TS)  │  │  Rust backend     │  │
│  │                      │  │                   │  │
│  │  DockBar.tsx         │  │  39 commands      │  │
│  │  DockIcon.tsx        │  │  (app mgmt,       │  │
│  │  SettingsApp.tsx     │  │   music, spaces,  │  │
│  │  SpacesIndicator.tsx │  │   screen insets,  │  │
│  │  MusicIndicator.tsx  │  │   window mgmt)    │  │
│  │  BatteryIndicator.tsx│  │                   │  │
│  │  WorldClock.tsx      │  │  strictOverlap    │  │
│  │  TerminalInput.tsx   │  │  background thread│  │
│  │  WindowPreview.tsx   │  │                   │  │
│  │                      │  │  dlsym CGS APIs   │  │
│  │  6 polling hooks     │  │  (screen insets,  │  │
│  │  (apps, music,       │  │   spaces, window  │  │
│  │   battery, windows)  │  │   level, etc.)    │  │
│  └──────────────────────┘  └──────────────────┘  │
│         │  invoke("command")  │                    │
│         └─────────────────────┘                    │
└──────────────────────────────────────────────────┘
```

### Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Framer Motion
- **Backend**: Rust, Tauri v2, objc/cocoa/core-foundation for macOS APIs
- **State**: `localStorage` + React hooks (no external state library)
- **Build**: Vite 7, esbuild (for extension transpilation)

### Private macOS APIs (dlsym)

BetterBar uses `dlsym(RTLD_DEFAULT, ...)` to resolve private CGS functions at runtime rather than linking against the SkyLight framework:

| Symbol | Purpose |
|--------|---------|
| `CGSMainConnectionID` | Get the CGS connection for the current process |
| `CGSSetScreenInsets` | Reserve screen space (same API as the Dock) |
| `CGSCopyManagedDisplaySpaces` | Enumerate Spaces with their actual workspace IDs |
| `CGSGoToSpace` / `CGSSetWorkspace` | Switch to a specific Space |

## Extensions

BetterBar supports third-party React components as bar sections. See [`EXTENSIONS.md`](EXTENSIONS.md) for the full API.

Quick start:

```bash
mkdir -p ~/.betterbar/extensions/my-ext
cat > ~/.betterbar/extensions/my-ext/main.tsx << 'EOF'
export const name = "My Ext";
export default function MyExtension() {
  return <span style={{ color: "var(--bb-accent)" }}>EXT</span>;
}
EOF
```

Then enable it in Settings → Content → Extensions.

## Development

```bash
# Start dev server (Vite + Tauri)
npm run tauri dev

# Type check
npx tsc --noEmit

# Build frontend only
npm run build

# Build Tauri app
npm run tauri build
```

The Vite dev server runs on port **1420** with HMR on port **1421**.

## Changelog

See [`history.md`](history.md) for the full changelog.

## License

MIT
