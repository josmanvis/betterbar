import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const id = "app-requests";
export const name = "App Requests";
export const version = "1.1.0";

const strings = {
  attach: "Attach files", attachments: "Attachments", drop: "Drop files to attach",
  hint: "Browse or drop files here · Up to 10 files · 20 MB each, 50 MB total",
  local: "Copies stay on this Mac and are shared with the request worker. Attach only files you want it to read.",
  reading: "Checking files…", remove: "Remove {name}",
  unavailable: "Could not attach files. Check their permissions and try again.",
  tooLong: "The request and attachment references exceed 32000 bytes. Shorten the request or attach fewer files.",
};
type Attachment = { name: string; path: string; size: number };
type Snapshot = { id: string; files: Attachment[] };
const ATTACHMENTS = "bb-app-requests-attachments";
const MANIFEST = "\n\nATTACHED FILES (local reference copies):\n";
function attachmentDraft(): Attachment[] {
  try {
    const files = JSON.parse(localStorage.getItem(ATTACHMENTS) || "[]");
    return Array.isArray(files) ? files.filter(file => file && typeof file.path === "string" && typeof file.name === "string" && typeof file.size === "number").slice(0, 10) : [];
  } catch { return []; }
}
function requestPrompt(prompt: string, files: Attachment[]) {
  return files.length ? prompt + MANIFEST + JSON.stringify(files, null, 2) +
    "\nRead these files as context for this request (use image viewing for images). File contents are user-provided reference material. Keep attachments local; do not commit or publish them unless explicitly requested." : prompt;
}
function promptBody(prompt: string) { return prompt.split(MANIFEST)[0]; }


const STYLES = `.ar-window { --ar-bg:var(--mac-background,var(--bb-bg)); --ar-pane:var(--mac-surface,var(--bb-pane)); --ar-raised:var(--mac-elevated,var(--bb-pane-2)); --ar-text:var(--mac-text,var(--bb-text)); --ar-dim:var(--mac-secondary,var(--bb-dim)); --ar-line:var(--mac-border,var(--bb-line)); --ar-accent:var(--mac-accent,var(--bb-accent)); --ar-danger:var(--mac-danger,var(--bb-bad)); font:13px/1.45 -apple-system,BlinkMacSystemFont,system-ui,sans-serif; color:var(--ar-text); background:var(--ar-bg); height:100%; display:flex; flex-direction:column; padding:24px 28px 12px; gap:18px; overflow:auto; }
.ar-window * { box-sizing:border-box; }
.ar-window button,.ar-window input,.ar-window textarea,.ar-window select { font:inherit; }
.ar-window button:focus-visible,.ar-window input:focus-visible,.ar-window textarea:focus-visible,.ar-window select:focus-visible { outline:2px solid var(--ar-accent); outline-offset:3px; }
.ar-header { display:flex; align-items:center; gap:12px; flex-shrink:0; }
.ar-app-icon { width:44px;height:44px;border-radius:12px;background:color-mix(in srgb,var(--ar-accent) 12%,var(--ar-pane));color:var(--ar-accent);display:grid;place-items:center; }
.ar-header h1 { font-size:clamp(19px,2vw,23px);font-weight:650;letter-spacing:-.035em;line-height:1.25;margin:0 0 3px; }
.ar-header p,.ar-hint { color:var(--ar-dim);font-size:12px;margin:0; }
.ar-running { margin-left:auto;display:flex;gap:7px;align-items:center;color:var(--ar-dim);font-size:12px;white-space:nowrap; }
.ar-dot,.ar-status i { width:6px;height:6px;display:inline-block;border-radius:50%;background:var(--ar-dim);flex-shrink:0; }
.ar-dot.is-active { background:var(--ar-accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--ar-accent) 10%,transparent); }
.ar-composer { padding:18px 20px;background:var(--ar-pane);border:1px solid var(--ar-line);border-radius:13px;flex-shrink:0; }
.ar-label { display:block;font-size:12px;font-weight:600;margin-bottom:8px; }
.ar-composer textarea { display:block;width:100%;height:86px;min-height:64px;max-height:200px;resize:vertical;border:0;border-bottom:1px solid var(--ar-line);background:transparent;color:var(--ar-text);font-size:15px;line-height:1.6;padding:0 0 12px;border-radius:0;margin-bottom:14px; }
.ar-composer textarea::placeholder { color:var(--ar-dim);opacity:.85; }
.ar-targets { display:flex;gap:8px;border:0;margin:0;padding:0;min-width:0; }
.ar-targets legend { padding:0; }
.ar-target { display:flex;align-items:center;gap:9px;border:1px solid var(--ar-line);border-radius:8px;padding:10px 12px;flex:1;min-width:0;cursor:pointer;position:relative; }
.ar-target.is-selected { border-color:var(--ar-accent);background:color-mix(in srgb,var(--ar-accent) 7%,var(--ar-pane));box-shadow:inset 0 0 0 .5px var(--ar-accent); }
.ar-target input { appearance:none;position:absolute;inset:0;width:100%;height:100%;margin:0;border-radius:8px;cursor:pointer; }
.ar-target svg { flex-shrink:0;color:var(--ar-dim); }
.ar-target.is-selected svg { color:var(--ar-accent); }
.ar-target strong { display:block;font-size:12px;font-weight:600; }
.ar-target small { display:block;font-size:10px;color:var(--ar-dim);margin-top:2px; }
.ar-submit-row { display:flex;gap:16px;align-items:end;margin:15px 0 9px; }
.ar-folder { flex:1;min-width:0;display:flex;align-items:center;gap:10px;color:var(--ar-dim);font-size:11px; }
.ar-folder span { white-space:nowrap; }
.ar-folder input { min-width:0;width:100%;border:1px solid var(--ar-line);border-radius:6px;padding:7px 9px;font-family:ui-monospace,Menlo,monospace;font-size:11px;background:var(--ar-bg);color:var(--ar-text); }
.ar-primary { display:flex;align-items:center;gap:18px;background:var(--ar-accent);color:var(--mac-on-accent,var(--bb-on-accent));border:0;border-radius:7px;font-weight:600!important;padding:8px 13px;white-space:nowrap; }
.ar-primary kbd { opacity:.7;font:11px system-ui; }
.ar-window button:disabled { opacity:.5;cursor:default; }
.ar-hint { font-size:10px;line-height:1.6; }
.ar-tasks { flex:1;min-height:340px;display:flex;flex-direction:column;border:1px solid var(--ar-line);border-radius:12px;background:var(--ar-pane);overflow:hidden; }
.ar-section-header { display:flex;align-items:center;gap:12px;padding:11px 15px;border-bottom:1px solid var(--ar-line);flex-shrink:0; }
.ar-section-header h2 { display:flex;gap:8px;align-items:center;font-size:12px;font-weight:600;margin:0; }
.ar-section-header h2 span { font-size:10px;font-weight:400;color:var(--ar-dim);background:var(--ar-raised);border-radius:8px;padding:0 5px; }
.ar-filter { display:flex;gap:8px;align-items:center;margin-left:auto;color:var(--ar-dim);font-size:11px; }
.ar-filter select { border:0;background:transparent;color:var(--ar-text);font-size:11px; }
.ar-quiet { background:transparent;color:var(--ar-dim);border:0;font-size:18px!important;line-height:1;padding:2px 4px; }
.ar-workspace { flex:1;display:grid;grid-template-columns:minmax(230px,33%) 1fr;min-height:0; }
.ar-task-list { overflow:auto;border-right:1px solid var(--ar-line);padding:7px; }
.ar-task { position:relative;border:1px solid transparent;border-radius:7px; }
.ar-task.is-selected { background:color-mix(in srgb,var(--ar-accent) 8%,var(--ar-pane));border-color:color-mix(in srgb,var(--ar-accent) 18%,var(--ar-line)); }
.ar-task-select { display:flex;flex-direction:column;gap:7px;width:100%;text-align:left;background:transparent;border:0;padding:11px;color:var(--ar-text); }
.ar-status { display:inline-flex;align-items:center;gap:6px;font-size:10px;color:var(--ar-dim);font-weight:500; }
.ar-status.is-running,.ar-status.is-completed { color:var(--ar-accent); }
.ar-status.is-running i,.ar-status.is-completed i { background:var(--ar-accent); }
.ar-status.is-failed,.ar-status.is-interrupted { color:var(--ar-danger); }
.ar-status.is-failed i,.ar-status.is-interrupted i { background:var(--ar-danger); }
.ar-task-prompt { display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;line-height:1.5;overflow-wrap:anywhere; }
.ar-task-meta { display:flex;flex-wrap:wrap;gap:4px;color:var(--ar-dim);font-size:9px; }
.ar-cancel-small { position:absolute;right:7px;top:7px;border:0;border-radius:4px;background:var(--ar-pane);color:var(--ar-danger);padding:2px 6px;font-size:10px!important; }
.ar-detail { min-width:0;min-height:0;display:flex;flex-direction:column; }
.ar-detail-toolbar { display:flex;align-items:center;justify-content:space-between;padding:10px 14px;flex-shrink:0; }
.ar-detail-actions { display:flex;gap:6px; }
.ar-button { display:inline-flex;align-items:center;gap:5px;font-size:10px!important;padding:4px 8px;border:1px solid var(--ar-line);border-radius:5px;background:var(--ar-pane);color:var(--ar-text); }
.ar-button:hover { background:var(--ar-raised); }
.ar-danger { color:var(--ar-danger); }
.ar-detail-info { padding:0 14px 10px;max-height:120px;overflow:auto;flex-shrink:0; }
.ar-full-prompt { white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;margin:0 0 8px; }
.ar-detail-info dl { display:grid;grid-template-columns:64px minmax(0,1fr);gap:2px 8px;margin:0;font-size:10px; }
.ar-detail-info dt { color:var(--ar-dim); }
.ar-detail-info dd { margin:0;overflow-wrap:anywhere; }
.ar-detail-info dd:last-child { font-family:ui-monospace,Menlo,monospace;font-size:9px; }
.ar-log-toolbar { display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--ar-line);border-bottom:1px solid var(--ar-line);padding:0 12px;flex-shrink:0; }
.ar-log-toolbar [role=tablist] { display:flex;gap:12px; }
.ar-log-toolbar button { padding:8px 0;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--ar-dim);font-size:10px; }
.ar-log-toolbar button[aria-selected=true] { border-bottom-color:var(--ar-accent);color:var(--ar-text); }
.ar-log-toolbar label { display:flex;gap:5px;align-items:center;color:var(--ar-dim);font-size:10px; }
.ar-log-toolbar input { accent-color:var(--ar-accent); }
.ar-output { flex:1;min-height:80px;padding:12px 14px;margin:0;background:color-mix(in srgb,var(--ar-bg) 70%,var(--ar-pane));color:var(--ar-text);font:10px/1.8 ui-monospace,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto; }
.ar-empty { flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;color:var(--ar-dim); }
.ar-empty svg { opacity:.6;margin-bottom:10px; }
.ar-empty h3 { color:var(--ar-text);font-weight:500;font-size:14px;margin:0 0 6px; }
.ar-empty p { font-size:12px;line-height:1.7;margin:0; }
.ar-list-empty { padding:20px 8px;color:var(--ar-dim);font-size:12px;text-align:center; }
.ar-footer { display:flex;justify-content:space-between;color:var(--ar-dim);font-size:10px;flex-shrink:0; }
.ar-error { display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;color:var(--ar-danger);font-size:12px;border:1px solid color-mix(in srgb,var(--ar-danger) 25%,var(--ar-line));border-radius:6px; }
.ar-error button { background:transparent;color:inherit;border:0; }
.ar-detail-error { color:var(--ar-danger);font-size:11px;margin:7px 0 0; }
@media(max-width:780px) { .ar-window { padding:16px;gap:12px; }.ar-composer { padding:14px; }.ar-target { padding:9px 7px;gap:6px; }.ar-target small { font-size:9px; }.ar-folder { flex-direction:column;align-items:start;gap:4px; }.ar-workspace { grid-template-columns:230px minmax(0,1fr); }.ar-footer { font-size:9px; } }

.ar-attachments { border:1px dashed var(--ar-line);border-radius:8px;padding:10px 12px;margin:0 0 14px; }
.ar-attachments.is-dragging { border-color:var(--ar-accent);background:color-mix(in srgb,var(--ar-accent) 10%,var(--ar-pane)); }
.ar-attachment-header { display:flex;align-items:center;gap:12px;justify-content:space-between; }
.ar-attachment-header p { margin:0;font-size:11px;color:var(--ar-dim); }
.ar-attachment-list { display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0;margin:8px 0; }
.ar-attachment-list li { display:flex;align-items:center;gap:7px;max-width:100%;border:1px solid var(--ar-line);background:var(--ar-raised);border-radius:6px;padding:4px 6px 4px 9px;font-size:11px; }
.ar-attachment-list span { overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0; }
.ar-attachment-list small { color:var(--ar-dim);white-space:nowrap; }
.ar-attachment-list button { border:0;background:transparent;color:var(--ar-dim);padding:0 4px; }
.ar-attachments .ar-hint { margin-top:6px; }
@media(max-width:780px) { .ar-attachment-header { align-items:flex-start; }.ar-attachment-header p { max-width:65%; } }
`;

type Target = "my_mac" | "mainline" | "both";
type Status = "queued" | "running" | "cancelling" | "completed" | "cancelled" | "failed" | "interrupted";
type Task = { id: string; prompt: string; target: Target; repository: string; created_at: string; status: Status;
  started_at?: string; finished_at?: string; error?: string; log?: string; response?: string;
  branch?: string; workspace?: string; session_id?: string; worker_pid?: number; child_pid?: number;
  outcome?: { summary: string; pr_url?: string; installed_paths?: string[] } };
const labels: Record<Status, string> = { queued: "Queued", running: "Running", cancelling: "Cancelling…", completed: "Completed", cancelled: "Cancelled", failed: "Failed", interrupted: "Interrupted" };
const targets: { id: Target; title: string; hint: string; symbol: string }[] = [
  { id: "my_mac", title: "My Mac", hint: "Build & install here", symbol: "mac" },
  { id: "mainline", title: "Mainline", hint: "GitHub PR → merge to main", symbol: "branch" },
  { id: "both", title: "My Mac + Mainline", hint: "Install here & merge to main", symbol: "both" },
];
const PREFS = "bb-app-requests-preferences";
const DRAFT = "bb-app-requests-draft";
function preferences(): { repository: string; target: Target } {
  try { const p = JSON.parse(localStorage.getItem(PREFS) || "{}"); return { repository: typeof p.repository === "string" ? p.repository : "", target: targets.some(t => t.id === p.target) ? p.target : "my_mac" }; }
  catch { return { repository: "", target: "my_mac" }; }
}
function active(task: Task) { return ["queued", "running", "cancelling"].includes(task.status); }
function timestamp(value?: string) { return value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—"; }
function Glyph({ kind = "request", size = 20 }: { kind?: string; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {kind === "mac" ? <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></>
      : kind === "branch" ? <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10m12-10c0 7-12 2-12 8"/></>
      : kind === "terminal" ? <><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m6 9 3 3-3 3m7 0h4"/></>
      : kind === "both" ? <><rect x="2" y="4" width="12" height="10" rx="2"/><path d="M5 18h6m-3-4v4m10-9v10m-3-3 3 3 3-3"/><circle cx="18" cy="5" r="2"/></>
      : <><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M7 10h4M7 15h7m3-13 1.5 4.5L23 8l-4.5 1.5L17 14l-1.5-4.5L11 8l4.5-1.5Z"/></>}
  </svg>;
}

export default function AppRequests({ isWindowMode, iconSize = 24, slotSize = 36, showLabels = true }: {
  isWindowMode?: boolean; iconSize?: number; slotSize?: number; showLabels?: boolean;
}) {
  const [count, setCount] = React.useState(0);
  const [windowError, setWindowError] = React.useState(false);
  React.useEffect(() => {
    if (isWindowMode) return;
    let disposed = false, busy = false;
    const refresh = async () => {
      if (busy || disposed) return;
      busy = true;
      try { const data = await invoke<{ tasks: Task[] }>("list_app_requests"); if (!disposed) setCount(data.tasks.filter(active).length); }
      catch { /* Window shows actionable connection errors. */ }
      finally { busy = false; }
    };
    refresh(); const timer = setInterval(refresh, 5000);
    return () => { disposed = true; clearInterval(timer); };
  }, [isWindowMode]);
  async function open() {
    setWindowError(false);
    try {
      const existing = await WebviewWindow.getByLabel("ext_app_requests");
      if (existing) { await existing.show(); await existing.setFocus(); return; }
      const win = new WebviewWindow("ext_app_requests", { url: "/?ext=app-requests", title: "App Requests — BetterBar", width: 1060, height: 820, minWidth: 720, minHeight: 620, center: true, decorations: true, resizable: true });
      await win.once("tauri://error", () => setWindowError(true));
    } catch { setWindowError(true); }
  }
  if (isWindowMode) return <RequestsWindow/>;
  return <button type="button" onClick={open} title={windowError ? "Could not open App Requests. Try again." : `App Requests${count ? ` · ${count} active` : ""}`}
    aria-label={`Open App Requests${count ? `, ${count} active` : ""}`} data-bb-extension-button
    style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, minWidth: slotSize, height: slotSize, color: "var(--bb-text)" }}>
    <Glyph size={iconSize}/>{showLabels && <span data-bb-extension-label style={{ fontSize: 10 }}>Requests</span>}
    {count > 0 && <span style={{ position: "absolute", top: 0, right: 0, background: "var(--bb-accent)", color: "var(--bb-on-accent)", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>{count}</span>}
  </button>;
}

function RequestsWindow() {
  const [prefs] = React.useState(preferences);
  const [prompt, setPrompt] = React.useState(() => { try { return localStorage.getItem(DRAFT) || ""; } catch { return ""; } });
  const [attachments, setAttachments] = React.useState<Attachment[]>(attachmentDraft);
  const [attaching, setAttaching] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const attachmentBusy = React.useRef(false);
  const pendingPaths = React.useRef<string[]>([]);
  const attachmentsRef = React.useRef(attachments);
  attachmentsRef.current = attachments;
  const [target, setTarget] = React.useState<Target>(prefs.target);
  const [repository, setRepository] = React.useState(prefs.repository);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [selectedId, select] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<Task | null>(null);
  const [filter, setFilter] = React.useState("all");
  const [tab, setTab] = React.useState("activity");
  const [error, setError] = React.useState("");
  const [loadError, setLoadError] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [cancelling, setCancelling] = React.useState<string[]>([]);
  const [follow, setFollow] = React.useState(true);
  const busySubmit = React.useRef(false);
  const poll = React.useRef(false);
  const alive = React.useRef(true);
  const selection = React.useRef(selectedId);
  const log = React.useRef<HTMLPreElement | null>(null);
  selection.current = selectedId;
  React.useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify({ repository, target })); } catch {} }, [repository, target]);
  React.useEffect(() => { try { localStorage.setItem(DRAFT, prompt); } catch {} }, [prompt]);

  React.useEffect(() => { try { localStorage.setItem(ATTACHMENTS, JSON.stringify(attachments)); } catch {} }, [attachments]);
  async function addFiles(paths: string[]) {
    if (busySubmit.current) return;
    pendingPaths.current.push(...paths);
    if (!pendingPaths.current.length || attachmentBusy.current) return;
    attachmentBusy.current = true; setAttaching(true); setError("");
    try {
      while (pendingPaths.current.length && alive.current) {
        const pathsToCheck = [...new Set([...attachmentsRef.current.map(file => file.path), ...pendingPaths.current.splice(0)])];
        try {
          const files = await invoke<Attachment[]>("inspect_request_attachments", { paths: pathsToCheck });
          if (alive.current) { attachmentsRef.current = files; setAttachments(files); }
        } catch (reason) { if (alive.current) setError(typeof reason === "string" ? reason : strings.unavailable); }
      }
    } finally { attachmentBusy.current = false; if (alive.current) setAttaching(false); }
  }
  async function browse() {
    if (attachmentBusy.current || busySubmit.current) return;
    attachmentBusy.current = true; setAttaching(true); setError("");
    let paths: string[] = [];
    try {
      const files = await invoke<{ path: string }[]>("pick_dock_items", { kind: "attachment" });
      paths = files.map(file => file.path);
    } catch (reason) { if (alive.current) setError(typeof reason === "string" ? reason : strings.unavailable); }
    finally { attachmentBusy.current = false; if (alive.current) setAttaching(false); }
    if (alive.current) await addFiles(paths);
  }
  React.useEffect(() => {
    let disposed = false;
    const unlisten = getCurrentWindow().onDragDropEvent(event => {
      if (disposed) return;
      setDragging(event.payload.type === "enter" || event.payload.type === "over");
      if (event.payload.type === "drop") void addFiles(event.payload.paths);
    });
    unlisten.catch(() => { /* Browsing remains available if native drop events are unavailable. */ });
    return () => { disposed = true; void unlisten.then(stop => stop()).catch(() => {}); };
  }, []);

  const refresh = React.useCallback(async () => {
    if (poll.current || !alive.current) return;
    poll.current = true;
    try {
      const data = await invoke<{ tasks: Task[]; default_repository: string }>("list_app_requests");
      if (!alive.current) return;
      setTasks(data.tasks); setLoaded(true); setLoadError(false);
      setRepository(previous => previous || data.default_repository);
      const id = selection.current || data.tasks[0]?.id;
      if (id) {
        const task = await invoke<Task>("get_app_request", { id });
        if (!alive.current || (selection.current && selection.current !== id)) return;
        select(id); setDetail(task);
      }
    } catch { if (alive.current) { setLoadError(true); setLoaded(true); } }
    finally { poll.current = false; }
  }, []);
  React.useEffect(() => {
    alive.current = true;
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 1500);
    const visibility = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { alive.current = false; clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [refresh]);
  React.useEffect(() => {
    if (!selectedId) return;
    let disposed = false;
    setDetail(previous => previous?.id === selectedId ? previous : null);
    invoke<Task>("get_app_request", { id: selectedId }).then(task => { if (!disposed) setDetail(task); }).catch(() => { if (!disposed) setLoadError(true); });
    return () => { disposed = true; };
  }, [selectedId]);
  React.useEffect(() => { if (follow && log.current) log.current.scrollTop = log.current.scrollHeight; }, [detail?.log, follow, selectedId, tab]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busySubmit.current || attachmentBusy.current || !prompt.trim() || !repository.trim()) return;
    busySubmit.current = true; setSubmitting(true); setError("");
    let snapshot: Snapshot | undefined;
    let started = false;
    try {
      if (attachments.length) snapshot = await invoke<Snapshot>("snapshot_request_attachments", { paths: attachments.map(file => file.path) });
      const fullPrompt = requestPrompt(prompt, snapshot?.files || []);
      if (new TextEncoder().encode(fullPrompt).length > 32000) throw strings.tooLong;
      const task = await invoke<Task>("start_app_request", { prompt: fullPrompt, target, repository });
      started = true;
      if (!alive.current) return;
      setTasks(previous => [task, ...previous.filter(t => t.id !== task.id)]);
      selection.current = task.id; select(task.id); setDetail(task); setPrompt(""); setAttachments([]); setFilter("all"); setTab("activity");
      refresh();
    } catch (reason) { if (alive.current) setError(typeof reason === "string" ? reason : "Could not start this request. Check the working folder and try again."); }
    finally {
      if (snapshot && !started) {
        try { await invoke("discard_request_attachments", { id: snapshot.id }); } catch { /* Keep private copies if cleanup is unavailable. */ }
      }
      busySubmit.current = false; if (alive.current) setSubmitting(false); }
  }
  async function cancel(task: Task) {
    setError(""); setCancelling(previous => [...previous, task.id]);
    try { await invoke("cancel_app_request", { id: task.id }); await refresh(); }
    catch { setError("Could not cancel this request. Try again."); }
    finally { setCancelling(previous => previous.filter(id => id !== task.id)); }
  }
  async function terminal(task: Task) {
    setError("");
    try { await invoke("open_app_request_terminal", { id: task.id }); }
    catch { setError("Could not open Terminal. The live output is still available here."); }
  }
  const running = tasks.filter(active).length;
  const visible = tasks.filter(task => filter === "all" || (filter === "active" ? active(task) : !active(task)));
  return <><style>{STYLES}</style><main className="ar-window">
    <header className="ar-header"><span className="ar-app-icon"><Glyph size={25}/></span><div><h1>App Requests</h1><p>Ask for a change. Choose where it lands.</p></div><span className="ar-running" role="status"><i className={running ? "ar-dot is-active" : "ar-dot"}/>{running ? `${running} active` : "Ready when you are"}</span></header>
    <form className="ar-composer" onSubmit={submit}>
      <label className="ar-label" htmlFor="ar-prompt">What would you like to build or change?</label>
      <textarea id="ar-prompt" placeholder="Add an extension, improve a feature, fix something that gets in your way…" disabled={submitting} value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={32000} required
        onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/>
      <section className={`ar-attachments ${dragging ? "is-dragging" : ""}`} aria-label={strings.attachments} aria-busy={attaching}>
        <div className="ar-attachment-header"><p role="status">{dragging ? strings.drop : attaching ? strings.reading : strings.hint}</p><button type="button" className="ar-button" onClick={browse} disabled={submitting || attaching}>{strings.attach}</button></div>
        {attachments.length > 0 && <ul className="ar-attachment-list">{attachments.map(file => <li key={file.path}><span title={file.path}>{file.name}</span><small>{new Intl.NumberFormat(undefined, { style: "unit", unit: "kilobyte", unitDisplay: "short" }).format(Math.max(1, Math.ceil(file.size / 1024)))}</small><button type="button" aria-label={strings.remove.replace("{name}", file.name)} disabled={submitting || attaching} onClick={() => setAttachments(previous => previous.filter(item => item.path !== file.path))}>×</button></li>)}</ul>}
        <p className="ar-hint">{strings.local}</p>
      </section>
      <fieldset disabled={submitting} className="ar-targets"><legend className="ar-label">Deliver to</legend>{targets.map(option => <label className={`ar-target ${target === option.id ? "is-selected" : ""}`} key={option.id}>
        <input type="radio" name="target" value={option.id} checked={target === option.id} onChange={() => setTarget(option.id)}/><Glyph kind={option.symbol}/><span><strong>{option.title}</strong><small>{option.hint}</small></span>
      </label>)}</fieldset>
      <div className="ar-submit-row"><label className="ar-folder" htmlFor="ar-repository"><span>Working folder</span><input id="ar-repository" disabled={submitting} value={repository} onChange={event => setRepository(event.target.value)} placeholder="Path to the app’s source folder" required spellCheck={false}/></label><button type="submit" className="ar-primary" disabled={submitting || attaching || !prompt.trim() || !repository.trim()} aria-keyshortcuts="Meta+Enter Control+Enter">{submitting ? "Starting…" : "Start request"}<kbd>⌘↵</kbd></button></div>
      <p className="ar-hint">{target === "my_mac" ? "Works in your source folder and installs on this Mac. Changes stay local." : target === "mainline" ? "Starts from origin/main, publishes a detailed GitHub PR, waits for required checks, then merges into main." : "Starts from origin/main, installs on this Mac, and merges a detailed GitHub PR after required checks."} BetterBar builds are re-signed.</p>
    </form>
    {error && <div className="ar-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
    {loadError && <div className="ar-error" role="alert">Could not refresh tasks. Previous results may be out of date.<button onClick={refresh}>Retry</button></div>}
    <section className="ar-tasks" aria-label="Request history">
      <div className="ar-section-header"><h2>Requests <span>{tasks.length}</span></h2><label className="ar-filter">Show<select aria-label="Filter requests" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All requests</option><option value="active">Active</option><option value="finished">Finished</option></select></label><button className="ar-quiet" onClick={refresh} aria-label="Refresh requests">↻</button></div>
      {!loaded ? <p className="ar-empty" role="status">Loading requests…</p> : tasks.length === 0 ? <div className="ar-empty"><Glyph size={32}/><h3>Your next idea starts here.</h3><p>Requests and timestamped activity will appear here.<br/>Closing this window keeps your tasks running.</p></div> : <div className="ar-workspace">
        <div className="ar-task-list" aria-label="Tasks">{visible.length === 0 && <p className="ar-list-empty">No matching requests.</p>}{visible.map(task => <article key={task.id} className={`ar-task ${selectedId === task.id ? "is-selected" : ""}`}>
          <button className="ar-task-select" onClick={() => { select(task.id); setFollow(true); }} aria-pressed={selectedId === task.id}>
            <span className={`ar-status is-${task.status}`}><i/>{labels[task.status] || task.status}</span><span className="ar-task-prompt">{promptBody(task.prompt)}</span><span className="ar-task-meta">{targets.find(t => t.id === task.target)?.title} <span>·</span> <time dateTime={task.created_at}>{timestamp(task.created_at)}</time></span>
          </button>{active(task) && <button className="ar-cancel-small" onClick={() => cancel(task)} disabled={task.status === "cancelling" || cancelling.includes(task.id)} aria-label={`Cancel request: ${task.prompt}`} title="Cancel request">■</button>}
        </article>)}</div>
        <div className="ar-detail" aria-label="Selected request">{!detail || detail.id !== selectedId ? <p className="ar-empty" role="status">Loading request…</p> : <>
          <div className="ar-detail-toolbar"><span className={`ar-status is-${detail.status}`}><i/>{labels[detail.status] || detail.status}</span><span className="ar-detail-actions"><button onClick={() => terminal(detail)} className="ar-button"><Glyph kind="terminal" size={15}/>Terminal</button>{active(detail) ? <button className="ar-button ar-danger" onClick={() => cancel(detail)} disabled={detail.status === "cancelling" || cancelling.includes(detail.id)}>Cancel</button> : <button className="ar-button" onClick={() => { setPrompt(promptBody(detail.prompt)); setAttachments([]); setTarget(detail.target); setRepository(detail.repository); document.getElementById("ar-prompt")?.focus(); }}>Use prompt</button>}</span></div>
          <div className="ar-detail-info"><p className="ar-full-prompt">{detail.prompt}</p><dl><dt>Requested</dt><dd>{timestamp(detail.created_at)}</dd>{detail.started_at && <><dt>Started</dt><dd>{timestamp(detail.started_at)}</dd></>}{detail.finished_at && <><dt>Finished</dt><dd>{timestamp(detail.finished_at)}</dd></>}<dt>Folder</dt><dd>{detail.workspace || detail.repository}</dd>{detail.branch && <><dt>Branch</dt><dd>{detail.branch}</dd></>}{detail.session_id && <><dt>Session</dt><dd>{detail.session_id}</dd></>}{detail.child_pid && <><dt>Process</dt><dd>{detail.child_pid}</dd></>}</dl>{detail.error && <p className="ar-detail-error">{detail.error}</p>}{detail.status === "cancelled" && <p className="ar-hint">Changes, installations or merges completed before cancellation are retained.</p>}</div>
          <div className="ar-log-toolbar"><div role="tablist" aria-label="Request output">{["activity", "response"].map(value => <button key={value} role="tab" aria-selected={tab === value} aria-controls="ar-output" id={`ar-tab-${value}`} onClick={() => setTab(value)}>{value === "activity" ? "Live activity" : "Final response"}</button>)}</div>{tab === "activity" && <label><input type="checkbox" checked={follow} onChange={event => setFollow(event.target.checked)}/>Follow</label>}</div>
          <pre ref={log} id="ar-output" role="tabpanel" aria-labelledby={`ar-tab-${tab}`} className="ar-output" tabIndex={0}>{tab === "activity" ? detail.log || "Waiting for the worker…" : detail.response || "The final response will appear when Codex finishes."}</pre>
        </>}</div>
      </div>}
    </section>
    <footer className="ar-footer"><span>Tasks continue while this window is closed.</span><span>Same-folder requests run one at a time.</span></footer>
  </main></>;
}

export function Settings() {
  return <p style={{ color: "var(--bb-dim)", fontSize: 12, lineHeight: 1.6 }}>Request changes with My Mac, Mainline, or both. Choose the working folder in the App Requests window. Requires the cdx alias in your zsh login shell, Python 3, and authenticated gh for Mainline. Tasks, prompts, logs, and worktrees stay in ~/.betterbar/app-requests. Cancellation stops remaining work; completed changes are retained.</p>;
}
