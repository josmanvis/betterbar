import { useEffect, useRef, useState } from "react";
import { PERMISSIONS, permissionStrings as strings, type ExtensionReview } from "../extension-permissions";

export function ExtensionPermissionDetails({ review }: { review: ExtensionReview }) {
  return <div className="bb-extension-permission-details">
    <p>{review.legacy ? strings.legacy : strings.requests}</p>
    {review.permissions.length ? <ul>{review.permissions.map(permission => {
      const detail = PERMISSIONS[permission];
      return <li key={permission}><strong>{detail?.title || permission}</strong><span>{detail?.description || strings.unknown}</span></li>;
    })}</ul> : <p>{strings.none}</p>}
    <p className="bb-extension-trust-note">{strings.trust}</p>
  </div>;
}

export function ExtensionPermissionReview({ review, onAllow, onCancel }: {
  review: ExtensionReview; onAllow: () => void; onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog ref={dialog} className="bb-permission-dialog" aria-labelledby="extension-permission-title" aria-describedby="extension-permission-description" onCancel={event => { event.preventDefault(); onCancel(); }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1]?.focus(); }
    else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0]?.focus(); }
  }}>
    <header><h2 id="extension-permission-title">{strings.allowTitle.replace("{name}", review.displayName)}</h2>
    <p id="extension-permission-description">{review.version ? strings.version.replace("{version}", review.version) : strings.unversioned} · {strings.once}</p></header>
    <div className="bb-permission-body"><ExtensionPermissionDetails review={review}/></div>
    {error && <p role="alert">{strings.saveError}</p>}
    <div className="bb-install-actions"><button autoFocus onClick={onCancel}>{strings.notNow}</button><button onClick={() => { try { onAllow(); } catch { setError(true); } }}>{strings.allow}</button></div>
  </dialog>;
}
