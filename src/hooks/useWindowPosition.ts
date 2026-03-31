import { useEffect } from "react";
import { BetterBarConfig } from "../types";
import { getScreenInfo, positionWindow, setWindowLevel } from "../tauri-bridge";

const DOCK_HEIGHT = 80;
const DOCK_THICKNESS = 80; // for left/right
const EDGE_PADDING = 8;

export function useWindowPosition(config: BetterBarConfig) {
  useEffect(() => {
    async function applyPosition() {
      try {
        const screen = await getScreenInfo();
        const scale = screen.scale_factor;
        const sw = screen.width;
        const sh = screen.height;

        let x = 0, y = 0, w = 0, h = 0;

        switch (config.position) {
          case "bottom":
            w = Math.round(sw * 0.6);
            h = DOCK_HEIGHT;
            x = Math.round((sw - w) / 2);
            y = Math.round(sh - h - EDGE_PADDING);
            break;
          case "top":
            w = Math.round(sw * 0.6);
            h = DOCK_HEIGHT;
            x = Math.round((sw - w) / 2);
            y = EDGE_PADDING;
            break;
          case "left":
            w = DOCK_THICKNESS;
            h = Math.round(sh * 0.6);
            x = EDGE_PADDING;
            y = Math.round((sh - h) / 2);
            break;
          case "right":
            w = DOCK_THICKNESS;
            h = Math.round(sh * 0.6);
            x = Math.round(sw - w - EDGE_PADDING);
            y = Math.round((sh - h) / 2);
            break;
        }

        await positionWindow(
          Math.round(x * scale),
          Math.round(y * scale),
          Math.round(w * scale),
          Math.round(h * scale)
        );
        await setWindowLevel("floating");
      } catch (e) {
        console.error("Failed to position window:", e);
      }
    }

    applyPosition();
  }, [config.position]);
}
