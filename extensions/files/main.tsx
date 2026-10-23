import React from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useDragSource } from "@betterbar/api";

declare function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
export const name = "Files";
export const version = "1.0.0";
export const permissions = ["files", "clipboard", "apps"];

const strings = {
  more: "More actions", title: "Files", openFiles: "Open Files", subtitle: "A place for everything.", open: "Open", back: "Back", forward: "Forward", up: "Parent folder",
  refresh: "Refresh", finder: "Show in Finder", quickLook: "Quick Look", newFolder: "New folder", rename: "Rename", duplicate: "Duplicate",
  copy: "Copy", cut: "Cut", paste: "Paste", move: "Move to…", copyTo: "Copy to…", trash: "Move to Trash", compress: "Compress", tags: "Edit tags", info: "Info",
  search: "Search this folder", searchPlaceholder: "Filter by name…", searchSubfolders: "Search subfolders with Spotlight", searchHint: "Spotlight finds indexed items only; hidden and unindexed locations may be absent.",
  go: "Go", goTo: "Go to folder", path: "Folder path", pathHint: "Enter an absolute path, ~, or ~/ followed by a folder.",
  empty: "This folder is empty", noMatches: "No matching items", emptyHint: "Create a folder or paste files to get started.", noMatchesHint: "Try another name or search subfolders.",
  loading: "Opening folder…", failed: "Could not complete this action. Check the item still exists and BetterBar has macOS Files and Folders access.",
  loadFailed: "Could not open this folder. Check the path and macOS Files and Folders access for BetterBar.", retry: "Try again",
  list: "List view", grid: "Icon view", sort: "Sort by", sortName: "Name", sortModified: "Date modified", sortSize: "Size", sortKind: "Kind", direction: "Reverse sort order",
  hidden: "Show hidden files", favorites: "FAVORITES", locations: "LOCATIONS", pin: "Add folder to favorites", unpin: "Remove favorite", tab: "New tab", closeTab: "Close tab",
  items: "{count} items", selected: "{count} selected", size: "Size", modified: "Modified", type: "Kind", location: "Location", folder: "Folder", application: "Application", package: "Package", file: "File", link: "Symbolic link",
  cancel: "Cancel", save: "Save", create: "Create", name: "Name", destination: "Destination folder", destinationHint: "Existing items are never replaced. Choose a different name if needed.",
  trashConfirm: "Move {count} selected items to Trash?", trashHint: "You can undo this action here, or restore items from Trash in Finder.",
  done: "Completed {count} items.", partial: "Completed {count} items before an error. Remaining items were left in place.", busy: "Working…", clipboard: "{count} items copied. Paste here or in Finder.", cutReady: "{count} items ready to move. Paste into another folder in Files.", clipboardEmpty: "Copy files in Files or Finder before pasting.",
  undo: "Undo last move / rename / Trash", undoFailed: "Could not undo every item. The original name may be occupied. Remaining undo items have been kept.",
  tagsSaved: "Finder tags saved.", tagHint: "Separate Finder tags with commas. An empty value removes tags.", tagPlaceholder: "Work, Important", tagFailed: "Could not read tags. Check access and volume support.",
  limit: "Results limited; narrow your search or open this folder in Finder.", skipped: "{count} unavailable items skipped.", copiedPath: "Path copied.", copyPath: "Copy path",
  drop: "Copy dropped items here?", dropHint: "Files will be copied into this folder. Originals stay in place; existing names are never replaced.", dropFailed: "Finder drag and drop is unavailable. Reopen Files to try again.",
  help: "Keyboard shortcuts and Finder features", helpText: "⌘↑ Parent · ⌘↓ Open · Space Quick Look · Return Rename · ⌘C Copy · ⌘X Cut · ⌘V Paste · ⌘⌫ Trash · ⇧⌘N New folder · ⇧⌘G Go to folder · ⌘T New tab · ⌘W Close tab · ⇧⌘. Hidden files · ⌘F Search",
  finderHint: "Use Show in Finder for sharing, AirDrop, aliases, Open With, permissions, device sync, network connections, and Finder’s other advanced tools. Files does not replace Finder’s desktop or system services.",
  closeInfo: "Close information", unavailable: "Unavailable", foldersFirst: "Folders first", preferences: "Files preferences", settingsHint: "Browse local folders and mounted volumes. File operations use macOS; Show in Finder opens advanced Finder tools. Spotlight requires indexing. Files never uploads your files.",
  openFailed: "Could not open Files. Try again.", selection: "File selection", fileList: "Folder contents", sortAscending: "Ascending", sortDescending: "Descending",
};
const format = (value: string, count: number) => value.replace("{count}", String(count));
type Entry = { path: string; name: string; directory: boolean; package: boolean; symlink: boolean; size: number; modified: number };
type Listing = { path: string; entries: Entry[]; truncated: boolean; skipped: number };
type Place = { name: string; path: string };
type Preferences = { view: "list" | "grid"; sort: "name" | "modified" | "size" | "kind"; reverse: boolean; hidden: boolean; foldersFirst: boolean; favorites: Place[] };
type Tab = { id: number; history: string[]; index: number };
type Undo = { from: string; to: string };
type Dialog = { action: "mkdir" | "rename" | "copy" | "move" | "trash" | "tags" | "go" | "drop"; paths: string[]; folder: string; value: string };
const PREFS = "bb-files-preferences";
function readPreferences(): Preferences {
  let value: Partial<Preferences> = {};
  try { value = JSON.parse(localStorage.getItem(PREFS) || "{}") || {}; } catch { /* Defaults recover corrupt local preferences. */ }
  return {
    view: value.view === "grid" ? "grid" : "list", sort: ["name", "modified", "size", "kind"].includes(value.sort || "") ? value.sort! : "name",
    reverse: value.reverse === true, hidden: value.hidden === true, foldersFirst: value.foldersFirst !== false,
    favorites: Array.isArray(value.favorites) ? value.favorites.filter(p => p && typeof p.name === "string" && typeof p.path === "string" && p.path.startsWith("/")).slice(0, 50) : [],
  };
}
function sizeLabel(bytes: number) {
  if (!bytes) return "0 B";
  const index = Math.min(4, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: index ? 1 : 0 }).format(bytes / 1024 ** index)} ${["B", "KB", "MB", "GB", "TB"][index]}`;
}
function kind(item: Entry) {
  if (item.symlink) return strings.link;
  if (item.package) return item.name.endsWith(".app") ? strings.application : strings.package;
  if (item.directory) return strings.folder;
  return item.name.includes(".") ? item.name.split(".").at(-1)!.toUpperCase() : strings.file;
}
const basename = (path: string) => path.split("/").filter(Boolean).at(-1) || "/";
const parent = (path: string) => path.substring(0, path.lastIndexOf("/")) || "/";
function sortEntries(items: Entry[], prefs: Preferences, query = "") {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return items.filter(item => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => {
    if (prefs.foldersFirst && (a.directory && !a.package) !== (b.directory && !b.package)) return a.directory && !a.package ? -1 : 1;
    let order = prefs.sort === "modified" ? b.modified - a.modified : prefs.sort === "size" ? b.size - a.size : prefs.sort === "kind" ? collator.compare(kind(a), kind(b)) : collator.compare(a.name, b.name);
    if (!order) order = collator.compare(a.name, b.name);
    return prefs.reverse ? -order : order;
  });
}
function FolderIcon({ size = 24, file = false }: { size?: number; file?: boolean }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, color: file ? "var(--bb-dim)" : "var(--bb-accent)" }}>
    {file ? <><path d="M6 3h8l4 4v14H6z" stroke="currentColor" strokeWidth="1.4"/><path d="M14 3v5h4M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.2"/></> : <><path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3z" fill="currentColor" opacity=".14"/><path d="M3 10V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3V10h18" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></>}
  </svg>;
}
const control: React.CSSProperties = { border: "1px solid var(--bb-line)", background: "var(--bb-pane-2)", color: "var(--bb-text)", borderRadius: 6, padding: "7px 10px", font: "inherit", cursor: "pointer" };
const input: React.CSSProperties = { ...control, cursor: "text", minWidth: 0, width: "100%" };
async function openWindow() {
  const existing = await WebviewWindow.getByLabel("ext_files");
  if (existing) { await existing.show(); await existing.setFocus(); return; }
  const created = new WebviewWindow("ext_files", { url: "/?ext=files", title: "Files — BetterBar", width: 1080, height: 720, minWidth: 680, minHeight: 480, decorations: true, center: true });
  await new Promise<void>((resolve, reject) => { void created.once("tauri://created", () => resolve()); void created.once("tauri://error", () => reject(new Error(strings.openFailed))); });
}
function FileTile({ item, selected, grid, paths, onSelect, onOpen, onMenu, onError }: {
  item: Entry; selected: boolean; grid: boolean; paths: string[];
  onSelect: (event: React.MouseEvent) => void; onOpen: () => void; onMenu: (event: React.MouseEvent) => void; onError: () => void;
}) {
  const { dragProps } = useDragSource({ paths, onError });
  return <button {...dragProps} className="files-entry" data-grid={grid} role="option" aria-selected={selected} aria-label={item.name} title={item.path}
    style={{ display: "grid", gridTemplateColumns: grid ? "1fr" : "26px minmax(100px,1fr) 155px 85px 75px", alignItems: "center", gap: grid ? 10 : 12,
      padding: grid ? "20px 12px" : "10px 14px", borderRadius: grid ? 9 : 0, border: "1px solid transparent", textAlign: grid ? "center" : "left",
      color: "var(--bb-text)", background: selected ? "color-mix(in srgb, var(--bb-accent) 14%, var(--bb-pane))" : "transparent", font: "inherit", minWidth: 0, cursor: "default" }}
    onClick={onSelect} onDoubleClick={onOpen} onContextMenu={onMenu}>
    <span style={{ justifySelf: grid ? "center" : "start" }}><FolderIcon size={grid ? 44 : 23} file={!item.directory || item.package}/></span>
    <span style={{ overflow: "hidden", textOverflow: "ellipsis", ...(grid ? { overflowWrap: "anywhere" } : { whiteSpace: "nowrap" }) }}>{item.name}{item.symlink ? " ↗" : ""}</span>
    {!grid && <><span className="files-secondary">{item.modified ? new Date(item.modified * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}</span><span className="files-secondary">{kind(item)}</span><span className="files-secondary" style={{ textAlign: "right" }}>{item.directory ? "—" : sizeLabel(item.size)}</span></>}
  </button>;
}
function FilesWindow() {
  const [prefs, setPrefs] = React.useState(readPreferences);
  const [places, setPlaces] = React.useState<Place[]>([]);
  const [tabs, setTabs] = React.useState<Tab[]>([{ id: 1, history: [], index: 0 }]);
  const [active, setActive] = React.useState(1);
  const sequence = React.useRef(1);
  const tab = tabs.find(t => t.id === active) || tabs[0];
  const path = tab.history[tab.index] || "";
  const [data, setData] = React.useState<Listing | null>(null);
  const [query, setQuery] = React.useState("");
  const [spotlight, setSpotlight] = React.useState("");
  const [revision, setRevision] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const anchor = React.useRef("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
  const [undo, setUndo] = React.useState<Undo[]>([]);
  const cut = React.useRef<string[]>([]);
  const [info, setInfo] = React.useState(false);
  const [help, setHelp] = React.useState(false);
  const [menu, setMenu] = React.useState<{ x: number; y: number } | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const latest = React.useRef({ path, busy, dialog }); latest.current = { path, busy, dialog };
  const items = React.useMemo(() => sortEntries(data?.path === path ? data.entries : [], prefs, spotlight ? "" : query), [data, path, prefs, query, spotlight]);
  const selectedItems = items.filter(i => selected.includes(i.path));
  const ready = !!path && data?.path === path && !loading && !busy;
  const first = selectedItems[0];
  const update = (change: Partial<Preferences>) => {
    setPrefs(current => {
      const next = { ...current, ...change };
      try { localStorage.setItem(PREFS, JSON.stringify(next)); } catch { setError(strings.failed); }
      return next;
    });
  };
  const navigate = (next: string) => {
    if (busyRef.current) return;
    setError("");
    setTabs(current => current.map(t => t.id === active ? { ...t, history: [...t.history.slice(0, t.index + 1), next], index: t.index + 1 } : t));
    setQuery(""); setSpotlight(""); setSelected([]); setMenu(null);
  };
  const travel = (offset: number) => {
    setError("");
    setTabs(current => current.map(t => t.id === active ? { ...t, index: Math.max(0, Math.min(t.history.length - 1, t.index + offset)) } : t));
    setQuery(""); setSpotlight(""); setSelected([]);
  };
  const newTab = () => { setError(""); const id = ++sequence.current; setTabs(current => [...current, { id, history: [path || places[0]?.path || "/"], index: 0 }]); setActive(id); setQuery(""); setSpotlight(""); setSelected([]); };
  const closeTab = () => {
    if (tabs.length === 1) { void getCurrentWindow().close().catch(() => setError(strings.failed)); return; }
    const remaining = tabs.filter(t => t.id !== active); setTabs(remaining); setActive(remaining[0].id); setQuery(""); setSpotlight(""); setSelected([]);
  };
  React.useEffect(() => {
    let live = true;
    void invoke<Place[]>("files_places").then(places => {
      if (!live) return;
      setPlaces(places);
      if (places[0]) setTabs(current => current.map(t => t.history.length ? t : { ...t, history: [places[0].path] }));
    }).catch(() => { if (live) setError(strings.loadFailed); });
    return () => { live = false; };
  }, []);
  React.useEffect(() => {
    if (!path) return;
    let live = true;
    setLoading(true); setSelected([]);
    const command = spotlight ? "files_search" : "files_list";
    void invoke<Listing>(command, { path, hidden: prefs.hidden, ...(spotlight ? { query: spotlight } : {}) }).then(result => {
      if (live) setData({ ...result, path });
    }).catch(() => { if (live) { setData(null); setError(strings.loadFailed); } }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [path, prefs.hidden, spotlight, revision, active]);
  React.useEffect(() => {
    let disposed = false; let unlisten: (() => void) | undefined;
    void getCurrentWindow().onDragDropEvent(event => {
      if (event.payload.type !== "drop") return;
      const current = latest.current;
      if (!current.path || current.busy || current.dialog) return;
      const paths = [...new Set(event.payload.paths)].filter(p => p.startsWith("/"));
      if (paths.length) setDialog({ action: "drop", paths, folder: current.path, value: "" });
    }).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(() => { if (!disposed) setMessage(strings.dropFailed); });
    return () => { disposed = true; unlisten?.(); };
  }, []);
  React.useEffect(() => {
    if (!menu) return;
    const firstAction = document.querySelector<HTMLButtonElement>(".files-menu button:not(:disabled)"); firstAction?.focus();
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close); window.addEventListener("blur", close);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("blur", close); };
  }, [menu]);

  async function batch(action: string, paths: string[], folder = path, name?: string) {
    if (busyRef.current || !paths.length) return;
    busyRef.current = true; setBusy(true); setError(""); setMessage(""); setMenu(null);
    const history: Undo[] = []; let completed = 0;
    try {
      for (const source of paths) {
        const result = await invoke<string>("files_action", { action, path: source, target: folder, name: name ?? null });
        completed++;
        if (["move", "rename", "trash"].includes(action) && result) history.unshift({ from: result, to: source });
      }
      setMessage(format(strings.done, completed));
    } catch (reason) {
      const safe = typeof reason === "string" && /^(An item with this name|A folder cannot|The operation failed|Use a name|Could not create|Could not compress|Manage this special)/.test(reason) ? reason : strings.failed;
      setError(`${completed ? format(strings.partial, completed) + " " : ""}${safe}`);
    } finally {
      if (history.length) setUndo(history);
      busyRef.current = false; setBusy(false); setSelected([]); setRevision(r => r + 1);
    }
  }
  async function performUndo() {
    if (!undo.length || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    const pending = [...undo];
    try {
      while (pending.length) {
        const item = pending[0];
        await invoke("files_action", { action: "move", path: item.from, target: parent(item.to), name: basename(item.to) });
        pending.shift();
      }
      setMessage(format(strings.done, undo.length));
    } catch { setError(strings.undoFailed); }
    finally { setUndo(pending); busyRef.current = false; setBusy(false); setRevision(r => r + 1); }
  }
  async function openItem(item: Entry) {
    if (item.directory && !item.package) navigate(item.path);
    else await batch("open", [item.path]);
  }
  async function clipboard(move = false) {
    if (!ready || !selectedItems.length) return;
    const paths = selectedItems.map(i => i.path);
    try { await invoke("files_clipboard", { paths }); cut.current = move ? paths : []; setMessage(format(move ? strings.cutReady : strings.clipboard, paths.length)); }
    catch { setError(strings.failed); }
  }
  async function paste() {
    if (!ready) return;
    try {
      const paths = await invoke<string[]>("files_clipboard");
      if (!paths.length) { setMessage(strings.clipboardEmpty); return; }
      const move = cut.current.length > 0 && paths.length === cut.current.length && paths.every((p, i) => p === cut.current[i]);
      cut.current = [];
      await batch(move ? "move" : "copy", paths);
    } catch { setError(strings.failed); }
  }
  async function showDialog(action: Dialog["action"]) {
    if (!ready && action !== "go") return;
    const paths = selectedItems.map(i => i.path);
    if (!["mkdir", "go"].includes(action) && !paths.length) return;
    setMenu(null);
    const next: Dialog = { action, paths, folder: path, value: action === "rename" ? first.name : ["copy", "move", "go"].includes(action) ? path : "" };
    if (action === "tags") {
      setBusy(true); busyRef.current = true;
      try { const tags = await invoke<string[]>("files_tags", { path: paths[0] }); next.value = tags.join(", "); }
      catch { setError(strings.tagFailed); return; }
      finally { setBusy(false); busyRef.current = false; }
    }
    setDialog(next);
  }
  const expandPath = (input: string) => input === "~" ? places[0]?.path || input : input.startsWith("~/") ? `${places[0]?.path || ""}/${input.slice(2)}` : input;
  async function submitDialog() {
    if (!dialog) return;
    const next = dialog;
    if (next.action === "go") { setDialog(null); navigate(expandPath(next.value)); return; }
    if (next.action === "tags") {
      setBusy(true); busyRef.current = true;
      try { await invoke("files_tags", { path: next.paths[0], values: [...new Set(next.value.split(",").map(t => t.trim()).filter(Boolean))] }); setDialog(null); setMessage(strings.tagsSaved); }
      catch { setError(strings.tagFailed); }
      finally { setBusy(false); busyRef.current = false; }
      return;
    }
    setDialog(null);
    await batch(next.action === "drop" ? "copy" : next.action, next.action === "mkdir" ? [next.folder] : next.paths,
      ["copy", "move"].includes(next.action) ? expandPath(next.value) : next.folder, ["mkdir", "rename"].includes(next.action) ? next.value : undefined);
  }
  function select(item: Entry, event: React.MouseEvent) {
    if (!ready) return;
    if (event.shiftKey && anchor.current) {
      const start = items.findIndex(i => i.path === anchor.current), end = items.indexOf(item);
      setSelected(items.slice(Math.max(0, Math.min(start, end)), Math.max(start, end) + 1).map(i => i.path));
    } else if (event.metaKey || event.ctrlKey) {
      setSelected(current => current.includes(item.path) ? current.filter(p => p !== item.path) : [...current, item.path]); anchor.current = item.path;
    } else { setSelected([item.path]); anchor.current = item.path; }
    listRef.current?.focus();
  }
  function keydown(event: React.KeyboardEvent) {
    if (dialog || busy) return;
    const editing = (event.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]");
    const command = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (command && key === "f") { event.preventDefault(); searchRef.current?.focus(); return; }
    if (editing) return;
    if (command && key === "t") { event.preventDefault(); newTab(); return; }
    if (command && key === "w") { event.preventDefault(); closeTab(); return; }
    if (command && event.shiftKey && key === "g") { event.preventDefault(); void showDialog("go"); return; }
    if (!ready) return;
    if (command && event.shiftKey && key === "n") { event.preventDefault(); void showDialog("mkdir"); }
    else if (command && event.shiftKey && key === ">") { event.preventDefault(); update({ hidden: !prefs.hidden }); }
    else if (command && key === "a") { event.preventDefault(); setSelected(items.map(i => i.path)); }
    else if (command && key === "c") { event.preventDefault(); void clipboard(); }
    else if (command && key === "x") { event.preventDefault(); void clipboard(true); }
    else if (command && key === "v") { event.preventDefault(); void paste(); }
    else if (command && key === "z") { event.preventDefault(); void performUndo(); }
    else if (command && key === "backspace") { event.preventDefault(); void showDialog("trash"); }
    else if (command && key === "arrowup") { event.preventDefault(); navigate(parent(path)); }
    else if (command && key === "arrowdown" && first) { event.preventDefault(); void openItem(first); }
    else if (event.altKey && ["arrowleft", "arrowright"].includes(key)) { event.preventDefault(); travel(key === "arrowleft" ? -1 : 1); }
    else if (key === " " && first) { event.preventDefault(); void batch("preview", selectedItems.map(i => i.path)); }
    else if (key === "enter" && selectedItems.length === 1) { event.preventDefault(); void showDialog("rename"); }
    else if (["arrowdown", "arrowup", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
      const offset = key === "arrowup" || key === "arrowleft" ? -1 : 1;
      const index = Math.max(0, Math.min(items.length - 1, items.findIndex(i => i.path === selected.at(-1)) + offset));
      const next = items[index];
      if (next) { setSelected(event.shiftKey ? [...new Set([...selected, next.path])] : [next.path]); anchor.current = next.path; listRef.current?.querySelectorAll(".files-entry")[index]?.scrollIntoView({ block: "nearest" }); }
    } else if (key === "escape") { setMenu(null); setSelected([]); }
  }
  const actions = [
    { label: strings.open, disabled: !first, run: () => first && openItem(first) },
    { label: strings.quickLook, disabled: !first, run: () => batch("preview", selectedItems.map(i => i.path)) },
    { label: strings.rename, disabled: selectedItems.length !== 1, run: () => showDialog("rename") },
    { label: strings.copy, disabled: !first, run: () => clipboard() },
    { label: strings.cut, disabled: !first, run: () => clipboard(true) },
    { label: strings.copyTo, disabled: !first, run: () => showDialog("copy") },
    { label: strings.move, disabled: !first, run: () => showDialog("move") },
    { label: strings.duplicate, disabled: !first, run: () => batch("duplicate", selectedItems.map(i => i.path)) },
    { label: strings.compress, disabled: selectedItems.length !== 1, run: () => batch("compress", selectedItems.map(i => i.path)) },
    { label: strings.tags, disabled: selectedItems.length !== 1, run: () => showDialog("tags") },
    { label: strings.trash, disabled: !first, run: () => showDialog("trash") },
  ];
  return <main className="files-root" onKeyDown={keydown}>
    <style>{`
      .files-root {height:100%; display:flex; flex-direction:column; font:12px ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--bb-text); background:var(--bb-pane)}
      .files-root * {box-sizing:border-box} .files-root button:disabled {opacity:.35;cursor:default!important}
      .files-root button:focus-visible,.files-root input:focus-visible,.files-root select:focus-visible,.files-list:focus-visible {outline:2px solid var(--bb-accent);outline-offset:-2px}
      .files-root button:not(:disabled):hover {background:color-mix(in srgb,var(--bb-accent) 9%,var(--bb-pane-2))!important}
      .files-secondary {color:var(--bb-dim);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .files-nav {border:0;background:transparent;color:var(--bb-text);font:inherit;border-radius:5px;text-align:left;padding:9px 12px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .files-label {color:var(--bb-dim);font-size:10px;letter-spacing:.13em;margin:22px 12px 8px}
      .files-entry[aria-selected=true] {border-color:color-mix(in srgb,var(--bb-accent) 45%,transparent)!important}
      .files-list {min-height:0;overflow:auto;flex:1;outline:none}
      .files-menu {position:fixed;z-index:10;min-width:190px;padding:5px;background:var(--bb-pane-2);border:1px solid var(--bb-line);border-radius:8px;box-shadow:0 12px 36px #0005;display:flex;flex-direction:column}
      @media(max-width:800px){.files-entry[data-grid=false]{grid-template-columns:23px minmax(100px,1fr) 80px!important}.files-entry[data-grid=false] .files-secondary:nth-last-child(3),.files-entry[data-grid=false] .files-secondary:nth-last-child(2){display:none}.files-sidebar{width:155px!important}.files-toolbar{gap:5px!important}}
    `}</style>
    <header style={{ padding: "16px 20px 10px", borderBottom: "1px solid var(--bb-line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 13 }}><FolderIcon size={26}/><strong style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-.05em" }}>{strings.title}</strong><span className="files-secondary">{strings.subtitle}</span><span style={{ flex: 1 }}/><button style={control} onClick={() => setHelp(!help)} aria-label={strings.help}>?</button></div>
      <div className="files-toolbar" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button style={control} aria-label={strings.back} title={strings.back} disabled={busy || tab.index < 1} onClick={() => travel(-1)}>←</button>
        <button style={control} aria-label={strings.forward} title={strings.forward} disabled={busy || tab.index >= tab.history.length - 1} onClick={() => travel(1)}>→</button>
        <button style={control} aria-label={strings.up} title={strings.up} disabled={!path || path === "/" || busy} onClick={() => navigate(parent(path))}>↑</button>
        <button style={{ ...control, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 50 }} title={path || strings.goTo} aria-label={strings.goTo} onClick={() => void showDialog("go")}>{path || "…"}</button>
        <button style={control} disabled={!path || busy} title={strings.refresh} aria-label={strings.refresh} onClick={() => { setError(""); setRevision(r => r + 1); }}>↻</button>
        <button style={control} disabled={!ready} onClick={() => void showDialog("mkdir")}>{strings.newFolder}</button>
        <button style={control} disabled={!ready} onClick={() => void batch("reveal", [first?.path || path])}>{strings.finder}</button>
      </div>
    </header>
    {help && <aside style={{ padding: "12px 20px", background: "var(--bb-pane-2)", borderBottom: "1px solid var(--bb-line)", lineHeight: 1.8 }}><p>{strings.helpText}</p><p className="files-secondary" style={{ whiteSpace: "normal", lineHeight: 1.6 }}>{strings.finderHint}</p></aside>}
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <nav className="files-sidebar" aria-label={strings.locations} style={{ width: 195, flexShrink: 0, borderRight: "1px solid var(--bb-line)", background: "var(--bb-bg)", padding: "0 8px 16px", overflow: "auto" }}>
        <p className="files-label">{strings.favorites}</p>
        {places.slice(0, 7).map(place => <button key={place.path} className="files-nav" style={{ display: "block", width: "100%", color: path === place.path ? "var(--bb-accent)" : undefined, background: path === place.path ? "var(--bb-pane-2)" : undefined }} disabled={busy} onClick={() => navigate(place.path)}>{place.name}</button>)}
        {prefs.favorites.map(place => <div key={place.path} style={{ display: "flex" }}><button className="files-nav" style={{ flex: 1 }} disabled={busy} onClick={() => navigate(place.path)} title={place.path}>{place.name}</button><button className="files-nav" aria-label={`${strings.unpin}: ${place.name}`} onClick={() => update({ favorites: prefs.favorites.filter(p => p.path !== place.path) })}>×</button></div>)}
        <button className="files-nav" style={{ color: "var(--bb-dim)", width: "100%" }} aria-label={strings.pin} title={strings.pin} disabled={!ready || prefs.favorites.some(p => p.path === path)} onClick={() => update({ favorites: [...prefs.favorites, { path, name: basename(path) }].slice(0, 50) })}>＋ {strings.favorites.toLocaleLowerCase()}</button>
        <p className="files-label">{strings.locations}</p>
        {places.slice(7).map(place => <button key={place.path} className="files-nav" style={{ display: "block", width: "100%" }} disabled={busy} onClick={() => navigate(place.path)}>{place.name}</button>)}
        <button className="files-nav" style={{ width: "100%" }} disabled={busy} onClick={() => navigate("/")}>/</button>
        <div style={{ margin: "28px 12px 0", color: "var(--bb-mute)", lineHeight: 1.8, fontSize: 10 }}>{strings.destinationHint}</div>
      </nav>
      <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div role="tablist" style={{ display: "flex", borderBottom: "1px solid var(--bb-line)", overflow: "auto", flexShrink: 0 }}>
          {tabs.map(t => <button key={t.id} role="tab" aria-selected={t.id === active} className="files-nav" disabled={busy} style={{ borderRadius: 0, maxWidth: 180, borderBottom: `2px solid ${t.id === active ? "var(--bb-accent)" : "transparent"}` }} onClick={() => { setError(""); setActive(t.id); setQuery(""); setSpotlight(""); setSelected([]); }}>{basename(t.history[t.index] || "…")}</button>)}
          <button className="files-nav" title={strings.tab} aria-label={strings.tab} disabled={busy} onClick={newTab}>＋</button><button className="files-nav" title={strings.closeTab} aria-label={strings.closeTab} disabled={busy} onClick={closeTab}>×</button>
        </div>
        <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--bb-line)" }}>
          <form style={{ display: "flex", flex: 1, minWidth: 170, gap: 6 }} onSubmit={e => { e.preventDefault(); if (query.trim()) setSpotlight(query.trim()); }}>
            <input type="search" ref={searchRef} aria-label={strings.search} placeholder={strings.searchPlaceholder} value={query} style={input} onChange={e => { setQuery(e.target.value); if (spotlight) setSpotlight(""); }} disabled={busy}/>
            <button style={control} title={strings.searchSubfolders} aria-label={strings.searchSubfolders} disabled={!query.trim() || busy || !path}>⌕</button>
          </form>
          <select aria-label={strings.sort} value={prefs.sort} style={control} onChange={e => update({ sort: e.target.value as Preferences["sort"] })}><option value="name">{strings.sortName}</option><option value="modified">{strings.sortModified}</option><option value="size">{strings.sortSize}</option><option value="kind">{strings.sortKind}</option></select>
          <button aria-label={strings.direction} title={prefs.reverse ? strings.sortDescending : strings.sortAscending} aria-pressed={prefs.reverse} style={control} onClick={() => update({ reverse: !prefs.reverse })}>{prefs.reverse ? "↓" : "↑"}</button>
          <button aria-label={strings.list} title={strings.list} aria-pressed={prefs.view === "list"} style={control} onClick={() => update({ view: "list" })}>☰</button>
          <button aria-label={strings.grid} title={strings.grid} aria-pressed={prefs.view === "grid"} style={control} onClick={() => update({ view: "grid" })}>⊞</button>
          <button aria-label={strings.info} title={strings.info} aria-pressed={info} style={control} onClick={() => setInfo(!info)}>ⓘ</button>
        </div>
        {spotlight && <p style={{ margin: 0, padding: "8px 14px", color: "var(--bb-dim)", fontSize: 10 }}>{strings.searchHint}</p>}
        <div style={{ display: "flex", gap: 5, padding: "8px 14px", borderBottom: "1px solid var(--bb-line)", flexWrap: "wrap" }}>
          {actions.filter(a => [strings.quickLook, strings.copy, strings.cut, strings.rename, strings.trash].includes(a.label)).map(action => <button key={action.label} className="files-nav" style={{ padding: "5px 8px", fontSize: 10 }} disabled={!ready || action.disabled} onClick={() => void action.run()}>{action.label}</button>)}
          <button className="files-nav" style={{ padding: "5px 8px", fontSize: 10 }} disabled={!ready} onClick={() => void paste()}>{strings.paste}</button>
          <button className="files-nav" style={{ padding: "5px 8px", fontSize: 10 }} aria-label={strings.more} aria-haspopup="menu" disabled={!ready} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setMenu(menu ? null : { x: Math.max(0, Math.min(rect.left, window.innerWidth - 205)), y: Math.max(0, Math.min(rect.bottom, window.innerHeight - 440)) }); }}>{strings.more}</button>
          <button className="files-nav" style={{ padding: "5px 8px", fontSize: 10, marginLeft: "auto" }} aria-label={strings.undo} title={strings.undo} disabled={busy || !undo.length} onClick={() => void performUndo()}>↶</button>
        </div>
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div ref={listRef} className="files-list" tabIndex={0} role="listbox" aria-multiselectable="true" aria-label={strings.fileList} aria-busy={loading || busy}>
            {loading ? <p style={{ margin: 40, color: "var(--bb-dim)" }}>{strings.loading}</p> : <>
              <div style={prefs.view === "grid" ? { padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(115px,1fr))", gap: 7, alignContent: "start" } : {}}>
                {items.map(item => <FileTile key={item.path} item={item} grid={prefs.view === "grid"} selected={selected.includes(item.path)} paths={selected.includes(item.path) ? selected : [item.path]}
                  onSelect={event => select(item, event)} onOpen={() => { if (ready) void openItem(item); }} onError={() => setError(strings.failed)}
                  onMenu={event => { event.preventDefault(); if (!ready) return; if (!selected.includes(item.path)) setSelected([item.path]); setMenu({ x: Math.max(0, Math.min(event.clientX, window.innerWidth - 205)), y: Math.max(0, Math.min(event.clientY, window.innerHeight - 440)) }); }}/>) }
              </div>
              {!items.length && !error && <div style={{ textAlign: "center", padding: "70px 20px", color: "var(--bb-dim)" }}><FolderIcon size={46}/><p style={{ fontSize: 16, color: "var(--bb-text)" }}>{query || spotlight ? strings.noMatches : strings.empty}</p><p>{query || spotlight ? strings.noMatchesHint : strings.emptyHint}</p></div>}
            </>}
          </div>
          {info && <aside style={{ width: 230, overflow: "auto", padding: 18, borderLeft: "1px solid var(--bb-line)", flexShrink: 0 }}>
            <FolderIcon size={44} file={first ? !first.directory || first.package : false}/><h2 style={{ fontSize: 15, overflowWrap: "anywhere", margin: "16px 0 24px" }}>{first?.name || basename(path)}</h2>
            <dl style={{ lineHeight: 1.8, overflowWrap: "anywhere" }}><dt className="files-secondary">{strings.location}</dt><dd style={{ margin: "0 0 16px", fontSize: 10 }}>{first?.path || path}</dd>{first && <><dt className="files-secondary">{strings.type}</dt><dd style={{ margin: "0 0 16px" }}>{kind(first)}</dd><dt className="files-secondary">{strings.size}</dt><dd style={{ margin: "0 0 16px" }}>{first.directory ? "—" : sizeLabel(first.size)}</dd><dt className="files-secondary">{strings.modified}</dt><dd style={{ margin: "0 0 16px" }}>{first.modified ? new Date(first.modified * 1000).toLocaleString() : strings.unavailable}</dd></>}</dl>
            <button style={control} disabled={!ready} onClick={() => { void navigator.clipboard.writeText(first?.path || path).then(() => setMessage(strings.copiedPath)).catch(() => setError(strings.failed)); }}>{strings.copyPath}</button>
            {actions.slice(4).map(action => <button key={action.label} className="files-nav" style={{ display: "block", width: "100%", marginTop: 6 }} disabled={!ready || action.disabled} onClick={() => void action.run()}>{action.label}</button>)}
          </aside>}
        </div>
        {(data?.truncated || data?.skipped) ? <p style={{ padding: "6px 14px", margin: 0, color: "var(--bb-warn)", fontSize: 10 }}>{data.truncated ? strings.limit : ""} {data.skipped ? format(strings.skipped, data.skipped) : ""}</p> : null}
        <footer style={{ borderTop: "1px solid var(--bb-line)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 16, color: "var(--bb-dim)", fontSize: 10 }}>
          <span>{selectedItems.length ? format(strings.selected, selectedItems.length) : format(strings.items, items.length)}</span><span style={{ flex: 1 }}/>
          <label style={{ display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={prefs.hidden} onChange={e => update({ hidden: e.target.checked })}/>{strings.hidden}</label>
        </footer>
      </section>
    </div>
    <div role="status" style={{ padding: message || busy ? "9px 20px" : 0, background: "var(--bb-pane-2)", color: "var(--bb-dim)", fontSize: 11 }}>{busy ? strings.busy : message}</div>
    {error && <div role="alert" style={{ padding: "12px 20px", background: "var(--bb-pane-2)", color: "var(--bb-bad)", lineHeight: 1.6 }}>{error} <button style={control} disabled={busy} onClick={() => { setError(""); setRevision(r => r + 1); if (!path) void invoke<Place[]>("files_places").then(p => { setPlaces(p); if (p[0]) navigate(p[0].path); }).catch(() => setError(strings.loadFailed)); }}>{strings.retry}</button></div>}
    {menu && <div role="menu" className="files-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={e => e.stopPropagation()}>{actions.map(action => <button role="menuitem" key={action.label} className="files-nav" disabled={!ready || action.disabled} onClick={() => { setMenu(null); void action.run(); }}>{action.label}</button>)}</div>}
    {dialog && <FileDialog value={dialog} busy={busy} onChange={value => setDialog(current => current ? { ...current, value } : null)} onCancel={() => { if (!busy) setDialog(null); }} onSubmit={() => void submitDialog()}/>}
  </main>;
}

function FileDialog({ value, busy, onChange, onCancel, onSubmit }: { value: Dialog; busy: boolean; onChange: (value: string) => void; onCancel: () => void; onSubmit: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current?.querySelector<HTMLInputElement>("input");
    if (element) { element.focus(); if (value.action === "rename") element.setSelectionRange(0, value.value.lastIndexOf(".") > 0 ? value.value.lastIndexOf(".") : value.value.length); else element.select(); }
    else ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { previous?.focus(); };
  }, []);
  const titles = { mkdir: strings.newFolder, rename: strings.rename, copy: strings.copyTo, move: strings.move, trash: format(strings.trashConfirm, value.paths.length), tags: strings.tags, go: strings.goTo, drop: strings.drop };
  const destructive = value.action === "trash";
  const hasInput = !["trash", "drop"].includes(value.action);
  return <div style={{ position: "fixed", inset: 0, background: "#0007", zIndex: 20, display: "grid", placeItems: "center", padding: 24 }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="files-dialog-title" aria-describedby="files-dialog-hint" style={{ width: "min(480px,100%)", background: "var(--bb-pane)", border: "1px solid var(--bb-line-2)", borderRadius: 12, padding: 24, boxShadow: "0 20px 80px #0005" }} onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onCancel(); }
      if (event.key === "Tab") {
        const focusable = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)") || [])];
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <h2 id="files-dialog-title" style={{ fontSize: 17, margin: "0 0 16px" }}>{titles[value.action]}</h2>
      <p id="files-dialog-hint" style={{ lineHeight: 1.7, color: "var(--bb-dim)" }}>{destructive ? strings.trashHint : value.action === "drop" ? strings.dropHint : value.action === "tags" ? strings.tagHint : value.action === "go" ? strings.pathHint : strings.destinationHint}</p>
      <form onSubmit={event => { event.preventDefault(); onSubmit(); }}>
        {hasInput && <label style={{ display: "grid", gap: 8, marginTop: 18 }}>{["copy", "move"].includes(value.action) ? strings.destination : value.action === "go" ? strings.path : value.action === "tags" ? strings.tags : strings.name}
          <input style={input} aria-label={["copy", "move"].includes(value.action) ? strings.destination : value.action === "go" ? strings.path : value.action === "tags" ? strings.tags : strings.name} value={value.value} onChange={e => onChange(e.target.value)} disabled={busy} required={value.action !== "tags"} placeholder={value.action === "tags" ? strings.tagPlaceholder : undefined}/>
        </label>}
        <div style={{ display: "flex", justifyContent: "end", gap: 10, marginTop: 24 }}><button type="button" style={control} disabled={busy} onClick={onCancel}>{strings.cancel}</button><button style={{ ...control, color: destructive ? "var(--bb-bad)" : "var(--bb-accent)" }} disabled={busy || (hasInput && value.action !== "tags" && !value.value.trim())}>{value.action === "mkdir" ? strings.create : value.action === "trash" ? strings.trash : value.action === "drop" ? strings.copy : value.action === "go" ? strings.go : strings.save}</button></div>
      </form>
    </div>
  </div>;
}
export function Settings() {
  const [error, setError] = React.useState(false);
  return <div style={{ font: "inherit", lineHeight: 1.7 }}><p>{strings.settingsHint}</p><button style={control} onClick={() => { setError(false); void openWindow().catch(() => setError(true)); }}>{strings.openFiles}</button>{error && <p role="alert">{strings.openFailed}</p>}</div>;
}
export default function Files({ isWindowMode = false, iconSize = 24, slotSize = 36, showLabels = true, showBorder = true }: { isWindowMode?: boolean; iconSize?: number; slotSize?: number; showLabels?: boolean; showBorder?: boolean }) {
  const [error, setError] = React.useState(false);
  if (isWindowMode) return <FilesWindow/>;
  return <button aria-label={strings.openFiles} title={error ? strings.openFailed : strings.openFiles} data-bb-extension-button style={{ ...control, minWidth: slotSize, height: slotSize, padding: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderColor: showBorder ? "var(--bb-line)" : "transparent" }} onClick={() => { setError(false); void openWindow().catch(() => setError(true)); }}><FolderIcon size={iconSize}/>{showLabels && <span data-bb-extension-label style={{ fontSize: 10 }}>{strings.title}</span>}</button>;
}
