import { useState, useEffect } from "react";
import { DockPosition } from "../types";
import {
  checkScreenRecordingPermission,
  requestScreenRecordingPermission,
  getWindowThumbnail,
} from "../tauri-bridge";

interface WindowPreviewProps {
  appName: string;
  pid: number;
  position: DockPosition;
}

export function WindowPreview({ appName, pid }: WindowPreviewProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [permitted, setPermitted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ok = await checkScreenRecordingPermission();
      if (cancelled) return;
      setPermitted(ok);
      if (!ok) return;

      const result = await getWindowThumbnail(pid);
      if (cancelled) return;
      setThumbnail(result?.image ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [pid]);

  return (
    <div className="flex flex-col items-center gap-2 min-w-[100px]">
      {permitted === false ? (
        <div className="text-center space-y-2">
          <p className="text-[11px] text-zinc-400 leading-tight">
            Screen Recording<br />required for previews
          </p>
          <button
            className="text-[11px] bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-md text-white transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              requestScreenRecordingPermission();
            }}
          >
            Open Settings
          </button>
        </div>
      ) : thumbnail ? (
        <img
          src={thumbnail}
          alt={appName}
          className="rounded-lg object-contain shadow-inner max-w-[280px]"
          draggable={false}
        />
      ) : null}
      <span className="text-xs font-medium text-white">{appName}</span>
    </div>
  );
}
