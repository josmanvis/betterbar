import { useEffect, useRef, useState } from "react";
import {
  GearSix, Lightning, Eye, EyeSlash, ArrowsOut, ArrowsOutCardinal, PencilSimple,
  Plus, Trash,
} from "@phosphor-icons/react";
import {
  BAR_LENGTH_MAX, BAR_LENGTH_MIN, BAR_SIZE_MAX, BAR_SIZE_MIN,
  AppSet, BarLengthMode, DockItem, DockPosition, IconStyle,
} from "./types";
import { useConfig } from "./store";

const LENGTH_MODES: { value: BarLengthMode; label: string }[] = [
  { value: "edge",   label: "EDGE" },
  { value: "auto",   label: "AUTO" },
  { value: "custom", label: "CUSTOM" },
];

const ICON_STYLES: { value: IconStyle; label: string; hint: string }[] = [
  { value: "auto",  label: "APP_ICON", hint: "Real macOS app icon, with glyph fallback" },
  { value: "glyph", label: "GLYPH",    hint: "Always the 2-letter shorthand" },
];

const POSITIONS: { value: DockPosition; label: string }[] = [
  { value: "bottom", label: "BOTTOM" },
  { value: "top",    label: "TOP" },
  { value: "left",   label: "LEFT" },
  { value: "right",  label: "RIGHT" },
];

export default function SettingsApp() {
  const {
    config,
    activeSet,
    setPosition,
    setBarSize,
    setBarLength,
    setBarLengthMode,
    setIconStyle,
    toggleGrayscaleIdle,
    toggleShowRunningApps,
    toggleAutoHide,
    toggleLabels,
    toggleFreeFloat,
    setItemHidden,
    renameItem,
    switchSet,
    addSet,
    renameSet,
    deleteSet,
  } = useConfig();

  const [bootCount, setBootCount] = useState(0);
  useEffect(() => {
    // staggered reveal — one shot, not a loop
    const t = setInterval(() => setBootCount((n) => (n >= 8 ? n : n + 1)), 35);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-black text-[var(--bb-text)] flex flex-col">
      {/* ── Header strip ─────────────────────────────────────────────────── */}
      <Header />

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bb-scroll">
        <div className="px-6 py-5 space-y-5 max-w-[640px]">
          <Reveal show={bootCount >= 1}>
            <Section number="01" title="POSITION" hint={config.position.toUpperCase()}>
              <div className="flex items-center gap-px text-[11px] uppercase">
                <span className="text-[var(--bb-mute)] pr-2">&lt;</span>
                {POSITIONS.map((p, i) => {
                  const active = config.position === p.value;
                  return (
                    <span key={p.value} className="flex items-center">
                      {i > 0 && <span className="text-[var(--bb-line-2)] px-2">|</span>}
                      <button
                        onClick={() => setPosition(p.value)}
                        className={`
                          px-2 py-0.5 tracking-[0.15em] transition-colors
                          ${active
                            ? "bg-[var(--bb-accent)] text-black font-bold"
                            : "text-[var(--bb-dim)] hover:text-[var(--bb-text)]"}
                        `}
                      >
                        {p.label}
                      </button>
                    </span>
                  );
                })}
                <span className="text-[var(--bb-mute)] pl-2">&gt;</span>
              </div>
            </Section>
          </Reveal>

          <Reveal show={bootCount >= 2}>
            <Section
              number="02"
              title="BAR_SIZE"
              hint={`${config.barSize}px`}
              icon={<ArrowsOut size={11} weight="bold" />}
            >
              <SliderRow
                value={config.barSize}
                min={BAR_SIZE_MIN}
                max={BAR_SIZE_MAX}
                step={2}
                onChange={setBarSize}
                lo="THIN"
                hi="THICK"
              />
            </Section>
          </Reveal>

          <Reveal show={bootCount >= 3}>
            <Section
              number="03"
              title="ICONS"
              hint={config.iconStyle === "auto" ? "APP_ICON" : "GLYPH"}
            >
              <div className="space-y-3">
                {/* Style picker */}
                <div className="flex items-center gap-px text-[11px] uppercase">
                  <span className="text-[var(--bb-mute)] pr-2">&lt;</span>
                  {ICON_STYLES.map((s, i) => {
                    const active = config.iconStyle === s.value;
                    return (
                      <span key={s.value} className="flex items-center">
                        {i > 0 && <span className="text-[var(--bb-line-2)] px-2">|</span>}
                        <button
                          onClick={() => setIconStyle(s.value)}
                          title={s.hint}
                          className={`
                            px-2 py-0.5 tracking-[0.15em] transition-colors
                            ${active
                              ? "bg-[var(--bb-accent)] text-black font-bold"
                              : "text-[var(--bb-dim)] hover:text-[var(--bb-text)]"}
                          `}
                        >
                          {s.label}
                        </button>
                      </span>
                    );
                  })}
                  <span className="text-[var(--bb-mute)] pl-2">&gt;</span>
                </div>

                <Toggle
                  label="GRAYSCALE_IDLE"
                  description="Desaturate icons that aren't hovered or running"
                  enabled={config.grayscaleIdle}
                  onToggle={toggleGrayscaleIdle}
                />
                <Toggle
                  label="SHOW_RUNNING"
                  description="Append running-but-unpinned apps after the pinned section"
                  enabled={config.showRunningApps}
                  onToggle={toggleShowRunningApps}
                />
              </div>
            </Section>
          </Reveal>

          <Reveal show={bootCount >= 4}>
            <Section number="04" title="BEHAVIOUR">
              <div className="flex flex-col">
                <Toggle
                  label="AUTO-HIDE"
                  description="Bar disappears when not in use"
                  enabled={config.autoHide}
                  onToggle={toggleAutoHide}
                  glyph={<EyeSlash size={11} weight="bold" />}
                  glyphOff={<Eye size={11} weight="bold" />}
                />
                <Toggle
                  label="SHOW_LABELS"
                  description="Render app names beneath icons"
                  enabled={config.showLabels}
                  onToggle={toggleLabels}
                />
                <Toggle
                  label="FREE_FLOAT"
                  description="Drag the bar anywhere on screen — hover edges for handle"
                  enabled={config.freeFloat}
                  onToggle={toggleFreeFloat}
                  glyph={<ArrowsOutCardinal size={11} weight="bold" />}
                />
              </div>
            </Section>
          </Reveal>

          <Reveal show={bootCount >= 5}>
            <Section
              number="05"
              title="BAR_LENGTH"
              hint={
                !config.freeFloat
                  ? "DISABLED"
                  : config.barLengthMode === "custom"
                    ? `${config.barLength}px`
                    : config.barLengthMode.toUpperCase()
              }
              icon={<ArrowsOutCardinal size={11} weight="bold" />}
            >
              <div className={config.freeFloat ? "space-y-3" : "space-y-3 opacity-40 pointer-events-none"}>
                {/* Mode picker — mirrors POSITION segmented control */}
                <div className="flex items-center gap-px text-[11px] uppercase">
                  <span className="text-[var(--bb-mute)] pr-2">&lt;</span>
                  {LENGTH_MODES.map((m, i) => {
                    const active = config.barLengthMode === m.value;
                    return (
                      <span key={m.value} className="flex items-center">
                        {i > 0 && <span className="text-[var(--bb-line-2)] px-2">|</span>}
                        <button
                          onClick={() => setBarLengthMode(m.value)}
                          className={`
                            px-2 py-0.5 tracking-[0.15em] transition-colors
                            ${active
                              ? "bg-[var(--bb-accent)] text-black font-bold"
                              : "text-[var(--bb-dim)] hover:text-[var(--bb-text)]"}
                          `}
                        >
                          {m.label}
                        </button>
                      </span>
                    );
                  })}
                  <span className="text-[var(--bb-mute)] pl-2">&gt;</span>
                </div>

                {/* Slider — only meaningful in custom mode */}
                <div className={config.barLengthMode === "custom" ? "" : "opacity-40 pointer-events-none"}>
                  <SliderRow
                    value={config.barLength}
                    min={BAR_LENGTH_MIN}
                    max={BAR_LENGTH_MAX}
                    step={20}
                    onChange={setBarLength}
                    lo="SHORT"
                    hi="LONG"
                  />
                </div>

                <p className="text-[10px] text-[var(--bb-mute)] normal-case leading-relaxed">
                  {config.barLengthMode === "edge"
                    && "Bar spans the full screen edge — same length as a docked bar, but free to move."}
                  {config.barLengthMode === "auto"
                    && "Bar shrinks to wrap its icons and indicators."}
                  {config.barLengthMode === "custom"
                    && "Drag the slider to set an exact length in pixels."}
                </p>
              </div>
              {!config.freeFloat && (
                <p className="mt-2 text-[10px] text-[var(--bb-mute)] uppercase tracking-[0.15em]">
                  &gt; Enable FREE_FLOAT to use this control
                </p>
              )}
            </Section>
          </Reveal>

          <Reveal show={bootCount >= 6}>
            <Section
              number="06"
              title="SETS"
              hint={`${config.sets.length}`}
            >
              <SetList
                sets={config.sets}
                activeSetId={config.activeSetId}
                onSwitch={switchSet}
                onAdd={addSet}
                onRename={renameSet}
                onDelete={deleteSet}
              />
            </Section>
          </Reveal>

          <Reveal show={bootCount >= 7}>
            <Section
              number="07"
              title="ITEMS"
              hint={`${activeSet.name} · ${activeSet.items.filter((i) => !i.hidden).length}/${activeSet.items.length}`}
            >
              <ItemList
                items={activeSet.items}
                onRename={renameItem}
                onSetHidden={setItemHidden}
              />
            </Section>
          </Reveal>

          <Reveal show={bootCount >= 8}>
            <Section number="08" title="LEGEND">
              <ul className="text-[11px] text-[var(--bb-dim)] space-y-1 leading-relaxed">
                <li><span className="text-[var(--bb-accent)]">[</span> chartreuse stripe <span className="text-[var(--bb-accent)]">]</span> — running app</li>
                <li><span className="text-[var(--bb-mute)]">[ ]</span> — hover (slot frame)</li>
                <li>hover bar edge (10px) — left-drag move, right-drag resize</li>
                <li>two-finger swipe on bar — switch sets</li>
                <li>right-click on icon — Edit Display · Hide</li>
              </ul>
            </Section>
          </Reveal>
        </div>
      </main>

      {/* ── Status line ──────────────────────────────────────────────────── */}
      <Footer config={config} />
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="border-b border-[var(--bb-line)] bg-black">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-baseline gap-2 text-[11px] tracking-[0.2em] uppercase">
          <span className="text-[var(--bb-accent)] font-bold">&gt;</span>
          <span className="text-[var(--bb-text)] font-bold">betterbar</span>
          <span className="text-[var(--bb-mute)]">/</span>
          <span className="text-[var(--bb-dim)]">settings</span>
          <span className="bb-caret text-[var(--bb-accent)]">▍</span>
        </div>
        <div className="text-[10px] text-[var(--bb-mute)] tabular-nums">
          v0.6.0
        </div>
      </div>
      {/* Stripe accent under the header */}
      <div className="h-[2px] flex">
        <div className="flex-1 bg-[var(--bb-accent)]" />
        <div className="w-12 bg-[var(--bb-line)]" />
        <div className="w-2 bg-[var(--bb-accent)]" />
        <div className="w-1 bg-[var(--bb-line)]" />
        <div className="w-3 bg-[var(--bb-accent)]" />
      </div>
    </header>
  );
}

// ── Footer / status line ───────────────────────────────────────────────────────

function Footer({ config }: { config: ReturnType<typeof useConfig>["config"] }) {
  const lenBit = config.barLengthMode === "custom" ? `${config.barLength}px` : config.barLengthMode;
  const floatBit = config.freeFloat ? ` float=on len=${lenBit}` : "";
  const stats = `pos=${config.position} bar=${config.barSize}px sets=${config.sets.length}${floatBit}`;
  return (
    <footer className="border-t border-[var(--bb-line)] bg-black px-4 py-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.18em]">
      <span className="text-[var(--bb-mute)] flex items-center gap-1.5">
        <Lightning size={10} weight="fill" className="text-[var(--bb-accent)]" />
        Live — changes save instantly
      </span>
      <span className="text-[var(--bb-dim)] tabular-nums normal-case tracking-normal">
        {stats}
      </span>
    </footer>
  );
}

// ── Section ────────────────────────────────────────────────────────────────────

function Section({
  number,
  title,
  hint,
  icon,
  children,
}: {
  number: string;
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--bb-line)] bg-[var(--bb-pane)]">
      <header className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--bb-line)] bg-[var(--bb-pane-2)]">
        <div className="flex items-baseline gap-2 text-[10px] uppercase tracking-[0.2em]">
          <span className="text-[var(--bb-mute)]">[{number}]</span>
          <span className="text-[var(--bb-text)] font-bold flex items-center gap-1.5">
            {icon}
            {title}
          </span>
        </div>
        {hint && (
          <span className="text-[10px] text-[var(--bb-accent)] tabular-nums uppercase tracking-wider">
            ::&nbsp;{hint}
          </span>
        )}
      </header>
      <div className="px-3 py-3">
        {children}
      </div>
    </section>
  );
}

// ── Slider row ─────────────────────────────────────────────────────────────────

function SliderRow({
  value, min, max, step, onChange, lo, hi,
}: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
  lo: string; hi: string;
}) {
  const fillPct = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[var(--bb-mute)] text-[10px]">[</span>
        <input
          type="range"
          className="bb-range flex-1"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ["--fill" as string]: `${fillPct}%` }}
        />
        <span className="text-[var(--bb-mute)] text-[10px]">]</span>
        <span className="text-[10px] tabular-nums text-[var(--bb-text)] w-12 text-right">
          {value.toString().padStart(3, "0")}<span className="text-[var(--bb-mute)]">px</span>
        </span>
      </div>
      <div className="flex justify-between text-[8px] tracking-[0.2em] text-[var(--bb-mute)]">
        <span>{lo}&nbsp;{min}</span>
        <span>{max}&nbsp;{hi}</span>
      </div>
    </div>
  );
}

// ── Toggle ─────────────────────────────────────────────────────────────────────

function Toggle({
  label,
  description,
  enabled,
  onToggle,
  glyph,
  glyphOff,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  glyph?: React.ReactNode;
  glyphOff?: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 py-2 px-1 group border-b border-[var(--bb-line)]/60 last:border-b-0"
    >
      <div className="flex items-center gap-2 text-left">
        <span className={`text-[12px] tabular-nums tracking-[0.15em] ${enabled ? "text-[var(--bb-accent)]" : "text-[var(--bb-mute)]"}`}>
          {enabled ? "[X]" : "[ ]"}
        </span>
        <div className="flex flex-col leading-tight">
          <span className={`text-[11px] tracking-[0.15em] uppercase ${enabled ? "text-[var(--bb-text)]" : "text-[var(--bb-dim)] group-hover:text-[var(--bb-text)]"}`}>
            {label}
          </span>
          <span className="text-[10px] text-[var(--bb-mute)] normal-case tracking-normal">
            {description}
          </span>
        </div>
      </div>
      <span className={`${enabled ? "text-[var(--bb-accent)]" : "text-[var(--bb-mute)]"} flex items-center`}>
        {enabled ? (glyph ?? <GearSix size={12} weight="bold" />) : (glyphOff ?? null)}
      </span>
    </button>
  );
}

// ── Item list (active set): rename + hide/show toggle per item ────────────────

function ItemList({
  items,
  onRename,
  onSetHidden,
}: {
  items: DockItem[];
  onRename: (id: string, name: string) => void;
  onSetHidden: (id: string, hidden: boolean) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    if (editingId) onRename(editingId, editingName);
    setEditingId(null);
  }

  const sorted = [...items].sort((a, b) => a.order - b.order);

  if (sorted.length === 0) {
    return (
      <p className="text-[10px] text-[var(--bb-mute)] uppercase tracking-[0.15em]">
        &gt; No items in this set
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {sorted.map((item, i) => {
        const num = String(i + 1).padStart(2, "0");
        const isHidden = !!item.hidden;
        const isEditing = editingId === item.id;
        return (
          <div
            key={item.id}
            className={`
              flex items-center gap-2 py-1.5 px-1
              border-b border-[var(--bb-line)]/60 last:border-b-0
              ${isHidden ? "opacity-50" : ""}
            `}
          >
            <span className="text-[9px] tabular-nums text-[var(--bb-mute)] w-6">{num}</span>

            {isEditing ? (
              <input
                ref={inputRef}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="flex-1 bg-black text-[var(--bb-text)] text-[11px] px-1 py-0.5 outline-none border border-[var(--bb-accent)] min-w-0"
                autoFocus
              />
            ) : (
              <span className="flex-1 text-[11px] text-[var(--bb-text)] truncate">
                {item.name}
              </span>
            )}

            {!isEditing && (
              <button
                onClick={() => {
                  setEditingId(item.id);
                  setEditingName(item.name);
                  setTimeout(() => inputRef.current?.select(), 30);
                }}
                title="Rename"
                className="w-6 h-6 flex items-center justify-center text-[var(--bb-dim)] hover:text-[var(--bb-accent)]"
              >
                <PencilSimple size={11} weight="bold" />
              </button>
            )}

            <button
              onClick={() => onSetHidden(item.id, !isHidden)}
              title={isHidden ? "Show in bar" : "Hide from bar"}
              className={`w-6 h-6 flex items-center justify-center ${
                isHidden
                  ? "text-[var(--bb-mute)] hover:text-[var(--bb-accent)]"
                  : "text-[var(--bb-dim)] hover:text-[var(--bb-warn)]"
              }`}
            >
              {isHidden ? <Eye size={11} weight="bold" /> : <EyeSlash size={11} weight="bold" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Set list: switch active set, rename inline, delete, add new ────────────────

function SetList({
  sets,
  activeSetId,
  onSwitch,
  onAdd,
  onRename,
  onDelete,
}: {
  sets: AppSet[];
  activeSetId: string;
  onSwitch: (id: string) => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const trimmed = editingName.trim();
    if (editingId && trimmed) onRename(editingId, trimmed);
    setEditingId(null);
  }

  return (
    <div className="flex flex-col">
      {sets.map((set, i) => {
        const num = String(i + 1).padStart(2, "0");
        const isActive = set.id === activeSetId;
        const isEditing = editingId === set.id;
        const itemCount = set.items.length;
        return (
          <div
            key={set.id}
            className={`
              flex items-center gap-2 py-1.5 px-1
              border-b border-[var(--bb-line)]/60 last:border-b-0
              ${isActive ? "bg-[var(--bb-accent)]/[0.06]" : ""}
            `}
          >
            <span className={`text-[9px] tabular-nums w-6 ${isActive ? "text-[var(--bb-accent)]" : "text-[var(--bb-mute)]"}`}>
              {num}
            </span>

            <span className={`text-[10px] w-3 ${isActive ? "text-[var(--bb-accent)]" : "text-[var(--bb-mute)]"}`}>
              {isActive ? "■" : "·"}
            </span>

            {isEditing ? (
              <input
                ref={inputRef}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="flex-1 bg-black text-[var(--bb-text)] text-[11px] px-1 py-0.5 outline-none border border-[var(--bb-accent)] min-w-0"
                autoFocus
              />
            ) : (
              <button
                onClick={() => onSwitch(set.id)}
                className={`flex-1 text-left text-[11px] truncate ${
                  isActive ? "text-[var(--bb-text)]" : "text-[var(--bb-dim)] hover:text-[var(--bb-text)]"
                }`}
                title={isActive ? "Active set" : "Switch to this set"}
              >
                {set.name}
              </button>
            )}

            <span className="text-[9px] tabular-nums text-[var(--bb-mute)] w-10 text-right">
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>

            {!isEditing && (
              <button
                onClick={() => {
                  setEditingId(set.id);
                  setEditingName(set.name);
                  setTimeout(() => inputRef.current?.select(), 30);
                }}
                title="Rename"
                className="w-6 h-6 flex items-center justify-center text-[var(--bb-dim)] hover:text-[var(--bb-accent)]"
              >
                <PencilSimple size={11} weight="bold" />
              </button>
            )}

            {sets.length > 1 && !isEditing && (
              <button
                onClick={() => onDelete(set.id)}
                title="Delete set"
                className="w-6 h-6 flex items-center justify-center text-[var(--bb-dim)] hover:text-[var(--bb-bad)]"
              >
                <Trash size={11} weight="bold" />
              </button>
            )}
          </div>
        );
      })}

      <button
        onClick={() => onAdd(`Set ${sets.length + 1}`)}
        className="mt-2 flex items-center justify-center gap-2 py-1.5 px-2 text-[10px] uppercase tracking-[0.18em] text-[var(--bb-dim)] hover:text-[var(--bb-accent)] border border-[var(--bb-line)] hover:border-[var(--bb-accent)] transition-colors"
      >
        <Plus size={11} weight="bold" />
        <span>New set</span>
      </button>
    </div>
  );
}

// ── Reveal — staggered fade-in on boot ─────────────────────────────────────────

function Reveal({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "translateY(0)" : "translateY(4px)",
        transition: "opacity 200ms ease, transform 200ms ease",
      }}
    >
      {children}
    </div>
  );
}
