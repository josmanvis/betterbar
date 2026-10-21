import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { searchSettings, settingsSearchEntries, type SettingsSearchEntry } from "../settings-search";

const strings = { label: "Search settings", placeholder: "Search settings…", clear: "Clear settings search", empty: "No settings found. Try another word.",
  count: "{count} settings found", hint: "↑↓ to browse · Enter to open · Esc to close" };

export function SettingsSearch({ extensions, onSelect }: {
  extensions: { name: string; displayName: string }[]; onSelect: (entry: SettingsSearchEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchSettings(query, settingsSearchEntries(extensions)), [query, extensions]);
  const visible = open && !!query.trim();
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") { event.preventDefault(); input.current?.focus(); input.current?.select(); setOpen(true); }
    };
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("keydown", keys); window.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", keys); window.removeEventListener("pointerdown", outside); };
  }, []);
  useEffect(() => { if (visible) document.getElementById(`settings-search-result-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active, visible]);
  function choose(entry: SettingsSearchEntry) { setQuery(""); setOpen(false); onSelect(entry); }
  return <div className="bb-settings-search" ref={root}>
    <MagnifyingGlass size={16} aria-hidden="true" />
    <input ref={input} type="search" role="combobox" aria-label={strings.label} placeholder={strings.placeholder}
      aria-autocomplete="list" aria-expanded={visible} aria-controls="settings-search-results"
      aria-activedescendant={visible && results[active] ? `settings-search-result-${active}` : undefined}
      value={query} onFocus={() => setOpen(true)} onBlur={event => { if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}
      onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); setQuery(""); setOpen(false); }
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(value => Math.max(0, Math.min(results.length - 1, value + (event.key === "ArrowDown" ? 1 : -1)))); }
        else if (event.key === "Enter" && visible && results[active]) { event.preventDefault(); choose(results[active]); }
      }} />
    {query ? <button type="button" aria-label={strings.clear} onClick={() => { setQuery(""); setOpen(false); input.current?.focus(); }}><X size={14} /></button> : <kbd>⌘F</kbd>}
    {visible && <div className="bb-search-popover">
      <p className="sr-only" role="status">{strings.count.replace("{count}", String(results.length))}</p>
      <div id="settings-search-results" role="listbox" aria-label={strings.label}>
        {results.length ? results.map((entry, index) => <div key={entry.id} id={`settings-search-result-${index}`} role="option" aria-selected={index === active}
          className={index === active ? "is-active" : ""} onMouseMove={event => { if (event.movementX || event.movementY) setActive(index); }} onMouseDown={event => event.preventDefault()} onClick={() => choose(entry)}>
          <span>{entry.label}</span><small>{entry.tab === "sections" ? "Bar items" : entry.tab === "sets" ? "Apps & Sets" : entry.tab}</small>
        </div>) : <p className="bb-search-empty">{strings.empty}</p>}
      </div><p className="bb-search-hint">{strings.hint}</p>
    </div>}
  </div>;
}
