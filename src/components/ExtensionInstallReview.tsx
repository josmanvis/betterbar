import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { INSTALL_REVIEW_EVENT, INSTALL_REVIEW_KEY, readInstallReviews, saveInstallReviews } from "../extension-install";
import { reloadExtensions } from "../extensions-runtime";

const strings = {
  upgrade: "Upgrade extension", downgrade: "Downgrade extension", same: "Replace same version", replace: "Replace extension", install: "Install extension",
  installed: "Installed version", incoming: "Incoming version", unversioned: "Unversioned", cancel: "Cancel", working: "Updating…",
  description: "The installed source will be backed up before replacement. Enabled extensions reload immediately after you confirm.",
  downgradeHint: "You are replacing this extension with an older version.", sameHint: "Both copies declare the same version. Confirm before replacing the installed copy.",
  legacyHint: "One or both copies lack a comparable version. BetterBar cannot determine whether this is an upgrade or downgrade.",
  error: "Could not update this extension. It may have changed or this request may have expired. Cancel and drop the file again to review the latest version.",
};
export function ExtensionInstallReview() {
  const [reviews, setReviews] = useState(readInstallReviews);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const item = reviews[0];
  useEffect(() => {
    const sync = () => setReviews(readInstallReviews());
    const storage = (event: StorageEvent) => { if (event.key === INSTALL_REVIEW_KEY || event.key === null) sync(); };
    window.addEventListener(INSTALL_REVIEW_EVENT, sync); window.addEventListener("storage", storage);
    // A drop can arrive between the initial render and listener subscription.
    sync();
    return () => { window.removeEventListener(INSTALL_REVIEW_EVENT, sync); window.removeEventListener("storage", storage); };
  }, []);
  useEffect(() => {
    if (!item) return;
    setError(false);
    const previous = document.activeElement as HTMLElement | null;
    const scrim = dialog.current?.parentElement;
    const siblings = Array.from(scrim?.parentElement?.children || []).filter(node => node !== scrim) as HTMLElement[];
    const prior = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    cancelButton.current?.focus();
    return () => { siblings.forEach((node, index) => { node.inert = prior[index]; }); previous?.focus(); };
  }, [item?.token]);
  function done() { saveInstallReviews(readInstallReviews().filter(review => review.token !== item.token)); }
  async function cancel() {
    if (busy) return;
    await invoke("discard_dropped_extension", { token: item.token }).catch(() => {});
    done();
  }
  async function confirm() {
    if (busy) return;
    setBusy(true); setError(false);
    try {
      await invoke("install_dropped_extension", { token: item.token, confirm: true });
      await reloadExtensions(); done();
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  if (!item) return null;
  const change = ["upgrade", "downgrade", "same", "replace"].includes(item.change) ? item.change : "replace";
  return <div className="bb-extension-install-scrim" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); void cancel(); }
    if (event.key === "Tab") {
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
      if (!controls.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1]?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus(); }
    }
  }}>
    <div ref={dialog} className="bb-extension-install-dialog" role="dialog" aria-modal="true" aria-labelledby="extension-install-title" aria-describedby="extension-install-description" aria-busy={busy}>
      <h2 id="extension-install-title">{strings[change]}: {item.displayName}</h2>
      <dl><dt>{strings.installed}</dt><dd>{item.installedVersion || strings.unversioned}</dd><dt>{strings.incoming}</dt><dd>{item.incomingVersion || strings.unversioned}</dd></dl>
      <p id="extension-install-description">{strings.description}</p>
      {change === "downgrade" && <p className="bb-install-version-hint">{strings.downgradeHint}</p>}
      {change === "same" && <p className="bb-install-version-hint">{strings.sameHint}</p>}
      {change === "replace" && <p className="bb-install-version-hint">{strings.legacyHint}</p>}
      {error && <p role="alert">{strings.error}</p>}
      <div className="bb-install-actions"><button ref={cancelButton} disabled={busy} onClick={cancel}>{strings.cancel}</button><button disabled={busy} onClick={confirm}>{busy ? strings.working : strings[change]}</button></div>
    </div>
  </div>;
}
