import { useEffect, useState } from "react";

/** Native lists contain flat records. Preserve order, active flags, and titles. */
export function reuseUnchangedRecords<T extends object>(previous: T[], next: T[]): T[] {
  if (previous.length !== next.length) return next;
  const unchanged = next.every((item, index) => {
    const before = previous[index] as Record<string, unknown>;
    const after = item as Record<string, unknown>;
    const keys = Object.keys(after);
    return Object.keys(before).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(before, key) && Object.is(before[key], after[key]));
  });
  return unchanged ? previous : next;
}

export function usePollingList<T extends object>(fetchList: () => Promise<T[]>, interval: number, enabled = true, onError?: (error: unknown) => void) {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    if (!enabled) { setItems(previous => previous.length ? [] : previous); return; }
    let cancelled = false;
    let pending = false;
    const poll = async () => {
      if (cancelled || pending) return;
      pending = true;
      try {
        const next = await fetchList();
        if (!cancelled) setItems(previous => reuseUnchangedRecords(previous, next));
      } catch (error) { if (!cancelled) onError?.(error); }
      finally { pending = false; }
    };
    poll();
    const timer = setInterval(poll, interval);
    return () => { cancelled = true; clearInterval(timer); };
  }, [fetchList, interval, enabled, onError]);
  return items;
}
