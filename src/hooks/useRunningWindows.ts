import { useState, useEffect, useRef } from "react";
import { WindowDetails } from "../types";
import { getOnScreenWindows } from "../tauri-bridge";

const POLL_INTERVAL = 2000;

export function useRunningWindows() {
  const [runningWindows, setRunningWindows] = useState<WindowDetails[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const windows = await getOnScreenWindows();
        if (!cancelled) setRunningWindows(windows);
      } catch {
        // Silently ignore errors during poll (e.g. accessibility/screen recording not granted yet)
      }
    }

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return runningWindows;
}
