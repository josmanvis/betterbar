import { useState, useEffect } from "react";
import { ClockConfig } from "../types";

interface WorldClockProps {
  isVertical: boolean;
  clocks?: ClockConfig[];
}

const DEFAULT_CLOCKS: ClockConfig[] = [
  { id: "sf",  code: "SF",  tz: "America/Los_Angeles" },
  { id: "bz",  code: "BZ",  tz: "America/Belize" },
  { id: "nyc", code: "NYC", tz: "America/New_York" },
  { id: "esp", code: "ESP", tz: "Europe/Madrid" },
  { id: "ind", code: "IND", tz: "Asia/Kolkata" },
];

function formatTime(tz: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(now);
  } catch (e) {
    // Handle invalid timezone smoothly
    return "--:--";
  }
}

export function WorldClock({ isVertical, clocks = DEFAULT_CLOCKS }: WorldClockProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const msToNext = 60_000 - (Date.now() % 60_000);
    const initial = setTimeout(() => {
      setNow(new Date());
      const interval = setInterval(() => setNow(new Date()), 60_000);
      return () => clearInterval(interval);
    }, msToNext);
    return () => clearTimeout(initial);
  }, []);

  const activeClocks = clocks.length > 0 ? clocks : DEFAULT_CLOCKS;

  if (isVertical) {
    return (
      <div className="w-full px-1.5 py-1.5 flex flex-col gap-px">
        {activeClocks.map(({ id, code, tz }) => {
          const time = formatTime(tz, now);
          return (
            <div
              key={id}
              className="flex items-baseline justify-between leading-none"
            >
              <span className="text-[10px] font-semibold tracking-[0.15em] text-[var(--bb-accent)] uppercase">
                {code}
              </span>
              <span className="text-[10px] text-[var(--bb-text)] tabular-nums">
                {time}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="h-full flex items-center gap-3 px-2">
      {activeClocks.map(({ id, code, tz }) => {
        const time = formatTime(tz, now);
        return (
          <div key={id} className="flex flex-col items-center leading-none gap-px">
            <span className="text-[9px] font-semibold tracking-[0.15em] text-[var(--bb-accent)] uppercase">
              {code}
            </span>
            <span className="text-[10px] text-[var(--bb-text)] tabular-nums">
              {time}
            </span>
          </div>
        );
      })}
    </div>
  );
}
