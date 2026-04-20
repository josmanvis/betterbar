import { BatteryInfo } from "../types";

interface BatteryIndicatorProps {
  battery: BatteryInfo;
  isVertical: boolean;
}

export function BatteryIndicator({ battery, isVertical }: BatteryIndicatorProps) {
  if (!battery.available) return null;

  const pct = Math.round(battery.percentage);

  const color =
    battery.is_charging ? "text-emerald-400" :
    pct <= 10           ? "text-red-400" :
    pct <= 20           ? "text-amber-400" :
                          "text-zinc-400";

  const fillColor =
    battery.is_charging ? "#34d399" :
    pct <= 10           ? "#f87171" :
    pct <= 20           ? "#fbbf24" :
                          "#71717a";

  const fillWidth = Math.max(1, (pct / 100) * 16); // 16px max inner fill

  if (isVertical) {
    return (
      <div className="w-full flex flex-col items-center gap-1 py-1.5">
        {/* Battery icon */}
        <BatteryIcon fillWidth={fillWidth} fillColor={fillColor} isCharging={battery.is_charging} />
        <span className={`text-[10px] font-medium tabular-nums leading-none ${color}`}>
          {pct}%
        </span>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center gap-1.5 px-2">
      <BatteryIcon fillWidth={fillWidth} fillColor={fillColor} isCharging={battery.is_charging} />
      <span className={`text-[10px] font-medium tabular-nums ${color}`}>{pct}%</span>
    </div>
  );
}

function BatteryIcon({
  fillWidth,
  fillColor,
  isCharging,
}: {
  fillWidth: number;
  fillColor: string;
  isCharging: boolean;
}) {
  return (
    <svg width="22" height="11" viewBox="0 0 22 11" fill="none">
      {/* Body */}
      <rect x="0.5" y="0.5" width="18" height="10" rx="2.5" stroke={fillColor} strokeOpacity="0.5" />
      {/* Positive terminal */}
      <path d="M19.5 3.5v4a1.5 1.5 0 0 1 0-4z" fill={fillColor} fillOpacity="0.4" />
      {/* Fill level */}
      <rect x="2" y="2" width={fillWidth} height="7" rx="1.5" fill={fillColor} />
      {/* Charging bolt */}
      {isCharging && (
        <path
          d="M10 2.5 L8 5.5h3L9 8.5"
          stroke="white"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
