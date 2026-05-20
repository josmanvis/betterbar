export type DockPosition = "bottom" | "left" | "right" | "top";

export interface DockItem {
  id: string;
  name: string;
  path: string;
  bundleId?: string;
  icon?: string; // base64 data URL or emoji fallback
  order: number;
  /** Hidden items are kept in the set but not rendered in the bar.
   *  Toggleable from the settings window. */
  hidden?: boolean;
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
  menu_bar_height: number;
  dock_height: number;
}

export interface BatteryInfo {
  percentage: number;
  is_charging: boolean;
  is_plugged: boolean;
  available: boolean;
}

export interface WindowThumbnail {
  image: string;         // "data:image/png;base64,..."
  title: string | null;
}

export interface AppSet {
  id: string;
  name: string;
  items: DockItem[];
}

export type BarLengthMode = "edge" | "auto" | "custom";

/** How each item's visual is rendered.
 * - "auto": real macOS app icon when resolvable, fallback to a 2-letter glyph.
 * - "glyph": always render the 2-letter glyph (no icon fetch). */
export type IconStyle = "auto" | "glyph";

export interface BetterBarConfig {
  position: DockPosition;
  iconSize: number; // 32–96
  barSize: number;  // 48–200, thickness of the bar
  autoHide: boolean;
  showLabels: boolean;
  theme: "dark" | "light" | "auto";
  sets: AppSet[];
  activeSetId: string;
  /** When true, the bar is a freely positioned floating window instead of an edge dock. */
  freeFloat: boolean;
  /** Logical-pixel x/y of the floating bar. Null = use a sensible initial location. */
  floatPosition: { x: number; y: number } | null;
  /**
   * How the bar's long axis is sized in free-float mode.
   * - "edge": span the full screen edge (visibleFrame length).
   * - "auto": expand to fit content (icons + indicators).
   * - "custom": use `barLength` (slider).
   */
  barLengthMode: BarLengthMode;
  /** Long-axis length in pixels when `barLengthMode` is "custom". Range [BAR_LENGTH_MIN, BAR_LENGTH_MAX]. */
  barLength: number;
  /** How to render each item's visual. */
  iconStyle: IconStyle;
  /** Desaturate idle (non-hovered, non-running) icons. */
  grayscaleIdle: boolean;
  /** Append a section showing currently-running apps that aren't already pinned. */
  showRunningApps: boolean;
}

export const BAR_SIZE_MIN = 48;
export const BAR_SIZE_MAX = 200;
export const BAR_LENGTH_MIN = 200;
export const BAR_LENGTH_MAX = 1400;
/** Width of the edge band that acts as a drag handle when freeFloat is on (logical pixels). */
export const FLOAT_DRAG_EDGE = 10;

const DEFAULT_ITEMS: DockItem[] = [
  { id: "finder",   name: "Finder",   path: "/System/Library/CoreServices/Finder.app",  bundleId: "com.apple.finder",       order: 0 },
  { id: "safari",   name: "Safari",   path: "/Applications/Safari.app",                 bundleId: "com.apple.Safari",       order: 1 },
  { id: "messages", name: "Messages", path: "/Applications/Messages.app",               bundleId: "com.apple.MobileSMS",    order: 2 },
  { id: "mail",     name: "Mail",     path: "/System/Applications/Mail.app",            bundleId: "com.apple.mail",         order: 3 },
  { id: "calendar", name: "Calendar", path: "/System/Applications/Calendar.app",        bundleId: "com.apple.iCal",         order: 4 },
  { id: "terminal", name: "Terminal", path: "/System/Applications/Utilities/Terminal.app", bundleId: "com.apple.Terminal",  order: 5 },
];

export const DEFAULT_CONFIG: BetterBarConfig = {
  position: "left",
  iconSize: 48,
  barSize: 68,
  autoHide: false,
  showLabels: false,
  theme: "dark",
  activeSetId: "default",
  sets: [
    { id: "default", name: "Default", items: DEFAULT_ITEMS },
  ],
  freeFloat: false,
  floatPosition: null,
  barLengthMode: "custom",
  barLength: 480,
  iconStyle: "auto",
  grayscaleIdle: true,
  showRunningApps: false,
};
