import { useState, useEffect } from "react";
import { MusicInfo } from "../types";
import { getMusicInfo } from "../tauri-bridge";

const POLL_MS = 2_000;

export function useMusic(): MusicInfo {
  const [info, setInfo] = useState<MusicInfo>({
    title: "",
    artist: "",
    album: "",
    is_playing: false,
    app_name: "",
    available: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await getMusicInfo();
        if (!cancelled) setInfo(data);
      } catch {}
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return info;
}
