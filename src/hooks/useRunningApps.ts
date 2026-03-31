import { useState, useEffect, useRef } from "react";
import { RunningApp } from "../types";
import { getRunningApps } from "../tauri-bridge";

const POLL_INTERVAL = 2000;

export function useRunningApps() {
  const [runningApps, setRunningApps] = useState<RunningApp[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const apps = await getRunningApps();
        if (!cancelled) setRunningApps(apps);
      } catch {
        // Silently ignore errors during poll (e.g., accessibility not granted yet)
      }
    }

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return runningApps;
}
