import { useEffect, useState } from "react";
import { openSettingsWindow } from "./tauri-bridge";

export const APPROVAL_KEY = "betterbar-extension-approvals-v1";
export const APPROVAL_EVENT = "betterbar-extension-approvals-changed";
export const PERMISSIONS: Record<string, { title: string; description: string }> = {
  network: { title: "Network", description: "Connect to online services and send or receive data." },
  files: { title: "Files and folders", description: "Read or change local files through BetterBar’s native integrations." },
  clipboard: { title: "Clipboard", description: "Read or replace text on your clipboard." },
  apps: { title: "Apps and windows", description: "Discover, open, focus, or control apps and windows." },
  shell: { title: "Commands", description: "Run commands through BetterBar’s native integrations." },
  calendar: { title: "Calendar", description: "Read calendars and events after macOS grants access." },
  system: { title: "System information and controls", description: "Read device status or change supported system controls." },
  "full-access": { title: "Full BetterBar access", description: "Use BetterBar’s native commands, files, clipboard, network, apps, and system controls; access calendars with macOS consent." },
};
export const permissionStrings = {
  legacy: "This extension has no readable permission list. Approval gives it full BetterBar access.",
  requests: "This extension requests:", none: "No additional permissions declared.",
  unknown: "An unrecognized permission. Ask the author what this access is used for.",
  trust: "Extensions run inside BetterBar and can use its native access. Permission lists describe intended use; they do not restrict code. Only allow extensions you trust. macOS permissions are requested separately.",
  allowTitle: "Allow {name}?", version: "Version {version}", unversioned: "Unversioned extension",
  once: "Review once for this version. Updates or source changes need approval again.",
  saveError: "Could not save approval. Try again.", notNow: "Not now", allow: "Allow extension",
  needsApproval: "Needs permission approval", paused: "Paused until you approve this version.", review: "Review permissions",
  revoke: "Revoke approval", revokeHint: "Revoking pauses this extension. Restart BetterBar to stop any background work it already started.",
  reviewLabel: "Review extension permissions", reviewCount: "Review {count}",
  notice: "{count} extensions are paused until you approve their permissions",
  openError: "Could not open Settings. Use ⌘, to review extension permissions.",
};
export interface ExtensionReview {
  name: string;
  displayName: string;
  version: string | null;
  fingerprint: string;
  permissions: string[];
  legacy: boolean;
}

/** Only inspect literal metadata. Never import or evaluate an unapproved extension. */
export async function inspectExtension(name: string, source: string, fallbackName = name): Promise<ExtensionReview> {
  let displayName = fallbackName, version: string | null = null, permissions = ["full-access"], legacy = true;
  try {
    const [{ transform }, { parse }] = await Promise.all([import("sucrase"), import("acorn")]);
    const code = transform(source, { transforms: ["typescript", "jsx"] }).code;
    const program = parse(code, { sourceType: "module", ecmaVersion: "latest" });
    for (const node of program.body) {
      if (node.type !== "ExportNamedDeclaration" || node.declaration?.type !== "VariableDeclaration" || node.declaration.kind !== "const") continue;
      for (const declaration of node.declaration.declarations) {
        if (declaration.id.type !== "Identifier") continue;
        const value = declaration.init;
        if (value?.type === "Literal" && typeof value.value === "string") {
          if (declaration.id.name === "name" && value.value.trim()) displayName = value.value.trim();
          if (declaration.id.name === "version") version = value.value;
        }
        if (declaration.id.name === "permissions" && value?.type === "ArrayExpression" && value.elements.every(item => item?.type === "Literal" && typeof item.value === "string" && item.value.trim())) {
          permissions = [...new Set(value.elements.map(item => (item as { value: string }).value))];
          legacy = false;
        }
      }
    }
  } catch { /* Invalid metadata gets the conservative legacy review; execution reports a generic error. */ }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return { name, displayName, version, permissions, legacy, fingerprint };
}

function readApprovals(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(APPROVAL_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function approvalIdentity(review: ExtensionReview) {
  return JSON.stringify([review.version, review.fingerprint, review.permissions, review.legacy]);
}
export function isExtensionApproved(review: ExtensionReview) {
  const approvals = readApprovals();
  return Object.prototype.hasOwnProperty.call(approvals, review.name) && approvals[review.name] === approvalIdentity(review);
}
export function approveExtension(review: ExtensionReview) {
  localStorage.setItem(APPROVAL_KEY, JSON.stringify({ ...readApprovals(), [review.name]: approvalIdentity(review) }));
  window.dispatchEvent(new Event(APPROVAL_EVENT));
}
export function revokeExtension(name: string) {
  const approvals = readApprovals(); delete approvals[name];
  localStorage.setItem(APPROVAL_KEY, JSON.stringify(approvals));
  window.dispatchEvent(new Event(APPROVAL_EVENT));
}
export function useExtensionApprovals() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const sync = () => setRevision(value => value + 1);
    const storage = (event: StorageEvent) => { if (event.key === APPROVAL_KEY || event.key === null) sync(); };
    window.addEventListener(APPROVAL_EVENT, sync); window.addEventListener("storage", storage);
    sync();
    return () => { window.removeEventListener(APPROVAL_EVENT, sync); window.removeEventListener("storage", storage); };
  }, []);
  return revision;
}

export async function requestExtensionReview() {
  localStorage.setItem("betterbar-settings-tab", "extensions");
  localStorage.setItem("betterbar-extension-review-request", `${Date.now()}-${Math.random()}`);
  await openSettingsWindow();
}
