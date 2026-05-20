import { useState, useEffect } from "react";

const CITIES = [
  { code: "NYC", tz: "America/New_York" },
  { code: "SF",  tz: "America/Los_Angeles" },
  { code: "IND", tz: "Asia/Kolkata" },
  { code: "ESP", tz: "Europe/Madrid" },
  { code: "BZ",  tz: "America/Belize" },
] as const;

function formatTime(tz: string, now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

interface WorldClockProps {
  isVertical: boolean;
}

export function WorldClock({ isVertical }: WorldClockProps) {
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

  if (isVertical) {
    return (
      <div className="w-full px-1.5 py-1.5 flex flex-col gap-px">
        {CITIES.map(({ code, tz }) => {
          const time = formatTime(tz, now);
          return (
            <div
              key={code}
              className="flex items-baseline justify-between leading-none"
            >
              <span className="text-[8px] font-semibold tracking-[0.15em] text-[var(--bb-mute)] uppercase">
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
      {CITIES.map(({ code, tz }) => {
        const time = formatTime(tz, now);
        return (
          <div key={code} className="flex flex-col items-center leading-none gap-px">
            <span className="text-[7px] font-semibold tracking-[0.15em] text-[var(--bb-mute)] uppercase">
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
