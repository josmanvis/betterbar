import { useState, useCallback } from "react";
import { BetterBarConfig, DEFAULT_CONFIG, DockItem, DockPosition } from "./types";

const STORAGE_KEY = "betterbar_config";

function loadConfig(): BetterBarConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_CONFIG;
}

function saveConfig(config: BetterBarConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function useConfig() {
  const [config, setConfigState] = useState<BetterBarConfig>(loadConfig);

  const setConfig = useCallback((update: Partial<BetterBarConfig> | ((prev: BetterBarConfig) => BetterBarConfig)) => {
    setConfigState((prev) => {
      const next = typeof update === "function" ? update(prev) : { ...prev, ...update };
      saveConfig(next);
      return next;
    });
  }, []);

  const addItem = useCallback((item: DockItem) => {
    setConfig((prev) => ({
      ...prev,
      items: [...prev.items, { ...item, order: prev.items.length }],
    }));
  }, [setConfig]);

  const removeItem = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.id !== id).map((i, idx) => ({ ...i, order: idx })),
    }));
  }, [setConfig]);

  const reorderItems = useCallback((items: DockItem[]) => {
    setConfig((prev) => ({ ...prev, items }));
  }, [setConfig]);

  const setPosition = useCallback((position: DockPosition) => {
    setConfig({ position });
  }, [setConfig]);

  const setIconSize = useCallback((iconSize: number) => {
    setConfig({ iconSize });
  }, [setConfig]);

  const toggleAutoHide = useCallback(() => {
    setConfig((prev) => ({ ...prev, autoHide: !prev.autoHide }));
  }, [setConfig]);

  const toggleLabels = useCallback(() => {
    setConfig((prev) => ({ ...prev, showLabels: !prev.showLabels }));
  }, [setConfig]);

  return {
    config,
    setConfig,
    addItem,
    removeItem,
    reorderItems,
    setPosition,
    setIconSize,
    toggleAutoHide,
    toggleLabels,
  };
}
