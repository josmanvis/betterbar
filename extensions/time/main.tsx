import React from "react";

export const name = "Time";
const PREFS_KEY = "bb-time-settings";
const PREFS_EVENT = "bb-time-settings-changed";
const strings = {
  clocks: "Clocks", hint: "Choose the timezones and labels shown on your bar.",
  empty: "No clocks yet. Add a timezone below.", label: "Label", timezone: "Timezone", add: "Add timezone", edit: "Edit", remove: "Remove",
  save: "Save clock", cancel: "Cancel", up: "Move {name} up", down: "Move {name} down", editClock: "Edit {name}", removeClock: "Remove {name}",
  invalidZone: "Enter a valid timezone, such as America/New_York or UTC.", invalidLabel: "Enter a label for this clock.",
  saveFailed: "Could not save your clock settings. Try again.", display: "Display", format: "Time format", twelve: "12-hour", twentyFour: "24-hour",
  seconds: "Show seconds", period: "Show AM / PM", labels: "Show clock labels", date: "Date", noDate: "Hidden", shortDate: "Month and day", weekday: "Weekday, month and day",
  layout: "Clock layout", adaptive: "Follow bar orientation", stacked: "Stacked", inline: "Inline", timeSize: "Time text size", labelSize: "Label text size",
  spacing: "Space between clocks", weight: "Time text weight", regular: "Regular", medium: "Medium", bold: "Bold", separators: "Separate clocks with a line",
  preview: "Preview", reset: "Reset display options", colors: "Use Appearance above to customize this extension’s colors, opacity, and overall size.",
};
type Clock = { id: string; code: string; tz: string };
type Config = { clocks?: Clock[] };
type Props = { isVertical?: boolean; config?: Config };
type Preferences = {
  hour12: boolean; showSeconds: boolean; showPeriod: boolean; showLabels: boolean;
  date: "none" | "short" | "weekday"; layout: "auto" | "stacked" | "inline";
  timeSize: number; labelSize: number; spacing: number; weight: number; separators: boolean;
};
const DEFAULT_CLOCKS: Clock[] = [
  { id: "sf", code: "SF", tz: "America/Los_Angeles" }, { id: "bz", code: "BZ", tz: "America/Belize" },
  { id: "nyc", code: "NYC", tz: "America/New_York" }, { id: "esp", code: "ESP", tz: "Europe/Madrid" },
  { id: "ind", code: "IND", tz: "Asia/Kolkata" }, { id: "gha", code: "GHA", tz: "Africa/Accra" },
];
const DEFAULTS: Preferences = { hour12: true, showSeconds: false, showPeriod: true, showLabels: true,
  date: "none", layout: "auto", timeSize: 10, labelSize: 9, spacing: 16, weight: 400, separators: false };
function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}
function readPreferences(): Preferences {
  let v: Partial<Preferences> = {};
  try { v = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch {}
  return { hour12: v.hour12 !== false, showSeconds: v.showSeconds === true, showPeriod: v.showPeriod !== false, showLabels: v.showLabels !== false,
    date: v.date === "short" || v.date === "weekday" ? v.date : "none", layout: v.layout === "stacked" || v.layout === "inline" ? v.layout : "auto",
    timeSize: bounded(v.timeSize, 10, 9, 24), labelSize: bounded(v.labelSize, 9, 8, 18), spacing: bounded(v.spacing, 16, 0, 32),
    weight: [400, 500, 700].includes(v.weight || 0) ? v.weight! : 400, separators: v.separators === true };
}
function usePreferences() {
  const [preferences, setPreferences] = React.useState(readPreferences);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    const sync = (event: Event) => { if (!(event instanceof StorageEvent) || event.key === PREFS_KEY || event.key === null) setPreferences(readPreferences()); };
    window.addEventListener("storage", sync); window.addEventListener(PREFS_EVENT, sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener(PREFS_EVENT, sync); };
  }, []);
  function update(patch: Partial<Preferences>) {
    try {
      const next = { ...readPreferences(), ...patch };
      localStorage.setItem(PREFS_KEY, JSON.stringify(next)); setPreferences(next); setError("");
      window.dispatchEvent(new Event(PREFS_EVENT));
    } catch { setError(strings.saveFailed); }
  }
  return { preferences, update, error };
}
function validTimezone(zone: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(); return true; } catch { return false; }
}
function clocksFor(config?: Config) { return Array.isArray(config?.clocks) ? config.clocks : DEFAULT_CLOCKS; }
function timeFormatter(tz: string, preferences: Preferences) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: preferences.hour12 ? "numeric" : "2-digit", minute: "2-digit",
    ...(preferences.showSeconds ? { second: "2-digit" } : {}), hourCycle: preferences.hour12 ? "h12" : "h23" });
}
function formatTime(formatter: Intl.DateTimeFormat | null | undefined, now: Date, preferences: Preferences) {
  try {
    if (!formatter) return "--:--";
    return preferences.hour12 && !preferences.showPeriod
      ? formatter.formatToParts(now).filter(part => part.type !== "dayPeriod").map(part => part.value).join("").trim()
      : formatter.format(now);
  } catch { return "--:--"; }
}
function useNow(seconds: boolean) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      clearTimeout(timer); setNow(new Date());
      const interval = seconds ? 1000 : 60000;
      timer = setTimeout(tick, interval - (Date.now() % interval));
    };
    tick(); document.addEventListener("visibilitychange", tick);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", tick); };
  }, [seconds]);
  return now;
}
export default function TimeExtension({ isVertical = false, config }: Props) {
  const { preferences: p } = usePreferences();
  const now = useNow(p.showSeconds);
  const clocks = clocksFor(config);
  const inline = p.layout === "inline" || (p.layout === "auto" && isVertical);
  const formatters = React.useMemo(() => new Map(clocks.map(clock => {
    try { return [clock.tz, timeFormatter(clock.tz, p)] as const; } catch { return [clock.tz, null] as const; }
  })), [JSON.stringify(clocks), p.hour12, p.showSeconds]);
  if (!clocks.length) return null;
  return <div className="time-extension" style={{ display: "flex", flexDirection: isVertical ? "column" : "row", alignItems: "center",
    gap: p.spacing, padding: isVertical ? "6px" : "6px 16px", fontFamily: '"IBM Plex Mono",Menlo,monospace' }}>
    {clocks.map((clock, index) => {
      const time = formatTime(formatters.get(clock.tz), now, p);
      let date = "";
      try {
        if (p.date !== "none") date = new Intl.DateTimeFormat(undefined, { timeZone: clock.tz, month: "short", day: "numeric", ...(p.date === "weekday" ? { weekday: "short" } : {}) }).format(now);
      } catch {}
      return <React.Fragment key={clock.id}>
        {p.separators && index > 0 && <span aria-hidden="true" style={{ background: "var(--bb-line-2)", width: isVertical ? "100%" : 1, height: isVertical ? 1 : 24, flexShrink: 0 }} />}
        <div title={`${clock.code} · ${clock.tz}`} style={{ display: "flex", flexDirection: inline ? "row" : "column", alignItems: inline ? "baseline" : "center", gap: inline ? 8 : 3, whiteSpace: "nowrap", lineHeight: 1.2 }}>
          {p.showLabels && <span style={{ fontSize: p.labelSize, fontWeight: 600, letterSpacing: ".1em", color: "var(--bb-accent)" }}>{clock.code}</span>}
          <span style={{ display: "flex", flexDirection: "column", alignItems: inline ? "flex-start" : "center", gap: 3 }}>
            <time dateTime={now.toISOString()} aria-label={`${clock.code} ${time}${date ? `, ${date}` : ""}`} style={{ fontSize: p.timeSize, fontWeight: p.weight, color: "var(--bb-text)", fontVariantNumeric: "tabular-nums" }}>{time}</time>
            {date && <span style={{ fontSize: p.labelSize, color: "var(--bb-dim)" }}>{date}</span>}
          </span>
        </div>
      </React.Fragment>;
    })}
  </div>;
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="time-field"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
export function Settings({ config, updateConfig }: { config?: Config; updateConfig: (patch: Config) => void }) {
  const { preferences: p, update, error } = usePreferences();
  const clocks = clocksFor(config);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [zone, setZone] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const suggestions = React.useMemo(() => {
    try { return ["UTC", ...Intl.supportedValuesOf("timeZone")]; } catch { return DEFAULT_CLOCKS.map(clock => clock.tz).concat("UTC"); }
  }, []);
  function begin(clock?: Clock) { setEditing(clock?.id || "new"); setCode(clock?.code || ""); setZone(clock?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone); setFormError(""); }
  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) { setFormError(strings.invalidLabel); return; }
    if (!validTimezone(zone.trim())) { setFormError(strings.invalidZone); return; }
    const clock = { id: editing === "new" ? `clock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` : editing!, code: code.trim(), tz: zone.trim() };
    try { updateConfig({ clocks: editing === "new" ? [...clocks, clock] : clocks.map(item => item.id === editing ? clock : item) }); setEditing(null); setFormError(""); }
    catch { setFormError(strings.saveFailed); }
  }
  function move(index: number, delta: number) {
    const next = [...clocks]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; updateConfig({ clocks: next });
  }
  function toggle(key: "showSeconds" | "showPeriod" | "showLabels" | "separators", label: string) {
    return <label className="time-toggle"><span>{label}</span><input type="checkbox" checked={p[key]} onChange={event => update({ [key]: event.target.checked })} /></label>;
  }
  return <div className="time-settings"><style>{css}</style>
    <div><h3>{strings.clocks}</h3><p className="time-hint">{strings.hint}</p></div>
    <div className="time-clock-list">
      {!clocks.length && <p className="time-hint">{strings.empty}</p>}
      {clocks.map((clock, index) => <div key={clock.id} className="time-clock-row">
        <div className="time-clock-name"><strong>{clock.code}</strong><span>{clock.tz.replaceAll("_", " ")}</span></div>
        <div className="time-clock-actions">
          <button disabled={index === 0} aria-label={strings.up.replace("{name}", clock.code)} onClick={() => move(index, -1)}>↑</button>
          <button disabled={index === clocks.length - 1} aria-label={strings.down.replace("{name}", clock.code)} onClick={() => move(index, 1)}>↓</button>
          <button aria-label={strings.editClock.replace("{name}", clock.code)} onClick={() => begin(clock)}>{strings.edit}</button>
          <button aria-label={strings.removeClock.replace("{name}", clock.code)} onClick={() => { updateConfig({ clocks: clocks.filter(item => item.id !== clock.id) }); if (editing === clock.id) setEditing(null); }}>{strings.remove}</button>
        </div>
      </div>)}
    </div>
    {editing !== null ? <form className="time-clock-form" onSubmit={save}>
      <label className="time-field"><span>{strings.label}</span><input value={code} maxLength={12} onChange={event => setCode(event.target.value)} autoFocus required /></label>
      <label className="time-field"><span>{strings.timezone}</span><input value={zone} list="time-zone-options" onChange={event => setZone(event.target.value)} required spellCheck={false} /></label>
      <datalist id="time-zone-options">{suggestions.map(tz => <option key={tz} value={tz} />)}</datalist>
      {formError && <p className="time-error" role="alert">{formError}</p>}
      <div className="time-form-actions"><button type="submit">{strings.save}</button><button type="button" onClick={() => setEditing(null)}>{strings.cancel}</button></div>
    </form> : <button className="time-add" onClick={() => begin()}>{strings.add}</button>}
    <details open className="time-display"><summary>{strings.display}</summary>
      <div className="time-field-grid">
        <Choice label={strings.format} value={p.hour12 ? "12" : "24"} options={[{ value: "12", label: strings.twelve }, { value: "24", label: strings.twentyFour }]} onChange={value => update({ hour12: value === "12" })} />
        <Choice label={strings.layout} value={p.layout} options={[{ value: "auto", label: strings.adaptive }, { value: "stacked", label: strings.stacked }, { value: "inline", label: strings.inline }]} onChange={value => update({ layout: value as Preferences["layout"] })} />
        <Choice label={strings.date} value={p.date} options={[{ value: "none", label: strings.noDate }, { value: "short", label: strings.shortDate }, { value: "weekday", label: strings.weekday }]} onChange={value => update({ date: value as Preferences["date"] })} />
        <Choice label={strings.weight} value={String(p.weight)} options={[{ value: "400", label: strings.regular }, { value: "500", label: strings.medium }, { value: "700", label: strings.bold }]} onChange={value => update({ weight: Number(value) })} />
      </div>
      {toggle("showSeconds", strings.seconds)}{p.hour12 && toggle("showPeriod", strings.period)}{toggle("showLabels", strings.labels)}{toggle("separators", strings.separators)}
      <div className="time-field-grid">
        {([['timeSize', strings.timeSize, 9, 24], ['labelSize', strings.labelSize, 8, 18], ['spacing', strings.spacing, 0, 32]] as const).map(([key, label, min, max]) => <label key={key} className="time-field"><span>{label}<output>{p[key]} px</output></span>
          <input type="range" min={min} max={max} value={p[key]} onChange={event => update({ [key]: Number(event.target.value) })} />
        </label>)}
      </div>
      <div className="time-preview"><span className="time-hint">{strings.preview}</span><div className="time-preview-scroll"><TimeExtension config={config} /></div></div>
      <p className="time-hint">{strings.colors}</p>
      <button className="time-add" onClick={() => update(DEFAULTS)}>{strings.reset}</button>
    </details>
    {error && <p className="time-error" role="alert">{error}</p>}
  </div>;
}
const css = `
.time-settings { display:flex; flex-direction:column; gap:20px; color:var(--bb-text); font-size:12px; }
.time-settings h3 { font-size:13px; font-weight:500; margin-bottom:8px; }
.time-hint { color:var(--bb-dim); font-size:11px; line-height:1.8; }
.time-clock-row { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding:12px 0; border-bottom:1px solid var(--bb-line); }
.time-clock-name { flex:1; min-width:160px; display:flex; flex-direction:column; gap:6px; }
.time-clock-name strong { color:var(--bb-accent); font-size:11px; }
.time-clock-name > span { font-size:10px; color:var(--bb-dim); overflow-wrap:anywhere; }
.time-clock-actions, .time-form-actions { display:flex; gap:6px; }
.time-settings button { border:1px solid var(--bb-line); padding:8px 10px; font-size:10px; color:var(--bb-text); background:var(--bb-pane); }
.time-settings button:hover:not(:disabled) { border-color:var(--bb-accent); color:var(--bb-accent); }
.time-settings button:disabled { opacity:.3; }
.time-settings button:focus-visible, .time-settings input:focus-visible, .time-settings select:focus-visible { outline:2px solid var(--bb-accent); outline-offset:2px; }
.time-settings .time-add { align-self:flex-start; }
.time-clock-form { padding:16px; border:1px solid var(--bb-line-2); display:flex; flex-direction:column; gap:16px; }
.time-field-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:20px; margin-bottom:12px; }
.time-field { display:flex; flex-direction:column; gap:10px; font-size:11px; }
.time-field > span { display:flex; justify-content:space-between; gap:10px; }
.time-field input:not([type=range]), .time-field select { width:100%; min-width:0; min-height:40px; font:inherit; color:var(--bb-text); background:var(--bb-bg); padding:10px 12px; border:1px solid var(--bb-line-2); border-radius:0; }
.time-field:has(select) { position:relative; }
.time-field select { appearance:none; padding-right:32px; }
.time-field:has(select)::after { content:""; width:6px; height:6px; border-right:1px solid var(--bb-dim); border-bottom:1px solid var(--bb-dim); transform:rotate(45deg); position:absolute; right:14px; bottom:18px; pointer-events:none; }
.time-field input[type=range], .time-toggle input { accent-color:var(--bb-accent); }
.time-field output { color:var(--bb-dim); }
.time-toggle { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 0; font-size:11px; border-bottom:1px solid var(--bb-line); }
.time-toggle input { width:16px; height:16px; }
.time-display { border-top:1px solid var(--bb-line); padding-top:20px; }
.time-display summary { cursor:pointer; font-size:12px; margin-bottom:20px; }
.time-display > .time-field-grid { margin-top:20px; }
.time-preview { border:1px solid var(--bb-line); padding:16px; margin:20px 0; display:flex; flex-direction:column; gap:12px; }
.time-preview-scroll { overflow:auto; padding:6px 0; }
.time-display > .time-add { margin-top:16px; }
.time-error { color:var(--bb-bad); font-size:11px; line-height:1.8; }
`;
