import { invoke } from "@tauri-apps/api/core";
import type { DockItem } from "./types";

export type DockTarget = { name: string; path: string; kind: "app" | "file" | "folder"; bundleId?: string };
export const inspectDockPaths = (paths: string[]) => invoke<DockTarget[]>("inspect_dock_paths", { paths });
export const pickDockItems = (kind: "file" | "folder" | "app") => invoke<DockTarget[]>("pick_dock_items", { kind });

/** Keep repeated drops/picks idempotent without merging distinct files with the same name. */
export function newDockItems(existing: DockItem[], targets: DockTarget[], createId = () => crypto.randomUUID()): DockItem[] {
  const paths = new Set(existing.filter(item => item.path).map(item => item.path));
  const added: DockItem[] = [];
  for (const target of targets) {
    if (paths.has(target.path)) continue;
    paths.add(target.path);
    added.push({ ...target, id: createId(), order: existing.length + added.length });
  }
  return added;
}
