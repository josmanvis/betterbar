import React from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { availableMonitors, currentMonitor } from "@tauri-apps/api/window";
import { useDragSource } from "@betterbar/api";

// Provided by BetterBar's extension runtime.
declare function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;

export const name = "Drawer";
export const version = "1.1.0";
const WINDOW = "ext_apps_drawer";
const RECENTS_KEY = "bb-apps-drawer-recents";
const PREFS_KEY = "bb-apps-drawer-settings";
const PREFS_EVENT = "bb-apps-drawer-settings-changed";
const GEOMETRY_KEY = "bb-apps-drawer-geometry";
const GEOMETRY_ACTIVE_KEY = "bb-apps-drawer-active-layout";
const GEOMETRY_RESET_KEY = "bb-apps-drawer-geometry-reset";
const GEOMETRY_OPENING_KEY = "bb-apps-drawer-opening";
const strings = {
  title: "Drawer", windowTitle: "Drawer — BetterBar", subtitle: "YOUR MAC, WITHIN REACH", open: "Open Drawer",
  search: "Search apps and folders", placeholder: "Search apps and folders…", clear: "Clear search",
  all: "All items", recent: "Recent", refresh: "Refresh applications", close: "Close Drawer",
  loading: "Finding your apps…", empty: "No matching items", emptyHint: "Try a different name.",
  noRecent: "Your next launch starts here", recentHint: "Apps and folders you open from Drawer will appear here.",
  noApps: "No applications found", retry: "Try again", failed: "Could not load applications.",
  openFailed: "Could not open the drawer. Try again.", launchFailed: "Could not open this item. It may have moved or been removed.",
  closeFailed: "Could not close the drawer. Try again.",
  dragFailed: "Could not drag this item. Try again.",
  installed: "items", results: "results", enter: "open", escape: "close", navigate: "navigate",
  settings: "Browse apps and folders, add folders with the + Folder button, and press Enter to open. Escape clears search or closes Drawer.",
  layout: "Drawer layout", library: "Library", panel: "Launch panel",
  libraryHint: "A spacious icon grid in a centered window.",
  panelHint: "Pinned favorites and an app list, opening beside your bar.",
  density: "Spacing", comfortable: "Comfortable", compact: "Compact",
  showRecent: "Show recent items", showRecentHint: "Keep recently opened apps and folders within reach.",
  dismiss: "Dismiss when clicking outside", dismissHint: "Keep the drawer open by turning this off.",
  preview: "Open drawer", pinned: "Pinned", managePins: "Edit pins", done: "Done",
  pin: "Pin", unpin: "Unpin", pinHint: "Choose your favorites with Edit pins.",
  pinsHint: "Pin apps and folders to your Launch panel. Removing a folder only removes its shortcut.",
  settingsError: "Could not save your drawer preferences. Try again.",
  appearance: "Appearance", behavior: "Behavior", window: "Window",
  iconSize: "Grid icon size", automatic: "Automatic", columns: "Grid columns",
  showLabels: "Show item names", labelsHint: "Keep names visible below grid icons.",
  showSubtitle: "Show header tagline", subtitleHint: "Display the small tagline next to Drawer.",
  showFooter: "Show keyboard hints", footerHint: "Display item counts and keyboard shortcuts at the bottom.",
  followAccent: "Follow bar accent", accentHint: "Use BetterBar’s accent, or choose a color just for the drawer.",
  customAccent: "Drawer accent", sort: "Item order", alphabetical: "Alphabetical", recentlyOpened: "Recently opened",
  recentLimit: "Recent items shown", panelStart: "Launch panel opens to",
  closeOnLaunch: "Close after opening", closeOnLaunchHint: "Dismiss Drawer when you open an app or folder.",
  rememberWindow: "Remember size and position", rememberHint: "Keep your window placement across opens and app restarts, separately for each layout.",
  resetWindow: "Reset window placement", resetWindowHint: "Use the default size and position the next time this layout opens.",
  resetDone: "Window placement reset.", clearRecents: "Clear recent items", recentsCleared: "Recent items cleared.",
  shortcut: "Double-tap Command to toggle", shortcutHint: "Press and release ⌘ twice quickly to show or hide Drawer from any app. Requires BetterBar Accessibility access.",
  shortcutOpen: "Toggle Drawer · double-tap ⌘", shortcutPermission: "Double-tap ⌘ needs BetterBar Accessibility access. Click to open the drawer.",
  shortcutFailed: "Could not register double-tap ⌘. Click to open the drawer.", accessibility: "Accessibility settings",
  folders: "Folders", addFolder: "+ Folder", addFolderLabel: "Add folders", removeFolder: "Remove folder",
  noFolders: "Keep your folders within reach", foldersHint: "Add folders to open them in Finder. Folders pinned to your active bar set appear here too.",
  folderFailed: "Could not add folders. Try again.", folder: "Folder",
};

type App = { name: string; path: string; bundle_id: string; kind?: "folder" };
type Folder = { name: string; path: string };
type Preferences = {
  layout: "library" | "panel"; density: "comfortable" | "compact"; showRecent: boolean; dismissOnBlur: boolean; pins: string[];
  iconSize: number; columns: number; showLabels: boolean; showSubtitle: boolean; showFooter: boolean;
  followAccent: boolean; accentColor: string; sort: "name" | "recent"; recentLimit: number;
  closeOnLaunch: boolean; rememberWindow: boolean; panelStart: "home" | "all";
  doubleTapCommand: boolean; folders: Folder[];
};
type WindowGeometry = {
  x: number; y: number; width: number; height: number; scale: number;
  screen: { name: string | null; x: number; y: number } | null;
};

function numberChoice(value: unknown, choices: number[], fallback: number) {
  return typeof value === "number" && choices.includes(value) ? value : fallback;
}

function validFolders(value: unknown): Folder[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is Folder => {
    if (!item || typeof item.name !== "string" || !item.name.trim() || typeof item.path !== "string"
      || !item.path.startsWith("/") || seen.has(item.path)) return false;
    seen.add(item.path); return true;
  }).map(({ name, path }) => ({ name, path }));
}

function barFolders(): Folder[] {
  try {
    const config = JSON.parse(localStorage.getItem("betterbar_config") || "{}");
    const set = config.sets?.find((set: { id: string }) => set.id === config.activeSetId);
    return validFolders((set?.items || []).filter((item: { kind?: string; hidden?: boolean }) => item.kind === "folder" && !item.hidden));
  } catch { return []; }
}

function drawerFolders(preferences: Preferences): App[] {
  return validFolders([...barFolders(), ...preferences.folders])
    .map(folder => ({ ...folder, bundle_id: "", kind: "folder" }));
}

function readPreferences(): Preferences {
  let value: Partial<Preferences> = {};
  try { value = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch {}
  let initialPins: string[] = [];
  try {
    const config = JSON.parse(localStorage.getItem("betterbar_config") || "{}");
    const set = config.sets?.find((set: { id: string }) => set.id === config.activeSetId);
    initialPins = (set?.items || []).filter((item: { hidden?: boolean; path?: string }) => !item.hidden && typeof item.path === "string")
      .map((item: { path: string }) => item.path).slice(0, 12);
  } catch {}
  return {
    layout: value.layout === "panel" ? "panel" : "library",
    density: value.density === "compact" ? "compact" : "comfortable",
    showRecent: value.showRecent !== false, dismissOnBlur: value.dismissOnBlur !== false,
    pins: Array.isArray(value.pins) ? [...new Set(value.pins.filter((path): path is string => typeof path === "string"))] : initialPins,
    iconSize: numberChoice(value.iconSize, [0, 32, 40, 46, 56, 64], 0),
    columns: numberChoice(value.columns, [0, 3, 4, 5, 6, 7, 8], 0),
    showLabels: value.showLabels !== false, showSubtitle: value.showSubtitle !== false, showFooter: value.showFooter !== false,
    followAccent: value.followAccent !== false,
    accentColor: typeof value.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(value.accentColor) ? value.accentColor : "#00f0ff",
    sort: value.sort === "recent" ? "recent" : "name",
    recentLimit: numberChoice(value.recentLimit, [4, 6, 8, 12], 4),
    closeOnLaunch: value.closeOnLaunch !== false, rememberWindow: value.rememberWindow !== false,
    panelStart: value.panelStart === "all" ? "all" : "home",
    doubleTapCommand: value.doubleTapCommand !== false,
    folders: validFolders(value.folders),
  };
}

function initialTab(preferences = readPreferences()) {
  return preferences.layout === "panel" ? preferences.panelStart : "all";
}

function readGeometry(layout: Preferences["layout"]): WindowGeometry | null {
  try {
    const value = JSON.parse(localStorage.getItem(GEOMETRY_KEY) || "{}")[layout];
    if (!value || ![value.x, value.y, value.width, value.height, value.scale].every(Number.isFinite)
      || value.width < 380 || value.height < 360 || value.width > 10000 || value.height > 10000 || value.scale <= 0 || value.scale > 8) return null;
    return { ...value, screen: value.screen && Number.isFinite(value.screen.x) && Number.isFinite(value.screen.y)
      && (typeof value.screen.name === "string" || value.screen.name === null) ? value.screen : null };
  } catch { return null; }
}

function isRestoringGeometry() {
  const started = Number(localStorage.getItem(GEOMETRY_OPENING_KEY));
  return started > 0 && Date.now() - started < 5000;
}

async function persistGeometry(target?: WebviewWindow) {
  try {
    if (!readPreferences().rememberWindow || isRestoringGeometry()) return;
    const session = localStorage.getItem(GEOMETRY_ACTIVE_KEY);
    const active = JSON.parse(session || "null");
    if (!active || !["library", "panel"].includes(active.layout)
      || active.reset !== localStorage.getItem(GEOMETRY_RESET_KEY)) return;
    const win = target || WebviewWindow.getCurrent();
    if (!await win.isVisible()) return;
    const [position, size, scale, monitors] = await Promise.all([win.outerPosition(), win.innerSize(), win.scaleFactor(), availableMonitors()]);
    if (isRestoringGeometry() || session !== localStorage.getItem(GEOMETRY_ACTIVE_KEY)
      || active.reset !== localStorage.getItem(GEOMETRY_RESET_KEY)) return;
    const screen = monitors.find(monitor => position.x + size.width / 2 >= monitor.position.x && position.y + size.height / 2 >= monitor.position.y
      && position.x + size.width / 2 < monitor.position.x + monitor.size.width && position.y + size.height / 2 < monitor.position.y + monitor.size.height);
    const geometry: WindowGeometry = { x: position.x, y: position.y, width: size.width / scale, height: size.height / scale, scale,
      screen: screen ? { name: screen.name, x: screen.position.x, y: screen.position.y } : null };
    if (geometry.width < 380 || geometry.height < 360) return;
    let saved: Record<string, WindowGeometry> = {};
    try { saved = JSON.parse(localStorage.getItem(GEOMETRY_KEY) || "{}") || {}; } catch {}
    localStorage.setItem(GEOMETRY_KEY, JSON.stringify({ ...saved, [active.layout]: geometry }));
  } catch (err) { console.error("Could not remember drawer placement."); }
}

function resetGeometry(layout: Preferences["layout"]) {
  let saved: Record<string, WindowGeometry> = {};
  try { saved = JSON.parse(localStorage.getItem(GEOMETRY_KEY) || "{}") || {}; } catch {}
  delete saved[layout];
  localStorage.setItem(GEOMETRY_KEY, JSON.stringify(saved));
  localStorage.setItem(GEOMETRY_RESET_KEY, `${Date.now()}-${Math.random()}`);
}

function usePreferences() {
  const [preferences, setPreferences] = React.useState(readPreferences);
  const [saveError, setSaveError] = React.useState(false);
  React.useEffect(() => {
    function sync(event: Event) {
      if (event instanceof StorageEvent && event.key !== PREFS_KEY && event.key !== "betterbar_config") return;
      setPreferences(readPreferences());
    }
    window.addEventListener("storage", sync);
    window.addEventListener(PREFS_EVENT, sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener(PREFS_EVENT, sync); };
  }, []);
  function update(patch: Partial<Preferences>) {
    try {
      const next = { ...readPreferences(), ...patch };
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      setPreferences(next);
      setSaveError(false);
      window.dispatchEvent(new Event(PREFS_EVENT));
    } catch { setSaveError(true); }
  }
  return { preferences, update, saveError };
}
const iconCache = new Map<string, Promise<string | null>>();
let iconQueue = Promise.resolve();

function loadIcon(app: App): Promise<string | null> {
  const key = app.kind === "folder" ? `folder:${app.path}` : app.bundle_id;
  if (!key) return Promise.resolve(null);
  if (!iconCache.has(key)) {
    // Serialize native icon rendering; only visible tiles request an icon.
    const result = iconQueue.then(() => app.kind === "folder"
      ? invoke<string | null>("get_path_icon", { path: app.path }) : invoke<string | null>("get_app_icon", { bundleId: app.bundle_id })).catch(() => null);
    iconCache.set(key, result);
    iconQueue = result.then(() => undefined);
  }
  return iconCache.get(key)!;
}

function readRecents(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 12) : [];
  } catch { return []; }
}

function GridIcon({ size = 16 }: { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    {[3, 10, 17].flatMap(x => [3, 10, 17].map(y => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="0.6" />))}
  </svg>;
}

function AppIcon({ app }: { app: App }) {
  const tile = React.useRef<HTMLSpanElement>(null);
  const [icon, setIcon] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      loadIcon(app).then(value => { if (!cancelled) setIcon(value); });
    }, { rootMargin: "80px" });
    if (tile.current) observer.observe(tile.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [app.bundle_id, app.path, app.kind]);
  return <span className="ad-app-icon" ref={tile} aria-hidden="true">
    {icon ? <img src={icon} alt="" draggable={false} /> : app.kind === "folder" ? <svg className="ad-folder-icon" viewBox="0 0 48 48" fill="currentColor"><path d="M4 12a4 4 0 0 1 4-4h12l5 5h15a4 4 0 0 1 4 4v21a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z"/></svg> : <span className="ad-fallback">{app.name.slice(0, 1).toUpperCase()}</span>}
  </span>;
}

let opening = false;
let toggling = false;
async function toggleDrawer(anchor?: DOMRect) {
  if (toggling || opening) return;
  toggling = true;
  try {
    const win = await WebviewWindow.getByLabel(WINDOW);
    if (win && await win.isVisible()) {
      await persistGeometry(win);
      await win.hide();
    } else { await openDrawer(anchor); }
  } finally { toggling = false; }
}

function useDrawerShortcut(enabled: boolean, onError: (value: boolean) => void) {
  const [status, setStatus] = React.useState<"idle" | "ready" | "permission" | "error">("idle");
  React.useEffect(() => {
    let cancelled = false, pending = false;
    let unlisten: (() => void) | undefined;
    if (!enabled) { setStatus("idle"); return; }
    async function register() {
      if (cancelled || pending) return;
      pending = true;
      try {
        const available = await invoke<boolean>("set_apps_drawer_shortcut", { enabled: true });
        if (!cancelled) setStatus(available ? "ready" : "permission");
      } catch { if (!cancelled) setStatus("error"); }
      finally { pending = false; }
    }
    WebviewWindow.getCurrent().listen("apps-drawer-toggle", () => {
      if (!cancelled) void toggleDrawer().catch(() => onError(true));
    }).then(stop => {
      if (cancelled) { stop(); return; }
      unlisten = stop; void register();
    }).catch(() => { if (!cancelled) setStatus("error"); });
    // Pick up Accessibility permission changes without restarting.
    const timer = setInterval(() => { if (unlisten) void register(); }, 5000);
    return () => {
      cancelled = true; clearInterval(timer); unlisten?.();
      void invoke("set_apps_drawer_shortcut", { enabled: false }).catch(() => {});
    };
  }, [enabled, onError]);
  return status;
}

async function openDrawer(anchor?: DOMRect) {
  if (opening) return;
  opening = true;
  try {
    const preferences = readPreferences();
    const main = await WebviewWindow.getByLabel("main");
    const position = main ? await main.innerPosition() : null;
    const size = main ? await main.innerSize() : null;
    const mainScale = main ? await main.scaleFactor() : 1;
    const buttonX = position && size ? position.x + (anchor ? anchor.x + anchor.width / 2 : size.width / mainScale / 2) * mainScale : 0;
    const buttonY = position && size ? position.y + (anchor ? anchor.y + anchor.height / 2 : size.height / mainScale / 2) * mainScale : 0;
    const saved = preferences.rememberWindow ? readGeometry(preferences.layout) : null;
    const monitors = await availableMonitors();
    const savedScreens = saved?.screen ? monitors.filter(monitor => monitor.name === saved.screen!.name) : [];
    const savedMonitor = saved?.screen ? savedScreens.find(monitor => monitor.position.x === saved.screen!.x && monitor.position.y === saved.screen!.y)
      || (saved.screen.name && savedScreens.length === 1 ? savedScreens[0] : undefined) : undefined;
    const savedPointMonitor = saved ? monitors.find(monitor => saved.x >= monitor.position.x && saved.y >= monitor.position.y
      && saved.x < monitor.position.x + monitor.size.width && saved.y < monitor.position.y + monitor.size.height) : undefined;
    // Compare physical coordinates consistently; macOS point lookup uses screen points.
    const monitor = savedMonitor || savedPointMonitor || monitors.find(monitor => buttonX >= monitor.position.x && buttonY >= monitor.position.y
      && buttonX < monitor.position.x + monitor.size.width && buttonY < monitor.position.y + monitor.size.height) || await currentMonitor();
    const scale = monitor?.scaleFactor || 1;
    const area = monitor?.workArea;
    const bounds = { x: area ? area.position.x : 0, y: area ? area.position.y : 30 * scale,
      width: area ? area.size.width : 1440 * scale, height: area ? area.size.height : 850 * scale };
    const width = Math.min(saved?.width ?? (preferences.layout === "panel" ? 560 : 680), bounds.width / scale - 24);
    const height = Math.min(saved?.height ?? (preferences.layout === "panel" ? 650 : 570), bounds.height / scale - 24);
    localStorage.setItem(GEOMETRY_OPENING_KEY, String(Date.now()));
    localStorage.setItem(GEOMETRY_ACTIVE_KEY, JSON.stringify({ layout: preferences.layout, reset: localStorage.getItem(GEOMETRY_RESET_KEY) }));
    let win = await WebviewWindow.getByLabel(WINDOW);
    if (!win) win = await new Promise<WebviewWindow>((resolve, reject) => {
      const created = new WebviewWindow(WINDOW, {
        url: "/?ext=apps-drawer", title: strings.windowTitle, width, height,
        minWidth: 380, minHeight: 360, decorations: false,
        transparent: false, resizable: true, skipTaskbar: true, visible: false,
      });
      created.once("tauri://created", () => resolve(created));
      created.once("tauri://error", event => reject(event.payload));
    });
    await win.setSize(new LogicalSize(width, height));
    // Keep the complete window frame within the monitor's work area.
    const frame = await win.outerSize();
    let x = bounds.x + (bounds.width - frame.width) / 2;
    let y = bounds.y + (bounds.height - frame.height) / 2;
    if (preferences.layout === "panel" && position && size) {
      const edge = (() => { try { return JSON.parse(localStorage.getItem("betterbar_config") || "{}").position; } catch { return "bottom"; } })();
      x = edge === "left" ? position.x + size.width + 10 * scale : edge === "right" ? position.x - frame.width - 10 * scale : buttonX - frame.width / 2;
      y = edge === "top" ? position.y + size.height + 10 * scale : edge === "left" || edge === "right" ? buttonY - frame.height / 2 : position.y - frame.height - 10 * scale;
    }
    if (saved && savedMonitor && saved.screen) {
      x = savedMonitor.position.x + (saved.x - saved.screen.x) / saved.scale * scale;
      y = savedMonitor.position.y + (saved.y - saved.screen.y) / saved.scale * scale;
    } else if (saved && savedPointMonitor) { x = saved.x; y = saved.y; }
    x = Math.max(bounds.x + 12 * scale, Math.min(x, bounds.x + bounds.width - frame.width - 12 * scale));
    y = Math.max(bounds.y + 12 * scale, Math.min(y, bounds.y + bounds.height - frame.height - 12 * scale));
    await win.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)));
    await win.show();
    await win.setFocus();
  } finally { localStorage.removeItem(GEOMETRY_OPENING_KEY); opening = false; }
}

function AppDragButton({ app, onDraggingChange, onError, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  app: App; onDraggingChange: (active: boolean) => void; onError: (error: unknown) => void;
}) {
  const { dragProps, dragging } = useDragSource({ paths: [app.path], onDraggingChange, onError });
  return <button {...props} {...dragProps} data-dragging={dragging || undefined}>{children}</button>;
}

function Drawer() {
  const { preferences, update, saveError } = usePreferences();
  const [apps, setApps] = React.useState<App[]>([]);
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState<"home" | "all" | "recent" | "folders">(() => initialTab());
  const [editingPins, setEditingPins] = React.useState(false);
  const [recents, setRecents] = React.useState(readRecents);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [launching, setLaunching] = React.useState<string | null>(null);
  const [pickingFolder, setPickingFolder] = React.useState(false);
  const folderPickerOpen = React.useRef(false);
  const search = React.useRef<HTMLInputElement>(null);
  const grid = React.useRef<HTMLDivElement>(null);
  const mounted = React.useRef(false);
  const generation = React.useRef(0);
  const launchPending = React.useRef(false);
  const keepOpenAfterLaunch = React.useRef(false);
  const nativeInteractionUntil = React.useRef(0);
  const draggingApp = React.useRef(false);
  function onDraggingChange(active: boolean) {
    draggingApp.current = active;
    nativeInteractionUntil.current = Date.now() + 350;
  }
  const isPanel = preferences.layout === "panel";
  const showHome = isPanel && tab === "home" && !query.trim() && !editingPins;
  React.useEffect(() => { setTab(initialTab()); setEditingPins(false); }, [isPanel, preferences.panelStart]);
  React.useEffect(() => { if (!preferences.showRecent && tab === "recent") setTab("all"); }, [preferences.showRecent, tab]);
  React.useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === RECENTS_KEY || event.key === null) setRecents(readRecents()); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const refresh = React.useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await invoke<App[]>("get_installed_apps");
      if (mounted.current && request === generation.current) setApps(result);
    } catch (err) {
      console.error("Drawer operation failed.");
      if (mounted.current && request === generation.current) setError(strings.failed);
    } finally {
      if (mounted.current && request === generation.current) setLoading(false);
    }
  }, []);

  const hide = React.useCallback(async () => {
    try { await persistGeometry(); await WebviewWindow.getCurrent().hide(); }
    catch (err) { console.error("Drawer operation failed."); setError(strings.closeFailed); }
  }, []);

  React.useEffect(() => {
    const win = WebviewWindow.getCurrent();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stops: (() => void)[] = [];
    function changed() {
      if (isRestoringGeometry()) return;
      nativeInteractionUntil.current = Date.now() + 500;
      clearTimeout(timer);
      timer = setTimeout(() => { void persistGeometry(); }, 120);
    }
    for (const listen of [win.onMoved(changed), win.onResized(changed), win.onCloseRequested(async event => {
      event.preventDefault(); await hide();
    })]) {
      listen.then(stop => { if (cancelled) stop(); else stops.push(stop); }).catch(() => console.error("Drawer operation failed."));
    }
    return () => { cancelled = true; clearTimeout(timer); stops.forEach(stop => stop()); };
  }, [hide]);

  React.useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    refresh();
    search.current?.focus();
    WebviewWindow.getCurrent().onFocusChanged(({ payload: focused }) => {
      if (draggingApp.current || folderPickerOpen.current) return;
      if (!focused) {
        // macOS temporarily blurs a borderless window during a native drag.
        if (Date.now() < nativeInteractionUntil.current) { void persistGeometry(); return; }
        if (readPreferences().dismissOnBlur && !keepOpenAfterLaunch.current) hide();
        else void persistGeometry();
        return;
      }
      keepOpenAfterLaunch.current = false;
      setQuery("");
      setEditingPins(false);
      setTab(initialTab());
      setRecents(readRecents());
      search.current?.focus();
      refresh();
    }).then(stop => { if (!cancelled) unlisten = stop; else stop(); }).catch(() => console.error("Drawer operation failed."));
    return () => { cancelled = true; mounted.current = false; generation.current++; unlisten?.(); };
  }, [refresh, hide]);

  const folders = React.useMemo(() => drawerFolders(preferences), [preferences]);
  const items = React.useMemo(() => [...apps, ...folders].sort((a, b) => a.name.localeCompare(b.name)), [apps, folders]);
  const filtered = React.useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    let source = tab === "folders" ? [...folders] : tab === "recent" && !term ? recents.slice(0, preferences.recentLimit).map(path => items.find(app => app.path === path)).filter((app): app is App => !!app) : [...items];
    if (preferences.sort === "recent" && tab !== "recent") {
      const rank = (app: App) => { const index = recents.indexOf(app.path); return index < 0 ? Infinity : index; };
      source = source.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    }
    if (!term) return source;
    return source.filter(app => app.name.toLocaleLowerCase().includes(term))
      .sort((a, b) => Number(!a.name.toLocaleLowerCase().startsWith(term)) - Number(!b.name.toLocaleLowerCase().startsWith(term)));
  }, [items, folders, query, tab, recents, preferences.sort, preferences.recentLimit]);

  const pinnedApps = preferences.pins.map(path => items.find(app => app.path === path)).filter((app): app is App => !!app);
  const recentApps = recents.map(path => items.find(app => app.path === path)).filter((app): app is App => !!app).slice(0, preferences.recentLimit);
  const homeApps = [...pinnedApps, ...(preferences.showRecent ? recentApps : [])];
  function togglePin(app: App) {
    const pins = readPreferences().pins;
    update({ pins: pins.includes(app.path) ? pins.filter(path => path !== app.path) : [...pins, app.path] });
  }
  async function addFolders() {
    if (folderPickerOpen.current) return;
    folderPickerOpen.current = true;
    setPickingFolder(true); setError("");
    try {
      const selected = await invoke<(Folder & { kind: string })[]>("pick_dock_items", { kind: "folder" });
      if (!mounted.current || !selected.length) return;
      update({ folders: validFolders([...readPreferences().folders, ...selected.filter(item => item.kind === "folder")]) });
      setQuery(""); setTab("folders"); setEditingPins(false);
    } catch { if (mounted.current) setError(strings.folderFailed); }
    finally {
      nativeInteractionUntil.current = Date.now() + 500;
      folderPickerOpen.current = false;
      if (mounted.current) { setPickingFolder(false); search.current?.focus(); }
    }
  }
  function removeFolder(app: App) {
    const current = readPreferences();
    update({ folders: current.folders.filter(folder => folder.path !== app.path), pins: current.pins.filter(path => path !== app.path) });
  }
  function appButton(app: App, list = false, keyPrefix = "") {
    const pinned = preferences.pins.includes(app.path);
    const removable = editingPins && app.kind === "folder" && !barFolders().some(folder => folder.path === app.path);
    return <div className={`ad-tile ${list ? "ad-tile-row" : ""}`} key={keyPrefix + app.path}>
      <AppDragButton app={app} onDraggingChange={onDraggingChange} onError={() => setError(strings.dragFailed)}
        className="ad-app" title={app.path} disabled={launching !== null} data-ad-launch
        aria-label={app.name} onClick={() => launch(app)}>
        <AppIcon app={app} /><span className="ad-app-name">{app.name}</span>
        {list && app.kind === "folder" && <span className="ad-kind">{strings.folder}</span>}
        {list && !editingPins && <span className="ad-row-arrow" aria-hidden="true">↗</span>}
      </AppDragButton>
      {editingPins && <button className="ad-pin" aria-pressed={pinned} aria-label={`${pinned ? strings.unpin : strings.pin} ${app.name}`}
        title={`${pinned ? strings.unpin : strings.pin} ${app.name}`} onClick={() => togglePin(app)}>{pinned ? "✓" : "+"}</button>}
      {removable && <button className="ad-remove" aria-label={`${strings.removeFolder} ${app.name}`}
        title={`${strings.removeFolder} ${app.name}`} onClick={() => removeFolder(app)}>×</button>}
    </div>;
  }

  async function launch(app: App) {
    if (launchPending.current) return;
    launchPending.current = true;
    setLaunching(app.path);
    setError("");
    keepOpenAfterLaunch.current = !readPreferences().closeOnLaunch;
    try {
      await invoke("launch_app", { path: app.path });
      const next = [app.path, ...readRecents().filter(path => path !== app.path)].slice(0, 12);
      try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch {}
      setRecents(next);
      if (readPreferences().closeOnLaunch) hide();
    } catch (err) { keepOpenAfterLaunch.current = false; console.error("Drawer operation failed."); setError(strings.launchFailed); }
    finally { launchPending.current = false; setLaunching(null); }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (draggingApp.current || folderPickerOpen.current) return;
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      if (query) { setQuery(""); search.current?.focus(); } else hide();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault(); search.current?.focus(); search.current?.select(); return;
    }
    const visibleApps = showHome ? homeApps : filtered;
    if (event.target === search.current && event.key === "Enter" && visibleApps[0]) {
      event.preventDefault(); launch(visibleApps[0]); return;
    }
    const buttons = Array.from(grid.current?.querySelectorAll<HTMLButtonElement>("button[data-ad-launch]") || []);
    if (event.target === search.current && event.key === "ArrowDown") {
      event.preventDefault(); buttons[0]?.focus(); return;
    }
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    if (current < 0 || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    // Pick the nearest visible tile in the requested direction, across grids and lists.
    const origin = buttons[current].getBoundingClientRect();
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const candidates = buttons.filter(button => button !== buttons[current]).map(button => {
      const rect = button.getBoundingClientRect();
      const dx = rect.x + rect.width / 2 - origin.x - origin.width / 2;
      const dy = rect.y + rect.height / 2 - origin.y - origin.height / 2;
      return { button, primary: horizontal ? dx : dy, cross: horizontal ? dy : dx };
    }).filter(item => item.primary * direction > 1 && (!horizontal || Math.abs(item.cross) < origin.height / 2))
      .sort((a, b) => Math.abs(a.primary) + Math.abs(a.cross) * 3 - Math.abs(b.primary) - Math.abs(b.cross) * 3);
    if (candidates[0]) { candidates[0].button.focus(); candidates[0].button.scrollIntoView({ block: "nearest" }); }
    else if (event.key === "ArrowUp") search.current?.focus();
  }

  return <section className={`ad-drawer ${isPanel ? "ad-panel" : ""} ad-density-${preferences.density} ${preferences.showLabels ? "" : "ad-hide-labels"}`} aria-label={strings.title} onKeyDown={onKeyDown}
    onPointerMoveCapture={event => {
      const bounds = event.currentTarget.getBoundingClientRect();
      // Native resize grips may consume pointerdown before the webview sees it.
      if (event.clientX < 8 || event.clientY < 8 || event.clientX > bounds.width - 8 || event.clientY > bounds.height - 8) {
        nativeInteractionUntil.current = Date.now() + 1500;
      }
    }}
    onPointerDownCapture={event => {
      const target = event.target as HTMLElement;
      const bounds = event.currentTarget.getBoundingClientRect();
      if ((target.closest("[data-tauri-drag-region]") && !target.closest("button"))
        || event.clientX < 5 || event.clientY < 5 || event.clientX > bounds.width - 5 || event.clientY > bounds.height - 5) {
        nativeInteractionUntil.current = Date.now() + 1500;
      }
    }}
    style={{ "--bb-accent": preferences.followAccent ? undefined : preferences.accentColor,
      "--ad-icon-size": `${preferences.iconSize || (preferences.density === "compact" ? 36 : 46)}px`,
      "--ad-columns": preferences.columns ? `repeat(${preferences.columns}, minmax(0, 1fr))` : undefined,
    } as React.CSSProperties}>
    <style>{css}</style>
    <header className="ad-header" data-tauri-drag-region>
      <div className="ad-heading" data-tauri-drag-region>
        <span className="ad-mark"><GridIcon size={19} /></span>
        <h1>{strings.title}</h1>{preferences.showSubtitle && <span className="ad-subtitle">{strings.subtitle}</span>}
      </div>
      <button className="ad-tool" aria-label={strings.close} title={strings.close} onClick={hide}>×</button>
    </header>
    <div className="ad-search-wrap">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
      <input ref={search} type="search" aria-label={strings.search} placeholder={strings.placeholder} value={query}
        onChange={event => setQuery(event.target.value)} spellCheck={false} autoComplete="off" />
      {query && <button className="ad-tool" aria-label={strings.clear} onClick={() => { setQuery(""); search.current?.focus(); }}>×</button>}
    </div>
    <nav className="ad-toolbar" aria-label={strings.title}>
      <div className="ad-tabs">
        {isPanel && <button aria-pressed={tab === "home" && !editingPins} onClick={() => { setTab("home"); setQuery(""); setEditingPins(false); }}>{strings.pinned}</button>}
        <button aria-pressed={tab === "all" && !editingPins} onClick={() => { setTab("all"); setQuery(""); setEditingPins(false); }}>{strings.all}<span>{items.length}</span></button>
        <button aria-pressed={tab === "folders"} onClick={() => { setTab("folders"); setQuery(""); setEditingPins(false); }}>{strings.folders}<span>{folders.length}</span></button>
        {preferences.showRecent && !isPanel && <button aria-pressed={tab === "recent"} onClick={() => { setTab("recent"); setQuery(""); }}>{strings.recent}</button>}
      </div>
      <div className="ad-actions"><button className="ad-text-button" disabled={pickingFolder} aria-label={strings.addFolderLabel} onClick={addFolders}>{strings.addFolder}</button>
      <button className="ad-text-button" aria-pressed={editingPins} onClick={() => { setEditingPins(!editingPins); setQuery(""); }}>{editingPins ? strings.done : strings.managePins}</button>
      <button className="ad-tool" disabled={loading} title={strings.refresh} aria-label={strings.refresh} onClick={refresh}>
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/></svg>
      </button></div>
    </nav>
    {(error || saveError) && <div className="ad-error" role="alert">{saveError ? strings.settingsError : error}<button onClick={refresh}>{strings.retry}</button></div>}
    <div className="ad-scroll" aria-busy={loading} ref={grid}>
      {showHome ? <>
        <div className="ad-section-label"><h2>{strings.pinned}</h2><span>{pinnedApps.length}</span></div>
        {pinnedApps.length ? <div className="ad-grid ad-pinned-grid">{pinnedApps.map(app => appButton(app))}</div>
          : <p className="ad-pin-hint">{strings.pinHint}</p>}
        {preferences.showRecent && <>
          <div className="ad-section-label ad-recent-label"><h2>{strings.recent}</h2></div>
          {recentApps.length ? <div className="ad-list">{recentApps.map(app => appButton(app, true, "recent-"))}</div>
            : <p className="ad-pin-hint">{strings.recentHint}</p>}
        </>}
      </> : <>
      {editingPins && <p className="ad-pin-hint">{strings.pinsHint}</p>}
      <div className={isPanel ? "ad-list" : "ad-grid"}>
        {filtered.map(app => appButton(app, isPanel))}
      </div>
      {filtered.length === 0 && <div className="ad-empty" role="status">
        <GridIcon size={30} />
        <strong>{loading ? strings.loading : query ? strings.empty : tab === "folders" ? strings.noFolders : tab === "recent" ? strings.noRecent : strings.noApps}</strong>
        {!loading && <span>{query ? strings.emptyHint : tab === "folders" ? strings.foldersHint : tab === "recent" ? strings.recentHint : ""}</span>}
      </div>}
      </>}
    </div>
    {preferences.showFooter && <footer className="ad-footer">
      <span role="status">{loading ? strings.loading : `${query || tab === "recent" || tab === "folders" ? filtered.length : items.length} ${query || tab === "recent" || tab === "folders" ? strings.results : strings.installed}`}</span>
      <div><span><kbd>↑↓</kbd> {strings.navigate}</span><span><kbd>↵</kbd> {strings.enter}</span><span><kbd>esc</kbd> {strings.escape}</span></div>
    </footer>}
  </section>;
}

export default function DrawerExtension({ isWindowMode = false, iconSize, slotSize, config }: {
  isWindowMode?: boolean; iconSize?: number; slotSize?: number; config?: { barSize?: number };
}) {
  const [error, setError] = React.useState(false);
  const { preferences } = usePreferences();
  const shortcut = useDrawerShortcut(!isWindowMode && preferences.doubleTapCommand, setError);
  if (isWindowMode) return <Drawer />;
  const glyphSize = iconSize ?? Math.max(20, (config?.barSize ?? 48) - 20);
  const buttonSize = slotSize ?? glyphSize + 8;
  return <><style>{css}</style><button className="ad-trigger" aria-label={strings.open}
    title={error ? strings.openFailed : shortcut === "permission" ? strings.shortcutPermission : shortcut === "error" ? strings.shortcutFailed : preferences.doubleTapCommand ? strings.shortcutOpen : strings.open}
    style={{ width: buttonSize, height: buttonSize, color: error ? "var(--bb-bad)" : undefined }}
    onClick={event => { setError(false); toggleDrawer(event.currentTarget.getBoundingClientRect()).catch(() => { console.error("Drawer operation failed."); setError(true); }); }}>
    <GridIcon size={glyphSize} />
  </button></>;
}

export function Settings() {
  const { preferences, update, saveError } = usePreferences();
  const [openError, setOpenError] = React.useState(false);
  const [actionStatus, setActionStatus] = React.useState("");
  function toggle(key: "showRecent" | "dismissOnBlur" | "showLabels" | "showSubtitle" | "showFooter" | "followAccent" | "closeOnLaunch" | "rememberWindow" | "doubleTapCommand", label: string, hint: string) {
    return <button className="ad-option-toggle" role="switch" aria-checked={preferences[key]}
      onClick={() => update({ [key]: !preferences[key] })}>
      <span><span className="ad-option-name">{label}</span><span className="ad-option-hint">{hint}</span></span>
      <span className="ad-switch" aria-hidden="true"><span/></span>
    </button>;
  }
  return <div className="ad-settings">
    <style>{css}</style>
    {toggle("doubleTapCommand", strings.shortcut, strings.shortcutHint)}
    {preferences.doubleTapCommand && <button className="ad-action-button" onClick={() => {
      void invoke("request_accessibility_permissions").catch(() => setActionStatus(strings.shortcutFailed));
    }}>{strings.accessibility}</button>}
    <fieldset className="ad-options-fieldset">
      <legend>{strings.layout}</legend>
      <div className="ad-layout-options">
        {(["library", "panel"] as const).map(layout => <button key={layout} className="ad-layout-option"
          aria-pressed={preferences.layout === layout} onClick={() => update({ layout })}>
          <span className={`ad-layout-preview ad-layout-preview-${layout}`} aria-hidden="true">
            <span className="ad-preview-search" />
            <span className="ad-preview-icons">{Array.from({ length: layout === "library" ? 12 : 6 }, (_, index) => <i key={index} />)}</span>
            {layout === "panel" && <span className="ad-preview-list"><i/><i/><i/></span>}
          </span>
          <span className="ad-option-name">{layout === "library" ? strings.library : strings.panel}<span aria-hidden="true">{preferences.layout === layout ? "✓" : ""}</span></span>
          <span className="ad-option-hint">{layout === "library" ? strings.libraryHint : strings.panelHint}</span>
        </button>)}
      </div>
    </fieldset>
    <details className="ad-settings-section" open>
      <summary>{strings.window}</summary>
      <div className="ad-settings-fields">
        {toggle("rememberWindow", strings.rememberWindow, strings.rememberHint)}
        <div className="ad-reset-row">
          <p className="ad-option-hint">{strings.resetWindowHint}</p>
          <button className="ad-action-button" onClick={() => {
            try { resetGeometry(preferences.layout); setActionStatus(strings.resetDone); }
            catch { setActionStatus(strings.settingsError); }
          }}>{strings.resetWindow}</button>
        </div>
      </div>
    </details>
    <details className="ad-settings-section">
      <summary>{strings.appearance}</summary>
      <div className="ad-settings-fields">
        <fieldset className="ad-options-fieldset">
          <legend>{strings.density}</legend>
          <div className="ad-density-options">
            {(["comfortable", "compact"] as const).map(density => <button key={density} aria-pressed={preferences.density === density}
              onClick={() => update({ density })}>{density === "comfortable" ? strings.comfortable : strings.compact}</button>)}
          </div>
        </fieldset>
        <div className="ad-field-grid">
          <Choice label={strings.iconSize} value={String(preferences.iconSize)} options={[{ value: "0", label: strings.automatic },
            ...[32, 40, 46, 56, 64].map(value => ({ value: String(value), label: `${value} px` }))]} onChange={value => update({ iconSize: Number(value) })} />
          <Choice label={strings.columns} value={String(preferences.columns)} options={[{ value: "0", label: strings.automatic },
            ...[3, 4, 5, 6, 7, 8].map(value => ({ value: String(value), label: String(value) }))]} onChange={value => update({ columns: Number(value) })} />
        </div>
        {toggle("showLabels", strings.showLabels, strings.labelsHint)}
        {toggle("showSubtitle", strings.showSubtitle, strings.subtitleHint)}
        {toggle("showFooter", strings.showFooter, strings.footerHint)}
        {toggle("followAccent", strings.followAccent, strings.accentHint)}
        {!preferences.followAccent && <label className="ad-color-control"><span>{strings.customAccent}</span>
          <input type="color" value={preferences.accentColor} onChange={event => update({ accentColor: event.target.value })} />
          <span>{preferences.accentColor.toUpperCase()}</span>
        </label>}
      </div>
    </details>
    <details className="ad-settings-section">
      <summary>{strings.behavior}</summary>
      <div className="ad-settings-fields">
        <Choice label={strings.sort} value={preferences.sort} options={[{ value: "name", label: strings.alphabetical }, { value: "recent", label: strings.recentlyOpened }]}
          onChange={value => update({ sort: value as Preferences["sort"] })} />
        {preferences.layout === "panel" && <Choice label={strings.panelStart} value={preferences.panelStart}
          options={[{ value: "home", label: strings.pinned }, { value: "all", label: strings.all }]} onChange={value => update({ panelStart: value as Preferences["panelStart"] })} />}
        {toggle("showRecent", strings.showRecent, strings.showRecentHint)}
        {preferences.showRecent && <Choice label={strings.recentLimit} value={String(preferences.recentLimit)}
          options={[4, 6, 8, 12].map(value => ({ value: String(value), label: String(value) }))} onChange={value => update({ recentLimit: Number(value) })} />}
        <button className="ad-action-button" onClick={() => {
          try { localStorage.setItem(RECENTS_KEY, "[]"); setActionStatus(strings.recentsCleared); }
          catch { setActionStatus(strings.settingsError); }
        }}>{strings.clearRecents}</button>
        {toggle("closeOnLaunch", strings.closeOnLaunch, strings.closeOnLaunchHint)}
        {toggle("dismissOnBlur", strings.dismiss, strings.dismissHint)}
      </div>
    </details>
    {actionStatus && <p className="ad-option-hint" role="status">{actionStatus}</p>}
    <div className="ad-settings-footer"><p>{strings.settings}</p><button className="ad-open-preview" onClick={() => {
      setOpenError(false); openDrawer().catch(() => { console.error("Drawer operation failed."); setOpenError(true); });
    }}>{strings.preview}<span aria-hidden="true">↗</span></button></div>
    {(saveError || openError) && <p className="ad-error" role="alert">{saveError ? strings.settingsError : strings.openFailed}</p>}
  </div>;
}

function Choice({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
}) {
  return <label className="ad-select-control"><span>{label}</span>
    <select value={value} onChange={event => onChange(event.target.value)}>
      {options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

const css = `
.ad-trigger { flex-shrink:0; display:grid; place-items:center; background:transparent; color:var(--bb-dim); border:1px solid var(--bb-line); transition:color 150ms,border-color 150ms; }
.ad-trigger:hover { color:var(--bb-accent); border-color:var(--bb-accent); }
.ad-drawer { --ad-muted:var(--bb-dim); --ad-gap:16px; height:100%; display:flex; flex-direction:column; background:var(--bb-pane); color:var(--bb-text); font-family:"IBM Plex Mono",Menlo,monospace; border:1px solid var(--bb-line-2); }
.ad-drawer button { font:inherit; color:inherit; background:transparent; border:0; }
.ad-drawer button:disabled { opacity:.5; }
.ad-drawer button:focus-visible,.ad-trigger:focus-visible { outline:2px solid var(--bb-accent); outline-offset:-2px; }
.ad-header { min-height:76px; padding:20px 24px 14px; display:flex; align-items:center; justify-content:space-between; }
.ad-heading { display:flex; align-items:center; gap:12px; flex:1; align-self:stretch; }
.ad-heading > * { pointer-events:none; }
.ad-mark { color:var(--bb-accent); display:flex; }
.ad-heading h1 { font-size:23px; font-weight:500; letter-spacing:-1px; }
.ad-subtitle { margin-left:8px; font-size:8px; letter-spacing:1.5px; color:var(--ad-muted); }
.ad-drawer .ad-tool { width:30px; height:30px; display:grid; place-items:center; color:var(--ad-muted); flex-shrink:0; font-size:23px; line-height:1; }
.ad-drawer .ad-tool:hover { color:var(--bb-text); background:var(--bb-line); }
.ad-search-wrap { margin:0 24px; padding:0 14px; display:flex; align-items:center; gap:12px; min-height:48px; border:1px solid var(--bb-line-2); background:var(--bb-pane-2); color:var(--ad-muted); }
.ad-search-wrap:focus-within { border-color:var(--bb-accent); }
.ad-search-wrap input { min-width:0; width:100%; height:46px; font:inherit; font-size:13px; background:transparent; border:0; outline:0; color:var(--bb-text); }
.ad-search-wrap input::placeholder { color:var(--ad-muted); }
.ad-search-wrap input::-webkit-search-cancel-button { display:none; }
.ad-toolbar { display:flex; justify-content:space-between; align-items:center; padding:14px 24px 12px; border-bottom:1px solid var(--bb-line); }
.ad-tabs { display:flex; flex-wrap:wrap; gap:6px 16px; }
.ad-actions { display:flex; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
.ad-toolbar { gap:8px; flex-wrap:wrap; }
.ad-folder-icon { width:90%; height:90%; color:var(--bb-accent); }
.ad-kind { font-size:9px; color:var(--ad-muted); }
.ad-drawer .ad-remove { position:absolute; top:2px; right:2px; width:24px; height:24px; color:var(--ad-muted); background:var(--bb-pane); border:1px solid var(--bb-line-2); }
.ad-drawer .ad-remove:hover { color:var(--bb-bad); }
.ad-grid .ad-pin { right:2px; top:30px; transform:none; }
.ad-drawer .ad-tabs button { color:var(--ad-muted); font-size:11px; padding:7px 0; display:flex; gap:8px; align-items:center; }
.ad-drawer .ad-tabs button[aria-pressed=true] { color:var(--bb-accent); }
.ad-tabs button span { font-size:9px; padding:2px 5px; background:var(--bb-line); color:var(--bb-text); }
.ad-scroll { overflow-y:auto; flex:1; min-height:0; padding:16px; position:relative; }
.ad-scroll::-webkit-scrollbar { width:6px; }
.ad-scroll::-webkit-scrollbar-thumb { background:var(--bb-line-2); }
.ad-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(92px,1fr)); gap:6px; align-content:start; }
.ad-drawer .ad-app { width:100%; min-width:0; min-height:104px; padding:12px 4px 9px; display:flex; flex-direction:column; align-items:center; gap:8px; border:1px solid transparent; transition:background 150ms,border-color 150ms; }
.ad-drawer .ad-app:hover { background:var(--bb-pane-2); border-color:var(--bb-line-2); }
.ad-app-icon { display:grid; place-items:center; width:46px; height:46px; flex-shrink:0; }
.ad-app-icon img { width:46px; height:46px; object-fit:contain; }
.ad-fallback { display:grid; place-items:center; width:36px; height:36px; background:var(--bb-line); color:var(--ad-muted); font-size:20px; }
.ad-app-name { font-size:10px; line-height:1.5; width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center; }
.ad-empty { min-height:160px; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:var(--ad-muted); text-align:center; font-size:11px; padding:20px; }
.ad-empty strong { font-size:13px; font-weight:400; color:var(--bb-text); }
.ad-empty > svg { margin-bottom:6px; color:var(--bb-dim); }
.ad-footer { min-height:42px; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 24px; border-top:1px solid var(--bb-line); font-size:9px; color:var(--ad-muted); }
.ad-footer > div { display:flex; gap:14px; }
.ad-footer kbd { font:inherit; color:var(--bb-text); }
.ad-error { display:flex; justify-content:space-between; gap:12px; padding:10px 24px; color:var(--bb-bad); font-size:10px; overflow-wrap:anywhere; }
.ad-error button { text-decoration:underline; flex-shrink:0; }
.ad-tile { min-width:0; position:relative; }
.ad-drawer .ad-text-button { font-size:10px; color:var(--ad-muted); padding:7px 8px; }
.ad-drawer .ad-text-button:hover,.ad-drawer .ad-text-button[aria-pressed=true] { color:var(--bb-accent); }
.ad-drawer .ad-pin { position:absolute; right:12px; top:50%; transform:translateY(-50%); height:28px; width:28px; border:1px solid var(--bb-line-2); color:var(--ad-muted); font-size:16px; }
.ad-drawer .ad-pin[aria-pressed=true] { border-color:var(--bb-accent); color:var(--bb-accent); }
.ad-list { display:flex; flex-direction:column; gap:4px; }
.ad-list .ad-app { flex-direction:row; gap:12px; padding:8px 12px; min-height:48px; }
.ad-list .ad-app-icon,.ad-list .ad-app-icon img { width:28px; height:28px; }
.ad-list .ad-fallback { width:25px; height:25px; font-size:15px; }
.ad-list .ad-app-name { text-align:left; font-size:11px; }
.ad-tile-row:has(.ad-pin) .ad-app { padding-right:52px; }
.ad-tile-row:has(.ad-remove) .ad-app { padding-right:88px; }
.ad-drawer .ad-tile-row:has(.ad-remove) .ad-pin { right:44px; }
.ad-drawer .ad-tile-row .ad-remove { right:8px; top:50%; transform:translateY(-50%); }
.ad-row-arrow { color:var(--bb-dim); font-size:13px; }
.ad-section-label { display:flex; justify-content:space-between; padding:4px 12px 14px; font-size:10px; color:var(--ad-muted); }
.ad-section-label h2 { font:inherit; color:var(--bb-text); }
.ad-recent-label { padding-top:24px; border-top:1px solid var(--bb-line); margin-top:18px; }
.ad-pin-hint { padding:12px; font-size:11px; line-height:1.7; color:var(--ad-muted); }
.ad-panel .ad-header { min-height:66px; padding-top:15px; padding-bottom:12px; }
.ad-panel .ad-subtitle { font-size:7px; letter-spacing:1px; }
.ad-panel .ad-scroll { padding:18px 20px; }
.ad-pinned-grid { grid-template-columns:repeat(auto-fill,minmax(96px,1fr)); }
.ad-pinned-grid .ad-app { min-height:92px; }
.ad-density-compact .ad-grid { grid-template-columns:repeat(auto-fill,minmax(78px,1fr)); gap:4px; }
.ad-density-compact .ad-grid .ad-app { min-height:84px; padding-top:10px; gap:6px; }
.ad-density-compact .ad-grid .ad-app-icon,.ad-density-compact .ad-grid .ad-app-icon img { width:36px; height:36px; }
.ad-density-compact .ad-list .ad-app { min-height:38px; padding-top:4px; padding-bottom:4px; }
.ad-drawer .ad-grid { grid-template-columns:var(--ad-columns, repeat(auto-fill,minmax(max(78px,calc(var(--ad-icon-size) + 32px)),1fr))); }
.ad-drawer .ad-grid .ad-app { min-height:calc(var(--ad-icon-size) + 58px); }
.ad-drawer.ad-density-compact .ad-grid .ad-app { min-height:calc(var(--ad-icon-size) + 48px); }
.ad-drawer .ad-pinned-grid .ad-app { min-height:calc(var(--ad-icon-size) + 46px); }
.ad-drawer .ad-grid .ad-app-icon { width:min(var(--ad-icon-size),100%); height:var(--ad-icon-size); }
.ad-drawer .ad-grid .ad-app-icon img { width:100%; height:100%; }
.ad-drawer.ad-hide-labels .ad-grid .ad-app-name { display:none; }
.ad-drawer.ad-hide-labels .ad-grid .ad-app { justify-content:center; min-height:calc(var(--ad-icon-size) + 30px); }
.ad-settings { display:flex; flex-direction:column; gap:24px; }
.ad-settings button { font:inherit; text-align:left; }
.ad-settings button:focus-visible { outline:2px solid var(--bb-accent); outline-offset:3px; }
.ad-options-fieldset { border:0; min-width:0; padding:0; margin:0; }
.ad-options-fieldset legend { font-size:10px; letter-spacing:.08em; color:var(--bb-dim); text-transform:uppercase; margin-bottom:12px; }
.ad-layout-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.ad-settings .ad-layout-option { padding:14px; background:var(--bb-pane); border:1px solid var(--bb-line-2); color:var(--bb-text); min-width:0; }
.ad-settings .ad-layout-option[aria-pressed=true] { border-color:var(--bb-accent); }
.ad-layout-preview { display:flex; flex-direction:column; gap:8px; padding:12px; height:105px; background:var(--bb-pane-2); border:1px solid var(--bb-line); margin-bottom:16px; }
.ad-preview-search { height:9px; background:var(--bb-line-2); display:block; }
.ad-preview-icons { display:grid; grid-template-columns:repeat(6,1fr); gap:7px; padding-top:4px; }
.ad-preview-icons i { height:12px; width:100%; max-width:16px; background:var(--bb-dim); opacity:.65; }
.ad-layout-preview-panel { width:76%; margin-left:auto; margin-right:auto; }
.ad-layout-preview-panel .ad-preview-icons { grid-template-columns:repeat(3,1fr); gap:5px; }
.ad-layout-preview-panel .ad-preview-icons i { height:8px; max-width:12px; }
.ad-preview-list { display:flex; flex-direction:column; gap:4px; padding-top:4px; border-top:1px solid var(--bb-line-2); }
.ad-preview-list i { height:3px; background:var(--bb-dim); opacity:.5; width:65%; }
.ad-option-name { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; line-height:1.5; color:var(--bb-text); }
.ad-layout-option[aria-pressed=true] .ad-option-name > span { color:var(--bb-accent); }
.ad-option-hint { display:block; margin-top:6px; font-size:10px; line-height:1.7; color:var(--bb-dim); }
.ad-density-options { display:flex; gap:8px; }
.ad-settings .ad-density-options button { min-height:36px; padding:8px 14px; font-size:11px; color:var(--bb-dim); border:1px solid var(--bb-line-2); background:var(--bb-pane); }
.ad-settings .ad-density-options button[aria-pressed=true] { border-color:var(--bb-accent); color:var(--bb-text); }
.ad-settings .ad-option-toggle { display:flex; align-items:center; justify-content:space-between; gap:20px; border:0; border-bottom:1px solid var(--bb-line); padding:0 0 18px; background:transparent; }
.ad-switch { width:36px; height:20px; background:var(--bb-line-2); position:relative; flex-shrink:0; border:1px solid var(--bb-line-2); }
.ad-switch > span { position:absolute; top:2px; left:2px; width:14px; height:14px; background:var(--bb-text); }
.ad-option-toggle[aria-checked=true] .ad-switch { background:var(--bb-accent); border-color:var(--bb-accent); }
.ad-option-toggle[aria-checked=true] .ad-switch > span { left:18px; background:var(--bb-bg); }
.ad-settings-footer { display:flex; align-items:center; justify-content:space-between; gap:20px; }
.ad-settings-footer p { font-size:10px; line-height:1.7; color:var(--bb-dim); max-width:40ch; }
.ad-settings .ad-open-preview { padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:14px; min-width:136px; font-size:11px; color:var(--bb-accent); border:1px solid var(--bb-line-2); background:var(--bb-pane); }
.ad-settings-section { border-top:1px solid var(--bb-line-2); padding-top:18px; }
.ad-settings-section summary { cursor:pointer; font-size:12px; color:var(--bb-text); padding:4px 0; }
.ad-settings-section summary::marker { color:var(--bb-accent); }
.ad-settings-fields { display:flex; flex-direction:column; gap:20px; padding-top:22px; }
.ad-field-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
.ad-select-control { display:flex; flex-direction:column; gap:10px; min-width:0; font-size:11px; color:var(--bb-text); }
.ad-select-control select { background:var(--bb-pane); border:1px solid var(--bb-line-2); color:var(--bb-text); padding:9px 12px; min-height:38px; width:100%; font:inherit; }
.ad-select-control select:focus-visible { outline:1px solid var(--bb-accent); }
.ad-color-control { display:flex; align-items:center; gap:12px; font-size:11px; color:var(--bb-text); }
.ad-color-control input { height:32px; width:40px; border:1px solid var(--bb-line-2); padding:3px; background:var(--bb-pane); }
.ad-color-control > span:last-child { color:var(--bb-dim); font-size:10px; }
.ad-reset-row { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.ad-reset-row p { margin:0; max-width:36ch; }
.ad-settings .ad-action-button { align-self:flex-start; flex-shrink:0; min-height:34px; padding:8px 12px; color:var(--bb-dim); font-size:10px; background:var(--bb-pane); border:1px solid var(--bb-line-2); }
.ad-settings .ad-action-button:hover { border-color:var(--bb-accent); color:var(--bb-text); }
@media(max-width:800px) { .ad-settings-footer { align-items:flex-start; flex-direction:column; } }
@media(max-width:800px) { .ad-reset-row { flex-direction:column; align-items:flex-start; } }
@media(max-width:460px) { .ad-layout-options { grid-template-columns:1fr; } }
@media(max-width:500px) { .ad-subtitle { display:none; } .ad-header { padding:16px; min-height:64px; } .ad-search-wrap { margin:0 16px; } .ad-toolbar { padding:10px 16px; } .ad-footer { padding:10px 16px; } .ad-footer > div > span:first-child { display:none; } }
@media(prefers-reduced-motion:reduce) { .ad-trigger,.ad-drawer .ad-app { transition:none; } }
`;
