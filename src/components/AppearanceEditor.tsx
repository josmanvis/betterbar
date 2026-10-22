import type { BetterBarConfig } from "../types";
import { appearanceFor, barSurface, PALETTE, type Appearance, type ExtensionAppearance, type Palette } from "../appearance";

const strings = {
  preview: "Your bar", hint: "Changes apply instantly to the bar and extensions. Background opacity keeps icons and text crisp.",
  presets: "Color presets", opacity: "Background opacity", blur: "Backdrop blur", radius: "Corner radius", border: "Border width",
  shadow: "Inner shadow", scanlines: "Scanline texture", colors: "Colors", accent: "Accent", reset: "Reset bar appearance",
  appearance: "Appearance", extensionHint: "Colors apply to this extension’s bar button and window. Extensions that draw their own colors may keep their own palette.",
  buttonOpacity: "{name} button opacity", iconSize: "{name} content size", customColors: "Use custom colors", resetExtension: "Reset extension appearance",
  labels: "Extension labels", inherit: "Follow shared setting", show: "Show", hide: "Hide",
  borderVisible: "Button border",
};
const labels: Record<keyof Palette, string> = {
  background: "Background", surface: "Panels", elevated: "Raised surfaces", text: "Primary text", secondary: "Secondary text",
  muted: "Muted text", border: "Borders", strongBorder: "Strong borders", warning: "Warnings", danger: "Errors",
};
const presets: { name: string; palette: Palette; accent: string }[] = [
  { name: "Terminal", palette: PALETTE, accent: "#c5f500" },
  { name: "Midnight", palette: { background: "#101725", surface: "#172235", elevated: "#20304a", text: "#eef3fc", secondary: "#a4b6d2", muted: "#7e94b4", border: "#2b3c58", strongBorder: "#476181", warning: "#ffbb6c", danger: "#ff7c8c" }, accent: "#74c7ff" },
  { name: "Paper", palette: { background: "#eeeae1", surface: "#f6f3eb", elevated: "#e4dfd4", text: "#252a29", secondary: "#555f5b", muted: "#69736f", border: "#c7c7bc", strongBorder: "#949e95", warning: "#9b550c", danger: "#c0393e" }, accent: "#3e7357" },
];

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="bb-color-field"><span>{label}</span><span className="bb-color-value">
    <input type="color" aria-label={label} value={value} onChange={event => onChange(event.target.value)} />
    <span>{value.toUpperCase()}</span></span></label>;
}
function RangeField({ label, value, max, min = 0, unit, onChange }: {
  label: string; value: number; max: number; min?: number; unit: string; onChange: (value: number) => void;
}) {
  return <label className="bb-appearance-range"><span>{label}<output>{Math.round(value)}{unit}</output></span>
    <input type="range" aria-label={label} min={min} max={max} step="1" value={value} onChange={event => onChange(Number(event.target.value))} />
  </label>;
}

export function AppearanceEditor({ config, update }: { config: BetterBarConfig; update: (patch: Partial<BetterBarConfig>) => void }) {
  const appearance = appearanceFor(config);
  const patch = (value: Partial<Appearance>) => update({ appearance: { ...appearance, ...value } });
  return <div className="bb-appearance-editor">
    <div className="bb-style-preview" style={{ backgroundImage: "repeating-conic-gradient(#29313c 0% 25%, #455262 0% 50%)" }}>
      <div style={{ ...barSurface(config), position: "relative", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ color: "var(--bb-accent)", fontWeight: 700 }}>BB</span>
        <span style={{ color: "var(--bb-text)" }}>{strings.preview}</span><span style={{ color: "var(--bb-dim)", marginLeft: "auto" }}>09:41</span>
      </div>
    </div>
    <p className="bb-appearance-hint">{strings.hint}</p>
    <div className="bb-appearance-presets" role="group" aria-label={strings.presets}>
      {presets.map(preset => <button key={preset.name} onClick={() => update({ appearance: { ...appearance, palette: { ...preset.palette } }, accentColor: preset.accent })}>
        <i aria-hidden="true" style={{ background: preset.palette.background, borderColor: preset.accent }} />{preset.name}
      </button>)}
    </div>
    <div className="bb-appearance-ranges">
      <RangeField label={strings.opacity} value={appearance.opacity} max={100} unit="%" onChange={opacity => patch({ opacity })} />
      <RangeField label={strings.blur} value={appearance.blur} max={40} unit=" px" onChange={blur => patch({ blur })} />
      <RangeField label={strings.radius} value={appearance.radius} max={48} unit=" px" onChange={radius => patch({ radius })} />
      <RangeField label={strings.border} value={appearance.borderWidth} max={4} unit=" px" onChange={borderWidth => patch({ borderWidth })} />
      <RangeField label={strings.shadow} value={appearance.shadow} max={100} unit="%" onChange={shadow => patch({ shadow })} />
    </div>
    <label className="bb-appearance-check"><input type="checkbox" checked={appearance.scanlines} onChange={event => patch({ scanlines: event.target.checked })} />{strings.scanlines}</label>
    <details className="bb-appearance-details" open><summary>{strings.colors}</summary>
      <div className="bb-color-grid">
        <ColorField label={strings.accent} value={config.accentColor} onChange={accentColor => update({ accentColor })} />
        {(Object.keys(labels) as (keyof Palette)[]).map(key => <ColorField key={key} label={labels[key]} value={appearance.palette[key]}
          onChange={value => patch({ palette: { ...appearance.palette, [key]: value } })} />)}
      </div>
    </details>
    <button className="bb-appearance-reset" onClick={() => update({ appearance: appearanceFor({ ...config, appearance: undefined, transparentBg: false }), accentColor: "#c5f500", transparentBg: false })}>{strings.reset}</button>
  </div>;
}

export function ExtensionAppearanceEditor({ config, name, label = name, update }: { config: BetterBarConfig; name: string; label?: string; update: (patch: Partial<BetterBarConfig>) => void }) {
  const value = config.extensionAppearance?.[name] || {};
  const globalPalette = appearanceFor(config).palette;
  const patch = (next: Partial<ExtensionAppearance>) => update({ extensionAppearance: { ...config.extensionAppearance, [name]: { ...value, ...next } } });
  return <details className="bb-appearance-details"><summary>{strings.appearance}</summary>
    <div className="bb-appearance-editor">
      <p className="bb-appearance-hint">{strings.extensionHint}</p>
      <label className="bb-extension-label-choice">{strings.labels}<select aria-label={`${label} ${strings.labels.toLowerCase()}`} value={value.showLabels === undefined ? "inherit" : value.showLabels ? "show" : "hide"}
        onChange={event => patch({ showLabels: event.target.value === "inherit" ? undefined : event.target.value === "show" })}>
        <option value="inherit">{strings.inherit}</option><option value="show">{strings.show}</option><option value="hide">{strings.hide}</option>
      </select></label>
      <label className="bb-extension-label-choice">{strings.borderVisible}<select aria-label={`${label} ${strings.borderVisible.toLowerCase()}`} value={value.showBorder === undefined ? "inherit" : value.showBorder ? "show" : "hide"}
        onChange={event => patch({ showBorder: event.target.value === "inherit" ? undefined : event.target.value === "show" })}>
        <option value="inherit">{strings.inherit}</option><option value="show">{strings.show}</option><option value="hide">{strings.hide}</option>
      </select></label>
      <div className="bb-appearance-ranges">
        <RangeField label={strings.buttonOpacity.replace("{name}", label)} value={value.opacity ?? 100} max={100} unit="%" onChange={opacity => patch({ opacity })} />
        <RangeField label={strings.iconSize.replace("{name}", label)} value={(value.iconScale ?? 1) * 100} min={50} max={150} unit="%" onChange={scale => patch({ iconScale: scale / 100 })} />
      </div>
      <label className="bb-appearance-check"><input type="checkbox" checked={!!value.colors}
        onChange={event => patch({ colors: event.target.checked ? { ...globalPalette, accent: config.accentColor } : undefined })} />{strings.customColors}</label>
      {value.colors && <div className="bb-color-grid">
        <ColorField label={`${label} ${strings.accent.toLowerCase()}`} value={value.colors.accent || config.accentColor} onChange={accent => patch({ colors: { ...value.colors, accent } })} />
        {(Object.keys(labels) as (keyof Palette)[]).map(key => <ColorField key={key} label={`${label} ${labels[key].toLowerCase()}`} value={value.colors?.[key] || globalPalette[key]}
          onChange={color => patch({ colors: { ...value.colors, [key]: color } })} />)}
      </div>}
      <button className="bb-appearance-reset" onClick={() => {
        const next = { ...config.extensionAppearance }; delete next[name]; update({ extensionAppearance: next });
      }}>{strings.resetExtension}</button>
    </div>
  </details>;
}
