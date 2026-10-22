import type { CSSProperties } from "react";
import { ACTIVE_APP_STYLES, activeAppSettings, type ActiveAppStyle } from "../appearance";
import type { BetterBarConfig, DockPosition } from "../types";

const strings = { hint: "Make the focused app stand out. The same treatment applies to pinned apps and running windows.",
  strength: "Highlight strength", pulse: "Soft pulse", dim: "Dim inactive apps", reset: "Reset active app appearance", preview: "Active app preview",
  edge: "Edge line", halo: "Halo", spotlight: "Spotlight", pill: "Soft tile", underline: "Underline", lift: "Lift", none: "None" };

export function appFocusProps(config: Partial<BetterBarConfig> = {}, active = false, position: DockPosition = "bottom") {
  const value = activeAppSettings(config);
  return { "data-bb-active": active ? "true" : "false", "data-active-style": value.activeAppStyle, "data-active-position": position,
    "data-dim-idle": value.dimInactiveApps ? "true" : "false", "data-active-pulse": value.activeAppPulse ? "true" : "false",
    style: { "--bb-active-opacity": value.activeAppStrength / 100 } as CSSProperties };
}

export function ActiveAppEditor({ config, update }: { config: BetterBarConfig; update: (patch: Partial<BetterBarConfig>) => void }) {
  const value = activeAppSettings(config);
  return <div className="bb-focus-editor"><p>{strings.hint}</p><div className="bb-focus-choices" role="group" aria-label={strings.preview}>
    {ACTIVE_APP_STYLES.map((style: ActiveAppStyle) => <button key={style} aria-pressed={value.activeAppStyle === style} onClick={() => update({ activeAppStyle: style })}>
      <span className="bb-focus-preview" {...appFocusProps({ ...config, activeAppStyle: style }, true)} aria-hidden="true"><span className="bb-focus-preview-icon"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 15 3-8 3 8m-5-3h4m2 5h3"/></svg></span></span>
      <span>{strings[style]}</span></button>)}
  </div><label className="bb-focus-strength"><span>{strings.strength}</span><input aria-label={strings.strength} type="range" min="20" max="100" value={value.activeAppStrength} onChange={event => update({ activeAppStrength: +event.target.value })}/><output>{value.activeAppStrength}%</output></label>
    <label className="bb-appearance-check"><input type="checkbox" checked={value.activeAppPulse} onChange={event => update({ activeAppPulse: event.target.checked })}/>{strings.pulse}</label>
    <label className="bb-appearance-check"><input type="checkbox" checked={value.dimInactiveApps} onChange={event => update({ dimInactiveApps: event.target.checked })}/>{strings.dim}</label>
    <button className="bb-appearance-reset" onClick={() => update(activeAppSettings({}))}>{strings.reset}</button></div>;
}
