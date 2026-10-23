import { invoke } from "@tauri-apps/api/core";
import type { DockTarget } from "./dock-targets";
import { inspectExtension, type ExtensionReview } from "./extension-permissions";
import { openSettingsWindow } from "./tauri-bridge";

export interface ExtensionInstallPlan {
  token: string; name: string; displayName: string;
  incomingVersion: string | null; installedVersion: string | null;
  existing: boolean; change: "install" | "upgrade" | "downgrade" | "same" | "replace";
  content: string;
}
export type InstallReview = Omit<ExtensionInstallPlan, "content"> & { review?: ExtensionReview };
export const INSTALL_REVIEW_KEY = "betterbar-extension-install-review";
export const INSTALL_REVIEW_EVENT = "betterbar-extension-install-review-changed";

export function readInstallReviews(): InstallReview[] {
  try {
    const value = JSON.parse(localStorage.getItem(INSTALL_REVIEW_KEY) || "[]");
    return Array.isArray(value) ? value.filter(item => item && typeof item.token === "string" && typeof item.displayName === "string" && typeof item.name === "string") : [];
  } catch { return []; }
}
export function saveInstallReviews(reviews: InstallReview[]) {
  if (reviews.length) localStorage.setItem(INSTALL_REVIEW_KEY, JSON.stringify(reviews));
  else localStorage.removeItem(INSTALL_REVIEW_KEY);
  window.dispatchEvent(new Event(INSTALL_REVIEW_EVENT));
}

/** Parse source before installing; do not evaluate it until approval and reload. */
export async function handleBarDrop(paths: string[]): Promise<{items: DockTarget[]; installed: string[]; warning?: string}> {
  const drop = await invoke<{ items: DockTarget[]; extensions: ExtensionInstallPlan[] }>("inspect_bar_drop", { paths });
  const installed: string[] = [];
  if (!drop.extensions.length) return { items: drop.items, installed };
  const { validateExtensionSource } = await import("./extension-evaluator");
  const reviews: InstallReview[] = [];
  try {
    for (const plan of drop.extensions) validateExtensionSource(plan.content);
    for (const plan of drop.extensions) {
      const { content: _privateSource, ...review } = plan;
      reviews.push({ ...review, review: await inspectExtension(plan.name, plan.content, plan.displayName) });
    }
  } catch (error) {
    await Promise.allSettled(drop.extensions.map(plan => invoke("discard_dropped_extension", { token: plan.token })));
    throw error;
  }
  let warning: string | undefined;
  if (reviews.length) {
    saveInstallReviews([...readInstallReviews(), ...reviews]);
    await openSettingsWindow().catch(() => { warning = "Open BetterBar Settings to review the pending extension update."; });
  }
  return { items: drop.items, installed, warning };
}
