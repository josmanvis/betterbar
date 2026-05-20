import { useEffect, useRef, useState } from "react";
import { DockItem } from "../types";
import { getAppIcon } from "../tauri-bridge";

/** Resolve bundleId → base64 icon data URL. Caches across re-renders so each
 *  bundle is fetched at most once per session. */
export function useAppIcons(items: DockItem[]): Record<string, string> {
  const [icons, setIcons] = useState<Record<string, string>>({});
  const cacheRef = useRef<Record<string, "loading" | "miss" | string>>({});

  useEffect(() => {
    let cancelled = false;
    console.log("[BB.useAppIcons] effect run, items:",
      items.map((i) => ({ id: i.id, bundleId: i.bundleId, hasIcon: !!i.icon })));

    items.forEach(async (item) => {
      if (!item.bundleId || item.icon) return;
      if (cacheRef.current[item.bundleId]) {
        console.log("[BB.useAppIcons] cached", item.bundleId, "→", cacheRef.current[item.bundleId].slice(0, 40));
        return;
      }
      cacheRef.current[item.bundleId] = "loading";
      console.log("[BB.useAppIcons] fetching", item.bundleId);
      try {
        const data = await getAppIcon(item.bundleId);
        if (cancelled) return;
        if (data) {
          console.log("[BB.useAppIcons] resolved", item.bundleId, "len:", data.length);
          cacheRef.current[item.bundleId] = data;
          setIcons((prev) => ({ ...prev, [item.bundleId!]: data }));
        } else {
          console.log("[BB.useAppIcons] miss", item.bundleId);
          cacheRef.current[item.bundleId] = "miss";
        }
      } catch (e) {
        cacheRef.current[item.bundleId!] = "miss";
        console.error("[BetterBar] icon load failed for", item.bundleId, e);
      }
    });

    return () => { cancelled = true; };
  }, [items]);

  return icons;
}
