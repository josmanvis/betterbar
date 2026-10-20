import React from "react";

declare function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
export const name = "Floatnote";
const strings = { open: "Open Floatnote", opening: "Opening Floatnote…", error: "Could not open Floatnote. Try again.",
  settings: "Opens or focuses your Floatnote app." };

export default function Floatnote({ iconSize = 28, slotSize = iconSize + 8 }: { iconSize?: number; slotSize?: number }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const pending = React.useRef(false);
  async function open() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      await invoke("open_floatnote");
    } catch (err) { console.error(err); setError(typeof err === "string" ? err : strings.error); }
    finally { pending.current = false; setBusy(false); }
  }
  return <><style>{styles}</style><button className="bb-owned-shortcut" onClick={open} disabled={busy}
    aria-label={strings.open} aria-busy={busy} title={error || (busy ? strings.opening : strings.open)}
    style={{ width: slotSize, height: slotSize, color: error ? "var(--bb-bad)" : busy ? "var(--bb-accent)" : undefined }}>
    <svg aria-hidden="true" width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3h16v12l-6 6H4zM14 21v-6h6M8 8h8M8 12h5"/>
    </svg>
  </button></>;
}

export function Settings() { return <p style={{ fontSize: 11, lineHeight: 1.7, color: "var(--bb-dim)" }}>{strings.settings}</p>; }

const styles = `.bb-owned-shortcut { display:grid;place-items:center;flex-shrink:0;background:transparent;border:1px solid var(--bb-line);color:var(--bb-dim); }
.bb-owned-shortcut:hover { color:var(--bb-accent);border-color:var(--bb-accent); }
.bb-owned-shortcut:focus-visible { outline:2px solid var(--bb-accent);outline-offset:-2px; }
.bb-owned-shortcut:disabled { opacity:.6; }`;
