import { useState, useEffect, type ComponentType } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inspectExtension, isExtensionApproved, useExtensionApprovals, type ExtensionReview } from "./extension-permissions";

export interface ExtensionFile {
  name: string;
  display_name: string;
  content: string;
  version?: string | null;
  review: ExtensionReview;
}

export interface LoadedExtension {
  name: string;
  displayName: string;
  Component: ComponentType<any>;
  Settings?: ComponentType<any>;
  version?: string;
  review: ExtensionReview;
}

// We will fetch the registry dynamically from Rust
let cachedRegistry: ExtensionFile[] = [];
let registryLoaded = false;
let registryPromise: Promise<ExtensionFile[]> | null = null;
const evaluated = new Map<string, { content: string; module: any }>();
const registryListeners = new Set<() => void>();
const RELOAD_KEY = "betterbar-extensions-reload";
let watchingReloads = false;

export async function fetchExtensionRegistry(): Promise<ExtensionFile[]> {
  if (registryLoaded) return cachedRegistry;
  if (!registryPromise) {
    registryPromise = invoke<ExtensionFile[]>("fetch_extension_files_from_disk").then(async (files) => {
      const exts = await Promise.all(files.map(async ext => ({ ...ext, review: await inspectExtension(ext.name, ext.content, ext.display_name) })));
      cachedRegistry = exts;
      registryLoaded = true;
      registryListeners.forEach(listener => listener());
      return exts;
    }).catch(error => { registryPromise = null; throw error; });
  }
  return registryPromise;
}

// Synchronous getter for the UI (SettingsApp uses this on mount)
// SettingsApp might mount before fetchExtensionRegistry completes, so we return empty if not ready.
export function getExtensionRegistry() {
  return cachedRegistry.map((ext) => ({ name: ext.name, displayName: ext.review.displayName, version: ext.review.version, review: ext.review }));
}

export function useExtensionRegistry() {
  const [registry, setRegistry] = useState(() => ({ extensions: getExtensionRegistry(), ready: registryLoaded }));
  useEffect(() => {
    const sync = () => setRegistry({ extensions: getExtensionRegistry(), ready: registryLoaded });
    if (!watchingReloads) {
      watchingReloads = true;
      window.addEventListener("storage", event => {
        if (event.key !== RELOAD_KEY) return;
        registryLoaded = false; registryPromise = null;
        fetchExtensionRegistry().then(() => window.dispatchEvent(new Event("betterbar-reload-extensions"))).catch(console.error);
      });
    }
    registryListeners.add(sync);
    fetchExtensionRegistry().then(sync).catch(console.error);
    return () => { registryListeners.delete(sync); };
  }, []);
  return registry;
}

export function useExtensions(enabled: string[]): LoadedExtension[] {
  const approvalRevision = useExtensionApprovals();
  const [loaded, setLoaded] = useState<LoadedExtension[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const handleReload = () => setReloadKey(k => k + 1);
    window.addEventListener("betterbar-reload-extensions", handleReload);
    return () => window.removeEventListener("betterbar-reload-extensions", handleReload);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      const results: LoadedExtension[] = [];
      if (!enabled.length) { setLoaded([]); return; }
      const exts = await fetchExtensionRegistry();
      const { evaluateExtension } = await import("./extension-evaluator");
      if (cancelled) return;
      for (const ext of exts) {
        if (!enabled.includes(ext.name) || !isExtensionApproved(ext.review)) continue;
        try {
          let cached = evaluated.get(ext.name);
          if (!cached || cached.content !== ext.content) {
            cached = { content: ext.content, module: evaluateExtension(ext.content, ext.name) };
            evaluated.set(ext.name, cached);
          }
          const mod = cached.module;
          if (mod && mod.default) {
            results.push({
              name: ext.name,
              review: ext.review,
              displayName: mod.name || ext.display_name,
              Component: mod.default,
              Settings: mod.Settings,
              version: typeof mod.version === "string" ? mod.version : ext.version || undefined,
            });
          }
        } catch {
          console.error(`[extensions] Failed to load "${ext.name}".`);
        }
      }
      if (!cancelled) setLoaded(results);
    }

    loadAll().catch(() => { if (!cancelled) console.error("[extensions] Could not load extensions."); });
    return () => { cancelled = true; };
  }, [enabled.join(","), reloadKey, approvalRevision]);

  return loaded.filter(ext => enabled.includes(ext.name) && isExtensionApproved(ext.review) && cachedRegistry.some(file => file.name === ext.name && file.review.fingerprint === ext.review.fingerprint));
}

export async function reloadExtensions() {
  registryLoaded = false;
  registryPromise = null;
  const registry = await fetchExtensionRegistry();
  window.dispatchEvent(new Event("betterbar-reload-extensions"));
  localStorage.setItem(RELOAD_KEY, `${Date.now()}-${Math.random()}`);
  return registry;
}
