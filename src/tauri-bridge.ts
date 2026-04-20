import { invoke } from "@tauri-apps/api/core";
import { BatteryInfo, RunningApp, ScreenInfo } from "./types";

export async function getRunningApps(): Promise<RunningApp[]> {
  return invoke<RunningApp[]>("get_running_apps");
}

export async function launchApp(path: string): Promise<void> {
  return invoke("launch_app", { path });
}

export async function getScreenInfo(): Promise<ScreenInfo> {
  return invoke<ScreenInfo>("get_screen_info");
}

export async function positionWindow(x: number, y: number, width: number, height: number): Promise<void> {
  return invoke("position_window", { x, y, width, height });
}

export async function setWindowLevel(level: "dock" | "floating" | "normal"): Promise<void> {
  return invoke("set_window_level", { level });
}

export async function getAppIcon(bundleId: string): Promise<string | null> {
  return invoke<string | null>("get_app_icon", { bundleId });
}

export async function getBatteryInfo(): Promise<BatteryInfo> {
  return invoke<BatteryInfo>("get_battery_info");
}

export async function checkAccessibilityPermissions(): Promise<boolean> {
  return invoke<boolean>("check_accessibility_permissions");
}

export async function requestAccessibilityPermissions(): Promise<void> {
  return invoke("request_accessibility_permissions");
}

export async function setScreenInset(
  position: string,
  barSize: number,
  menuBarHeight: number,
): Promise<void> {
  return invoke("set_screen_inset", { position, barSize, menuBarHeight });
}
