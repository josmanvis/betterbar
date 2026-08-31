import { useState, useCallback, useEffect } from "react";
import {
  AppSet, BAR_LENGTH_MAX, BAR_LENGTH_MIN, BAR_SIZE_MAX, BAR_SIZE_MIN,
  BarLengthMode, BetterBarConfig, DEFAULT_CONFIG as TYPES_DEFAULT_CONFIG, DEFAULT_SECTION_ORDER, DockItem, DockPosition,
  IconChrome, IconStyle, SectionId, SectionPadding, SectionStyleConfig,
} from "./types";
import { setOpenOnLogin as tauriSetOpenOnLogin } from "./tauri-bridge";

export const DEFAULT_CONFIG = TYPES_DEFAULT_CONFIG;

const STORAGE_KEY = "betterbar_config";

export function sanitize(cfg: BetterBarConfig): BetterBarConfig {
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
    showExtensions: cfg.showExtensions === undefined ? DEFAULT_CONFIG.showExtensions : !!cfg.showExtensions,
    enabledExtensions: Array.isArray(cfg.enabledExtensions) ? cfg.enabledExtensions : [],
    showSpaces: cfg.showSpaces === undefined ? DEFAULT_CONFIG.showSpaces : !!cfg.showSpaces,
    showCaffeine: cfg.showCaffeine === undefined ? DEFAULT_CONFIG.showCaffeine : !!cfg.showCaffeine,
    openOnLogin: cfg.openOnLogin === undefined ? DEFAULT_CONFIG.openOnLogin : !!cfg.openOnLogin,
    sectionOrder: normalizeSectionOrder(cfg.sectionOrder),
    sectionStyles: sanitizeSectionStyles(cfg.sectionStyles),
    iconChrome: sanitizeIconChrome(cfg.iconChrome),
    sets: Array.isArray(cfg.sets)
      ? cfg.sets.map((s) => ({
          ...s,
          items: Array.isArray(s.items)
            ? s.items.map((it) => {
                const chrome = sanitizeIconChrome(it.chrome);
                return Object.keys(chrome).length ? { ...it, chrome } : stripChrome(it);
              })
            : s.items,
        }))
      : cfg.sets,
  };
}

function stripChrome(item: DockItem): DockItem {
  if (item.chrome === undefined) return item;
  const { chrome: _drop, ...rest } = item;
  return rest;
}

const CHROME_COLOR_KEYS = ["background", "borderColor"] as const;
const CHROME_NUM_LIMITS: Record<"borderWidth" | "radius" | "padding", number> = {
  borderWidth: 4,
  radius: 24,
  padding: 16,
};

/** Keep only known keys, clamp the numeric ones, drop empty/invalid strings. */
export function sanitizeIconChrome(v: unknown): IconChrome {
  if (!v || typeof v !== "object") return {};
  const src = v as Record<string, unknown>;
  const out: IconChrome = {};
  for (const key of CHROME_COLOR_KEYS) {
    const raw = src[key];
    if (typeof raw === "string" && raw.trim()) out[key] = raw.trim();
  }
  for (const key of Object.keys(CHROME_NUM_LIMITS) as (keyof typeof CHROME_NUM_LIMITS)[]) {
    const raw = src[key];
    if (Number.isFinite(raw)) {
      out[key] = Math.max(0, Math.min(CHROME_NUM_LIMITS[key], Math.round(raw as number)));
    }
  }
  return out;
}

/** Merge a chrome patch, treating `undefined` values as "clear this field". */
function applyChromePatch(base: IconChrome | undefined, patch: Partial<IconChrome>): IconChrome {
  const next: IconChrome = { ...(base || {}) };
  for (const [k, val] of Object.entries(patch)) {
    if (val === undefined) delete (next as Record<string, unknown>)[k];
    else (next as Record<string, unknown>)[k] = val;
  }
  return sanitizeIconChrome(next);
}

function sanitizeSectionStyles(
  styles: unknown
): Partial<Record<SectionId, SectionStyleConfig>> {
  if (!styles || typeof styles !== "object") return {};
  const out: Partial<Record<SectionId, SectionStyleConfig>> = {};
  for (const [key, val] of Object.entries(styles as Record<string, any>)) {
    if (DEFAULT_SECTION_ORDER.includes(key as SectionId) && val && typeof val === "object") {
      const p = val.padding;
      const padding = p && typeof p === "object" ? {
        top: Number.isFinite(p.top) ? Math.max(0, Math.min(100, Math.round(p.top))) : undefined,
        right: Number.isFinite(p.right) ? Math.max(0, Math.min(100, Math.round(p.right))) : undefined,
        bottom: Number.isFinite(p.bottom) ? Math.max(0, Math.min(100, Math.round(p.bottom))) : undefined,
        left: Number.isFinite(p.left) ? Math.max(0, Math.min(100, Math.round(p.left))) : undefined,
      } : undefined;
      const contentScale = Number.isFinite(val.contentScale)
        ? Math.max(0.3, Math.min(3.0, Number(val.contentScale.toFixed(2))))
        : undefined;
      out[key as SectionId] = {
        padding,
        contentScale,
      };
    }
  }
  return out;
}

/** Keep only known section ids (dropping unknowns/dupes) and append any known
 *  ids missing from the stored order, so new sections appear without a reset. */
function normalizeSectionOrder(stored: unknown): SectionId[] {
  const known = DEFAULT_SECTION_ORDER;
  const arr = Array.isArray(stored) ? (stored as SectionId[]) : [];
  const seen = new Set<SectionId>();
  const out: SectionId[] = [];
  for (const id of arr) {
    if (known.includes(id) && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  for (const id of known) if (!seen.has(id)) out.push(id);
  return out;
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
        items: s.items.map((i) => (i.id === id ? { ...i, icon, deviceIcon: undefined, forceGlyph: undefined, forceNative: undefined } : i)),
      }));
    },
    [updateActiveSet]
  );

  const setItemDeviceIcon = useCallback(
    (id: string, deviceIcon: string | undefined) => {
      updateActiveSet((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === id ? { ...i, deviceIcon, icon: undefined, forceGlyph: undefined, forceNative: undefined } : i)),
      }));
    },
    [updateActiveSet]
  );

  const setItemForceGlyph = useCallback(
    (id: string, forceGlyph: boolean | undefined) => {
      updateActiveSet((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === id ? { ...i, forceGlyph, deviceIcon: undefined, icon: undefined, forceNative: undefined } : i)),
      }));
    },
    [updateActiveSet]
  );

  const setItemForceNative = useCallback(
    (id: string, forceNative: boolean | undefined) => {
      updateActiveSet((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === id ? { ...i, forceNative, icon: undefined, deviceIcon: undefined, forceGlyph: undefined } : i)),
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
  const setSectionOrder = useCallback((sectionOrder: SectionId[]) => setConfig({ sectionOrder }), [setConfig]);
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
  const toggleOpenOnLogin = useCallback(() => {
    setConfig((p) => {
      const next = !p.openOnLogin;
      tauriSetOpenOnLogin(next).catch(console.error);
      return { ...p, openOnLogin: next };
    });
  }, [setConfig]);
  const setOpenOnLogin = useCallback(
    (openOnLogin: boolean) => {
      tauriSetOpenOnLogin(openOnLogin).catch(console.error);
      setConfig({ openOnLogin });
    },
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

  const toggleShowExtensions = useCallback(
    () => setConfig((p) => ({ ...p, showExtensions: !p.showExtensions })),
    [setConfig]
  );

  const toggleSpaces = useCallback(
    () => setConfig((p) => ({ ...p, showSpaces: !p.showSpaces })),
    [setConfig]
  );

  const toggleExtension = useCallback(
    (name: string) => {
      setConfig((prev) => {
        const enabled = prev.enabledExtensions || [];
        const next = enabled.includes(name)
          ? enabled.filter((n) => n !== name)
          : [...enabled, name];
        return { ...prev, enabledExtensions: next };
      });
    },
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
    setItemForceNative,
    setSectionOrder,
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
    toggleOpenOnLogin,
    setOpenOnLogin,
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
    toggleShowExtensions,
    toggleSpaces,
    toggleCaffeine: useCallback(() => setConfig((p) => ({ ...p, showCaffeine: !p.showCaffeine })), [setConfig]),
    toggleExtension,
    setSectionPadding: useCallback((sectionId: SectionId, padding: SectionPadding) => {
      setConfig((prev) => {
        const styles = { ...(prev.sectionStyles || {}) };
        const existing = styles[sectionId] || {};
        styles[sectionId] = { ...existing, padding: { ...(existing.padding || {}), ...padding } };
        return { ...prev, sectionStyles: styles };
      });
    }, [setConfig]),
    setSectionContentScale: useCallback((sectionId: SectionId, contentScale: number) => {
      setConfig((prev) => {
        const styles = { ...(prev.sectionStyles || {}) };
        const existing = styles[sectionId] || {};
        styles[sectionId] = { ...existing, contentScale };
        return { ...prev, sectionStyles: styles };
      });
    }, [setConfig]),
    resetSectionStyle: useCallback((sectionId: SectionId) => {
      setConfig((prev) => {
        const styles = { ...(prev.sectionStyles || {}) };
        delete styles[sectionId];
        return { ...prev, sectionStyles: styles };
      });
    }, [setConfig]),
    setIconChrome: useCallback((patch: Partial<IconChrome>) => {
      setConfig((prev) => ({ ...prev, iconChrome: applyChromePatch(prev.iconChrome, patch) }));
    }, [setConfig]),
    resetIconChrome: useCallback(() => {
      setConfig((prev) => ({ ...prev, iconChrome: {} }));
    }, [setConfig]),
    setItemChrome: useCallback((id: string, patch: Partial<IconChrome>) => {
      updateActiveSet((s) => ({
        ...s,
        items: s.items.map((i) => {
          if (i.id !== id) return i;
          const chrome = applyChromePatch(i.chrome, patch);
          if (!Object.keys(chrome).length) {
            const { chrome: _drop, ...rest } = i;
            return rest;
          }
          return { ...i, chrome };
        }),
      }));
    }, [updateActiveSet]),
    resetItemChrome: useCallback((id: string) => {
      updateActiveSet((s) => ({
        ...s,
        items: s.items.map((i) => {
          if (i.id !== id || i.chrome === undefined) return i;
          const { chrome: _drop, ...rest } = i;
          return rest;
        }),
      }));
    }, [updateActiveSet]),
  };
}
