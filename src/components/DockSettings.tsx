import { useRef, useState } from "react";
import type { BetterBarConfig, DockItem } from "../types";
import { newDockItems, pickDockItems } from "../dock-targets";

const strings = { app: "Dock apps…", file: "Dock files…", folder: "Dock folders…", busy: "Choosing items…", error: "Could not dock these items. Check that they are still available and try again.", hint: "Open files with their default app and folders in Finder. You can also drag them from Finder onto the bar.", up: "Move {name} earlier", down: "Move {name} later", remove: "Undock {name}", labels: "Show app and file names" };
type Props = { showItems?: boolean; config: BetterBarConfig; updateConfig: (patch: Partial<BetterBarConfig>) => void };
export function DockSettings({ config, updateConfig, showItems = true }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const latest = useRef(config); latest.current = config;
  const active = config.sets.find(set => set.id === config.activeSetId) || config.sets[0];
  function save(items: DockItem[], setId = active.id) {
    const current = latest.current;
    updateConfig({ sets: current.sets.map(set => set.id === setId ? { ...set, items } : set) });
  }
  async function pick(kind: "app" | "file" | "folder") {
    const setId = active.id;
    setBusy(true); setError(false);
    try {
      const targets = await pickDockItems(kind);
      const current = latest.current.sets.find(set => set.id === setId);
      if (current) save([...current.items, ...newDockItems(current.items, targets)], setId);
    } catch { setError(true); } finally { setBusy(false); }
  }
  const sorted = [...(active?.items || [])].sort((a, b) => a.order - b.order);
  function move(index: number, delta: number) {
    const next = [...sorted]; [next[index], next[index + delta]] = [next[index + delta], next[index]];
    // Keep legacy per-app slots in agreement with the group order for uninstall fallback.
    const ids = new Set(next.map(item => `app:${encodeURIComponent(active.id)}:${encodeURIComponent(item.id)}`));
    let cursor = 0;
    updateConfig({ sets: config.sets.map(set => set.id === active.id ? { ...set, items: next.map((item, order) => ({ ...item, order })) } : set),
      barOrder: config.barOrder?.map(id => ids.has(id) ? `app:${encodeURIComponent(active.id)}:${encodeURIComponent(next[cursor++].id)}` as const : id) });
  }
  return <div className="bb-dock-settings">
    <p>{strings.hint}</p>
    <div className="flex flex-wrap gap-2 my-3">{(["app", "file", "folder"] as const).map(kind => <button key={kind} disabled={busy || !active} onClick={() => pick(kind)}>{strings[kind]}</button>)}</div>
    {busy && <p role="status">{strings.busy}</p>}{error && <p role="alert">{strings.error}</p>}
    <label className="flex items-center gap-2 my-3"><input type="checkbox" checked={config.showLabels} onChange={event => updateConfig({ showLabels: event.target.checked })}/>{strings.labels}</label>
    {showItems && <ul>{sorted.map((item, index) => <li className="flex items-center gap-2 py-2 border-b border-[var(--bb-line)]" key={item.id}>
      <span className="flex-1 truncate" title={item.path}>{item.name}<small className="ml-2 opacity-60">{item.kind || "app"}</small></span>
      <button aria-label={strings.up.replace("{name}", item.name)} disabled={!index} onClick={() => move(index, -1)}>↑</button>
      <button aria-label={strings.down.replace("{name}", item.name)} disabled={index === sorted.length - 1} onClick={() => move(index, 1)}>↓</button>
      <button aria-label={strings.remove.replace("{name}", item.name)} onClick={() => save(active.items.filter(pin => pin.id !== item.id))}>×</button>
    </li>)}</ul>}
  </div>;
}
