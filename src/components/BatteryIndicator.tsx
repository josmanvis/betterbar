import { Lightning } from "@phosphor-icons/react";
import { BatteryInfo } from "../types";

interface BatteryIndicatorProps {
  battery: BatteryInfo;
  isVertical: boolean;
}

const SEGMENTS = 8;

export function BatteryIndicator({ battery, isVertical }: BatteryIndicatorProps) {
  if (!battery.available) return null;

  const pct = Math.round(battery.percentage);
  const filled = Math.max(0, Math.min(SEGMENTS, Math.round((pct / 100) * SEGMENTS)));

  const tone =
    battery.is_charging ? "var(--bb-accent)" :
    pct <= 10           ? "var(--bb-bad)"    :
    pct <= 20           ? "var(--bb-warn)"   :
                          "var(--bb-text)";

  if (isVertical) {
    return (
      <div className="w-full flex flex-col items-center gap-1 py-1.5 px-1.5">
        <div className="flex flex-col items-center gap-px" style={{ color: tone }}>
          {Array.from({ length: SEGMENTS }).map((_, i) => {
            // top segment is the highest charge level
            const segIdx = SEGMENTS - 1 - i;
            const isFilled = segIdx < filled;
            return (
              <div
                key={i}
                className="w-3 h-[3px]"
                style={{ background: isFilled ? "currentColor" : "var(--bb-line-2)" }}
              />
            );
          })}
        </div>
        <span className="text-[9px] tabular-nums leading-none flex items-center gap-0.5" style={{ color: tone }}>
          {battery.is_charging && <Lightning size={8} weight="fill" />}
          <span>{pct}</span>
          <span className="text-[var(--bb-mute)]">%</span>
        </span>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center gap-1.5 px-2">
      <div className="flex flex-row items-center gap-px" style={{ color: tone }}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const isFilled = i < filled;
          return (
            <div
              key={i}
              className="w-[3px] h-3"
              style={{ background: isFilled ? "currentColor" : "var(--bb-line-2)" }}
            />
          );
        })}
      </div>
      <span className="text-[10px] tabular-nums flex items-center gap-0.5" style={{ color: tone }}>
        {battery.is_charging && <Lightning size={9} weight="fill" />}
        <span>{pct}</span>
        <span className="text-[var(--bb-mute)]">%</span>
      </span>
    </div>
  );
}
