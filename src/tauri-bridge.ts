import { invoke } from "@tauri-apps/api/core";
import { BatteryInfo, RunningApp, ScreenInfo, WindowThumbnail, WindowDetails } from "./types";

export async function getRunningApps(): Promise<RunningApp[]> {
  return invoke<RunningApp[]>("get_running_apps");
}

export async function launchApp(path: string): Promise<void> {
  return invoke("launch_app", { path });
}

export async function focusApp(bundleId: string): Promise<void> {
  return invoke("focus_app", { bundleId });
}

export async function getInstalledTerminals(): Promise<import("./types").TerminalApp[]> {
  return invoke<import("./types").TerminalApp[]>("get_installed_terminals");
}

export async function executeTerminalCommand(bundleId: string, command: string): Promise<void> {
  return invoke("execute_terminal_command", { bundleId, command });
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

export async function clearScreenInsets(): Promise<void> {
  return invoke("clear_screen_insets");
}

export async function updateBarGeometry(
  strictOverlap: boolean,
  position: string,
  barSize: number,
): Promise<void> {
  return invoke("update_bar_geometry", { strictOverlap, position, barSize });
}

export async function checkScreenRecordingPermission(): Promise<boolean> {
  return invoke<boolean>("check_screen_recording_permission");
}

export async function requestScreenRecordingPermission(): Promise<void> {
  return invoke("request_screen_recording_permission");
}

export async function getWindowThumbnail(pid: number): Promise<WindowThumbnail | null> {
  return invoke<WindowThumbnail | null>("get_window_thumbnail", { pid });
}

export async function openSettingsWindow(): Promise<void> {
  return invoke("open_settings_window");
}

/** Returns the main window's outer position in physical pixels [x, y]. */
export async function getWindowOuterPosition(): Promise<[number, number]> {
  return invoke<[number, number]>("get_window_outer_position");
}

export async function getOnScreenWindows(): Promise<WindowDetails[]> {
  return invoke<WindowDetails[]>("get_on_screen_windows");
}

export async function focusWindow(pid: number, title: string): Promise<void> {
  return invoke("focus_window", { pid, title });
}

export async function getWindowIdThumbnail(windowId: number): Promise<WindowThumbnail | null> {
  return invoke<WindowThumbnail | null>("get_window_id_thumbnail", { windowId });
}
