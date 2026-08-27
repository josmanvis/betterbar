import { useState, useEffect, useCallback } from "react";
import { CaffeineStatus } from "../types";
import { getCaffeineStatus, setCaffeine, toggleCaffeine } from "../tauri-bridge";

const POLL_MS = 3_000;

export function useCaffeine() {
  const [status, setStatus] = useState<CaffeineStatus>({
    active: false,
    minutes_remaining: null,
  });

  const refresh = useCallback(async () => {
    try {
      const s = await getCaffeineStatus();
      setStatus(s);
    } catch {}
  }, []);

  const toggle = useCallback(async (durationMins?: number) => {
    try {
      const s = await toggleCaffeine(durationMins);
      setStatus(s);
    } catch {}
  }, []);

  const activate = useCallback(async (durationMins?: number) => {
    try {
      const s = await setCaffeine(true, durationMins);
      setStatus(s);
    } catch {}
  }, []);

  const deactivate = useCallback(async () => {
    try {
      const s = await setCaffeine(false);
      setStatus(s);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { status, refresh, toggle, activate, deactivate };
}
