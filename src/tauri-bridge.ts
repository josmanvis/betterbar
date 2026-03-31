import { invoke } from "@tauri-apps/api/core";
import { RunningApp, ScreenInfo } from "./types";

export async function getRunningApps(): Promise<RunningApp[]> {
  return invoke<RunningApp[]>("get_running_apps");
}

export async function launchApp(path: string): Promise<void> {
  return invoke("launch_app", { path });
}

export async function getScreenInfo(): Promise<ScreenInfo> {
  return invoke<ScreenInfo>("get_screen_info");
}

export async function positionWindow(
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  return invoke("position_window", { x, y, width, height });
}

export async function setWindowLevel(
  level: "dock" | "floating" | "normal"
): Promise<void> {
  return invoke("set_window_level", { level });
}

export async function getAppIcon(bundleId: string): Promise<string | null> {
  return invoke<string | null>("get_app_icon", { bundleId });
}
