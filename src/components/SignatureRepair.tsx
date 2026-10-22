import { useCallback, useEffect, useState } from "react";
import { ArrowCounterClockwise, ShieldCheck } from "@phosphor-icons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppSignatureStatus, getAppSignatureStatus, repairAppSignature } from "../tauri-bridge";

export const REOPEN_PERMISSIONS_KEY = "betterbar:reopen-permissions";

const strings = {
  title: "App signature",
  checking: "Checking signature…",
  valid: "Verified",
  invalid: "Needs attention",
  unavailable: "Unavailable",
  local: "Local signature",
  certificate: "Certificate signature",
  unsigned: "Unsigned app",
  development: "Development build",
  explanation: "If permissions stop working after an update, re-sign the installed app and restart BetterBar. A verified copy is prepared before the app closes. Your bar settings and extensions are preserved.",
  permissionHint: "After restarting, you may need to remove BetterBar from Accessibility and Screen Recording in System Settings, add it again, and enable access.",
  persistenceHint: "Local signatures can still require new permission grants after rebuilding or updating. Consistent developer signing is needed for a lasting app identity.",
  repair: "Re-sign & restart",
  repairing: "Preparing verified copy…",
  restarting: "Restarting BetterBar…",
  success: "The app was re-signed and restarted. Check the permission statuses above and enable access in System Settings if needed.",
  failed: "The last repair did not finish. Review the repair log for details.",
  pending: "The last repair has not reported a result. If BetterBar did not restart, try again.",
  log: "Repair log",
  error: "Unable to repair the app signature.",
} as const;

export function SignatureRepair() {
  const [status, setStatus] = useState<AppSignatureStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [phase, setPhase] = useState<"idle" | "preparing" | "restarting">("idle");
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setChecking(true);
    try { setStatus(await getAppSignatureStatus()); }
    catch (cause) { setError(String(cause)); }
    finally { setChecking(false); }
  }, []);

  useEffect(() => {
    void refresh();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow().onFocusChanged(({ payload }) => { if (payload) void refresh(); })
      .then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(console.error);
    return () => { disposed = true; unlisten?.(); };
  }, [refresh]);

  const repair = async () => {
    if (phase !== "idle" || !status?.repairAvailable) return;
    setError(null);
    setPhase("preparing");
    try {
      // Reopen the same settings panel after the native helper restarts the app.
      localStorage.setItem(REOPEN_PERMISSIONS_KEY, "1");
      await repairAppSignature();
      setPhase("restarting");
    } catch (cause) {
      localStorage.removeItem(REOPEN_PERMISSIONS_KEY);
      setError(String(cause) || strings.error);
      setPhase("idle");
    }
  };

  return (
    <div className="mt-2 border border-[var(--bb-line)] bg-[var(--bb-pane)]">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--bb-line)] px-4 py-3">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--bb-text)]">
          <ShieldCheck size={14} aria-hidden="true" />{strings.title}
        </span>
        <span role="status" className={`text-[10px] font-bold uppercase tracking-wider ${status?.valid ? "text-[var(--bb-accent)]" : "text-[var(--bb-warn)]"}`}>
          {checking ? strings.checking : status ? (status.valid ? strings.valid : strings.invalid) : strings.unavailable}
        </span>
      </div>
      <div className="space-y-4 px-4 py-4 text-[11px] leading-relaxed normal-case text-[var(--bb-mute)]">
        <p>{strings.explanation}</p>
        {status && <p className="break-all text-[10px] text-[var(--bb-dim)]">{strings[status.kind]}{status.identifier ? ` · ${status.identifier}` : ""}</p>}
        <p>{strings.permissionHint}</p>
        {status?.kind === "local" || status?.kind === "unsigned" ? <p>{strings.persistenceHint}</p> : null}
        {status?.reason && <p>{status.reason}</p>}
        {status?.lastResult && (
          <div role="status" className="space-y-2 border-l-2 border-[var(--bb-line)] pl-3">
            <p>{strings[status.lastResult]}</p>
            {status.lastResult !== "success" && <p className="break-all text-[10px]">{strings.log}: {status.logPath}</p>}
          </div>
        )}
        {error && <p role="alert" className="break-words text-[var(--bb-bad)]">{error}</p>}
        <button
          onClick={() => void repair()}
          disabled={checking || !status?.repairAvailable || phase !== "idle"}
          className="flex min-h-10 items-center justify-center gap-2 border border-[var(--bb-accent)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--bb-accent)] transition-colors hover:bg-[var(--bb-accent)]/10 cursor-pointer disabled:cursor-default disabled:opacity-40"
        >
          <ArrowCounterClockwise size={13} weight="bold" aria-hidden="true" className={phase !== "idle" ? "animate-spin" : ""} />
          {phase === "preparing" ? strings.repairing : phase === "restarting" ? strings.restarting : strings.repair}
        </button>
      </div>
    </div>
  );
}
