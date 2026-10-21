import { useState } from "react";
import type { BarItemId, BetterBarConfig } from "../types";
import { barItems, moveBarItem, resolveBarOrder } from "../bar-layout";

const strings = {
  hint: "Drag rows, use the arrows, or choose a position. Extensions and pinned apps can go anywhere. On the bar, hold ⌘ and drag any item.",
  position: "Position for {name}", up: "Move {name} toward start", down: "Move {name} toward end",
  extension: "Extension", app: "Pinned app", native: "Bar feature", hidden: "Hidden", moved: "Moved {name} to position {position}.",
};
const DRAG_TYPE = "application/x-betterbar-item";
export function BarOrderEditor({ config, extensions, onChange }: {
  config: BetterBarConfig; extensions: { name: string; displayName: string }[]; onChange: (order: BarItemId[]) => void;
}) {
  const order = resolveBarOrder(config, extensions.map(extension => extension.name));
  const items = barItems(config, extensions);
  const [dragging, setDragging] = useState<BarItemId | null>(null);
  const [over, setOver] = useState<BarItemId | null>(null);
  const [announcement, setAnnouncement] = useState("");
  function move(source: BarItemId, target: BarItemId) {
    const next = moveBarItem(order, source, target);
    if (next !== order) {
      onChange(next);
      const item = items.find(item => item.id === source);
      const visible = items.map(item => item.id);
      const nextVisible = next.filter(id => visible.includes(id));
      setAnnouncement(strings.moved.replace("{name}", item?.label || "").replace("{position}", String(nextVisible.indexOf(source) + 1)));
    }
    setDragging(null); setOver(null);
  }
  return <div className="bb-bar-order">
    <p className="bb-bar-order-hint">{strings.hint}</p>
    <ol>
      {items.map((item, index) => <li key={item.id} draggable className={`${dragging === item.id ? "is-dragging" : ""} ${over === item.id ? "is-over" : ""}`}
        data-bar-order-item={item.id}
        onDragStart={event => { event.dataTransfer.setData(DRAG_TYPE, item.id); event.dataTransfer.effectAllowed = "move"; setDragging(item.id); }}
        onDragOver={event => { if (event.dataTransfer.types.includes(DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOver(item.id); } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); }}
        onDrop={event => { if (!event.dataTransfer.types.includes(DRAG_TYPE)) return; event.preventDefault(); const source = event.dataTransfer.getData(DRAG_TYPE); if (items.some(item => item.id === source)) move(source as BarItemId, item.id); }}
        onDragEnd={() => { setDragging(null); setOver(null); }}>
        <span className="bb-order-grip" aria-hidden="true">⠿</span>
        <div className="bb-order-label"><span>{item.label}</span><small>{strings[item.kind]}{!item.enabled ? ` · ${strings.hidden}` : ""}</small></div>
        <label className="bb-order-position"><span className="sr-only">{strings.position.replace("{name}", item.label)}</span>
          <select value={item.id} onChange={event => move(item.id, event.target.value as BarItemId)}>
            {items.map((target, position) => <option key={target.id} value={target.id}>{position + 1}</option>)}
          </select>
        </label>
        <div className="bb-order-arrows">
          <button disabled={index === 0} aria-label={strings.up.replace("{name}", item.label)} onClick={() => move(item.id, items[index - 1].id)}>↑</button>
          <button disabled={index === items.length - 1} aria-label={strings.down.replace("{name}", item.label)} onClick={() => move(item.id, items[index + 1].id)}>↓</button>
        </div>
      </li>)}
    </ol>
    <p className="sr-only" aria-live="polite">{announcement}</p>
  </div>;
}
