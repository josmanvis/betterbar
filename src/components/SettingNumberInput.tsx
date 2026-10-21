import { useRef, useState } from "react";

// Keep partial numbers editable; clamp only when the edit is committed.
export function SettingNumberInput({ value, min, max, step, formatValue, onChange, label }: {
  value: number; min: number; max: number; step: number; formatValue?: (value: number) => string;
  onChange: (value: number) => void; label?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const formatted = formatValue ? formatValue(value) : String(value);
  return <input type="number" min={min} max={max} step={step} aria-label={label} value={draft ?? formatted}
    onFocus={() => { cancelled.current = false; setDraft(formatted); }}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      if (!cancelled.current && draft !== null && draft.trim() !== "") {
        const number = Number(draft);
        if (Number.isFinite(number)) onChange(Math.max(min, Math.min(max, number)));
      }
      cancelled.current = false; setDraft(null);
    }}
    onKeyDown={event => {
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      else if (event.key === "Escape") { event.preventDefault(); cancelled.current = true; setDraft(null); event.currentTarget.blur(); }
    }}
    className="w-14 bg-[var(--bb-bg)] border border-[var(--bb-line)] text-[var(--bb-text)] text-[10px] tabular-nums text-right px-1.5 py-1 outline-none focus:border-[var(--bb-accent)]" />;
}
