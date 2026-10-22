import { createContext, useContext, type ReactNode } from "react";
import type { BetterBarConfig, DockItem, RunningApp, WindowDetails } from "./types";
export { focusApp, focusWindow, launchApp, openSettingsWindow } from "./tauri-bridge";
export { inspectDockPaths, pickDockItems } from "./dock-targets";
export { DockSettings } from "./components/DockSettings";

export const API_VERSION = 1;

export type NativeSectionName = "docked-apps" | "opened-apps" | "terminal" | "spaces" | "caffeine" | "app-sets" | "simulators" | "settings";
export interface BarAPI {
  config: BetterBarConfig;
  dockItems: DockItem[];
  runningApps: RunningApp[];
  windows: WindowDetails[];
  sections: Partial<Record<NativeSectionName, ReactNode>>;
  addItem: (item: DockItem) => void;
  removeItem: (id: string) => void;
  switchSet: (id: string) => void;
  dockPaths: (paths: string[]) => Promise<void>;
}
export const BarAPIContext = createContext<BarAPI | null>(null);

/** Shared snapshots and actions avoid one native poller per extension. */
export function useBetterBar(): BarAPI {
  const api = useContext(BarAPIContext);
  if (!api) throw new Error("The bar API is available in taskbar extensions only.");
  return api;
}

/** Reuse native interactions, window previews, and accessibility in custom layouts. */
export function NativeSection({ name }: { name: NativeSectionName }) {
  return <>{useBetterBar().sections[name] ?? null}</>;
}
