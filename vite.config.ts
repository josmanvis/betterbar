import { defineConfig, type Plugin, type ResolvedConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import os from "os";
import { transformSync } from "esbuild";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// ── Vite plugin: betterbar extensions ─────────────────────────────────────────
// Scans `~/.betterbar/extensions/<name>/main.tsx` and exposes them as virtual
// modules so extensions are compiled by Vite and can be dynamically loaded.

const EXTENSIONS_DIR = path.join(os.homedir(), ".betterbar", "extensions");
const VIRTUAL_REGISTRY = "\0betterbar-extensions:registry";

function betterbarExtensions(): Plugin {
  let config: ResolvedConfig;

  function scan(): { name: string; displayName: string }[] {
    const out: { name: string; displayName: string }[] = [];
    try {
      if (!fs.existsSync(EXTENSIONS_DIR)) return out;
      const dirs = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        if (fs.existsSync(path.join(EXTENSIONS_DIR, d.name, "main.tsx"))) {
          out.push({
            name: d.name,
            displayName: d.name
              .replace(/-/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
          });
        }
      }
    } catch {}
    return out;
  }

  return {
    name: "betterbar-extensions",
    enforce: "pre",

    configResolved(c) {
      config = c;
    },

    resolveId(id) {
      if (id === "virtual:betterbar-extensions") return VIRTUAL_REGISTRY;
      if (id.startsWith("virtual:betterbar-extensions:")) {
        const name = id.slice("virtual:betterbar-extensions:".length);
        if (!name) return;
        return `\0betterbar-extensions:${name}`;
      }
    },

    load(id) {
      // ── Registry module ─────────────────────────────────────────────────
      if (id === VIRTUAL_REGISTRY) {
        const entries = scan();
        if (entries.length === 0) {
          return "export const registry = [];\n";
        }
        const imports = entries.map(
          (e, i) =>
            `const __ext${i} = () => import("virtual:betterbar-extensions:${e.name}");`
        );
        const items = entries.map(
          (e, i) =>
            `{name:${JSON.stringify(e.name)},displayName:${JSON.stringify(e.displayName)},load:__ext${i}}`
        );
        return [
          `const __def = Object.defineProperty;`,
          ...imports,
          `export const registry = [${items.join(",")}];`,
          `export default registry;`,
        ].join("\n");
      }

      // ── Individual extension ────────────────────────────────────────────
      if (id.startsWith("\0betterbar-extensions:")) {
        const name = id.slice("\0betterbar-extensions:".length);
        if (!name) return;
        const filePath = path.join(EXTENSIONS_DIR, name, "main.tsx");
        if (!fs.existsSync(filePath)) return;
        const source = fs.readFileSync(filePath, "utf-8");
        this.addWatchFile(filePath);

        try {
          const result = transformSync(source, {
            loader: "tsx",
            jsx: "automatic",
            jsxImportSource: "react",
            target: "es2020",
            sourcemap: config.command === "serve" ? "inline" : false,
            sourcefile: name,
          });
          return { code: result.code, map: result.map };
        } catch (err) {
          this.warn(
            `[betterbar-extensions] Failed to compile "${name}": ${err}`
          );
          return [
            `const Comp = () => null;`,
            `export default Comp;`,
            `export const __error = ${JSON.stringify(String(err))};`,
          ].join("\n");
        }
      }
    },

    configureServer(server) {
      if (!fs.existsSync(EXTENSIONS_DIR)) return;
      server.watcher.add(EXTENSIONS_DIR);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), betterbarExtensions()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
