import React, { useState, useEffect } from "react";

export const name = "Power";
const strings = { settings: "Battery percentage and charging status. Colors follow your appearance settings." };

export default function PowerExtension({ isVertical = false }: { isVertical?: boolean }) {
  const [info, setInfo] = useState({
    percentage: 0,
    is_charging: false,
    is_plugged: false,
    available: false,
  });

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        // @ts-ignore
        const data = await invoke("get_battery_info");
        if (!cancelled) setInfo(data);
      } catch {}
    }
    poll();
    const timer = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!info.available) return null;

  const pct = Math.round(info.percentage);
  const tone =
    info.is_charging ? "var(--bb-accent)" :
    pct <= 10           ? "var(--bb-bad)"    :
    pct <= 20           ? "var(--bb-warn)"   :
                          "var(--bb-text)";

  const lightningIcon = (
    <svg width="9" height="9" viewBox="0 0 256 256" fill="currentColor">
      <path d="M215.79,118.17a8,8,0,0,0-5-5.66L153.18,90.9l14.66-73.33a8,8,0,0,0-13.69-7L47.79,122.17a8,8,0,0,0,5,13.66l57.62,21.61L95.78,230.76a8,8,0,0,0,13.69,7l106.32-111.61A8,8,0,0,0,215.79,118.17Z" />
    </svg>
  );

  return (
    <div className={`${isVertical ? "w-full flex-col py-1.5 px-1.5" : "h-full px-4"} flex items-center`}>
      <span className={`tabular-nums flex items-center gap-0.5 ${isVertical ? "text-[9px] leading-none" : "text-[10px]"}`} style={{ color: tone }}>
        {info.is_charging && lightningIcon}
        <span>{pct}</span>
        <span className="text-[var(--bb-mute)]">%</span>
      </span>
    </div>
  );
}

export function Settings() { return <p style={{ fontSize: 11, lineHeight: 1.8, color: "var(--bb-dim)" }}>{strings.settings}</p>; }
