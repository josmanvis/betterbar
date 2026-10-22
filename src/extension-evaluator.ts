import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { transform } from "sucrase";
import { marked } from "marked";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { availableMonitors, currentMonitor } from "@tauri-apps/api/window";
import { homeDir, join } from "@tauri-apps/api/path";

import * as betterbar from "./extension-api";

export function evaluateExtension(tsxCode: string, name: string) {
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
      if (id === "@betterbar/api") return betterbar;
      if (id === "marked") return { marked };
      if (id === "@tauri-apps/api/webviewWindow") return { WebviewWindow };
      if (id === "@tauri-apps/api/dpi") return { LogicalSize, PhysicalPosition };
      if (id === "@tauri-apps/api/window") return { availableMonitors, currentMonitor };
      if (id === "@tauri-apps/api/path") return { homeDir, join };
      throw new Error(`Cannot require ${id} in extension`);
    };

    const f = new Function("exports", "module", "require", "React", "invoke", jsCode);
    f(exports, module, require_fn, React, invoke);

    return module.exports;
  } catch {
    // Parser errors can contain excerpts of private extension source.
    throw new Error(`[extensions] Failed to evaluate "${name}".`);
  }
}
