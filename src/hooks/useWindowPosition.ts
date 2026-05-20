import { useEffect, useRef } from "react";
import { BetterBarConfig } from "../types";
import {
  clearScreenInsets, getScreenInfo, positionWindow,
  setScreenInset, setWindowLevel,
} from "../tauri-bridge";

const POLL_MS = 1500; // poll interval to detect menu bar visibility changes

export function useWindowPosition(
  config: BetterBarConfig,
  onFloatPositionChange?: (pos: { x: number; y: number }) => void,
  autoLength?: number | null,
) {
  const lastBoundsRef = useRef<string>("");
  const lastModeRef = useRef<"docked" | "float" | null>(null);
  const { barSize, barLength, barLengthMode, freeFloat, floatPosition } = config;

  // Stable ref to the callback so its identity doesn't re-trigger the effect.
  const cbRef = useRef(onFloatPositionChange);
  useEffect(() => { cbRef.current = onFloatPositionChange; }, [onFloatPositionChange]);

  useEffect(() => {
    async function applyDocked(screen: Awaited<ReturnType<typeof getScreenInfo>>) {
      const scale = screen.scale_factor;
      const sw = screen.width;
      const sh = screen.height;
      const menuH = screen.menu_bar_height;
      const dockH = screen.dock_height;

      let x = 0, y = 0, w = 0, h = 0;
      switch (config.position) {
        case "left":
          x = 0; y = menuH; w = barSize; h = sh - menuH - dockH; break;
        case "right":
          x = sw - barSize; y = menuH; w = barSize; h = sh - menuH - dockH; break;
        case "top":
          x = 0; y = menuH; w = sw; h = barSize; break;
        case "bottom":
          x = 0; y = sh - barSize - dockH; w = sw; h = barSize; break;
      }

      const key = `docked:${x},${y},${w},${h}`;
      if (key === lastBoundsRef.current) return;
      lastBoundsRef.current = key;

      await positionWindow(
        Math.round(x * scale),
        Math.round(y * scale),
        Math.round(w * scale),
        Math.round(h * scale),
      );
      await setWindowLevel("floating");
      await setScreenInset(config.position, barSize, menuH);
    }

    async function applyFloat(screen: Awaited<ReturnType<typeof getScreenInfo>>) {
      const scale = screen.scale_factor;
      const sw = screen.width;
      const sh = screen.height;
      const menuH = screen.menu_bar_height;
      const dockH = screen.dock_height;

      const isVertical = config.position === "left" || config.position === "right";

      // Resolve the long-axis length based on the configured mode.
      let resolvedLen: number;
      switch (barLengthMode) {
        case "edge":
          resolvedLen = isVertical ? sh - menuH - dockH : sw;
          break;
        case "auto":
          // Fall back to `barLength` while the content's intrinsic size hasn't been measured yet.
          resolvedLen = autoLength && autoLength > 0 ? autoLength : barLength;
          break;
        case "custom":
        default:
          resolvedLen = barLength;
          break;
      }

      const w = isVertical ? barSize : resolvedLen;
      const h = isVertical ? resolvedLen : barSize;

      console.log("[BB.applyFloat]", {
        mode: barLengthMode, autoLength, isVertical, resolvedLen,
        w, h, sw, sh, menuH, dockH, barSize, barLength,
      });

      // visibleFrame in our coordinate system (top-left origin):
      //   x ∈ [0, sw - w], y ∈ [menuH, sh - dockH - h]
      const minX = 0;
      const maxX = Math.max(0, sw - w);
      const minY = menuH;
      const maxY = Math.max(menuH, sh - dockH - h);

      let x: number, y: number;
      if (floatPosition) {
        x = floatPosition.x;
        y = floatPosition.y;
      } else {
        // Initialize at a sensible spot derived from the current edge.
        switch (config.position) {
          case "left":   x = 0;                 y = menuH + 40; break;
          case "right":  x = sw - w;            y = menuH + 40; break;
          case "top":    x = (sw - w) / 2;      y = menuH; break;
          case "bottom": x = (sw - w) / 2;      y = sh - dockH - h; break;
        }
      }

      // Clamp to visibleFrame
      const cx = Math.max(minX, Math.min(maxX, x));
      const cy = Math.max(minY, Math.min(maxY, y));

      // If clamping (or initialization) changed the saved position, persist it.
      if (!floatPosition || cx !== floatPosition.x || cy !== floatPosition.y) {
        cbRef.current?.({ x: cx, y: cy });
      }

      const key = `float:${cx},${cy},${w},${h}`;
      if (key === lastBoundsRef.current) {
        console.log("[BB.applyFloat] skip (cached)", key);
        return;
      }
      console.log("[BB.applyFloat] apply", { prevKey: lastBoundsRef.current, newKey: key });
      lastBoundsRef.current = key;

      // Clear the docked screen reservation the first time we enter float mode.
      if (lastModeRef.current !== "float") {
        await clearScreenInsets();
      }

      await positionWindow(
        Math.round(cx * scale),
        Math.round(cy * scale),
        Math.round(w * scale),
        Math.round(h * scale),
      );
      await setWindowLevel("floating");
    }

    async function applyPosition() {
      try {
        const screen = await getScreenInfo();
        if (freeFloat) {
          await applyFloat(screen);
          lastModeRef.current = "float";
        } else {
          await applyDocked(screen);
          lastModeRef.current = "docked";
        }
      } catch (e) {
        console.error("Failed to position window:", e);
      }
    }

    applyPosition();
    const timer = setInterval(applyPosition, POLL_MS);
    return () => clearInterval(timer);
  }, [config.position, barSize, barLength, barLengthMode, autoLength, freeFloat, floatPosition]);
}
