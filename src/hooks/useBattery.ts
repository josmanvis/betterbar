import { useState, useEffect } from "react";
import { BatteryInfo } from "../types";
import { getBatteryInfo } from "../tauri-bridge";

const POLL_MS = 30_000;

export function useBattery(): BatteryInfo {
  const [info, setInfo] = useState<BatteryInfo>({
    percentage: 0,
    is_charging: false,
    is_plugged: false,
    available: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await getBatteryInfo();
        if (!cancelled) setInfo(data);
      } catch {}
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return info;
}
