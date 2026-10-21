import type { CSSProperties } from "react";
import type { BetterBarConfig } from "./types";

export const PALETTE = {
  background: "#000000", surface: "#0a0a0a", elevated: "#111111",
  text: "#e7e5dc", secondary: "#7a7a74", muted: "#555551",
  border: "#1f1f1f", strongBorder: "#2b2b2b", warning: "#ff8a3d", danger: "#ff4d4d",
};
export type Palette = typeof PALETTE;
export interface Appearance {
  palette: Palette; opacity: number; blur: number; radius: number;
  borderWidth: number; shadow: number; scanlines: boolean;
}
export interface ExtensionAppearance {
  colors?: Partial<Palette> & { accent?: string };
  opacity?: number;
  iconScale?: number;
  showLabels?: boolean;
  showBorder?: boolean;
}
export const ACTIVE_APP_STYLES = ["edge", "halo", "spotlight", "pill", "underline", "lift", "none"] as const;
export type ActiveAppStyle = (typeof ACTIVE_APP_STYLES)[number];
export function activeAppSettings(config: Partial<BetterBarConfig>) {
  return { activeAppStyle: ACTIVE_APP_STYLES.includes(config.activeAppStyle as ActiveAppStyle) ? config.activeAppStyle! : "edge" as ActiveAppStyle,
    activeAppStrength: clamp(config.activeAppStrength, 75, 20, 100), activeAppPulse: config.activeAppPulse === true, dimInactiveApps: config.dimInactiveApps === true };
}
export const color = (value: unknown, fallback: string) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
const clamp = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function sanitizeAppearance(value: unknown, transparent = false): Appearance {
  const v = value && typeof value === "object" ? value as Partial<Appearance> : {};
  const palette = Object.fromEntries(Object.entries(PALETTE).map(([key, fallback]) => [key, color(v.palette?.[key as keyof Palette], fallback)])) as Palette;
  return { palette, opacity: clamp(v.opacity, transparent ? 35 : 100, 0, 100), blur: clamp(v.blur, transparent ? 12 : 0, 0, 40),
    radius: clamp(v.radius, 0, 0, 48), borderWidth: clamp(v.borderWidth, 1, 0, 4), shadow: clamp(v.shadow, 0, 0, 100), scanlines: v.scanlines !== false };
}

export function sanitizeExtensionAppearance(value: unknown): Record<string, ExtensionAppearance> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([,v]) => v && typeof v === "object").map(([key, raw]) => {
    const v = raw as ExtensionAppearance;
    const colors = v.colors && typeof v.colors === "object" ? Object.fromEntries(Object.entries(v.colors)
      .filter(([k,c]) => (k === "accent" || k in PALETTE) && typeof c === "string" && /^#[\da-f]{6}$/i.test(c))) : undefined;
    return [key, { colors, opacity: clamp(v.opacity, 100, 0, 100), iconScale: clamp(v.iconScale, 1, .5, 1.5),
      ...(typeof v.showLabels === "boolean" ? { showLabels: v.showLabels } : {}),
      ...(typeof v.showBorder === "boolean" ? { showBorder: v.showBorder } : {}) }];
  }));
}

export const appearanceFor = (config: BetterBarConfig) => sanitizeAppearance(config.appearance, config.transparentBg);

export const extensionBorderVisible = (config: BetterBarConfig, name: string) =>
  config.extensionAppearance?.[name]?.showBorder ?? config.showExtensionBorders !== false;

export function themeStyle(config: BetterBarConfig, extension?: string): CSSProperties {
  const own = extension ? config.extensionAppearance?.[extension]?.colors : undefined;
  const p = { ...appearanceFor(config).palette, ...own };
  const accent = own?.accent || config.accentColor;
  const luminance = [1, 3, 5].map(offset => parseInt(accent.slice(offset, offset + 2), 16) / 255)
    .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
    .reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
  return {
    "--bb-bg": p.background, "--bb-pane": p.surface, "--bb-pane-2": p.elevated,
    "--bb-text": p.text, "--bb-dim": p.secondary, "--bb-mute": p.muted,
    "--bb-line": p.border, "--bb-line-2": p.strongBorder, "--bb-warn": p.warning, "--bb-bad": p.danger,
    "--bb-accent": accent, "--bb-accent-d": accent, "--bb-on-accent": luminance > .179 ? "#101010" : "#fafafa",
    color: p.text,
  } as CSSProperties;
}

export function barSurface(config: BetterBarConfig): CSSProperties {
  const a = appearanceFor(config);
  const hex = a.palette.background.slice(1);
  const rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  return { ...themeStyle(config), backgroundColor: `rgba(${rgb.join(",")},${a.opacity / 100})`,
    backdropFilter: a.blur ? `blur(${a.blur}px)` : "none", WebkitBackdropFilter: a.blur ? `blur(${a.blur}px)` : "none",
    borderRadius: a.radius, borderWidth: a.borderWidth, borderStyle: "solid", borderColor: a.palette.border,
    boxShadow: a.shadow ? `inset 0 0 18px rgba(0,0,0,${a.shadow / 100})` : "none" };
}
