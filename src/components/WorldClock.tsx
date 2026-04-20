import { useState, useEffect } from "react";

const CITIES = [
  { code: "NYC", tz: "America/New_York" },
  { code: "SF",  tz: "America/Los_Angeles" },
  { code: "IND", tz: "Asia/Kolkata" },
  { code: "ESP", tz: "Europe/Madrid" },
  { code: "BZ",  tz: "America/Belize" },
] as const;

function formatTime(tz: string, now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
}

interface WorldClockProps {
  isVertical: boolean;
}

export function WorldClock({ isVertical }: WorldClockProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Sync to the next minute boundary, then tick every minute
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
      <div className="w-full px-1.5 py-2 flex flex-col gap-[3px]">
        {CITIES.map(({ code, tz }) => {
          const time = formatTime(tz, now);
          // Split "3:24 PM" → ["3:24", "PM"]
          const [hm, ampm] = time.split(" ");
          return (
            <div key={code} className="flex items-baseline justify-between px-1">
              <span className="text-[9px] font-semibold tracking-wide text-zinc-500 uppercase leading-none w-7">
                {code}
              </span>
              <span className="text-[10px] font-medium text-zinc-300 leading-none tabular-nums">
                {hm}
                <span className="text-[8px] text-zinc-500 ml-[2px]">{ampm}</span>
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // Horizontal layout — show as a horizontal row with less info
  return (
    <div className="h-full flex items-center gap-3 px-2">
      {CITIES.map(({ code, tz }) => {
        const time = formatTime(tz, now);
        const [hm, ampm] = time.split(" ");
        return (
          <div key={code} className="flex flex-col items-center leading-none">
            <span className="text-[8px] font-semibold tracking-wide text-zinc-500 uppercase mb-[2px]">
              {code}
            </span>
            <span className="text-[10px] font-medium text-zinc-300 tabular-nums">
              {hm}<span className="text-[8px] text-zinc-500 ml-[1px]">{ampm}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
