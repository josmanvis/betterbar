import { useState, useEffect, useCallback } from "react";
import { getSpaces, switchToSpace } from "../tauri-bridge";
import type { SpaceInfo } from "../types";

export function useSpaces() {
  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await getSpaces();
      setSpaces(list);
    } catch (e) {
      console.error("[Spaces] Failed to fetch spaces:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  return spaces;
}

export function SpacesIndicator({
  spaces,
  isVertical,
}: {
  spaces: SpaceInfo[];
  isVertical: boolean;
}) {
  const [switching, setSwitching] = useState<number | null>(null);

  const handleClick = async (id: number) => {
    setSwitching(id);
    try {
      await switchToSpace(id);
    } catch (e) {
      console.error("[Spaces] Failed to switch:", e);
    }
    setTimeout(() => setSwitching(null), 300);
  };

  return (
    <div
      className={`flex items-center justify-center gap-1.5 px-1.5 ${
        isVertical ? "flex-col w-full py-1" : "flex-row h-full"
      }`}
    >
      {spaces.map((space) => {
        const active = space.is_current;
        const isSwitching = switching === space.id;
        return (
          <button
            key={space.id}
            onClick={() => handleClick(space.id)}
            title={space.name}
            className={`
              relative shrink-0 rounded-sm transition-all duration-150 cursor-pointer
              ${isVertical ? "w-[18px] h-[30px]" : "w-[32px] h-[20px]"}
              ${active ? "scale-110" : "hover:scale-105"}
              ${
                isSwitching
                  ? "animate-pulse"
                  : ""
              }
            `}
            style={{
              background: active
                ? "var(--bb-accent)"
                : "var(--bb-pane-2)",
              border: active
                ? "1px solid var(--bb-accent)"
                : "1px solid var(--bb-line)",
              boxShadow: active
                ? "inset 0 0 0 1px rgba(0,0,0,0.4)"
                : "inset 0 0 0 1px rgba(255,255,255,0.03)",
            }}
          >
            {!active && (
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, transparent 45%, rgba(255,255,255,0.08) 50%, transparent 55%)",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
