import { Coffee } from "@phosphor-icons/react";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { useCaffeine } from "../hooks/useCaffeine";
import { openSettingsWindow } from "../tauri-bridge";

interface CaffeineIndicatorProps {
  isVertical: boolean;
}

export function CaffeineIndicator({ isVertical }: CaffeineIndicatorProps) {
  const { status, toggle, activate, deactivate } = useCaffeine();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggle().catch(console.error);
  };

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const items: (MenuItem | PredefinedMenuItem)[] = [
      await MenuItem.new({
        text: status.active && !status.minutes_remaining ? "● Keep Awake: Indefinitely" : "Keep Awake: Indefinitely",
        action: () => activate(undefined).catch(console.error),
      }),
      await MenuItem.new({
        text: status.active && status.minutes_remaining === 15 ? "● Keep Awake: 15 Minutes" : "Keep Awake: 15 Minutes",
        action: () => activate(15).catch(console.error),
      }),
      await MenuItem.new({
        text: status.active && status.minutes_remaining === 30 ? "● Keep Awake: 30 Minutes" : "Keep Awake: 30 Minutes",
        action: () => activate(30).catch(console.error),
      }),
      await MenuItem.new({
        text: status.active && status.minutes_remaining === 60 ? "● Keep Awake: 1 Hour" : "Keep Awake: 1 Hour",
        action: () => activate(60).catch(console.error),
      }),
      await MenuItem.new({
        text: status.active && status.minutes_remaining === 120 ? "● Keep Awake: 2 Hours" : "Keep Awake: 2 Hours",
        action: () => activate(120).catch(console.error),
      }),
      await MenuItem.new({
        text: status.active && status.minutes_remaining === 300 ? "● Keep Awake: 5 Hours" : "Keep Awake: 5 Hours",
        action: () => activate(300).catch(console.error),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        text: "Deactivate (Allow Sleep)",
        enabled: status.active,
        action: () => deactivate().catch(console.error),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        text: "BetterBar Settings...",
        action: () => openSettingsWindow().catch(console.error),
      }),
    ];

    const menu = await Menu.new({ items });
    await menu.popup();
  };

  const remainingLabel = status.minutes_remaining
    ? status.minutes_remaining >= 60
      ? `${Math.floor(status.minutes_remaining / 60)}h${status.minutes_remaining % 60 ? `${status.minutes_remaining % 60}m` : ""}`
      : `${status.minutes_remaining}m`
    : null;

  const tooltip = status.active
    ? `Caffeine: Active (${remainingLabel || "Indefinite"})\nClick to deactivate • Right-click for timer`
    : "Caffeine: Inactive (Normal Sleep)\nClick to keep Mac awake • Right-click for timer";

  if (isVertical) {
    return (
      <div
        className="w-full flex flex-col items-center py-1.5 px-1 cursor-pointer transition-colors group select-none"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        title={tooltip}
      >
        <div className="relative flex flex-col items-center justify-center">
          <Coffee
            size={14}
            weight={status.active ? "fill" : "bold"}
            className={`transition-colors ${
              status.active
                ? "text-[var(--bb-accent)] drop-shadow-[0_0_4px_var(--bb-accent)]"
                : "text-[var(--bb-dim)] group-hover:text-[var(--bb-text)]"
            }`}
          />
          {status.active && (
            <span className="text-[7px] font-mono leading-none tracking-tighter text-[var(--bb-accent)] mt-0.5 font-bold">
              {remainingLabel || "ON"}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full flex items-center px-1.5 cursor-pointer transition-colors group select-none"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={tooltip}
    >
      <div className="flex items-center gap-1">
        <Coffee
          size={14}
          weight={status.active ? "fill" : "bold"}
          className={`transition-colors ${
            status.active
              ? "text-[var(--bb-accent)] drop-shadow-[0_0_4px_var(--bb-accent)]"
              : "text-[var(--bb-dim)] group-hover:text-[var(--bb-text)]"
          }`}
        />
        {status.active && (
          <span className="text-[9px] font-mono leading-none tracking-tight text-[var(--bb-accent)] font-bold">
            {remainingLabel || "ON"}
          </span>
        )}
      </div>
    </div>
  );
}
