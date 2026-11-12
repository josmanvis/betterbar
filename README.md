# BetterBar

A customizable dock alternative for macOS and Linux. Brutalist terminal aesthetic, native performance.

Replace your Dock with a minimal, monospace bar that shows pinned apps, running apps, music controls, world clocks, battery status, simulator launchers, workspaces, and third-party extensions — all in a frameless window that reserves its own screen real estate.

On macOS it uses the same private CoreGraphics API the system Dock uses. On Linux it uses the freedesktop.org equivalents: XDG desktop entries, the icon theme spec, MPRIS over D-Bus, sysfs and NetworkManager. See [Linux support](#linux-support) for what differs.

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
- BKRD Branch Explorer: searchable branch and clone data, QA/MR status, tickets, and local notes in a dedicated window

**Settings Window**
- Native macOS window with all configuration options
- Changes sync live between settings and bar
- Item management (rename, hide/show, reorder)
- Search settings with ⌘F, or filter extensions by name, purpose, and enabled status
- Expand an extension's Settings to customize it; Appearance includes label and border overrides
- Hide app frames in **Icons → Icon Box → Show icon borders**; hide widget frames in **Extensions → Show extension borders**

**Screen Space Reservation**
- macOS: uses `CGSSetScreenInsets` (the same private API the Dock uses) so maximized windows don't overlap the bar
- Linux/X11: uses `_NET_WM_STRUT_PARTIAL`, the EWMH property every Linux panel uses
- Automatic cleanup on quit

## Installation

### macOS: Via Homebrew (Recommended)

```bash
brew install josmanvis/betterbar/betterbar
```

Or via two-step tap:

```bash
brew tap josmanvis/betterbar
brew install --cask betterbar
```

### Linux

Install the package for your distribution from the [GitHub Releases](https://github.com/josmanvis/betterbar/releases) page:

```bash
# Fedora / RHEL / openSUSE
sudo dnf install ./BetterBar-*.rpm

# Debian / Ubuntu
sudo apt install ./BetterBar_*.deb
```

Both packages recommend `wmctrl`, `xdotool` and `xorg-x11-utils`/`x11-utils`, which the
window-management features use on X11. They are optional on Wayland, where those
features are unavailable regardless (see [Linux support](#linux-support)).

### From Release

Download the latest `.dmg` or `.tar.gz` (macOS), or `.rpm`/`.deb` (Linux), from the [GitHub Releases](https://github.com/josmanvis/betterbar/releases) page.

### From Source

#### Prerequisites

**macOS**

- macOS 13.0+
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) with the macOS target (`rustup target add aarch64-apple-darwin` or `rustup target add x86_64-apple-darwin`)

**Linux**

- [Node.js](https://nodejs.org/) 18+ and [Rust](https://rustup.rs/)
- GTK 3 and WebKitGTK 4.1 development packages, plus the usual Tauri prerequisites:

```bash
# Fedora
sudo dnf install webkit2gtk4.1-devel gtk3-devel openssl-devel \
    librsvg2-devel libappindicator-gtk3-devel patchelf

# Debian / Ubuntu
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libssl-dev \
    librsvg2-dev libayatana-appindicator3-dev patchelf
```

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

### Repair macOS permission access

Open **Settings → Permissions** to check Accessibility, Screen Recording, and the app's code signature. **Re-sign & restart** prepares a verified local signature, restarts BetterBar, and returns to this panel. If access is still denied, remove BetterBar from the corresponding list in **System Settings → Privacy & Security**, add the installed app again, and enable access.

The repair preserves bar settings and extensions and does not reset or grant macOS permissions. It is available for locally signed or unsigned builds in a writable app folder. Certificate-signed builds must be reinstalled with the same developer's signature. Repair details are saved to `~/Library/Caches/com.betterbar.app/signature-repair.log`.

Source builds sign the complete app bundle locally by default. Local signatures can still require new permission grants when the executable changes; use a consistent developer signing identity across releases for a lasting identity. See [Apple's code signing guidance](https://developer.apple.com/library/archive/technotes/tn2206/_index.html).

## Configuration

The bar is configured entirely through the **Settings** window (click the `[BB]` cog on the bar, or right-click the bar and select *BetterBar Settings…*).

Key configuration is persisted to `localStorage` and synced across windows via `StorageEvent`.

Use **Search settings** or **⌘F** to find controls, including installed extensions. Select a result to open its tab and highlight the matching setting. **Style → Active app** offers edge, halo, spotlight, soft tile, underline, lift, and no highlight, with strength, optional pulse, and inactive-app dimming. Motion respects Reduce Motion. **Extensions → Show extension labels** applies across bundled extensions, with a per-extension override under Appearance.

### Bar Position & Appearance

| Setting | Options | Default |
|---------|---------|---------|
| Position | bottom, left, right, top | left |
| Bar Size | 24–200px | 68px |
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
- **Backend**: Rust, Tauri v2; objc/cocoa/core-foundation on macOS, freedesktop.org interfaces on Linux (see `src-tauri/src/linux.rs`)
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

## Linux support

Linux is supported as a first-class target. The platform backend lives in
`src-tauri/src/linux.rs` and mirrors the `macos` module's API, so the Tauri
command layer dispatches to whichever platform it was built for. Where macOS
uses a bundle identifier, Linux uses the XDG desktop-entry ID
(`org.gnome.Nautilus`), which is also what matches a window's `StartupWMClass`.

### What maps to what

| Feature | macOS | Linux |
|---------|-------|-------|
| Installed / running apps | `NSWorkspace`, `/Applications` scan | XDG desktop entries + `/proc` |
| App icons | `NSWorkspace` icon API | freedesktop icon theme spec |
| Launching apps | `NSWorkspace` / `open -a` | `gio launch` on the desktop entry |
| Quit app | AppleScript | `SIGTERM` to the app's processes |
| Music controls | AppleScript to Spotify / Music.app | MPRIS over D-Bus (any player) |
| Battery | IOKit | `/sys/class/power_supply` |
| System metrics | `host_statistics` | `/proc/stat`, `/proc/meminfo` |
| Wi-Fi status | CoreWLAN | NetworkManager + `/proc/net/wireless` |
| Keep awake | `caffeinate` | `systemd-inhibit` |
| Open at login | Login Items | `~/.config/autostart` entry |
| Screen space | `CGSSetScreenInsets` | `_NET_WM_STRUT_PARTIAL` (X11 only) |
| Workspaces | `CGSCopyManagedDisplaySpaces` | EWMH desktop list (X11 only) |
| Window list / focus / minimize | Accessibility API | `wmctrl` / `xdotool` (X11 only) |
| Permission prompts | TCC (Accessibility, Screen Recording) | not applicable; no prompts |
| Updates | `.dmg` / `.tar.gz` asset | `.rpm` / `.deb` / AppImage asset |

### X11 vs Wayland

**On Linux the bar runs on the X11 backend by default**, through XWayland when the
session is Wayland. This is deliberate: a dock has to place its own window at a
screen edge and reserve that edge, and Wayland offers a client neither. There is
no way to set a surface's position, and the only space-reservation protocol,
`wlr-layer-shell`, is not implemented by GNOME's Mutter. `main()` therefore sets
`GDK_BACKEND=x11` when `DISPLAY` is available.

Set `BETTERBAR_WAYLAND=1` (or `GDK_BACKEND=wayland`) to run as a native Wayland
window instead. The bar then cannot be positioned or dock to an edge — it is
placed wherever the compositor puts it — so this is only useful for debugging.

The settings window is also created at runtime on Linux rather than taken from
`tauri.conf.json`, because that window is declared transparent for macOS's
vibrancy material and a transparent GTK window is given no decorations at all,
leaving no titlebar and no way to close it. The runtime window is opaque and
decorated, and closing it hides it, matching macOS.

### Appearance

The settings window's sidebar is translucent so that macOS can show an
`NSVisualEffectView` through it. Linux has no such view, and no compositor lets
a client blur what is behind its own window, so the material is drawn inside the
page: the window carries a soft accent wash and the sidebar blurs it with
`backdrop-filter`, giving a real frosted panel rather than a flat fill.

Desktop preferences are read from GNOME and applied to that window:
`accent-color` (mapped to the hex GNOME ships for each named colour),
`color-scheme` for light/dark, `enable-animations` for reduced motion, and
`high-contrast`, which stands in for macOS's "reduce transparency" and turns the
material off. Dark mode has to be applied explicitly because WebKitGTK does not
inherit the desktop's preference on its own.

Everything above works on X11. On Wayland the following are unavailable, and the
app reports that rather than failing silently:

- **Screen space reservation.** Only `wlr-layer-shell` can reserve edge space,
  and GNOME's Mutter does not implement it. The bar floats above windows
  instead of shrinking the maximized area.
- **Window enumeration, focusing and minimizing.** Wayland deliberately gives
  clients no way to see or control other apps' windows. GNOME's
  `org.gnome.Shell.Introspect.GetWindows` exists but denies unprivileged
  callers (`AccessDenied`), so it needs a GNOME Shell extension to bridge it.
- **Workspace switching.** Same reason: no client-visible workspace protocol.

Quitting an app still works on Wayland, because it is done by signalling the
process rather than by asking the compositor. Music controls also work, because
MPRIS `Raise()` lets the *player* ask to be activated.

### Not ported

- **iOS/iPadOS/watchOS simulators** need Xcode. The Android emulator is
  supported on Linux; other simulator types return a clear error.
- **Apple Calendar agenda.** The macOS build talks to EventKit; `open_apple_calendar`
  opens GNOME Calendar on Linux, but the agenda itself is not wired to
  Evolution Data Server.
- **Window hover previews.** Screen capture on Wayland requires per-session
  xdg-desktop-portal consent, which is unusable for hover thumbnails, so
  `check_screen_recording` reports `false` and previews stay off.
- **Code signature repair.** Linux builds are not code signed; the Settings
  panel reports there is nothing to verify.

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
