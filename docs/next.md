# BetterBar next

`next` combines the taskbar from `feat/independent-bar-items` with the Settings
window from `macos-native-ui`. Existing local work and local-only extensions are
preserved. The macOS experiment's taskbar redesign and layout preset are omitted.

Settings has a compact sidebar, macOS system typography, SF Symbols rendered by
AppKit, native traffic lights, a draggable title area, sidebar material, aligned
preference rows, segmented controls, switches, and keyboard-accessible dialogs.
The webview controls remain React/HTML.

Style → Window appearance offers Automatic, Light, and Dark. The preference
persists as `settingsAppearance` and applies to Settings and all extension
windows, including native title bars. Style → Bar colors and effects retains the existing taskbar customization controls. Settings search
opens that disclosure when a matching bar appearance control is selected.
Shared native colors are scoped to `.bb-native-surface` and Settings layout to
`.bb-settings`; the existing taskbar palette, IBM Plex Mono typography, scanlines,
icon chrome, layout, and per-extension color overrides
remain available. Window entry points load independently to avoid loading the
Settings UI and its stylesheet in the taskbar window.

## Run and test

```sh
npm ci
npx playwright install chromium webkit
npm run test:unit
npm run test:typecheck
npm run test:e2e
npm run test:performance
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

`npm run test:all` runs the portable unit suite, type checks, production build,
all browser scenarios, performance budgets, and Rust tests. The Chromium project
uses an installed Chrome on macOS when available; CI uses Playwright’s Chromium.
Set `PLAYWRIGHT_CHROME_CHANNEL` to override that choice. `npm run test:extensions`
additionally runs the pre-existing
local extension tests; those require the user's local extension sources and are
not part of clean-checkout CI.

```sh
npm run tauri -- dev
npm run tauri -- build --bundles app
```

The build produces `src-tauri/target/release/bundle/macos/BetterBar.app`. These
commands do not install the app over `/Applications/BetterBar.app`.

## Coverage and limits

- Unit coverage: configuration migration, persistence, taskbar theme isolation,
  appearance editor updates, native listener cleanup, shared symbol requests and
  retries, CSS scoping, native window permissions, and clean-checkout auditing.
- Browser scenarios in Chromium and WebKit: sidebar keyboard navigation, all
  settings tabs, restart persistence, search and disclosures, disabled layout
  controls, dimensions, extensions, reset focus trapping/cancellation/confirmation,
  720px layouts, reduced motion, Light/Dark/system appearance, native API failure
  fallbacks, taskbar styling, and settings-to-taskbar storage synchronization.
- Performance budgets against the production build: Settings interactive in
  2 seconds, under 1 MB of uncompressed JavaScript, search results within 200 ms,
  and tab transitions within 250 ms. JSON measurements are attached to the report.
  IPC assertions prevent repeated symbol rendering, appearance refreshes on bar
  size edits, and continuous app queries when the app list is empty.
- Rust tests exercise real AppKit symbol rendering and macOS accessibility
  preferences. Existing native tests run alongside them.

Browser tests run the real built frontend using Tauri's official IPC/window mocks
and synthetic extensions. They do not automate the installed application,
permission dialogs, native screen reservations, or the AppKit titlebar/material.
Inspect native chrome in the built app for platform-specific visual validation.
Screenshots, traces on failure, and performance measurements are available in
`playwright-report/` and `test-results/`; CI uploads these as artifacts.

The Tests GitHub Actions workflow runs on macOS for pull requests and `next`
pushes. Builds and portable tests do not require installed private extensions.


## Standup and app labels

The local Standup Update extension has a reading layout, Refresh (⌘R), Copy
Markdown, last-update feedback, and retry/empty states. Failed refreshes keep the
previous note visible. Source remains in the local extension registry; its unit
and browser checks use synthetic notes and skip when local source is unavailable.

The Show labels switch controls both pinned and running apps. Explicit per-item
Icon / Icon + Label / Label choices retain precedence. With the settings cog
hidden, ⌘, opens Settings while the taskbar is focused.
