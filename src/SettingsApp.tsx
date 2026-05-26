import { useEffect, useRef, useState } from "react";
import {
  GearSix, Lightning, Eye, EyeSlash, ArrowsOut, ArrowsOutCardinal, PencilSimple,
  Plus, Trash,
} from "@phosphor-icons/react";
import {
  BAR_LENGTH_MAX, BAR_LENGTH_MIN, BAR_SIZE_MAX, BAR_SIZE_MIN,
  AppSet, BarLengthMode, DockItem, DockPosition, IconStyle, TerminalApp, ClockConfig
} from "./types";
import { useConfig } from "./store";
import { getInstalledTerminals } from "./tauri-bridge";
import { useRunningApps } from "./hooks/useRunningApps";

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

const PRESET_ACCENTS = [
  { name: "CHARTREUSE", hex: "#c5f500" },
  { name: "CYAN",       hex: "#00f0ff" },
  { name: "GREEN",      hex: "#39ff14" },
  { name: "AMBER",      hex: "#ffb800" },
  { name: "MAGENTA",    hex: "#ff007a" },
  { name: "BLUE",       hex: "#00a3ff" },
  { name: "WHITE",      hex: "#ffffff" },
];

const TABS = [
  { id: "layout",    label: "LAYOUT" },
  { id: "style",     label: "STYLE" },
  { id: "behaviour", label: "BEHAVIOUR" },
  { id: "content",   label: "CONTENT" },
  { id: "help",      label: "HELP" },
] as const;

type TabId = (typeof TABS)[number]["id"];

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
    toggleHideSelf,
    toggleAutoHide,
    toggleLabels,
    toggleFreeFloat,
    setItemHidden,
    renameItem,
    switchSet,
    addSet,
    renameSet,
    deleteSet,
    setContentScale,
    setDefaultTerminal,
    setConfig,
    toggleTransparentBg,
    setAccentColor,
    togglePreventOverlap,
    toggleStrictOverlap,
    toggleWindowGrouping,
  } = useConfig();

  const [activeTab, setActiveTab] = useState<TabId>("layout");
  const [terminals, setTerminals] = useState<TerminalApp[]>([]);
  const runningApps = useRunningApps();

  useEffect(() => {
    getInstalledTerminals().then(setTerminals).catch(console.error);
  }, []);

  return (
    <div
      style={{
        "--bb-accent": config.accentColor || "#c5f500",
        "--bb-accent-d": config.accentColor || "#c5f500",
      } as any}
      className="min-h-screen bg-black text-[var(--bb-text)] flex flex-col"
    >
      {/* ── Header strip ─────────────────────────────────────────────────── */}
      <Header />

      {/* ── Tab Switcher ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-px border-b border-[var(--bb-line)] bg-black px-6 py-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-3 py-1 text-[11px] font-bold tracking-[0.18em] uppercase transition-colors cursor-pointer
                ${isActive
                  ? "bg-[var(--bb-accent)] text-black font-extrabold"
                  : "text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:bg-[var(--bb-pane)]"}
              `}
            >
              {isActive ? `[ ${tab.label} ]` : tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bb-scroll">
        <div className="px-6 py-5 space-y-5 max-w-[640px]">
          {activeTab === "layout" && (
            <>
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

              <Section
                number="03"
                title="CONTENT_SCALE"
                hint={`${config.contentScale.toFixed(2)}x`}
                icon={<ArrowsOut size={11} weight="bold" />}
              >
                <SliderRow
                  value={config.contentScale}
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  onChange={setContentScale}
                  lo="SMALL"
                  hi="LARGE"
                  formatValue={(v) => v.toFixed(2)}
                />
              </Section>

              <Section
                number="04"
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
                    &gt; Enable FREE_FLOAT (under BEHAVIOUR tab) to use this control
                  </p>
                )}
              </Section>
            </>
          )}

          {activeTab === "style" && (
            <>
              <Section
                number="05"
                title="ICONS"
                hint={config.iconStyle === "auto" ? "APP_ICON" : "GLYPH"}
              >
                <div className="space-y-3">
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
                  <Toggle
                    label="HIDE_SELF"
                    description="Hide BetterBar from the running apps list"
                    enabled={config.hideSelf}
                    onToggle={toggleHideSelf}
                    glyph={<EyeSlash size={11} weight="bold" />}
                    glyphOff={<Eye size={11} weight="bold" />}
                  />
                </div>
              </Section>

              <Section number="06" title="THEME">
                <div className="flex flex-col gap-3">
                  <Toggle
                    label="TRANSPARENT_BG"
                    description="Make bar background translucent and enable backdrop blur"
                    enabled={config.transparentBg}
                    onToggle={toggleTransparentBg}
                  />
                  
                  <div className="pt-3 border-t border-[var(--bb-line)]/60">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-[var(--bb-dim)] font-semibold">
                      Accent Color
                    </span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {PRESET_ACCENTS.map((preset) => {
                        const active = config.accentColor.toLowerCase() === preset.hex.toLowerCase();
                        return (
                          <button
                            key={preset.hex}
                            onClick={() => setAccentColor(preset.hex)}
                            className={`
                              px-2 py-1 text-[10px] tracking-[0.1em] uppercase border transition-colors flex items-center gap-1.5 cursor-pointer
                              ${active 
                                ? "bg-[var(--bb-accent)] border-[var(--bb-accent)] text-black font-bold" 
                                : "border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:border-[var(--bb-dim)]"}
                            `}
                          >
                            <div className="w-2.5 h-2.5 border border-black" style={{ backgroundColor: preset.hex }} />
                            <span>{preset.name}</span>
                          </button>
                        );
                      })}
                      
                      <div className="flex items-center gap-1.5 border border-[var(--bb-line)] px-2 py-1 text-[10px] text-[var(--bb-dim)]">
                        <span>CUSTOM:</span>
                        <input
                          type="color"
                          value={config.accentColor || "#c5f500"}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="w-4 h-4 bg-transparent border-0 cursor-pointer outline-none"
                        />
                        <span className="font-mono text-[9px] text-[var(--bb-text)] select-all uppercase">
                          {config.accentColor}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Section>
            </>
          )}

          {activeTab === "behaviour" && (
            <>
              <Section number="07" title="BEHAVIOUR">
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
                  <Toggle
                    label="PREVENT_OVERLAP"
                    description="Prevent maximized windows from overlapping the bar when docked"
                    enabled={config.preventOverlap}
                    onToggle={togglePreventOverlap}
                  />
                  <Toggle
                    label="STRICT_OVERLAP"
                    description="Actively resizes/pushes any window that manually overlaps the bar"
                    enabled={config.strictOverlap}
                    onToggle={toggleStrictOverlap}
                  />
                </div>
              </Section>

              <Section number="08" title="TERMINAL">
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] text-[var(--bb-mute)] leading-relaxed normal-case">
                    Set a default terminal. If set, pressing Enter will execute the command immediately. You can still use the Arrow keys to open the selection carousel.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setDefaultTerminal(undefined)}
                      className={`
                        px-2 py-1 text-[10px] tracking-[0.1em] uppercase border transition-colors cursor-pointer
                        ${!config.defaultTerminal 
                          ? "bg-[var(--bb-accent)] border-[var(--bb-accent)] text-black font-bold" 
                          : "border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:border-[var(--bb-dim)]"}
                      `}
                    >
                      Ask Always
                    </button>
                    {terminals.map((term) => {
                      const active = config.defaultTerminal === term.bundle_id;
                      return (
                        <button
                          key={term.bundle_id}
                          onClick={() => setDefaultTerminal(term.bundle_id)}
                          className={`
                            px-2 py-1 text-[10px] flex items-center gap-1.5 border transition-colors cursor-pointer
                            ${active 
                              ? "bg-[var(--bb-accent)] border-[var(--bb-accent)] text-black font-bold" 
                              : "border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:border-[var(--bb-dim)]"}
                          `}
                        >
                          {term.icon && (
                            <img src={term.icon} alt={term.name} className="w-3 h-3 object-contain" />
                          )}
                          <span>{term.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Section>

              <Section number="09" title="WINDOW_GROUPING" hint={`${config.ungroupedBundleIds?.length || 0} UNGROUPED`}>
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] text-[var(--bb-mute)] leading-relaxed normal-case">
                    By default, multiple windows of the same app are grouped under a single icon. Turn off grouping for specific apps to display each window as a separate icon.
                  </p>
                  
                  <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto bb-scroll pr-1">
                    {(() => {
                      const allApps = new Map<string, { name: string; bundleId: string }>();

                      // Pinned apps
                      activeSet.items.forEach((item) => {
                        if (item.bundleId) {
                          allApps.set(item.bundleId, { name: item.name, bundleId: item.bundleId });
                        }
                      });

                      // Running apps
                      runningApps.forEach((app) => {
                        if (
                          app.bundle_id &&
                          app.bundle_id !== "com.betterbar.app" &&
                          app.bundle_id !== "com.google.antigravity"
                        ) {
                          allApps.set(app.bundle_id, { name: app.name, bundleId: app.bundle_id });
                        }
                      });

                      const appsList = Array.from(allApps.values()).sort((a, b) => a.name.localeCompare(b.name));

                      if (appsList.length === 0) {
                        return <p className="text-[10px] text-[var(--bb-mute)] uppercase">No apps found</p>;
                      }

                      return appsList.map((app) => {
                        const isUngrouped = config.ungroupedBundleIds?.includes(app.bundleId);
                        return (
                          <div
                            key={app.bundleId}
                            className="flex items-center justify-between py-1.5 border-b border-[var(--bb-line)]/60 last:border-b-0"
                          >
                            <div className="flex flex-col">
                              <span className="text-[11px] text-[var(--bb-text)] font-semibold">{app.name}</span>
                              <span className="text-[9px] text-[var(--bb-mute)] font-mono">{app.bundleId}</span>
                            </div>
                            <button
                              onClick={() => toggleWindowGrouping(app.bundleId)}
                              className={`
                                px-2.5 py-0.5 text-[9px] tracking-[0.12em] uppercase border transition-colors cursor-pointer font-bold
                                ${isUngrouped
                                  ? "border-[var(--bb-accent)] text-[var(--bb-accent)] hover:bg-[var(--bb-accent)]/10"
                                  : "border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:border-[var(--bb-dim)]"}
                              `}
                            >
                              {isUngrouped ? "UNGROUPED" : "GROUPED"}
                            </button>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </Section>
            </>
          )}

          {activeTab === "content" && (
            <>
              <Section
                number="10"
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

              <Section
                number="11"
                title="ITEMS"
                hint={`${activeSet.name} · ${activeSet.items.filter((i) => !i.hidden).length}/${activeSet.items.length}`}
              >
                <ItemList
                  items={activeSet.items}
                  onRename={renameItem}
                  onSetHidden={setItemHidden}
                />
              </Section>

              <Section number="12" title="TIMEZONES" hint={`${config.clocks ? config.clocks.length : 0}`}>
                <ClockList
                  clocks={config.clocks || []}
                  onChange={(nextClocks) => setConfig({ clocks: nextClocks })}
                />
              </Section>
            </>
          )}

          {activeTab === "help" && (
            <Section number="13" title="LEGEND">
              <ul className="text-[11px] text-[var(--bb-dim)] space-y-1 leading-relaxed">
                <li><span className="text-[var(--bb-accent)]">[</span> accent stripe <span className="text-[var(--bb-accent)]">]</span> — running app</li>
                <li><span className="text-[var(--bb-mute)]">[ ]</span> — hover (slot frame)</li>
                <li>hover bar edge (10px) — left-drag move, right-drag resize</li>
                <li>two-finger swipe on bar — switch sets</li>
                <li>right-click on icon — Edit Display · Hide</li>
              </ul>
            </Section>
          )}
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
  value, min, max, step, onChange, lo, hi, formatValue
}: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
  lo: string; hi: string;
  formatValue?: (v: number) => string;
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
          {formatValue ? formatValue(value) : value.toString().padStart(3, "0")}<span className="text-[var(--bb-mute)]">{!formatValue && "px"}</span>
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
        className="mt-2 flex items-center justify-center gap-2 py-1.5 px-2 text-[10px] uppercase tracking-[0.18em] text-[var(--bb-dim)] hover:text-[var(--bb-accent)] border border-[var(--bb-line)] hover:border-[var(--bb-accent)] transition-colors cursor-pointer"
      >
        <Plus size={11} weight="bold" />
        <span>New set</span>
      </button>
    </div>
  );
}

// ── Clock list: add, remove, and customize timezones and labels ─────────────

function ClockList({
  clocks,
  onChange,
}: {
  clocks: ClockConfig[];
  onChange: (clocks: ClockConfig[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState("");
  const [editingTz, setEditingTz] = useState("");

  function save(id: string) {
    const code = editingCode.trim().toUpperCase() || "UTC";
    const tz = editingTz.trim() || "UTC";
    const nextClocks = clocks.map((c) => (c.id === id ? { ...c, code, tz } : c));
    onChange(nextClocks);
    setEditingId(null);
  }

  function deleteClock(id: string) {
    onChange(clocks.filter((c) => c.id !== id));
  }

  function addClock() {
    const id = `clock_${Date.now()}`;
    const newClock: ClockConfig = {
      id,
      code: "UTC",
      tz: "UTC",
    };
    onChange([...clocks, newClock]);
    setEditingId(id);
    setEditingCode("UTC");
    setEditingTz("UTC");
  }

  return (
    <div className="flex flex-col gap-2">
      {clocks.map((clock, i) => {
        const isEditing = editingId === clock.id;
        const num = String(i + 1).padStart(2, "0");
        return (
          <div
            key={clock.id}
            className="flex items-center gap-2 py-1.5 px-1 border-b border-[var(--bb-line)]/60 last:border-b-0"
          >
            <span className="text-[9px] tabular-nums text-[var(--bb-mute)] w-6">{num}</span>
            {isEditing ? (
              <div className="flex-1 flex gap-2">
                <input
                  value={editingCode}
                  onChange={(e) => setEditingCode(e.target.value)}
                  placeholder="Label"
                  className="w-16 bg-black text-[var(--bb-text)] text-[11px] px-1 py-0.5 outline-none border border-[var(--bb-accent)]"
                  maxLength={5}
                />
                <input
                  value={editingTz}
                  onChange={(e) => setEditingTz(e.target.value)}
                  placeholder="Timezone"
                  className="flex-1 bg-black text-[var(--bb-text)] text-[11px] px-1 py-0.5 outline-none border border-[var(--bb-accent)] min-w-0"
                />
                <button
                  onClick={() => save(clock.id)}
                  className="px-2 py-0.5 bg-[var(--bb-accent)] text-black text-[10px] font-bold uppercase cursor-pointer"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="px-2 py-0.5 border border-[var(--bb-line)] text-[var(--bb-dim)] text-[10px] uppercase cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <span className="w-12 text-[10px] font-bold text-[var(--bb-accent)] uppercase tracking-wider">
                  {clock.code}
                </span>
                <span className="flex-1 text-[11px] text-[var(--bb-dim)] truncate">
                  {clock.tz}
                </span>
                <button
                  onClick={() => {
                    setEditingId(clock.id);
                    setEditingCode(clock.code);
                    setEditingTz(clock.tz);
                  }}
                  title="Edit timezone"
                  className="w-6 h-6 flex items-center justify-center text-[var(--bb-dim)] hover:text-[var(--bb-accent)] cursor-pointer"
                >
                  <PencilSimple size={11} weight="bold" />
                </button>
                <button
                  onClick={() => deleteClock(clock.id)}
                  title="Delete timezone"
                  className="w-6 h-6 flex items-center justify-center text-[var(--bb-dim)] hover:text-[var(--bb-bad)] cursor-pointer"
                >
                  <Trash size={11} weight="bold" />
                </button>
              </>
            )}
          </div>
        );
      })}
      <button
        onClick={addClock}
        className="mt-2 flex items-center justify-center gap-2 py-1.5 px-2 text-[10px] uppercase tracking-[0.18em] text-[var(--bb-dim)] hover:text-[var(--bb-accent)] border border-[var(--bb-line)] hover:border-[var(--bb-accent)] transition-colors cursor-pointer"
      >
        <Plus size={11} weight="bold" />
        <span>Add Timezone</span>
      </button>
    </div>
  );
}
