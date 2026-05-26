import { useState, useCallback, useEffect } from "react";
import {
  AppSet, BAR_LENGTH_MAX, BAR_LENGTH_MIN, BAR_SIZE_MAX, BAR_SIZE_MIN,
  BarLengthMode, BetterBarConfig, DEFAULT_CONFIG as TYPES_DEFAULT_CONFIG, DockItem, DockPosition,
  IconStyle,
} from "./types";

export const DEFAULT_CONFIG = TYPES_DEFAULT_CONFIG;

const STORAGE_KEY = "betterbar_config";

function sanitize(cfg: BetterBarConfig): BetterBarConfig {
  const barSize = Number.isFinite(cfg.barSize) ? cfg.barSize : DEFAULT_CONFIG.barSize;
  const barLength = Number.isFinite(cfg.barLength) ? cfg.barLength : DEFAULT_CONFIG.barLength;
  const fp = cfg.floatPosition;
  const floatPosition =
    fp && Number.isFinite(fp.x) && Number.isFinite(fp.y) ? { x: fp.x, y: fp.y } : null;
  const validModes: BarLengthMode[] = ["edge", "auto", "custom"];
  const barLengthMode: BarLengthMode = validModes.includes(cfg.barLengthMode as BarLengthMode)
    ? (cfg.barLengthMode as BarLengthMode)
    : DEFAULT_CONFIG.barLengthMode;
  const validIconStyles: IconStyle[] = ["auto", "glyph"];
  const iconStyle: IconStyle = validIconStyles.includes(cfg.iconStyle as IconStyle)
    ? (cfg.iconStyle as IconStyle)
    : DEFAULT_CONFIG.iconStyle;
  return {
    ...cfg,
    barSize: Math.max(BAR_SIZE_MIN, Math.min(BAR_SIZE_MAX, barSize)),
    iconSize: Number.isFinite(cfg.iconSize) ? cfg.iconSize : DEFAULT_CONFIG.iconSize,
    barLength: Math.max(BAR_LENGTH_MIN, Math.min(BAR_LENGTH_MAX, barLength)),
    freeFloat: !!cfg.freeFloat,
    floatPosition,
    barLengthMode,
    iconStyle,
    grayscaleIdle: cfg.grayscaleIdle === undefined ? DEFAULT_CONFIG.grayscaleIdle : !!cfg.grayscaleIdle,
    showRunningApps: !!cfg.showRunningApps,
    hideSelf: cfg.hideSelf === undefined ? DEFAULT_CONFIG.hideSelf : !!cfg.hideSelf,
    contentScale: Number.isFinite(cfg.contentScale) ? cfg.contentScale : DEFAULT_CONFIG.contentScale,
    defaultTerminal: cfg.defaultTerminal,
    clocks: Array.isArray(cfg.clocks) ? cfg.clocks : DEFAULT_CONFIG.clocks,
    transparentBg: cfg.transparentBg === undefined ? DEFAULT_CONFIG.transparentBg : !!cfg.transparentBg,
    accentColor: typeof cfg.accentColor === "string" ? cfg.accentColor : DEFAULT_CONFIG.accentColor,
    preventOverlap: cfg.preventOverlap === undefined ? DEFAULT_CONFIG.preventOverlap : !!cfg.preventOverlap,
    strictOverlap: cfg.strictOverlap === undefined ? DEFAULT_CONFIG.strictOverlap : !!cfg.strictOverlap,
    ungroupedBundleIds: Array.isArray(cfg.ungroupedBundleIds) ? cfg.ungroupedBundleIds : [],
    showMusic: cfg.showMusic === undefined ? DEFAULT_CONFIG.showMusic : !!cfg.showMusic,
    showSimIcons: cfg.showSimIcons === undefined ? DEFAULT_CONFIG.showSimIcons : !!cfg.showSimIcons,
    showClocks: cfg.showClocks === undefined ? DEFAULT_CONFIG.showClocks : !!cfg.showClocks,
    showBattery: cfg.showBattery === undefined ? DEFAULT_CONFIG.showBattery : !!cfg.showBattery,
    showSetSwitcher: cfg.showSetSwitcher === undefined ? DEFAULT_CONFIG.showSetSwitcher : !!cfg.showSetSwitcher,
    showSimDropdown: cfg.showSimDropdown === undefined ? DEFAULT_CONFIG.showSimDropdown : !!cfg.showSimDropdown,
    showTerminalIcon: cfg.showTerminalIcon === undefined ? DEFAULT_CONFIG.showTerminalIcon : !!cfg.showTerminalIcon,
    showDockArea: cfg.showDockArea === undefined ? DEFAULT_CONFIG.showDockArea : !!cfg.showDockArea,
  };
}

function loadConfig(): BetterBarConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // Migrate old config that used top-level `items` instead of `sets`
      if (!saved.sets && saved.items) {
        saved.sets = [{ id: "default", name: "Default", items: saved.items }];
        saved.activeSetId = "default";
        delete saved.items;
      }
      return sanitize({ ...DEFAULT_CONFIG, ...saved });
    }
  } catch {}
  return DEFAULT_CONFIG;
}

function saveConfig(config: BetterBarConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function useConfig() {
  const [config, setConfigState] = useState<BetterBarConfig>(loadConfig);

  // Sync state across BetterBar windows: when another window writes to
  // localStorage, mirror the change locally without re-saving (avoid loops).
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const next = JSON.parse(e.newValue);
        setConfigState(sanitize({ ...DEFAULT_CONFIG, ...next }));
      } catch {}
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setConfig = useCallback(
    (update: Partial<BetterBarConfig> | ((prev: BetterBarConfig) => BetterBarConfig)) => {
      setConfigState((prev) => {
        const next = typeof update === "function" ? update(prev) : { ...prev, ...update };
        saveConfig(next);
        return next;
      });
    },
    []
  );

  // Active set helpers
  const activeSet = config.sets.find((s) => s.id === config.activeSetId) ?? config.sets[0];

  const updateActiveSet = useCallback(
    (update: Partial<AppSet> | ((s: AppSet) => AppSet)) => {
      setConfig((prev) => ({
        ...prev,
        sets: prev.sets.map((s) => {
          if (s.id !== prev.activeSetId) return s;
          return typeof update === "function" ? update(s) : { ...s, ...update };
        }),
      }));
    },
    [setConfig]
  );

  // Item operations (within active set)
  const addItem = useCallback(
    (item: DockItem) => {
      updateActiveSet((s) => ({
        ...s,
        items: [...s.items, { ...item, order: s.items.length }],
      }));
    },
    [updateActiveSet]
  );

  const removeItem = useCallback(
    (id: string) => {
      updateActiveSet((s) => ({
        ...s,
        items: s.items.filter((i) => i.id !== id).map((i, idx) => ({ ...i, order: idx })),
      }));
    },
    [updateActiveSet]
  );

  const reorderItems = useCallback(
    (items: DockItem[]) => {
      updateActiveSet((s) => ({ ...s, items }));
    },
    [updateActiveSet]
  );

  const renameItem = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      updateActiveSet((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === id ? { ...i, name: trimmed } : i)),
      }));
    },
    [updateActiveSet]
  );

  const setItemHidden = useCallback(
    (id: string, hidden: boolean) => {
      updateActiveSet((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === id ? { ...i, hidden } : i)),
      }));
    },
    [updateActiveSet]
  );

  const setItemIcon = useCallback(
    (id: string, icon: string | undefined) => {
      updateActiveSet((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === id ? { ...i, icon, deviceIcon: undefined, forceGlyph: undefined } : i)),
      }));
    },
    [updateActiveSet]
  );

  const setItemDeviceIcon = useCallback(
    (id: string, deviceIcon: string | undefined) => {
      updateActiveSet((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === id ? { ...i, deviceIcon, icon: undefined, forceGlyph: undefined } : i)),
      }));
    },
    [updateActiveSet]
  );

  const setItemForceGlyph = useCallback(
    (id: string, forceGlyph: boolean | undefined) => {
      updateActiveSet((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === id ? { ...i, forceGlyph, deviceIcon: undefined, icon: undefined } : i)),
      }));
    },
    [updateActiveSet]
  );

  const setItemShowLabel = useCallback(
    (id: string, showLabel: boolean | undefined) => {
      updateActiveSet((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === id ? { ...i, showLabel } : i)),
      }));
    },
    [updateActiveSet]
  );

  const setItemDisplayType = useCallback(
    (id: string, displayType: DockItem["displayType"]) => {
      updateActiveSet((s) => ({
        ...s,
        items: s.items.map((i) => {
          if (i.id !== id) return i;
          return {
            ...i,
            displayType,
            hidden: false,
            // Keep showLabel in sync for backward compat
            showLabel: displayType === "icon_label" || displayType === "label" ? true : undefined,
          };
        }),
      }));
    },
    [updateActiveSet]
  );

  // Set operations
  const switchSet = useCallback(
    (id: string) => {
      setConfig((prev) => ({ ...prev, activeSetId: id }));
    },
    [setConfig]
  );

  const addSet = useCallback(
    (name: string) => {
      const id = `set_${Date.now()}`;
      setConfig((prev) => ({
        ...prev,
        sets: [...prev.sets, { id, name, items: [] }],
        activeSetId: id,
      }));
    },
    [setConfig]
  );

  const renameSet = useCallback(
    (id: string, name: string) => {
      setConfig((prev) => ({
        ...prev,
        sets: prev.sets.map((s) => (s.id === id ? { ...s, name } : s)),
      }));
    },
    [setConfig]
  );

  const deleteSet = useCallback(
    (id: string) => {
      setConfig((prev) => {
        if (prev.sets.length <= 1) return prev; // keep at least one
        const sets = prev.sets.filter((s) => s.id !== id);
        const activeSetId =
          prev.activeSetId === id ? sets[0].id : prev.activeSetId;
        return { ...prev, sets, activeSetId };
      });
    },
    [setConfig]
  );

  // Global config
  const setPosition = useCallback((position: DockPosition) => setConfig({ position }), [setConfig]);
  const setIconSize = useCallback((iconSize: number) => setConfig({ iconSize }), [setConfig]);
  const setBarSize = useCallback((barSize: number) => setConfig({ barSize }), [setConfig]);
  const setBarLength = useCallback((barLength: number) => setConfig({ barLength }), [setConfig]);
  const setBarLengthMode = useCallback(
    (barLengthMode: BarLengthMode) => setConfig({ barLengthMode }),
    [setConfig]
  );
  const setIconStyle = useCallback(
    (iconStyle: IconStyle) => setConfig({ iconStyle }),
    [setConfig]
  );
  const toggleGrayscaleIdle = useCallback(
    () => setConfig((p) => ({ ...p, grayscaleIdle: !p.grayscaleIdle })),
    [setConfig]
  );
  const toggleShowRunningApps = useCallback(
    () => setConfig((p) => ({ ...p, showRunningApps: !p.showRunningApps })),
    [setConfig]
  );
  const toggleHideSelf = useCallback(
    () => setConfig((p) => ({ ...p, hideSelf: !p.hideSelf })),
    [setConfig]
  );
  const toggleAutoHide = useCallback(() => setConfig((p) => ({ ...p, autoHide: !p.autoHide })), [setConfig]);
  const toggleLabels = useCallback(() => setConfig((p) => ({ ...p, showLabels: !p.showLabels })), [setConfig]);
  const toggleFreeFloat = useCallback(
    () => setConfig((p) => ({ ...p, freeFloat: !p.freeFloat })),
    [setConfig]
  );
  const setFreeFloat = useCallback(
    (freeFloat: boolean) => setConfig({ freeFloat }),
    [setConfig]
  );
  const setFloatPosition = useCallback(
    (floatPosition: { x: number; y: number } | null) => setConfig({ floatPosition }),
    [setConfig]
  );
  const setContentScale = useCallback(
    (contentScale: number) => setConfig({ contentScale }),
    [setConfig]
  );
  const setDefaultTerminal = useCallback(
    (defaultTerminal: string | undefined) => setConfig({ defaultTerminal }),
    [setConfig]
  );
  const toggleTransparentBg = useCallback(
    () => setConfig((p) => ({ ...p, transparentBg: !p.transparentBg })),
    [setConfig]
  );
  const setAccentColor = useCallback(
    (accentColor: string) => setConfig({ accentColor }),
    [setConfig]
  );
  const togglePreventOverlap = useCallback(
    () => setConfig((p) => ({ ...p, preventOverlap: !p.preventOverlap })),
    [setConfig]
  );
  const toggleStrictOverlap = useCallback(
    () => setConfig((p) => ({ ...p, strictOverlap: !p.strictOverlap })),
    [setConfig]
  );
  const toggleWindowGrouping = useCallback(
    (bundleId: string) => {
      if (!bundleId) return;
      setConfig((prev) => {
        const ungrouped = prev.ungroupedBundleIds || [];
        const nextUngrouped = ungrouped.includes(bundleId)
          ? ungrouped.filter((id) => id !== bundleId)
          : [...ungrouped, bundleId];
        return { ...prev, ungroupedBundleIds: nextUngrouped };
      });
    },
    [setConfig]
  );

  const toggleMusic = useCallback(
    () => setConfig((p) => ({ ...p, showMusic: !p.showMusic })),
    [setConfig]
  );
  const toggleSimIcons = useCallback(
    () => setConfig((p) => ({ ...p, showSimIcons: !p.showSimIcons })),
    [setConfig]
  );
  const toggleClocks = useCallback(
    () => setConfig((p) => ({ ...p, showClocks: !p.showClocks })),
    [setConfig]
  );
  const toggleBattery = useCallback(
    () => setConfig((p) => ({ ...p, showBattery: !p.showBattery })),
    [setConfig]
  );
  const toggleSetSwitcher = useCallback(
    () => setConfig((p) => ({ ...p, showSetSwitcher: !p.showSetSwitcher })),
    [setConfig]
  );
  const toggleSimDropdown = useCallback(
    () => setConfig((p) => ({ ...p, showSimDropdown: !p.showSimDropdown })),
    [setConfig]
  );
  const toggleTerminalIcon = useCallback(
    () => setConfig((p) => ({ ...p, showTerminalIcon: !p.showTerminalIcon })),
    [setConfig]
  );
  const toggleDockArea = useCallback(
    () => setConfig((p) => ({ ...p, showDockArea: !p.showDockArea })),
    [setConfig]
  );

  return {
    config,
    activeSet,
    setConfig,
    addItem,
    removeItem,
    reorderItems,
    renameItem,
    setItemHidden,
    setItemIcon,
    setItemDeviceIcon,
    setItemForceGlyph,
    setItemShowLabel,
    setItemDisplayType,
    switchSet,
    addSet,
    renameSet,
    deleteSet,
    setPosition,
    setIconSize,
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
    setFreeFloat,
    setFloatPosition,
    setContentScale,
    setDefaultTerminal,
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
  };
}
