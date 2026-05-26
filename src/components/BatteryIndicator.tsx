import { Lightning } from "@phosphor-icons/react";
import { BatteryInfo } from "../types";

interface BatteryIndicatorProps {
  battery: BatteryInfo;
  isVertical: boolean;
}

export function BatteryIndicator({ battery, isVertical }: BatteryIndicatorProps) {
  if (!battery.available) return null;

  const pct = Math.round(battery.percentage);

  const tone =
    battery.is_charging ? "var(--bb-accent)" :
    pct <= 10           ? "var(--bb-bad)"    :
    pct <= 20           ? "var(--bb-warn)"   :
                          "var(--bb-text)";

  if (isVertical) {
    return (
      <div className="w-full flex flex-col items-center py-1.5 px-1.5">
        <span className="text-[9px] tabular-nums leading-none flex items-center gap-0.5" style={{ color: tone }}>
          {battery.is_charging && <Lightning size={8} weight="fill" />}
          <span>{pct}</span>
          <span className="text-[var(--bb-mute)]">%</span>
        </span>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center px-2">
      <span className="text-[10px] tabular-nums flex items-center gap-0.5" style={{ color: tone }}>
        {battery.is_charging && <Lightning size={9} weight="fill" />}
        <span>{pct}</span>
        <span className="text-[var(--bb-mute)]">%</span>
      </span>
    </div>
  );
}
