import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { BetterBarConfig } from "../types";
import { getMacosPreferences } from "../tauri-bridge";
import { themeStyle } from "../appearance";

export function WindowAppearance({ config }: { config: BetterBarConfig }) {
  useEffect(() => {
    const mode = config.settingsAppearance;
    document.documentElement.dataset.macosAppearance = mode === "light" || mode === "dark" ? mode : "system";
    document.documentElement.style.colorScheme = mode === "light" || mode === "dark" ? mode : "light dark";
    let cancelled = false;
    const refresh = async () => {
      try {
        if (cancelled) return;
        const prefs = await getMacosPreferences();
        if (cancelled) return;
        const root = document.documentElement;
        // Lets the stylesheet pick the sidebar material: macOS reveals a
        // native NSVisualEffectView, other platforms draw it in CSS.
        root.dataset.nativePlatform = prefs.platform ?? "other";
        // Outside macOS the webview does not inherit the desktop's light/dark
        // preference, so honour it here when the user has left this on system.
        if (mode !== "light" && mode !== "dark" && (prefs.color_scheme === "dark" || prefs.color_scheme === "light")) {
          root.dataset.macosAppearance = prefs.color_scheme;
          root.style.colorScheme = prefs.color_scheme;
          void getCurrentWindow().setTheme(prefs.color_scheme).catch(() => {});
        }
        root.dataset.nativeReduceTransparency = String(prefs.reduce_transparency);
        root.dataset.nativeIncreaseContrast = String(prefs.increase_contrast);
        root.dataset.nativeReduceMotion = String(prefs.reduce_motion);
        if (/^#[\da-f]{6}$/i.test(prefs.accent)) {
          const contrast = themeStyle({ ...config, accentColor: prefs.accent }) as Record<string, string>;
          const surface = document.querySelector<HTMLElement>(".bb-native-surface");
          for (const prefix of ["--mac", "--mac-light", "--mac-dark"]) {
            surface?.style.setProperty(`${prefix}-accent`, prefs.accent);
            surface?.style.setProperty(`${prefix}-on-accent`, contrast["--bb-on-accent"]);
          }
        }
      } catch { /* CSS system defaults remain available outside the native runtime. */ }
    };
    getCurrentWindow().setTheme(mode === "light" || mode === "dark" ? mode : null).then(refresh).catch(refresh);
    window.addEventListener("focus", refresh);
    const colors = window.matchMedia("(prefers-color-scheme: dark)");
    colors.addEventListener("change", refresh);
    return () => { cancelled = true; window.removeEventListener("focus", refresh); colors.removeEventListener("change", refresh); };
  }, [config.settingsAppearance]);
  return null;
}
