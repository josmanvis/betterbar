import { test as base, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DEFAULT_CONFIG, type BetterBarConfig } from "../../src/types";

// Run the real production UI with Tauri's official IPC and window mocks. Test
// data is synthetic; no installed extensions, settings, or native actions run.
const require = createRequire(import.meta.url);
const mocks = readFileSync(require.resolve("@tauri-apps/api/mocks").replace(/\.cjs$/, ".js"), "utf8")
  .replace(/export \{[^}]+\};?\s*$/, "");

export const seed: BetterBarConfig = {
  ...DEFAULT_CONFIG,
  settingsAppearance: "system",
  position: "bottom",
  barSize: 68,
  freeFloat: false,
  openOnLogin: false,
  showRunningApps: false,
  showMusic: false,
  showSimIcons: false,
  showCaffeine: false,
  showSpaces: false,
  enabledExtensions: ["sample-clock"],
  sets: [{ id: "test", name: "Work", items: [
    { id: "notes", name: "Notes", path: "/Applications/Notes.app", bundleId: "com.apple.Notes", order: 0 },
  ] }],
  activeSetId: "test",
  accentColor: "#73daca",
  appearance: {
    palette: { background: "#101820", surface: "#16232d", elevated: "#233443", text: "#f2efe9", secondary: "#a4aeb4", muted: "#71818c", border: "#304454", strongBorder: "#456070", warning: "#ffbd69", danger: "#ff6b6b" },
    opacity: 84, blur: 12, radius: 4, borderWidth: 1, shadow: 15, scanlines: true,
  },
};

export async function installRuntime(page: Page, options: {
  label?: "main" | "settings" | `ext_${string}`; config?: BetterBarConfig; emptyApps?: boolean;
  registryExtensions?: { name: string; display_name: string; content: string }[];
  standupResponses?: { text?: string; error?: boolean; delayMs?: number }[];
  runningApps?: { name: string; bundle_id: string; pid: number; is_active: boolean }[];
  spaces?: { id: number; name: string; is_current: boolean }[];
  pickedTargets?: {name: string; path: string; kind: "app" | "file" | "folder"; bundleId?: string}[];
  dropPlans?: {token: string; name: string; displayName: string; incomingVersion: string | null; installedVersion: string | null; existing: boolean; change: string; content: string}[];
  installFailure?: boolean;
  pickerFailure?: boolean;
  wifiStatus?: Record<string, unknown>;
  nativeFailure?: boolean; nativeAccent?: string; reduceTransparency?: boolean; increaseContrast?: boolean;
} = {}) {
  const initialize = ({ initial, options }: { initial: BetterBarConfig; options: any }) => {
    const win = window as any;
    win.__ipcCalls = [];
    win.__unexpectedIPC = [];
    const extension = {
      name: "sample-clock", display_name: "Sample Clock",
      content: 'export default function Clock() { return <button title="Sample clock">09:41</button>; } export function Settings() { return <label>Sample clock label<input aria-label="Sample clock label" defaultValue="Local time" /></label>; }',
    };
    const registryKey = "__betterbar_test_registry";
    if (options.dropPlans && !localStorage.getItem(registryKey)) localStorage.setItem(registryKey, JSON.stringify(options.registryExtensions || []));
    let standupRead = 0;
    win.mockWindows(options.label || "settings");
    win.mockIPC((cmd: string, args: any) => {
      win.__ipcCalls.push({ cmd, args });
      if (options.nativeFailure && ["get_macos_preferences", "get_system_symbols"].includes(cmd)) return Promise.reject(new Error("Native appearance unavailable"));
      switch (cmd) {
        case "get_system_symbols": return {};
        case "get_wifi_status": return win.__wifiFailure ? Promise.reject(new Error("Wi-Fi unavailable")) : (win.__wifiStatus || options.wifiStatus);
        case "test_wifi_speed": {
          if (win.__wifiTestFailure) return Promise.reject(new Error("Test unavailable"));
          const result = { download_mbps: 120, upload_mbps: 24, taken_at: Date.now() };
          win.__wifiStatus = { ...options.wifiStatus, speed_test: result };
          return result;
        }
        case "open_wifi_status_app": return null;
        case "get_macos_preferences": return { accent: options.nativeAccent || "#007aff", reduce_transparency: !!options.reduceTransparency, increase_contrast: !!options.increaseContrast, reduce_motion: true };
        case "fetch_extension_files_from_disk": return options.dropPlans ? JSON.parse(localStorage.getItem(registryKey) || "[]") : options.registryExtensions || [extension];
        case "read_standup_file": {
          const responses = options.standupResponses || [{ text: "# Standup" }];
          const response = responses[Math.min(standupRead++, responses.length - 1)];
          return new Promise((resolve, reject) => setTimeout(() => response.error ? reject(new Error("Read failed")) : resolve(response.text || ""), response.delayMs || 0));
        }
        case "get_installed_terminals": return [];
        case "get_open_on_login": return false;
        case "check_for_updates": return { has_update: false, current_version: "0.11.0", latest_version: "0.11.0" };
        case "plugin:app|version": return "0.11.0";
        case "plugin:window|set_theme":
        case "plugin:window|show":
        case "plugin:window|set_focus":
        case "plugin:window|unminimize":
        case "plugin:window|start_dragging":
        case "set_open_on_login":
        case "position_window":
        case "set_window_level":
        case "set_screen_inset":
        case "clear_screen_insets":
        case "update_bar_geometry":
        case "open_settings_window": return null;
        case "get_running_apps": return options.emptyApps ? [] : options.runningApps || [{ name: "Notes", bundle_id: "com.apple.Notes", pid: 101, is_active: true }];
        case "get_on_screen_windows": return [];
        case "get_spaces": return options.spaces || [];
        case "switch_to_space":
        case "launch_simulator": return null;
        case "get_app_icon":
        case "get_path_icon": return null;
        case "focus_app":
        case "focus_window":
        case "launch_app": return null;
        case "inspect_bar_drop": return { items: options.pickedTargets || [], extensions: options.dropPlans || [] };
        case "discard_dropped_extension": return null;
        case "install_dropped_extension": {
          const plan = options.dropPlans?.find((plan: any) => plan.token === args.token);
          if (!plan || options.installFailure || (plan.existing && !args.confirm)) return Promise.reject(new Error("Install conflict"));
          const registry = JSON.parse(localStorage.getItem(registryKey) || "[]").filter((ext: any) => ext.name !== plan.name);
          registry.push({ name: plan.name, display_name: plan.displayName, content: plan.content });
          localStorage.setItem(registryKey, JSON.stringify(registry));
          return plan.name;
        }
        case "pick_dock_items":
        case "inspect_dock_paths": return options.pickerFailure ? Promise.reject(new Error("Picker failed")) : options.pickedTargets || [];
        case "get_screen_info": return { width: 1440, height: 900, scale_factor: 1, menu_bar_height: 25, dock_height: 0 };
        case "get_window_outer_position": return [0, 832];
        case "get_battery_info": return { percentage: 80, is_charging: false, is_plugged: false, available: true };
        case "get_caffeine_status": return { active: false, minutes_remaining: null };
        case "toggle_caffeine": return { active: true, minutes_remaining: null };
        case "check_accessibility_permissions":
        case "check_screen_recording_permission": return true;
        case "get_apple_calendar_status": return "authorized";
        case "get_app_signature_status": return { valid: true, identifier: "com.betterbar.app", kind: "local", repairAvailable: false, reason: null };
        case "get_release_history": return [];
        default:
          win.__unexpectedIPC.push(cmd);
          return Promise.reject(new Error(`Unmocked IPC: ${cmd}`));
      }
    }, { shouldMockEvents: true });
    if (!localStorage.getItem("betterbar_config")) localStorage.setItem("betterbar_config", JSON.stringify(initial));
  };
  await page.addInitScript({ content: `${mocks}\nwindow.mockWindows = mockWindows; window.mockIPC = mockIPC;\n(${initialize.toString()})(${JSON.stringify({ initial: options.config || seed, options })});` });
}

export async function savedConfig(page: Page): Promise<BetterBarConfig> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("betterbar_config")!));
}

export const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await use(errors);
    expect(errors, "browser runtime errors").toEqual([]);
    if (!page.isClosed()) expect(await page.evaluate(() => (window as any).__unexpectedIPC || [])).toEqual([]);
  }, { auto: true }],
});

export { expect };
