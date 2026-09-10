import { useState, useEffect } from "react";
import * as React from "react";
import type { ComponentType } from "react";
import { invoke } from "@tauri-apps/api/core";
import { transform } from "sucrase";
import { marked } from "marked";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export interface ExtensionFile {
  name: string;
  display_name: string;
  content: string;
}

export interface LoadedExtension {
  name: string;
  displayName: string;
  Component: ComponentType<any>;
  Settings?: ComponentType<any>;
}

// We will fetch the registry dynamically from Rust
let cachedRegistry: ExtensionFile[] = [];
let registryLoaded = false;
let registryPromise: Promise<ExtensionFile[]> | null = null;

export async function fetchExtensionRegistry(): Promise<ExtensionFile[]> {
  if (registryLoaded) return cachedRegistry;
  if (!registryPromise) {
    registryPromise = invoke<ExtensionFile[]>("fetch_extension_files_from_disk").then((exts) => {
      cachedRegistry = exts;
      registryLoaded = true;
      return exts;
    });
  }
  return registryPromise;
}

// Synchronous getter for the UI (SettingsApp uses this on mount)
// SettingsApp might mount before fetchExtensionRegistry completes, so we return empty if not ready.
export function getExtensionRegistry(): { name: string; displayName: string }[] {
  return cachedRegistry.map((ext) => ({ name: ext.name, displayName: ext.display_name }));
}

function evaluateExtension(tsxCode: string, name: string) {
  try {
    const jsCode = transform(tsxCode, {
      transforms: ["typescript", "jsx", "imports"],
      jsxPragma: "React.createElement",
      jsxFragmentPragma: "React.Fragment",
    }).code;

    const exports: any = {};
    const module = { exports };
    const require_fn = (id: string) => {
      if (id === "react") return React;
      if (id === "marked") return { marked };
      if (id === "@tauri-apps/api/webviewWindow") return { WebviewWindow };
      throw new Error(`Cannot require ${id} in extension`);
    };

    const f = new Function("exports", "module", "require", "React", "invoke", jsCode);
    f(exports, module, require_fn, React, invoke);

    return module.exports;
  } catch (err) {
    console.error(`[extensions] Failed to evaluate "${name}":`, err);
    throw err;
  }
}

export function useExtensions(enabled: string[]): LoadedExtension[] {
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
      const exts = await fetchExtensionRegistry();
      
      for (const ext of exts) {
        if (!enabled.includes(ext.name)) continue;
        try {
          const mod = evaluateExtension(ext.content, ext.name);
          if (mod && mod.default) {
            results.push({
              name: ext.name,
              displayName: mod.name || ext.display_name,
              Component: mod.default,
              Settings: mod.Settings,
            });
          }
        } catch (e) {
          console.error(`[extensions] Failed to load "${ext.name}":`, e);
        }
      }
      if (!cancelled) setLoaded(results);
    }

    loadAll();
    return () => { cancelled = true; };
  }, [enabled.join(","), reloadKey]);

  return loaded;
}

export async function reloadExtensions() {
  registryLoaded = false;
  registryPromise = null;
  return fetchExtensionRegistry();
}
