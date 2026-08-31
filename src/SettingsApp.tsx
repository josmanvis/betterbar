import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Lightning, Eye, EyeSlash, PencilSimple,
  Plus, Trash, MagnifyingGlass, ArrowCounterClockwise, Warning, CaretUp, CaretDown,
  CaretRight, DownloadSimple, UploadSimple, Copy, Check, FileText,
  SquaresFour, PaintBrush, StackSimple, SlidersHorizontal, Sparkle, ShieldCheck, Info,
} from "@phosphor-icons/react";
import {
   BAR_LENGTH_MAX, BAR_LENGTH_MIN, BAR_SIZE_MAX, BAR_SIZE_MIN,
   AppSet, BarLengthMode, DockItem, DockPosition, IconChrome, IconStyle, ICON_CHROME_PRESETS, TerminalApp, ClockConfig, RunningApp, SectionId, ReleaseInfo,
 } from "./types";
 import { iconChromeStyle } from "./iconChrome";
 import { useConfig, DEFAULT_CONFIG, sanitize } from "./store";
 import { getInstalledTerminals, getRunningApps, checkAccessibilityPermissions, requestAccessibilityPermissions, checkScreenRecordingPermission, requestScreenRecordingPermission, getOpenOnLogin, checkForUpdates, getReleaseHistory, installUpdate } from "./tauri-bridge";
 import { getCurrentWindow } from "@tauri-apps/api/window";
import { getExtensionRegistry } from "./extensions-runtime";

const LENGTH_MODES: { value: BarLengthMode; label: string }[] = [
  { value: "edge",   label: "EDGE" },
  { value: "auto",   label: "AUTO" },
  { value: "custom", label: "CUSTOM" },
];

const ICON_STYLES: { value: IconStyle; label: string; hint: string }[] = [
  { value: "auto",  label: "APP_ICON", hint: "Real macOS app icon, with glyph fallback" },
  { value: "glyph", label: "GLYPH",    hint: "Always the 2-letter shorthand" },
];

const SECTION_LABELS: Record<SectionId, string> = {
  terminal: "TERMINAL",
  pin: "PINNED APPS",
  run: "RUNNING APPS",
  spacer: "SPACER / GAP",
  time: "CLOCKS",
  music: "MUSIC",
  caffeine: "CAFFEINE",
  battery: "BATTERY",
  sets: "SET SWITCHER",
  sims: "SIMULATORS",
  cog: "SETTINGS COG",
  extensions: "EXTENSIONS",
  spaces: "SPACES",
};

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

const NAV = [
  { id: "layout",      label: "Layout",      Icon: SquaresFour },
  { id: "style",       label: "Style",       Icon: PaintBrush },
  { id: "icons",       label: "Icons",       Icon: StackSimple },
  { id: "sets",        label: "Sets & Items", Icon: SlidersHorizontal },
  { id: "sections",    label: "Sections",    Icon: SquaresFour },
  { id: "behaviour",   label: "Behaviour",   Icon: Sparkle },
  { id: "permissions", label: "Permissions", Icon: ShieldCheck },
  { id: "about",       label: "About",       Icon: Info },
] as const;

type TabId = (typeof NAV)[number]["id"];

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
    toggleOpenOnLogin,
    setOpenOnLogin,
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
    toggleMusic,
    toggleSimIcons,
    toggleClocks,
    toggleBattery,
    toggleSetSwitcher,
    toggleSimDropdown,
    toggleTerminalIcon,
    toggleDockArea,
    toggleShowExtensions,
    toggleSpaces,
    toggleCaffeine,
    toggleExtension,
    setSectionOrder,
    setIconChrome,
    resetIconChrome,
    setItemChrome,
    resetItemChrome,
  } = useConfig();

  const [activeTab, setActiveTab] = useState<TabId>("layout");
  const [terminals, setTerminals] = useState<TerminalApp[]>([]);
  const [runningApps, setRunningApps] = useState<RunningApp[]>([]);
  const [runningAppsLoading, setRunningAppsLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const [extensionsList] = useState(() => getExtensionRegistry());

  const [axGranted, setAxGranted] = useState<boolean | null>(null);
  const [srGranted, setSrGranted] = useState<boolean | null>(null);
  const [permsLoading, setPermsLoading] = useState(false);

  const checkPermissions = useCallback(async () => {
    setPermsLoading(true);
    try {
      const [ax, sr] = await Promise.all([
        checkAccessibilityPermissions(),
        checkScreenRecordingPermission(),
      ]);
      setAxGranted(ax);
      setSrGranted(sr);
    } catch {
      setAxGranted(false);
      setSrGranted(false);
    } finally {
      setPermsLoading(false);
    }
  }, []);

  // Check permissions when PERMS tab activates, and on window focus
  useEffect(() => {
    if (activeTab !== "permissions") return;
    checkPermissions();
    let unlisten: (() => void) | null = null;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) checkPermissions();
      })
      .then((fn) => { unlisten = fn; })
      .catch(console.error);
    return () => { unlisten?.(); };
  }, [activeTab, checkPermissions]);

  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    getInstalledTerminals().then(setTerminals).catch(console.error);
    getOpenOnLogin()
      .then((enabled) => {
        if (config.openOnLogin !== enabled) {
          setOpenOnLogin(enabled);
        }
      })
      .catch(console.error);
    checkForUpdates()
      .then((info) => {
        if (info.has_update) setHasUpdate(true);
      })
      .catch(() => {});
  }, []);

  // Fetch running apps on-demand when behaviour tab activates
  useEffect(() => {
    if (activeTab === "behaviour" && runningApps.length === 0 && !runningAppsLoading) {
      setRunningAppsLoading(true);
      getRunningApps()
        .then(setRunningApps)
        .catch(console.error)
        .finally(() => setRunningAppsLoading(false));
    }
  }, [activeTab, runningApps.length, runningAppsLoading]);

  // Keyboard navigation for the sidebar
  const handleTabKeyDown = useCallback((e: React.KeyboardEvent, tabId: TabId) => {
    const idx = NAV.findIndex((t) => t.id === tabId);
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      setActiveTab(NAV[(idx + 1) % NAV.length].id);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      setActiveTab(NAV[(idx - 1 + NAV.length) % NAV.length].id);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveTab(NAV[0].id);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveTab(NAV[NAV.length - 1].id);
    }
  }, []);

  return (
    <div
      style={{
        "--bb-accent": config.accentColor || "#c5f500",
        "--bb-accent-d": config.accentColor || "#c5f500",
      } as any}
      className="h-screen bg-black text-[var(--bb-text)] flex flex-col"
    >
      <Header />

      <div className="flex-1 min-h-0 flex">
        <nav
          role="tablist"
          aria-orientation="vertical"
          aria-label="Settings"
          className="w-[172px] shrink-0 border-r border-[var(--bb-line)] bg-black overflow-y-auto bb-scroll py-2"
        >
          {NAV.map((tab) => {
            const isActive = activeTab === tab.id;
            const showDot = tab.id === "about" && hasUpdate;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
                className={`
                  w-full flex items-center gap-2.5 px-4 py-2 text-[11px] tracking-[0.12em] uppercase
                  transition-colors cursor-pointer border-l-2
                  ${isActive
                    ? "border-[var(--bb-accent)] bg-[var(--bb-pane)] text-[var(--bb-text)] font-bold"
                    : "border-transparent text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:bg-[var(--bb-pane)]/50"}
                `}
              >
                <tab.Icon
                  size={13}
                  weight={isActive ? "fill" : "regular"}
                  className={isActive ? "text-[var(--bb-accent)] shrink-0" : "shrink-0"}
                />
                <span className="flex-1 text-left truncate">{tab.label}</span>
                {showDot && <span className="w-1.5 h-1.5 bg-[var(--bb-accent)] shrink-0" />}
              </button>
            );
          })}
        </nav>

        <main className="flex-1 min-h-0 overflow-y-auto bb-scroll">
          <div className="px-8 py-7 space-y-6 max-w-[600px]">
            <AnimatePresence mode="wait">
            {activeTab === "layout" && (
              <motion.div
                key="layout"
                id="panel-layout"
                role="tabpanel"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.12 }}
              >
                <Section title="POSITION" hint={config.position.toUpperCase()}>
                  <PillSelector
                    options={POSITIONS.map((p) => ({ value: p.value, label: p.label }))}
                    value={config.position}
                    onChange={(v) => setPosition(v as DockPosition)}
                  />
                </Section>

                <Section title="BAR SIZE" hint={`${config.barSize}px`}>
                  <SliderRow
                    value={config.barSize}
                    min={BAR_SIZE_MIN}
                    max={BAR_SIZE_MAX}
                    step={2}
                    onChange={setBarSize}
                  />
                </Section>

                <Section title="CONTENT SCALE" hint={`${config.contentScale.toFixed(2)}x`}>
                  <SliderRow
                    value={config.contentScale}
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    onChange={setContentScale}
                    formatValue={(v) => v.toFixed(2)}
                  />
                </Section>

                <Section
                  title="BAR LENGTH"
                  hint={
                    !config.freeFloat
                      ? "DISABLED"
                      : config.barLengthMode === "custom"
                        ? `${config.barLength}px`
                        : config.barLengthMode.toUpperCase()
                  }
                >
                  <div className={config.freeFloat ? "space-y-3" : "space-y-3 opacity-40 pointer-events-none"}>
                    <PillSelector
                      options={LENGTH_MODES.map((m) => ({ value: m.value, label: m.label }))}
                      value={config.barLengthMode}
                      onChange={(v) => setBarLengthMode(v as BarLengthMode)}
                    />

                    <div className={config.barLengthMode === "custom" ? "" : "opacity-40 pointer-events-none"}>
                      <SliderRow
                        value={config.barLength}
                        min={BAR_LENGTH_MIN}
                        max={BAR_LENGTH_MAX}
                        step={20}
                        onChange={setBarLength}
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
                      &gt; Turn on FREE FLOAT (Behaviour) to use this control
                    </p>
                  )}
                </Section>
              </motion.div>
            )}

            {activeTab === "style" && (
              <motion.div
                key="style"
                id="panel-style"
                role="tabpanel"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.12 }}
              >
                <Section title="THEME">
                  <div className="flex flex-col gap-3">
                    <Toggle
                      label="TRANSPARENT BG"
                      description="Make bar background translucent and enable backdrop blur"
                      enabled={config.transparentBg}
                      onToggle={toggleTransparentBg}
                    />

                    <AccentColorPicker
                      presets={PRESET_ACCENTS}
                      value={config.accentColor}
                      onChange={setAccentColor}
                    />
                  </div>
                </Section>
              </motion.div>
            )}

            {activeTab === "icons" && (
              <motion.div
                key="icons"
                id="panel-icons"
                role="tabpanel"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.12 }}
              >
                <Section
                  title="ICON SOURCE"
                  hint={config.iconStyle === "auto" ? "APP ICON" : "GLYPH"}
                >
                  <div className="space-y-3">
                    <PillSelector
                      options={ICON_STYLES.map((s) => ({ value: s.value, label: s.label, title: s.hint }))}
                      value={config.iconStyle}
                      onChange={(v) => setIconStyle(v as IconStyle)}
                    />

                    <Toggle
                      label="GRAYSCALE IDLE"
                      description="Desaturate icons that aren't hovered or running"
                      enabled={config.grayscaleIdle}
                      onToggle={toggleGrayscaleIdle}
                    />
                    <Toggle
                      label="SHOW RUNNING"
                      description="Append running-but-unpinned apps after the pinned section"
                      enabled={config.showRunningApps}
                      onToggle={toggleShowRunningApps}
                    />
                    <Toggle
                      label="HIDE SELF"
                      description="Hide BetterBar from the running apps list"
                      enabled={config.hideSelf}
                      onToggle={toggleHideSelf}
                    />
                  </div>
                </Section>

                <Section
                  title="ICON BOX"
                  hint={hasChromeValue(config.iconChrome) ? "CUSTOM" : "DEFAULT"}
                >
                  <IconChromeEditor
                    value={config.iconChrome ?? {}}
                    onChange={setIconChrome}
                    onReset={resetIconChrome}
                  />
                </Section>
              </motion.div>
            )}

            {activeTab === "behaviour" && (
              <motion.div
                key="behaviour"
                id="panel-behaviour"
                role="tabpanel"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.12 }}
              >
                <Section title="GENERAL">
                  <div className="flex flex-col">
                    <Toggle
                      label="OPEN ON LOGIN"
                      description="Launch BetterBar automatically when you log into macOS"
                      enabled={config.openOnLogin}
                      onToggle={toggleOpenOnLogin}
                    />
                    <Toggle
                      label="AUTO-HIDE"
                      description="Bar disappears when not in use"
                      enabled={config.autoHide}
                      onToggle={toggleAutoHide}
                    />
                    <Toggle
                      label="SHOW LABELS"
                      description="Render app names beneath icons"
                      enabled={config.showLabels}
                      onToggle={toggleLabels}
                    />
                    <Toggle
                      label="FREE FLOAT"
                      description="Drag the bar anywhere on screen — hover edges for handle"
                      enabled={config.freeFloat}
                      onToggle={toggleFreeFloat}
                    />
                    <Toggle
                      label="PREVENT OVERLAP"
                      description="Prevent maximized windows from overlapping the bar when docked"
                      enabled={config.preventOverlap}
                      onToggle={togglePreventOverlap}
                    />
                    <Toggle
                      label="STRICT OVERLAP"
                      description="Actively resizes/pushes any window that manually overlaps the bar"
                      enabled={config.strictOverlap}
                      onToggle={toggleStrictOverlap}
                    />
                  </div>
                </Section>

                <Section title="TERMINAL">
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

                <Section title="WINDOW GROUPING" hint={`${config.ungroupedBundleIds?.length || 0} UNGROUPED`}>
                  <WindowGroupingList
                    runningApps={runningApps}
                    activeSet={activeSet}
                    ungroupedIds={config.ungroupedBundleIds || []}
                    onToggle={toggleWindowGrouping}
                    loading={runningAppsLoading}
                    onRefresh={() => {
                      setRunningAppsLoading(true);
                      getRunningApps()
                        .then(setRunningApps)
                        .catch(console.error)
                        .finally(() => setRunningAppsLoading(false));
                    }}
                  />
                </Section>
              </motion.div>
            )}

            {activeTab === "sets" && (
              <motion.div
                key="sets"
                id="panel-sets"
                role="tabpanel"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.12 }}
              >
                <Section
                  title="SETS"
                  hint={`${config.sets.length}`}
                >
                  <SetList
                    sets={config.sets}
                    activeSetId={config.activeSetId}
                    onSwitch={switchSet}
                    onAdd={addSet}
                    onRename={renameSet}
                    onDelete={(id) => {
                      const set = config.sets.find((s) => s.id === id);
                      setConfirmDialog({
                        message: `Delete set "${set?.name || id}" and all its items?`,
                        onConfirm: () => deleteSet(id),
                      });
                    }}
                  />
                </Section>

                <Section
                  title="ITEMS"
                  hint={`${activeSet.name} · ${activeSet.items.filter((i) => !i.hidden).length}/${activeSet.items.length}`}
                >
                  <ItemList
                    items={activeSet.items}
                    onRename={renameItem}
                    onSetHidden={setItemHidden}
                    globalChrome={config.iconChrome ?? {}}
                    onSetItemChrome={setItemChrome}
                    onResetItemChrome={resetItemChrome}
                  />
                </Section>

                <Section title="TIMEZONES" hint={`${config.clocks ? config.clocks.length : 0}`}>
                  <ClockList
                    clocks={config.clocks || []}
                    onChange={(nextClocks) => setConfig({ clocks: nextClocks })}
                    onDeleteConfirm={(id) => {
                      const clock = (config.clocks || []).find((c) => c.id === id);
                      setConfirmDialog({
                        message: `Remove timezone "${clock?.code || id}"?`,
                        onConfirm: () => setConfig({ clocks: (config.clocks || []).filter((c) => c.id !== id) }),
                      });
                    }}
                  />
                </Section>
              </motion.div>
            )}

            {activeTab === "sections" && (
              <motion.div
                key="sections"
                id="panel-sections"
                role="tabpanel"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.12 }}
              >
                <Section title="VISIBLE SECTIONS">
                  <div className="flex flex-col">
                    <SubHead>Dock</SubHead>
                    <Toggle
                      label="DOCK AREA"
                      description="Show pinned apps and running apps"
                      enabled={config.showDockArea}
                      onToggle={toggleDockArea}
                    />
                    <Toggle
                      label="TERMINAL ICON"
                      description="Show the blinking cursor terminal launcher"
                      enabled={config.showTerminalIcon}
                      onToggle={toggleTerminalIcon}
                    />

                    <SubHead>Indicators</SubHead>
                    <Toggle
                      label="MUSIC"
                      description="Now-playing info and play/pause/skip for Music or Spotify"
                      enabled={config.showMusic}
                      onToggle={toggleMusic}
                    />
                    <Toggle
                      label="TIME / CLOCKS"
                      description="Show the world clock section"
                      enabled={config.showClocks}
                      onToggle={toggleClocks}
                    />
                    <Toggle
                      label="POWER / BATTERY"
                      description="Show the battery percentage indicator"
                      enabled={config.showBattery}
                      onToggle={toggleBattery}
                    />
                    <Toggle
                      label="CAFFEINE / KEEP AWAKE"
                      description="Coffee-cup indicator that prevents display and system sleep"
                      enabled={config.showCaffeine}
                      onToggle={toggleCaffeine}
                    />
                    <Toggle
                      label="SET SWITCHER"
                      description="Show the set dots for switching app sets"
                      enabled={config.showSetSwitcher}
                      onToggle={toggleSetSwitcher}
                    />

                    <SubHead>Extras</SubHead>
                    <Toggle
                      label="SIMULATOR ICONS"
                      description="Show simulator device quick-launch buttons"
                      enabled={config.showSimIcons}
                      onToggle={toggleSimIcons}
                    />
                    <Toggle
                      label="SIMULATOR MORE MENU"
                      description="Show the '+' button for the full simulator list"
                      enabled={config.showSimDropdown}
                      onToggle={toggleSimDropdown}
                    />
                    <Toggle
                      label="EXTENSIONS"
                      description="Show third-party extensions registered on the bar"
                      enabled={config.showExtensions}
                      onToggle={toggleShowExtensions}
                    />
                    <Toggle
                      label="SPACES"
                      description="Show macOS workspace switcher rectangles"
                      enabled={config.showSpaces}
                      onToggle={toggleSpaces}
                    />
                  </div>
                </Section>

                {extensionsList.length > 0 && (
                  <Section
                    title="EXTENSIONS"
                    hint={`${config.enabledExtensions.length}/${extensionsList.length} ENABLED`}
                  >
                    <div className="flex flex-col">
                      {extensionsList.map((ext) => {
                        const enabled = config.enabledExtensions.includes(ext.name);
                        return (
                          <div
                            key={ext.name}
                            className="flex items-center justify-between py-2 px-1 border-b border-[var(--bb-line)]/60 last:border-b-0"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`text-[12px] tabular-nums tracking-[0.15em] ${enabled ? "text-[var(--bb-accent)]" : "text-[var(--bb-mute)]"}`}>
                                {enabled ? "[X]" : "[ ]"}
                              </span>
                              <span className={`text-[11px] tracking-[0.15em] ${enabled ? "text-[var(--bb-text)]" : "text-[var(--bb-dim)]"}`}>
                                {ext.displayName}
                              </span>
                            </div>
                            <button
                              onClick={() => toggleExtension(ext.name)}
                              className={`px-2.5 py-0.5 text-[9px] tracking-[0.12em] uppercase border transition-colors cursor-pointer font-bold shrink-0 ml-2 ${
                                enabled
                                  ? "border-[var(--bb-accent)] text-[var(--bb-accent)] hover:bg-[var(--bb-accent)]/10"
                                  : "border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:border-[var(--bb-dim)]"
                              }`}
                            >
                              {enabled ? "ENABLED" : "DISABLED"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </Section>
                )}

                <Section title="SECTION ORDER" hint={`${config.sectionOrder.length}`}>
                  <p className="text-[10px] text-[var(--bb-mute)] mb-2 leading-relaxed normal-case">
                    Order of regions along the bar. Use the arrows to move a section toward the start or end.
                  </p>
                  <div className="flex flex-col divide-y divide-[var(--bb-line)] border border-[var(--bb-line)]">
                    {config.sectionOrder.map((id, idx) => (
                      <div key={id} className="flex items-center justify-between px-2 py-1.5">
                        <span className="text-[11px] tracking-wider text-[var(--bb-text)] tabular-nums">
                          <span className="text-[var(--bb-mute)] mr-2">{String(idx + 1).padStart(2, "0")}</span>
                          {SECTION_LABELS[id]}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            disabled={idx === 0}
                            onClick={() => {
                              const next = [...config.sectionOrder];
                              [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                              setSectionOrder(next);
                            }}
                            title="Move toward start"
                            className="p-1 border border-[var(--bb-line)] text-[var(--bb-dim)] enabled:hover:text-[var(--bb-accent)] enabled:hover:border-[var(--bb-accent)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <CaretUp size={11} weight="bold" />
                          </button>
                          <button
                            disabled={idx === config.sectionOrder.length - 1}
                            onClick={() => {
                              const next = [...config.sectionOrder];
                              [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                              setSectionOrder(next);
                            }}
                            title="Move toward end"
                            className="p-1 border border-[var(--bb-line)] text-[var(--bb-dim)] enabled:hover:text-[var(--bb-accent)] enabled:hover:border-[var(--bb-accent)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <CaretDown size={11} weight="bold" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              </motion.div>
            )}

            {activeTab === "permissions" && (
              <motion.div
                key="permissions"
                id="panel-permissions"
                role="tabpanel"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
              >
                <Section title="PERMISSIONS" hint={
                  axGranted === false || srGranted === false
                    ? "SOME DENIED"
                    : axGranted === null || srGranted === null
                      ? "CHECKING..."
                      : "ALL GRANTED"
                }>
                  <PermissionsTab
                    axGranted={axGranted}
                    srGranted={srGranted}
                    loading={permsLoading}
                    onCheck={checkPermissions}
                    onRequestAccessibility={requestAccessibilityPermissions}
                    onRequestScreenRecording={requestScreenRecordingPermission}
                  />
                </Section>
              </motion.div>
            )}

            {activeTab === "about" && (
              <motion.div
                key="about"
                id="panel-about"
                role="tabpanel"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.12 }}
              >
                <Section title="SOFTWARE UPDATE">
                  <UpdatesSection />
                </Section>

                <Section title="BACKUP & SHARE">
                  <BackupSection config={config} onImport={setConfig} />
                </Section>

                <Section title="LEGEND">
                  <LegendContent onReset={() => {
                    setConfirmDialog({
                      message: "Reset all settings to defaults? This cannot be undone.",
                      onConfirm: () => setConfig(DEFAULT_CONFIG),
                    });
                  }} />
                </Section>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      <Footer />

      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          onConfirm={() => {
            confirmDialog.onConfirm();
            setConfirmDialog(null);
          }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}

// ── ConfirmDialog ──────────────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onCancel}
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--bb-pane)] border border-[var(--bb-line)] shadow-lg max-w-xs w-full"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--bb-line)]">
          <Warning size={14} weight="fill" className="text-[var(--bb-bad)]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--bb-text)]">
            Confirm
          </span>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] text-[var(--bb-dim)] leading-relaxed">{message}</p>
        </div>
        <div className="flex border-t border-[var(--bb-line)]">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-[10px] uppercase tracking-[0.18em] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:bg-[var(--bb-pane-2)] border-r border-[var(--bb-line)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--bb-bad)] hover:bg-[var(--bb-bad)]/10 transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PillSelector (extracted common pattern) ────────────────────────────────────

function PillSelector<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex border border-[var(--bb-line)] divide-x divide-[var(--bb-line)] text-[11px] uppercase w-full">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            title={opt.title}
            aria-pressed={active}
            className={`
              flex-1 px-2 py-1.5 tracking-[0.15em] transition-colors cursor-pointer
              ${active
                ? "bg-[var(--bb-accent)] text-black font-bold"
                : "text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:bg-[var(--bb-pane-2)]"}
            `}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── AccentColorPicker ──────────────────────────────────────────────────────────

function AccentColorPicker({
  presets,
  value,
  onChange,
}: {
  presets: { name: string; hex: string }[];
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="pt-3 border-t border-[var(--bb-line)]/60">
      <span className="text-[10px] tracking-[0.15em] uppercase text-[var(--bb-dim)] font-semibold">
        Accent Color
      </span>
      <div className="flex flex-wrap gap-2 mt-2">
        {presets.map((preset) => {
          const active = value.toLowerCase() === preset.hex.toLowerCase();
          return (
            <button
              key={preset.hex}
              onClick={() => onChange(preset.hex)}
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
            value={value || "#c5f500"}
            onChange={(e) => onChange(e.target.value)}
            className="w-4 h-4 bg-transparent border-0 cursor-pointer outline-none"
          />
          <span className="font-mono text-[9px] text-[var(--bb-text)] select-all uppercase">
            {value}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── WindowGroupingList ─────────────────────────────────────────────────────────

function WindowGroupingList({
  runningApps,
  activeSet,
  ungroupedIds,
  onToggle,
  loading,
  onRefresh,
}: {
  runningApps: RunningApp[];
  activeSet: AppSet;
  ungroupedIds: string[];
  onToggle: (bundleId: string) => void;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");

  const allApps = new Map<string, { name: string; bundleId: string }>();

  activeSet.items.forEach((item) => {
    if (item.bundleId) {
      allApps.set(item.bundleId, { name: item.name, bundleId: item.bundleId });
    }
  });

  runningApps.forEach((app) => {
    if (
      app.bundle_id &&
      app.bundle_id !== "com.betterbar.app" &&
      app.bundle_id !== "com.google.antigravity"
    ) {
      allApps.set(app.bundle_id, { name: app.name, bundleId: app.bundle_id });
    }
  });

  const filtered = Array.from(allApps.values())
    .filter((app) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        app.name.toLowerCase().includes(q) ||
        app.bundleId.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] text-[var(--bb-mute)] leading-relaxed normal-case">
        By default, multiple windows of the same app are grouped under a single icon. Turn off grouping for specific apps to display each window as a separate icon.
      </p>

      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-1.5 border border-[var(--bb-line)] px-2 py-1">
          <MagnifyingGlass size={10} className="text-[var(--bb-mute)]" weight="bold" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter apps..."
            className="flex-1 bg-transparent text-[10px] text-[var(--bb-text)] outline-none placeholder:text-[var(--bb-mute)] uppercase tracking-[0.12em]"
          />
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-2 py-1 border border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:border-[var(--bb-dim)] transition-colors cursor-pointer disabled:opacity-40"
          title="Refresh app list"
        >
          <ArrowCounterClockwise size={11} weight="bold" className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto bb-scroll pr-1">
        {filtered.length === 0 ? (
          <p className="text-[10px] text-[var(--bb-mute)] uppercase">
            {search ? "No apps match filter" : "No apps found"}
          </p>
        ) : (
          filtered.map((app) => {
            const isUngrouped = ungroupedIds.includes(app.bundleId);
            return (
              <div
                key={app.bundleId}
                className="flex items-center justify-between py-1.5 border-b border-[var(--bb-line)]/60 last:border-b-0"
              >
                <div className="flex flex-col min-w-0 overflow-hidden">
                  <span className="text-[11px] text-[var(--bb-text)] font-semibold truncate">{app.name}</span>
                  <span className="text-[9px] text-[var(--bb-mute)] font-mono truncate">{app.bundleId}</span>
                </div>
                <button
                  onClick={() => onToggle(app.bundleId)}
                  className={`
                    px-2.5 py-0.5 text-[9px] tracking-[0.12em] uppercase border transition-colors cursor-pointer font-bold shrink-0 ml-2
                    ${isUngrouped
                      ? "border-[var(--bb-accent)] text-[var(--bb-accent)] hover:bg-[var(--bb-accent)]/10"
                      : "border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:border-[var(--bb-dim)]"}
                  `}
                >
                  {isUngrouped ? "UNGROUPED" : "GROUPED"}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="border-b border-[var(--bb-line)] bg-black">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-baseline gap-2 text-[13px] tracking-[0.2em] uppercase">
          <span className="text-[var(--bb-accent)] font-bold">&gt;</span>
          <span className="text-[var(--bb-text)] font-bold">betterbar</span>
          <span className="text-[var(--bb-dim)]">/</span>
          <span className="text-[var(--bb-dim)]">settings</span>
          <span className="bb-caret text-[var(--bb-accent)]">▍</span>
        </div>
        <div className="text-[11px] text-[var(--bb-dim)] tabular-nums">
          v0.10.0
        </div>
      </div>
      <div className="h-px bg-[var(--bb-accent)]/60" />
    </header>
  );
}

// ── FormattedChangelog & Markdown Parser ────────────────────────────────────────

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-[var(--bb-text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="px-1 py-0.5 bg-black/60 border border-[var(--bb-line)] text-[var(--bb-accent)] text-[9px] font-mono mx-0.5">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function FormattedChangelog({ body }: { body: string }) {
  if (!body) {
    return <div className="text-[10px] text-[var(--bb-mute)] italic p-2">No release notes provided.</div>;
  }

  const lines = body.split("\n");

  return (
    <div className="space-y-1.5 text-[10px] leading-relaxed font-mono">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-0.5" />;

        if (trimmed.startsWith("###") || trimmed.startsWith("##")) {
          const headingText = trimmed.replace(/^#+\s*/, "");
          return (
            <div key={idx} className="pt-2 pb-1 border-b border-[var(--bb-line)]/50 flex items-center gap-2">
              <span className="text-[10px] font-bold text-[var(--bb-accent)] uppercase tracking-wider">
                {headingText}
              </span>
            </div>
          );
        }

        if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
          const content = trimmed.substring(1).trim();
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 text-[var(--bb-text)]">
              <span className="text-[var(--bb-accent)] font-bold select-none text-[9px]">▸</span>
              <div className="flex-1 leading-normal">
                {renderInlineMarkdown(content)}
              </div>
            </div>
          );
        }

        return (
          <div key={idx} className="text-[var(--bb-dim)]">
            {renderInlineMarkdown(trimmed)}
          </div>
        );
      })}
    </div>
  );
}

// ── UpdatesSection ─────────────────────────────────────────────────────────────

function UpdatesSection() {
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installStep, setInstallStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const [historyList, setHistoryList] = useState<ReleaseInfo[]>([]);
  const [selectedArchiveIdx, setSelectedArchiveIdx] = useState(0);
  const [viewMode, setViewMode] = useState<"latest" | "archive">("latest");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const check = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [info, history] = await Promise.all([
        checkForUpdates(),
        getReleaseHistory().catch(() => []),
      ]);
      setReleaseInfo(info);
      setHistoryList(history);
      setLastChecked(new Date());
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const install = useCallback(async () => {
    if (!releaseInfo?.download_url) return;
    setInstalling(true);
    setError(null);
    setInstallStep("[1/3] Downloading latest release from GitHub...");
    try {
      setTimeout(() => {
        setInstallStep("[2/3] Extracting universal bundle and verifying permissions...");
      }, 1500);
      setTimeout(() => {
        setInstallStep("[3/3] Replacing /Applications/BetterBar.app and relaunching...");
      }, 3000);
      await installUpdate(releaseInfo.download_url);
    } catch (e: any) {
      setError(e?.message || String(e));
      setInstalling(false);
      setInstallStep(null);
    }
  }, [releaseInfo]);

  useEffect(() => {
    check();
  }, [check]);

  const activeDisplayRelease = viewMode === "archive" && historyList.length > 0
    ? historyList[selectedArchiveIdx] || releaseInfo
    : releaseInfo;

  return (
    <div className="border border-[var(--bb-line)] bg-[var(--bb-pane)] p-4 space-y-4">
      {/* Top Banner Status */}
      <div className="flex items-center justify-between border-b border-[var(--bb-line)] pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold tracking-[0.15em] text-[var(--bb-text)] uppercase">
            BetterBar {releaseInfo?.current_version || "v0.10.0"}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 bg-[var(--bb-line)] text-[var(--bb-dim)] font-mono uppercase">
            Universal (x86_64 + arm64)
          </span>
        </div>

        <div>
          {loading ? (
            <span className="text-[10px] uppercase tracking-wider text-[var(--bb-dim)] flex items-center gap-1.5 font-bold">
              <ArrowCounterClockwise size={11} weight="bold" className="animate-spin text-[var(--bb-accent)]" />
              Checking GitHub...
            </span>
          ) : releaseInfo?.has_update ? (
            <span className="text-[10px] uppercase tracking-wider text-[var(--bb-accent)] font-bold flex items-center gap-1">
              ● UPDATE AVAILABLE: {releaseInfo.version}
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wider text-[var(--bb-accent)] font-bold flex items-center gap-1">
              ● UP TO DATE
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="p-2.5 bg-[var(--bb-bad)]/10 border border-[var(--bb-bad)]/40 text-[10px] text-[var(--bb-bad)] flex items-center gap-2">
          <Warning size={12} weight="bold" />
          <span>{error}</span>
        </div>
      )}

      {/* Update Action Card (when update available) */}
      {releaseInfo?.has_update && (
        <div className="border border-[var(--bb-accent)] bg-[var(--bb-accent)]/5 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-[var(--bb-accent)] text-black">
                NEW VERSION
              </span>
              <span className="text-[12px] font-bold text-[var(--bb-text)] tracking-wider">
                {releaseInfo.version}
              </span>
              <span className="text-[10px] text-[var(--bb-mute)]">
                (currently on {releaseInfo.current_version})
              </span>
            </div>
            {releaseInfo.published_at && (
              <span className="text-[9px] text-[var(--bb-dim)] font-mono">
                {new Date(releaseInfo.published_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>

          {installing && installStep && (
            <div className="p-2.5 bg-black/60 border border-[var(--bb-accent)]/50 text-[10px] text-[var(--bb-accent)] flex items-center gap-2">
              <ArrowCounterClockwise size={12} weight="bold" className="animate-spin text-[var(--bb-accent)]" />
              <span className="font-mono">{installStep}</span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            {releaseInfo.download_url && (
              <button
                onClick={install}
                disabled={installing}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--bb-accent)] text-black text-[10px] font-bold uppercase tracking-[0.18em] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
              >
                {installing ? (
                  <>
                    <ArrowCounterClockwise size={11} weight="bold" className="animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <Lightning size={11} weight="fill" />
                    <span>Update & Restart Now</span>
                  </>
                )}
              </button>
            )}
            <a
              href={releaseInfo.html_url}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] uppercase tracking-[0.15em] text-[var(--bb-dim)] hover:text-[var(--bb-text)] transition-colors underline"
            >
              View on GitHub ↗
            </a>
          </div>
        </div>
      )}

      {/* Integrated Changelog & Release Notes Viewer */}
      <div className="border border-[var(--bb-line-2)] bg-black/50 p-3 space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--bb-line)] pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-[var(--bb-text)] uppercase tracking-wider">
              Changelog & Release Notes
            </span>
            {activeDisplayRelease?.version && (
              <span className="text-[9px] px-1.5 py-0.2 bg-[var(--bb-line)] text-[var(--bb-accent)] font-mono">
                {activeDisplayRelease.version}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode("latest")}
              className={`px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold transition-colors cursor-pointer ${
                viewMode === "latest"
                  ? "bg-[var(--bb-accent)] text-black"
                  : "text-[var(--bb-dim)] hover:text-[var(--bb-text)]"
              }`}
            >
              Latest
            </button>
            {historyList.length > 0 && (
              <button
                onClick={() => setViewMode("archive")}
                className={`px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold transition-colors cursor-pointer ${
                  viewMode === "archive"
                    ? "bg-[var(--bb-accent)] text-black"
                    : "text-[var(--bb-dim)] hover:text-[var(--bb-text)]"
                }`}
              >
                Archive ({historyList.length})
              </button>
            )}
          </div>
        </div>

        {viewMode === "archive" && historyList.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 bb-scroll">
            {historyList.map((rel, idx) => (
              <button
                key={rel.version}
                onClick={() => setSelectedArchiveIdx(idx)}
                className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap border ${
                  selectedArchiveIdx === idx
                    ? "border-[var(--bb-accent)] bg-[var(--bb-accent)]/10 text-[var(--bb-accent)] font-bold"
                    : "border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)]"
                }`}
              >
                {rel.version}
              </button>
            ))}
          </div>
        )}

        {/* Formatted Markdown Content */}
        <div className="max-h-60 overflow-y-auto bb-scroll p-2 bg-black/40 border border-[var(--bb-line-2)]">
          {activeDisplayRelease?.body ? (
            <FormattedChangelog body={activeDisplayRelease.body} />
          ) : (
            <div className="text-[10px] text-[var(--bb-mute)] italic p-2">
              {loading ? "Fetching changelog..." : "No changelog available for this release."}
            </div>
          )}
        </div>
      </div>

      {/* Footer Check For Updates Button */}
      <div className="flex items-center justify-between pt-1 border-t border-[var(--bb-line)]/50">
        <span className="text-[9px] text-[var(--bb-mute)] font-mono">
          {lastChecked ? `Last checked: ${lastChecked.toLocaleTimeString()}` : "Not checked yet"}
        </span>
        <button
          onClick={check}
          disabled={loading || installing}
          className="flex items-center gap-1.5 px-3 py-1 text-[10px] uppercase tracking-[0.15em] border border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:border-[var(--bb-dim)] transition-colors cursor-pointer disabled:opacity-40"
        >
          <ArrowCounterClockwise size={11} weight="bold" className={loading ? "animate-spin" : ""} />
          <span>Check For Updates</span>
        </button>
      </div>
    </div>
  );
}

// ── BackupSection (Export / Import) ────────────────────────────────────────────

function BackupSection({
  config,
  onImport,
}: {
  config: ReturnType<typeof useConfig>["config"];
  onImport: (newConfig: ReturnType<typeof useConfig>["config"]) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportFile = () => {
    try {
      const dataStr = JSON.stringify(config, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `betterbar-config-${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setImportStatus({ type: "success", message: "Configuration exported to JSON file." });
    } catch (err: any) {
      setImportStatus({ type: "error", message: `Export failed: ${err.message}` });
    }
  };

  const handleCopy = () => {
    try {
      const dataStr = JSON.stringify(config, null, 2);
      navigator.clipboard.writeText(dataStr);
      setCopied(true);
      setImportStatus({ type: "success", message: "Configuration copied to clipboard!" });
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      setImportStatus({ type: "error", message: `Copy failed: ${err.message}` });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          throw new Error("Invalid JSON format");
        }
        const clean = sanitize({ ...DEFAULT_CONFIG, ...parsed });
        onImport(clean);
        setImportStatus({
          type: "success",
          message: `Configuration loaded successfully! (${clean.sets.length} sets, ${clean.sets.reduce((acc, s) => acc + s.items.length, 0)} items)`,
        });
      } catch (err: any) {
        setImportStatus({ type: "error", message: `Import error: ${err.message}` });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const handlePasteImport = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setImportStatus({ type: "error", message: "Clipboard is empty." });
        return;
      }
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Clipboard content is not a valid JSON object");
      }
      const clean = sanitize({ ...DEFAULT_CONFIG, ...parsed });
      onImport(clean);
      setImportStatus({
        type: "success",
        message: `Pasted configuration loaded! (${clean.sets.length} sets, ${clean.sets.reduce((acc, s) => acc + s.items.length, 0)} items)`,
      });
    } catch (err: any) {
      setImportStatus({ type: "error", message: `Failed to import from clipboard: ${err.message}` });
    }
  };

  return (
    <div className="border border-[var(--bb-line)] bg-[var(--bb-pane)] p-4 space-y-4">
      <p className="text-[10px] text-[var(--bb-mute)] leading-relaxed normal-case">
        Export your complete BetterBar configuration (app sets, custom icons, layout, timezones, and behavior) to JSON, or import from another Mac.
      </p>

      {importStatus && (
        <div
          className={`p-2.5 text-[10px] flex items-center gap-2 border ${
            importStatus.type === "success"
              ? "bg-[var(--bb-accent)]/10 border-[var(--bb-accent)] text-[var(--bb-text)]"
              : "bg-[var(--bb-bad)]/10 border-[var(--bb-bad)]/40 text-[var(--bb-bad)]"
          }`}
        >
          {importStatus.type === "success" ? (
            <Check size={12} weight="bold" className="text-[var(--bb-accent)]" />
          ) : (
            <Warning size={12} weight="bold" />
          )}
          <span>{importStatus.message}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Export Column */}
        <div className="space-y-2 border border-[var(--bb-line-2)] bg-black/40 p-3 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-[var(--bb-text)] uppercase tracking-wider block mb-1">
              Export Configuration
            </span>
            <p className="text-[9px] text-[var(--bb-mute)] normal-case leading-relaxed">
              Save as file or copy JSON to share with another machine.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={handleExportFile}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 text-[10px] uppercase tracking-[0.15em] bg-[var(--bb-accent)] text-black font-bold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <DownloadSimple size={11} weight="bold" />
              <span>Export File (.json)</span>
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 text-[10px] uppercase tracking-[0.15em] border border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:border-[var(--bb-dim)] transition-colors cursor-pointer"
            >
              {copied ? <Check size={11} weight="bold" className="text-[var(--bb-accent)]" /> : <Copy size={11} weight="bold" />}
              <span>{copied ? "Copied to Clipboard" : "Copy JSON"}</span>
            </button>
          </div>
        </div>

        {/* Import Column */}
        <div className="space-y-2 border border-[var(--bb-line-2)] bg-black/40 p-3 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-[var(--bb-text)] uppercase tracking-wider block mb-1">
              Import Configuration
            </span>
            <p className="text-[9px] text-[var(--bb-mute)] normal-case leading-relaxed">
              Load configuration from a .json file or paste from clipboard.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 text-[10px] uppercase tracking-[0.15em] border border-[var(--bb-accent)] text-[var(--bb-accent)] hover:bg-[var(--bb-accent)]/10 font-bold transition-colors cursor-pointer"
            >
              <UploadSimple size={11} weight="bold" />
              <span>Load File (.json)</span>
            </button>
            <button
              onClick={handlePasteImport}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 text-[10px] uppercase tracking-[0.15em] border border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:border-[var(--bb-dim)] transition-colors cursor-pointer"
            >
              <FileText size={11} weight="bold" />
              <span>Paste from Clipboard</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Legend (Help tab content) ──────────────────────────────────────────────────

function LegendContent({ onReset }: { onReset: () => void }) {
  return (
    <div className="space-y-4">
      <ul className="text-[11px] text-[var(--bb-dim)] space-y-1 leading-relaxed">
        <li><span className="text-[var(--bb-accent)]">[</span> accent stripe <span className="text-[var(--bb-accent)]">]</span> — running app</li>
        <li><span className="text-[var(--bb-mute)]">[ ]</span> — hover (slot frame)</li>
        <li>hover bar edge (10px) — left-drag move, right-drag resize</li>
        <li>two-finger swipe on bar — switch sets</li>
        <li>right-click on icon — Edit Display · Hide</li>
        <li className="pt-1 text-[var(--bb-mute)]">
          <span className="text-[var(--bb-accent)]">TAB</span> / <span className="text-[var(--bb-accent)]">← →</span> — switch between setting tabs
        </li>
      </ul>

      <div className="border-t border-[var(--bb-line)]/60 pt-3">
        <button
          onClick={onReset}
          className="flex items-center justify-center gap-2 w-full py-2 px-3 text-[10px] uppercase tracking-[0.18em] border border-[var(--bb-bad)]/40 text-[var(--bb-bad)] hover:bg-[var(--bb-bad)]/10 hover:border-[var(--bb-bad)] transition-colors cursor-pointer"
        >
          <ArrowCounterClockwise size={11} weight="bold" />
          <span className="font-bold">Reset All Settings to Default</span>
        </button>
      </div>
    </div>
  );
}

// ── Permissions Tab ────────────────────────────────────────────────────────────

function PermissionsTab({
  axGranted, srGranted, loading, onCheck,
  onRequestAccessibility, onRequestScreenRecording,
}: {
  axGranted: boolean | null;
  srGranted: boolean | null;
  loading: boolean;
  onCheck: () => void;
  onRequestAccessibility: () => void;
  onRequestScreenRecording: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[10px] text-[var(--bb-mute)] leading-relaxed normal-case">
        BetterBar requires certain macOS privacy permissions to function fully.
        Grant them from <span className="text-[var(--bb-text)] font-semibold">System Settings &gt; Privacy &amp; Security</span>.
        Permissions are checked when this tab is opened and when the window regains focus.
      </p>

      <PermissionRow
        name="Accessibility"
        description="Required to read the list of running apps, focus app windows, and enforce strict overlap prevention. Without it, the bar cannot detect or interact with other apps."
        granted={axGranted}
        onRequest={onRequestAccessibility}
      />

      <PermissionRow
        name="Screen Recording"
        description="Required to capture window thumbnails for the hover preview and to enumerate on-screen windows for window grouping. Without it, previews show a placeholder."
        granted={srGranted}
        onRequest={onRequestScreenRecording}
      />

      <button
        onClick={onCheck}
        disabled={loading}
        className="flex items-center justify-center gap-2 w-full py-2 px-3 text-[10px] uppercase tracking-[0.18em] border border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:border-[var(--bb-dim)] transition-colors cursor-pointer disabled:opacity-40"
      >
        <ArrowCounterClockwise size={11} weight="bold" className={loading ? "animate-spin" : ""} />
        <span className="font-bold">Re-check Permissions</span>
      </button>
    </div>
  );
}

function PermissionRow({
  name, description, granted, onRequest,
}: {
  name: string;
  description: string;
  granted: boolean | null;
  onRequest: () => void;
}) {
  const statusText =
    granted === null ? "CHECKING..." :
    granted ? "GRANTED" : "DENIED";
  const statusClass =
    granted === null ? "text-[var(--bb-dim)]" :
    granted ? "text-[var(--bb-accent)]" : "text-[var(--bb-bad)]";
  const statusDot =
    granted === null ? "○" :
    granted ? "●" : "●";

  return (
    <div className="border border-[var(--bb-line)] bg-[var(--bb-pane)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--bb-line)]">
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--bb-text)]">
          {name}
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${statusClass}`}>
          {statusDot}
          <span>[ {statusText} ]</span>
        </span>
      </div>
      <div className="px-3 py-3 space-y-3">
        <p className="text-[10px] text-[var(--bb-mute)] leading-relaxed normal-case">
          {description}
        </p>
        {granted === false && (
          <button
            onClick={onRequest}
            className="flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] border border-[var(--bb-warn)]/40 text-[var(--bb-warn)] hover:bg-[var(--bb-warn)]/10 hover:border-[var(--bb-warn)] transition-colors cursor-pointer"
          >
            <Warning size={11} weight="bold" />
            <span className="font-semibold">Open System Settings</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Footer / status line ───────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-[var(--bb-line)] bg-black px-6 py-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--bb-mute)]">
      <Lightning size={10} weight="fill" className="text-[var(--bb-accent)]" />
      Changes save automatically
    </footer>
  );
}

// ── Small caps sub-header (used to group rows inside a Section) ─────────────────

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] tracking-[0.22em] uppercase text-[var(--bb-mute)] pt-4 first:pt-0 pb-1.5">
      {children}
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────────

function Section({
  title,
  hint,
  icon,
  children,
}: {
  number?: string;
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--bb-line)] bg-[var(--bb-pane)]">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--bb-line)]">
        <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--bb-text)] font-bold flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        {hint && (
          <span className="text-[10px] text-[var(--bb-dim)] tabular-nums uppercase tracking-wider">
            {hint}
          </span>
        )}
      </header>
      <div className="px-4 py-4">
        {children}
      </div>
    </section>
  );
}

// ── Slider row ─────────────────────────────────────────────────────────────────

function SliderRow({
  value, min, max, step, onChange, formatValue, unit = "px",
}: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
  lo?: string; hi?: string;
  formatValue?: (v: number) => string;
  unit?: string;
}) {
  const fillPct = ((value - min) / (max - min)) * 100;
  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  return (
    <div className="flex items-center gap-3">
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
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={formatValue ? formatValue(value) : value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(clamp(n));
          }}
          className="w-14 bg-black border border-[var(--bb-line)] text-[var(--bb-text)] text-[10px] tabular-nums text-right px-1.5 py-1 outline-none focus:border-[var(--bb-accent)]"
        />
        {!formatValue && unit && <span className="text-[9px] text-[var(--bb-mute)]">{unit}</span>}
      </div>
    </div>
  );
}

// ── Toggle (switch) ───────────────────────────────────────────────────────────

function Toggle({
  label,
  description,
  enabled,
  onToggle,
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
      role="switch"
      aria-checked={enabled}
      className="w-full flex items-center justify-between gap-3 py-2.5 px-1 min-h-[44px] group text-left border-b border-[var(--bb-line)]/60 last:border-b-0"
    >
      <div className="flex flex-col leading-tight min-w-0">
        <span className={`text-[11px] tracking-[0.15em] uppercase ${enabled ? "text-[var(--bb-text)]" : "text-[var(--bb-dim)] group-hover:text-[var(--bb-text)]"}`}>
          {label}
        </span>
        <span className="text-[10px] text-[var(--bb-mute)] normal-case tracking-normal">
          {description}
        </span>
      </div>
      <span
        aria-hidden
        className={`relative shrink-0 w-9 h-5 border transition-colors duration-100 ${
          enabled
            ? "bg-[var(--bb-accent)] border-[var(--bb-accent)]"
            : "bg-[var(--bb-line-2)] border-[var(--bb-line-2)]"
        }`}
      >
        <span
          className={`absolute top-0.5 w-3.5 h-3.5 transition-all duration-100 ${
            enabled ? "left-[18px] bg-black" : "left-0.5 bg-[var(--bb-text)]"
          }`}
        />
      </span>
    </button>
  );
}

// ── IconChromeEditor ──────────────────────────────────────────────────────────

function hasChromeValue(c?: IconChrome): boolean {
  return !!c && Object.keys(c).length > 0;
}

const CHROME_BG_SWATCHES: { name: string; value: string | undefined }[] = [
  { name: "NONE",   value: undefined },
  { name: "PANE",   value: "#0a0a0a" },
  { name: "TILE",   value: "#111111" },
  { name: "FROST",  value: "rgba(255,255,255,0.06)" },
];

const CHROME_BORDER_SWATCHES: { name: string; value: string | undefined }[] = [
  { name: "NONE",   value: undefined },
  { name: "LINE",   value: "#1f1f1f" },
  { name: "LINE+",  value: "#2b2b2b" },
  { name: "ACCENT", value: "var(--bb-accent)" },
];

function SwatchStrip({
  label, swatches, current, onPick,
}: {
  label: string;
  swatches: { name: string; value: string | undefined }[];
  current: string | undefined;
  onPick: (v: string | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] tracking-[0.18em] uppercase text-[var(--bb-dim)]">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {swatches.map((sw) => {
          const active = (current ?? undefined) === sw.value
            || (sw.value === undefined && current === undefined);
          return (
            <button
              key={sw.name}
              onClick={() => onPick(sw.value)}
              className={`flex items-center gap-1.5 px-2 py-1 text-[9px] tracking-[0.1em] uppercase border transition-colors cursor-pointer ${
                active
                  ? "border-[var(--bb-accent)] text-[var(--bb-text)]"
                  : "border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:border-[var(--bb-dim)]"
              }`}
            >
              <span
                className="w-3 h-3 border border-black shrink-0"
                style={sw.value ? { background: sw.value } : {
                  backgroundImage: "linear-gradient(45deg, #333 25%, transparent 25%, transparent 75%, #333 75%)",
                  backgroundSize: "6px 6px",
                }}
              />
              {sw.name}
            </button>
          );
        })}
        <label className="flex items-center gap-1 px-2 py-1 text-[9px] tracking-[0.1em] uppercase border border-[var(--bb-line)] text-[var(--bb-dim)] cursor-pointer hover:border-[var(--bb-dim)]">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(current || "") ? (current as string) : "#111111"}
            onChange={(e) => onPick(e.target.value)}
            className="w-3 h-3 bg-transparent border-0 p-0 cursor-pointer outline-none"
          />
          CUSTOM
        </label>
      </div>
    </div>
  );
}

function IconChromeEditor({
  value,
  inherited,
  onChange,
  onReset,
  compact,
}: {
  value: IconChrome;
  inherited?: IconChrome;
  onChange: (patch: Partial<IconChrome>) => void;
  onReset: () => void;
  compact?: boolean;
}) {
  const eff: IconChrome = { ...(inherited || {}), ...value };
  const dirty = hasChromeValue(value);

  return (
    <div className={`flex flex-col ${compact ? "gap-3" : "gap-4"}`}>
      {/* Preview */}
      <div className="flex items-center gap-3 border border-[var(--bb-line)] bg-black p-3">
        <div className="w-12 h-12 flex items-center justify-center shrink-0" style={iconChromeStyle(eff)}>
          <span className="text-[var(--bb-accent)] font-bold text-[15px] tracking-tight">BB</span>
        </div>
        <div className="text-[9px] text-[var(--bb-mute)] normal-case leading-relaxed">
          {inherited
            ? dirty ? "This item overrides the global icon box." : "Following the global icon box."
            : "Applies to every dock icon. Individual items can override this."}
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-1.5">
        {ICON_CHROME_PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => onChange({
              background: p.chrome.background,
              borderColor: p.chrome.borderColor,
              borderWidth: p.chrome.borderWidth,
              radius: p.chrome.radius,
              padding: p.chrome.padding,
            })}
            className="px-2 py-1 text-[9px] tracking-[0.12em] uppercase border border-[var(--bb-line)] text-[var(--bb-dim)] hover:text-[var(--bb-text)] hover:border-[var(--bb-accent)] transition-colors cursor-pointer"
          >
            {p.name}
          </button>
        ))}
      </div>

      <SwatchStrip
        label="Background"
        swatches={CHROME_BG_SWATCHES}
        current={value.background}
        onPick={(v) => onChange({ background: v })}
      />
      <SwatchStrip
        label="Border color"
        swatches={CHROME_BORDER_SWATCHES}
        current={value.borderColor}
        onPick={(v) => onChange({ borderColor: v })}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] tracking-[0.18em] uppercase text-[var(--bb-dim)]">Border width</span>
        <SliderRow value={eff.borderWidth ?? 0} min={0} max={4} step={1}
          onChange={(v) => onChange({ borderWidth: v === 0 ? undefined : v })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] tracking-[0.18em] uppercase text-[var(--bb-dim)]">Corner radius</span>
        <SliderRow value={eff.radius ?? 0} min={0} max={24} step={1}
          onChange={(v) => onChange({ radius: v === 0 ? undefined : v })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] tracking-[0.18em] uppercase text-[var(--bb-dim)]">Inner padding</span>
        <SliderRow value={eff.padding ?? 0} min={0} max={16} step={1}
          onChange={(v) => onChange({ padding: v === 0 ? undefined : v })} />
      </div>

      <button
        onClick={onReset}
        disabled={!dirty}
        className="self-start flex items-center gap-1.5 px-2.5 py-1 text-[9px] uppercase tracking-[0.15em] border border-[var(--bb-line)] text-[var(--bb-dim)] enabled:hover:text-[var(--bb-text)] enabled:hover:border-[var(--bb-dim)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ArrowCounterClockwise size={10} weight="bold" />
        {inherited ? "Use global default" : "Clear"}
      </button>
    </div>
  );
}

// ── Item list (active set): rename + hide/show + per-item icon box ─────────────

function ItemList({
  items,
  onRename,
  onSetHidden,
  globalChrome,
  onSetItemChrome,
  onResetItemChrome,
}: {
  items: DockItem[];
  onRename: (id: string, name: string) => void;
  onSetHidden: (id: string, hidden: boolean) => void;
  globalChrome: IconChrome;
  onSetItemChrome: (id: string, patch: Partial<IconChrome>) => void;
  onResetItemChrome: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
        const isExpanded = expandedId === item.id;
        const customized = hasChromeValue(item.chrome);
        return (
          <div
            key={item.id}
            className={`border-b border-[var(--bb-line)]/60 last:border-b-0 ${isHidden ? "opacity-50" : ""}`}
          >
            <div className="flex items-center gap-2 py-2 px-1">
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
                <span className="flex-1 text-[11px] text-[var(--bb-text)] truncate flex items-center gap-1.5">
                  {item.name}
                  {customized && <span className="w-1 h-1 bg-[var(--bb-accent)] shrink-0" title="Custom icon box" />}
                </span>
              )}

              {!isEditing && (
                <button
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  title="Icon box"
                  className={`w-6 h-6 flex items-center justify-center cursor-pointer ${
                    isExpanded || customized ? "text-[var(--bb-accent)]" : "text-[var(--bb-dim)] hover:text-[var(--bb-accent)]"
                  }`}
                >
                  {isExpanded ? <CaretDown size={11} weight="bold" /> : <CaretRight size={11} weight="bold" />}
                </button>
              )}

              {!isEditing && (
                <button
                  onClick={() => {
                    setEditingId(item.id);
                    setEditingName(item.name);
                    setTimeout(() => inputRef.current?.select(), 30);
                  }}
                  title="Rename"
                  className="w-6 h-6 flex items-center justify-center text-[var(--bb-dim)] hover:text-[var(--bb-accent)] cursor-pointer"
                >
                  <PencilSimple size={11} weight="bold" />
                </button>
              )}

              <button
                onClick={() => onSetHidden(item.id, !isHidden)}
                title={isHidden ? "Show in bar" : "Hide from bar"}
                className={`w-6 h-6 flex items-center justify-center cursor-pointer ${
                  isHidden
                    ? "text-[var(--bb-mute)] hover:text-[var(--bb-accent)]"
                    : "text-[var(--bb-dim)] hover:text-[var(--bb-warn)]"
                }`}
              >
                {isHidden ? <Eye size={11} weight="bold" /> : <EyeSlash size={11} weight="bold" />}
              </button>
            </div>

            {isExpanded && (
              <div className="px-2 pb-3 pt-1">
                <IconChromeEditor
                  compact
                  value={item.chrome ?? {}}
                  inherited={globalChrome}
                  onChange={(patch) => onSetItemChrome(item.id, patch)}
                  onReset={() => onResetItemChrome(item.id)}
                />
              </div>
            )}
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
                flex items-center gap-2 py-2 px-1
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
                className="w-6 h-6 flex items-center justify-center text-[var(--bb-dim)] hover:text-[var(--bb-accent)] cursor-pointer"
              >
                <PencilSimple size={11} weight="bold" />
              </button>
            )}

            {sets.length > 1 && !isEditing && (
              <button
                onClick={() => onDelete(set.id)}
                title="Delete set"
                className="w-6 h-6 flex items-center justify-center text-[var(--bb-dim)] hover:text-[var(--bb-bad)] cursor-pointer"
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
  onDeleteConfirm,
}: {
  clocks: ClockConfig[];
  onChange: (clocks: ClockConfig[]) => void;
  onDeleteConfirm: (id: string) => void;
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
            className="flex items-center gap-2 py-2 px-1 border-b border-[var(--bb-line)]/60 last:border-b-0"
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
                  onClick={() => onDeleteConfirm(clock.id)}
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
