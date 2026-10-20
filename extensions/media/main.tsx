import React, { useState, useEffect } from "react";
export const name = "Media";
const strings = { previous: "Previous track", next: "Next track", pause: "Pause", play: "Play", settings: "Playback controls for the current track in Music or Spotify." };

export default function MediaExtension({ isVertical = false }: { isVertical?: boolean }) {
  const [info, setInfo] = useState({
    title: "",
    artist: "",
    album: "",
    is_playing: false,
    app_name: "",
    available: false,
  });
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        // @ts-ignore
        const data = await invoke("get_music_info");
        if (!cancelled) setInfo(data);
      } catch {}
    }
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!info.available) return null;

  const handleAction = (cmd: string) => async (e: any) => {
    e.stopPropagation();
    try {
      // @ts-ignore
      await invoke(cmd);
    } catch {}
  };

  const actionClass = `flex items-center justify-center text-[var(--bb-dim)] hover:text-[var(--bb-accent)] transition-colors ${isVertical ? "w-full py-0.5" : "h-full px-0.5"}`;

  const showInfo = hovered && (info.title || info.artist);

  const controls = (
    <div className={`flex ${isVertical ? "flex-col items-center" : "flex-row items-center"} gap-0.5`}>
      <button onClick={handleAction("music_previous")} className={actionClass} title={strings.previous}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
      </button>
      <button onClick={handleAction("music_play_pause")} className={`${actionClass} ${info.is_playing ? "text-[var(--bb-accent)]" : ""}`} title={info.is_playing ? strings.pause : strings.play}>
        {info.is_playing ? (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        ) : (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>
      <button onClick={handleAction("music_next")} className={actionClass} title={strings.next}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
      </button>
    </div>
  );

  return (
    <div
      className={`${isVertical ? "w-full flex flex-col py-1.5 px-1 gap-1" : "h-full flex px-4 gap-2"} items-center cursor-pointer`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        // @ts-ignore
        invoke("focus_music_app", { appName: info.app_name }).catch(()=>{});
      }}
    >
      {showInfo && (
        <div className={`flex flex-col leading-tight min-w-0 ${isVertical ? "text-center max-w-[60px]" : "max-w-[120px]"}`}>
          <div className={`text-[9px] text-[var(--bb-text)] truncate`}>{info.title}</div>
          <div className={`text-[8px] text-[var(--bb-mute)] truncate`}>{info.artist}</div>
        </div>
      )}
      {controls}
    </div>
  );
}

export function Settings() { return <p style={{ fontSize: 11, lineHeight: 1.8, color: "var(--bb-dim)" }}>{strings.settings}</p>; }
