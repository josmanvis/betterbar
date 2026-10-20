import React from "react";

declare function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
export const name = "Timesheets";
const strings = { open: "Open Timesheets", opening: "Opening Timesheets…", error: "Could not open Timesheets. Try again.",
  settings: "Opens the entry popup in Timesheet Alert Comments." };

export default function Timesheets({ iconSize = 28, slotSize = iconSize + 8 }: { iconSize?: number; slotSize?: number }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(false);
  const pending = React.useRef(false);
  async function open() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(false);
    try { await invoke("open_timesheets"); }
    catch (err) { console.error(err); setError(true); }
    finally { pending.current = false; setBusy(false); }
  }
  return <><style>{styles}</style><button className="bb-owned-shortcut" onClick={open} disabled={busy}
    aria-label={strings.open} aria-busy={busy} title={error ? strings.error : busy ? strings.opening : strings.open}
    style={{ width: slotSize, height: slotSize, color: error ? "var(--bb-bad)" : busy ? "var(--bb-accent)" : undefined }}>
    <svg aria-hidden="true" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-3M8 2h8v4H8zM8 11h3M8 15h3"/>
      <circle cx="16" cy="14" r="4"/><path d="M16 12v2l1.5 1"/>
    </svg>
  </button></>;
}

export function Settings() { return <p style={{ fontSize: 11, lineHeight: 1.7, color: "var(--bb-dim)" }}>{strings.settings}</p>; }

const styles = `.bb-owned-shortcut { display:grid;place-items:center;flex-shrink:0;background:transparent;border:1px solid var(--bb-line);color:var(--bb-dim); }
.bb-owned-shortcut:hover { color:var(--bb-accent);border-color:var(--bb-accent); }
.bb-owned-shortcut:focus-visible { outline:2px solid var(--bb-accent);outline-offset:-2px; }
.bb-owned-shortcut:disabled { opacity:.6; }`;
