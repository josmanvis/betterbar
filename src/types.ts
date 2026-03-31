export type DockPosition = "bottom" | "left" | "right" | "top";

export interface DockItem {
  id: string;
  name: string;
  path: string;
  bundleId?: string;
  icon?: string; // base64 data URL or emoji fallback
  order: number;
}

export interface RunningApp {
  name: string;
  bundle_id: string;
  pid: number;
  is_active: boolean;
}

export interface ScreenInfo {
  width: number;
  height: number;
  scale_factor: number;
}

export interface BetterBarConfig {
  position: DockPosition;
  iconSize: number; // 32–96
  autoHide: boolean;
  showLabels: boolean;
  theme: "dark" | "light" | "auto";
  items: DockItem[];
}

export const DEFAULT_CONFIG: BetterBarConfig = {
  position: "bottom",
  iconSize: 56,
  autoHide: false,
  showLabels: true,
  theme: "dark",
  items: [
    { id: "finder", name: "Finder", path: "/System/Library/CoreServices/Finder.app", bundleId: "com.apple.finder", order: 0 },
    { id: "safari", name: "Safari", path: "/Applications/Safari.app", bundleId: "com.apple.Safari", order: 1 },
    { id: "messages", name: "Messages", path: "/Applications/Messages.app", bundleId: "com.apple.MobileSMS", order: 2 },
    { id: "mail", name: "Mail", path: "/System/Applications/Mail.app", bundleId: "com.apple.mail", order: 3 },
    { id: "calendar", name: "Calendar", path: "/System/Applications/Calendar.app", bundleId: "com.apple.iCal", order: 4 },
    { id: "terminal", name: "Terminal", path: "/System/Applications/Utilities/Terminal.app", bundleId: "com.apple.Terminal", order: 5 },
  ],
};
