import { useState, useCallback } from "react";
import { AppSet, BetterBarConfig, DEFAULT_CONFIG, DockItem, DockPosition } from "./types";

const STORAGE_KEY = "betterbar_config";

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
      return { ...DEFAULT_CONFIG, ...saved };
    }
  } catch {}
  return DEFAULT_CONFIG;
}

function saveConfig(config: BetterBarConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function useConfig() {
  const [config, setConfigState] = useState<BetterBarConfig>(loadConfig);

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
  const toggleAutoHide = useCallback(() => setConfig((p) => ({ ...p, autoHide: !p.autoHide })), [setConfig]);
  const toggleLabels = useCallback(() => setConfig((p) => ({ ...p, showLabels: !p.showLabels })), [setConfig]);

  return {
    config,
    activeSet,
    setConfig,
    addItem,
    removeItem,
    reorderItems,
    switchSet,
    addSet,
    renameSet,
    deleteSet,
    setPosition,
    setIconSize,
    toggleAutoHide,
    toggleLabels,
  };
}
