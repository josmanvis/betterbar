import { useEffect, useState } from "react";
import { CaretDown, MagnifyingGlass, PuzzlePiece } from "@phosphor-icons/react";
import type { BetterBarConfig } from "../types";
import type { LoadedExtension } from "../extensions-runtime";
import { reloadExtensions } from "../extensions-runtime";
import { ExtensionAppearanceEditor } from "./AppearanceEditor";

const strings = {
  search: "Filter extensions", all: "All", enabled: "Enabled", disabled: "Disabled", filters: "Filter by status",
  enable: "Enable {name}", disable: "Disable {name}", configure: "Configure {name}",
  settings: "Settings", hideSettings: "Hide settings", loading: "Loading extensions…", empty: "No extensions installed.",
  noMatch: "No extensions match your filters.", clear: "Clear filters", reload: "Reload extensions", reloading: "Reloading…",
  reloaded: "Extensions reloaded.", reloadFailed: "Could not reload extensions. Try again.",
  hidden: "Enabled · hidden from bar", off: "Enable this extension to customize it.",
  unavailable: "This extension could not load. Try reloading extensions.",
  generic: "Customize this extension’s appearance and options.", count: "{shown} of {total} extensions",
};
const descriptions: Record<string, string> = {
  "apps-drawer": "Find and launch apps, with your favorites close at hand.",
  "apple-calendar": "Upcoming events from your Mac’s calendars.",
  "focus-timer": "A simple timer for focus sessions and breaks.",
  "system-monitor": "Live CPU and memory use at a glance.",
  time: "World clocks, date formats, and timezones.", media: "Playback controls and the current track.",
  power: "Battery level and charging status.", floatnote: "Open Floatnote from your bar.",
  timesheets: "Open Timesheets from your bar.", "Standup Update": "Read your latest standup update.",
};
type Extension = { name: string; displayName: string };
type Props = { config: BetterBarConfig; extensions: Extension[]; loaded: LoadedExtension[]; ready: boolean;
  update: (patch: Partial<BetterBarConfig>) => void; toggle: (name: string) => void; revealName?: string };

export function filterExtensions(extensions: Extension[], enabled: string[], query: string, filter: string) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return extensions.filter(ext => (filter === "all" || enabled.includes(ext.name) === (filter === "enabled")) &&
    words.every(word => `${ext.name} ${ext.displayName} ${descriptions[ext.name] || ""}`.toLocaleLowerCase().includes(word)))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function ExtensionManager({ config, extensions, loaded, ready, update, toggle, revealName }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reloadState, setReloadState] = useState<"idle" | "loading" | "done" | "error">("idle");
  useEffect(() => {
    if (!revealName) return;
    setQuery(""); setFilter("all"); setExpanded(revealName);
  }, [revealName]);
  const visible = filterExtensions(extensions, config.enabledExtensions, query, filter);
  async function reload() {
    setReloadState("loading");
    try { await reloadExtensions(); setReloadState("done"); }
    catch { setReloadState("error"); }
  }
  return <div className="bb-extension-manager">
    <div className="bb-extension-tools">
      <label className="bb-extension-filter"><MagnifyingGlass size={16} aria-hidden="true"/>
        <input type="search" aria-label={strings.search} placeholder={strings.search} value={query} onChange={event => setQuery(event.target.value)}/>
      </label>
      <div className="bb-extension-status-filter" role="group" aria-label={strings.filters}>
        {(["all", "enabled", "disabled"] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{strings[value]}</button>)}
      </div>
    </div>
    <div className="bb-extension-result-meta"><span aria-live="polite">{strings.count.replace("{shown}", String(visible.length)).replace("{total}", String(extensions.length))}</span>
      <button disabled={reloadState === "loading"} onClick={reload}>{reloadState === "loading" ? strings.reloading : strings.reload}</button>
    </div>
    {reloadState === "error" && <p role="alert">{strings.reloadFailed}</p>}
    {reloadState === "done" && <p role="status">{strings.reloaded}</p>}
    {!ready ? <p role="status">{strings.loading}</p> : extensions.length === 0 ? <p>{strings.empty}</p> : visible.length === 0 ?
      <div className="bb-extension-empty"><p>{strings.noMatch}</p><button onClick={() => { setQuery(""); setFilter("all"); }}>{strings.clear}</button></div> :
      <div className="bb-extension-list">{visible.map(ext => {
        const enabled = config.enabledExtensions.includes(ext.name);
        const extension = loaded.find(item => item.name === ext.name);
        const Settings = extension?.Settings;
        const displayName = extension?.displayName || ext.displayName.replace(/\b\w/g, letter => letter.toUpperCase());
        const open = expanded === ext.name;
        const panelId = `extension-options-${encodeURIComponent(ext.name)}`;
        return <div className="bb-extension-card" key={ext.name}>
          <div className="bb-extension-header">
            <PuzzlePiece size={20} aria-hidden="true"/>
            <div className="bb-extension-heading"><h2>{displayName}</h2><p>{descriptions[ext.name] || strings.generic}</p>
              <small>{enabled ? config.showExtensions ? strings.enabled : strings.hidden : strings.disabled}</small>
            </div>
            <button className="bb-extension-switch" role="switch" aria-checked={enabled}
              aria-label={(enabled ? strings.disable : strings.enable).replace("{name}", displayName)}
              onClick={() => { toggle(ext.name); if (!enabled) setExpanded(ext.name); }}><span/></button>
          </div>
          {enabled && <>
            <button className="bb-extension-configure" aria-label={strings.configure.replace("{name}", displayName)} aria-expanded={open} aria-controls={panelId}
              onClick={() => setExpanded(open ? null : ext.name)}>{open ? strings.hideSettings : strings.settings}<CaretDown size={14} aria-hidden="true"/></button>
            <div className="bb-extension-options" id={panelId} hidden={!open}>
              {open && <><ExtensionAppearanceEditor config={config} name={ext.name} label={displayName} update={update}/>
                {Settings ? <Settings config={config} updateConfig={update}/> : !extension && <p role="status">{strings.unavailable}</p>}</>}
            </div>
          </>}
          {!enabled && open && <p className="bb-extension-disabled-hint">{strings.off}</p>}
        </div>;
      })}</div>}
  </div>;
}
