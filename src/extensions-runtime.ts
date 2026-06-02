import { useState, useEffect } from "react";

import type { ComponentType } from "react";

export interface RegistryEntry {
  name: string;
  displayName: string;
  load: () => Promise<ExtensionModule>;
}

interface ExtensionModule {
  default: ComponentType<any>;
  name?: string;
  description?: string;
}

// Virtual module provided by the Vite plugin – see vite.config.ts
// eslint-disable-next-line import/no-unresolved
import { registry as _registry } from "virtual:betterbar-extensions";

const registry: RegistryEntry[] = _registry;

export interface LoadedExtension {
  name: string;
  displayName: string;
  Component: ComponentType<any>;
}

export function getExtensionRegistry(): { name: string; displayName: string }[] {
  return registry.map(({ name, displayName }) => ({ name, displayName }));
}

export function useExtensions(enabled: string[]): LoadedExtension[] {
  const [loaded, setLoaded] = useState<LoadedExtension[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      const results: LoadedExtension[] = [];
      for (const entry of registry) {
        if (!enabled.includes(entry.name)) continue;
        try {
          const mod = await entry.load();
          results.push({
            name: entry.name,
            displayName: mod.name ?? entry.displayName,
            Component: mod.default,
          });
        } catch (e) {
          console.error(`[extensions] Failed to load "${entry.name}":`, e);
        }
      }
      if (!cancelled) setLoaded(results);
    }

    loadAll();
    return () => { cancelled = true; };
  }, [enabled.join(",")]);

  return loaded;
}
