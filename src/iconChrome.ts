import type { CSSProperties } from "react";
import type { IconChrome } from "./types";

/** Merge a global chrome with a per-item override (item wins field-by-field). */
export function mergeChrome(global?: IconChrome, item?: IconChrome): IconChrome {
  return { ...(global || {}), ...(item || {}) };
}

/** True when the chrome paints anything of its own (a fill or a border). */
export function hasChrome(c: IconChrome): boolean {
  return c.background !== undefined || c.borderColor !== undefined;
}

/** Inline styles for the icon-box wrapper. Shared by the live bar (`DockIcon`,
 *  `RunningAppIcon`) and the settings preview so the two never drift. */
export function iconChromeStyle(c: IconChrome): CSSProperties {
  const style: CSSProperties = {};
  if (c.background !== undefined) style.background = c.background;
  if (c.borderColor !== undefined || c.borderWidth !== undefined) {
    style.border = `${c.borderWidth ?? 1}px solid ${c.borderColor ?? "transparent"}`;
  }
  if (c.radius !== undefined) {
    style.borderRadius = `${c.radius}px`;
    style.overflow = "hidden";
  }
  if (c.padding !== undefined) style.padding = `${c.padding}px`;
  return style;
}
