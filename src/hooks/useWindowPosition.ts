import { useEffect, useRef } from "react";
import { BetterBarConfig } from "../types";
import { getScreenInfo, positionWindow, setWindowLevel, setScreenInset } from "../tauri-bridge";

const SIDEBAR_SIZE = 68; // px — sidebar width (left/right) or height (top/bottom)
const POLL_MS = 1500;    // poll interval to detect menu bar visibility changes

export function useWindowPosition(config: BetterBarConfig) {
  const lastBoundsRef = useRef<string>("");

  useEffect(() => {
    async function applyPosition() {
      try {
        const screen = await getScreenInfo();
        const scale = screen.scale_factor;
        const sw = screen.width;
        const sh = screen.height;
        const menuH = screen.menu_bar_height; // logical px; 0 when menu bar is hidden

        // Start our panel just below the menu bar (never overlap it)
        let x = 0, y = 0, w = 0, h = 0;

        switch (config.position) {
          case "left":
            x = 0;
            y = menuH;
            w = SIDEBAR_SIZE;
            h = sh - menuH;
            break;
          case "right":
            x = sw - SIDEBAR_SIZE;
            y = menuH;
            w = SIDEBAR_SIZE;
            h = sh - menuH;
            break;
          case "top":
            x = 0;
            y = menuH;
            w = sw;
            h = SIDEBAR_SIZE;
            break;
          case "bottom":
            x = 0;
            y = sh - SIDEBAR_SIZE;
            w = sw;
            h = SIDEBAR_SIZE;
            break;
        }

        const boundsKey = `${x},${y},${w},${h}`;
        if (boundsKey === lastBoundsRef.current) return; // no change
        lastBoundsRef.current = boundsKey;

        await positionWindow(
          Math.round(x * scale),
          Math.round(y * scale),
          Math.round(w * scale),
          Math.round(h * scale)
        );
        await setWindowLevel("floating");
        await setScreenInset(config.position, SIDEBAR_SIZE, menuH);
      } catch (e) {
        console.error("Failed to position window:", e);
      }
    }

    applyPosition();
    const timer = setInterval(applyPosition, POLL_MS);
    return () => clearInterval(timer);
  }, [config.position]);
}
