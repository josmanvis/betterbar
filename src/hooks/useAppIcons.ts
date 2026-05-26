import { useEffect, useMemo, useRef, useState } from "react";
import { DockItem } from "../types";
import { getAppIcon } from "../tauri-bridge";

/** Resolve bundleId → base64 icon data URL. Each bundle is fetched at most once
 *  per session and cached. */
export function useAppIcons(items: DockItem[]): Record<string, string> {
  const [icons, setIcons] = useState<Record<string, string>>({});
  // Per-bundle fetch status, so we never fire a duplicate request.
  const statusRef = useRef<Record<string, "loading" | "done" | "miss">>({});

  // Unique bundle ids that still need a native icon (items with a custom icon
  // are skipped). Derived as a stable string key so the effect below only runs
  // when the actual set changes — not on every render. Re-running on every
  // render previously cancelled in-flight fetches and left them stuck.
  const bundleIds = useMemo(
    () => Array.from(new Set(items.filter((i) => i.bundleId && !i.icon).map((i) => i.bundleId!))),
    [items]
  );
  const key = bundleIds.join("|");

  useEffect(() => {
    bundleIds.forEach(async (bundleId) => {
      if (statusRef.current[bundleId]) return; // loading | done | miss
      statusRef.current[bundleId] = "loading";
      try {
        const data = await getAppIcon(bundleId);
        if (data) {
          statusRef.current[bundleId] = "done";
          setIcons((prev) => ({ ...prev, [bundleId]: data }));
        } else {
          statusRef.current[bundleId] = "miss";
        }
      } catch (e) {
        statusRef.current[bundleId] = "miss";
        console.error("[BetterBar] icon load failed for", bundleId, e);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return icons;
}
