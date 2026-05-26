import { useState } from "react";
import { Play, Pause, SkipForward, SkipBack } from "@phosphor-icons/react";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { MusicInfo } from "../types";
import { musicPlayPause, musicNext, musicPrevious, focusMusicApp, openSettingsWindow } from "../tauri-bridge";

interface MusicIndicatorProps {
  music: MusicInfo;
  isVertical: boolean;
}

export function MusicIndicator({ music, isVertical }: MusicIndicatorProps) {
  const [hovered, setHovered] = useState(false);
  if (!music.available) return null;

  const handleOpenApp = () => {
    focusMusicApp(music.app_name).catch(() => {});
  };

  async function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const item = await MenuItem.new({
      text: "BetterBar Settings",
      action: () => openSettingsWindow().catch(console.error),
    });
    const menu = await Menu.new({ items: [item] });
    await menu.popup();
  }

  const actionClass = `flex items-center justify-center text-[var(--bb-dim)] hover:text-[var(--bb-accent)] transition-colors ${
    isVertical ? "w-full py-0.5" : "h-full px-0.5"
  }`;

  const controls = (
    <div className={`flex ${isVertical ? "flex-col items-center" : "flex-row items-center"} gap-0.5`}>
      <button
        onClick={(e) => { e.stopPropagation(); musicPrevious().catch(() => {}); }}
        className={actionClass}
        title="Previous track"
      >
        <SkipBack size={9} weight="bold" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); musicPlayPause().catch(() => {}); }}
        className={`${actionClass} ${music.is_playing ? "text-[var(--bb-accent)]" : ""}`}
        title={music.is_playing ? "Pause" : "Play"}
      >
        {music.is_playing ? <Pause size={9} weight="fill" /> : <Play size={9} weight="fill" />}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); musicNext().catch(() => {}); }}
        className={actionClass}
        title="Next track"
      >
        <SkipForward size={9} weight="bold" />
      </button>
    </div>
  );

  const showInfo = hovered && (music.title || music.artist);

  if (isVertical) {
    return (
      <div
        className="w-full flex flex-col items-center py-1.5 px-1 gap-1 cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleOpenApp}
        onContextMenu={handleContextMenu}
      >
        {showInfo && (
          <>
            <div className="text-[8px] leading-tight text-center text-[var(--bb-text)] max-w-[60px] truncate">
              {music.title}
            </div>
            <div className="text-[7px] leading-tight text-center text-[var(--bb-mute)] max-w-[60px] truncate">
              {music.artist}
            </div>
          </>
        )}
        {controls}
      </div>
    );
  }

  return (
    <div
      className="h-full flex items-center px-1.5 gap-1.5 cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleOpenApp}
      onContextMenu={handleContextMenu}
    >
      {showInfo && (
        <div className="flex flex-col leading-tight min-w-0 max-w-[120px]">
          <div className="text-[9px] text-[var(--bb-text)] truncate">
            {music.title}
          </div>
          <div className="text-[8px] text-[var(--bb-mute)] truncate">
            {music.artist}
          </div>
        </div>
      )}
      {controls}
    </div>
  );
}
