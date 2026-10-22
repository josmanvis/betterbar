import { DEFAULT_SECTION_ORDER, type BarItemId, type BetterBarConfig, type DockItem, type SectionId } from "./types";
import { EXTENSION_REPLACEMENTS, installedReplacements } from "./extension-replacements";

export function appMatchesDockItem(item: Pick<DockItem, "name" | "bundleId" | "kind">, app: { name: string; bundle_id: string }) {
  if (item.kind === "file" || item.kind === "folder") return false;
  return item.bundleId ? item.bundleId === app.bundle_id : item.name.toLocaleLowerCase() === app.name.toLocaleLowerCase();
}

export const extensionItemId = (name: string): BarItemId => `extension:${encodeURIComponent(name)}`;
export const appItemId = (set: string, item: string): BarItemId => `app:${encodeURIComponent(set)}:${encodeURIComponent(item)}`;
export function extensionName(id: string): string | null {
  try { return id.startsWith("extension:") && id.length > 10 ? decodeURIComponent(id.slice(10)) : null; } catch { return null; }
}
export function isBarItemId(id: unknown): id is BarItemId {
  if (typeof id !== "string") return false;
  if (DEFAULT_SECTION_ORDER.includes(id as SectionId) || extensionName(id)) return true;
  if (!id.startsWith("app:")) return false;
  const parts = id.split(":");
  try { return parts.length === 3 && parts.slice(1).every(part => !!decodeURIComponent(part)); } catch { return false; }
}
export function sanitizeBarOrder(value: unknown): BarItemId[] | undefined {
  return Array.isArray(value) ? [...new Set(value.filter(isBarItemId))] : undefined;
}

/** Stable slots survive toggles and extension reloads; legacy groups expand once. */
export function resolveBarOrder(config: BetterBarConfig, installed: string[]): BarItemId[] {
  const apps = config.sets.flatMap(set => [...set.items].sort((a, b) => a.order - b.order).map(item => appItemId(set.id, item.id)));
  const knownApps = new Set(apps);
  const replacements = installedReplacements(installed);
  const seed: BarItemId[] = [];
  for (const section of config.sectionOrder) {
    const replacement = replacements.find(item => item.section === section);
    if (section === "pin") seed.push(...apps, replacement ? extensionItemId(replacement.name) : section);
    else if (section === "extensions") seed.push(...installed.filter(name => !replacements.some(item => item.name === name)).map(extensionItemId), section);
    else seed.push(replacement ? extensionItemId(replacement.name) : section);
  }
  const saved = sanitizeBarOrder(config.barOrder);
  const source = saved?.length ? saved : seed;
  const result: BarItemId[] = [];
  for (let id of source) {
    if (id.startsWith("app:") && !knownApps.has(id)) continue;
    if (id.startsWith("app:") && replacements.some(item => item.name === "docked-apps") && !source.includes(extensionItemId("docked-apps")) && !result.includes(extensionItemId("docked-apps"))) result.push(extensionItemId("docked-apps"));
    const replacement = replacements.find(item => item.section === id);
    if (replacement) {
      const extension = extensionItemId(replacement.name);
      if (source.includes(extension)) continue;
      id = extension;
    }
    const removed = EXTENSION_REPLACEMENTS.find(item => extensionItemId(item.name) === id && !installed.includes(item.name));
    if (removed) id = removed.section;
    if (!result.includes(id)) result.push(id);
  }
  function insert(id: BarItemId, anchor?: BarItemId) {
    if (result.includes(id)) return;
    const index = anchor ? result.indexOf(anchor) : -1;
    result.splice(index < 0 ? result.length : index, 0, id);
  }
  for (const id of apps) insert(id, "pin");
  for (const name of installed) insert(extensionItemId(name), "extensions");
  for (const id of seed) insert(id);
  return result;
}
export function migrateBarOrder(config: BetterBarConfig, installed: string[]): BetterBarConfig {
  const barOrder = resolveBarOrder(config, installed);
  return JSON.stringify(config.barOrder) === JSON.stringify(barOrder) ? config : { ...config, barOrder };
}
export function moveBarItem(order: BarItemId[], source: BarItemId, target: BarItemId): BarItemId[] {
  const from = order.indexOf(source), to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order]; next.splice(from, 1); next.splice(to, 0, source); return next;
}

/** Keep app management and the bar in agreement without losing hidden apps. */
export function applyBarOrder(config: BetterBarConfig, value: BarItemId[]): BetterBarConfig {
  const barOrder = sanitizeBarOrder(value) || [];
  const rank = new Map(barOrder.map((id, index) => [id, index]));
  const sets = config.sets.map(set => {
    const current = [...set.items].sort((a, b) => a.order - b.order);
    const next = [...current].sort((a, b) => (rank.get(appItemId(set.id, a.id)) ?? Infinity) - (rank.get(appItemId(set.id, b.id)) ?? Infinity));
    return next.some((item, index) => item.id !== current[index].id)
      ? { ...set, items: next.map((item, order) => ({ ...item, order })) } : set;
  });
  return { ...config, barOrder, sets };
}

export interface BarItem {
  id: BarItemId; label: string; kind: "extension" | "app" | "native"; enabled: boolean;
  section?: SectionId; extension?: string; app?: DockItem;
}
const labels: Partial<Record<SectionId, string>> = {
  terminal: "Terminal", run: "Running apps", spacer: "Flexible space", time: "Clocks", music: "Music", caffeine: "Caffeine",
  battery: "Battery", sets: "Set switcher", sims: "Simulators", cog: "Settings", spaces: "Spaces",
};
const flags: Partial<Record<SectionId, keyof BetterBarConfig>> = {
  terminal: "showTerminalIcon", run: "showRunningApps", time: "showClocks", music: "showMusic", caffeine: "showCaffeine",
  battery: "showBattery", sets: "showSetSwitcher", sims: "showSimIcons", cog: "showSettingsCog", spaces: "showSpaces",
};
export function barItems(config: BetterBarConfig, extensions: { name: string; displayName: string }[]): BarItem[] {
  const activeSet = config.sets.find(set => set.id === config.activeSetId) || config.sets[0];
  return resolveBarOrder(config, extensions.map(extension => extension.name)).flatMap((id): BarItem[] => {
    const name = extensionName(id);
    if (name) {
      const extension = extensions.find(extension => extension.name === name);
      return extension ? [{ id, label: extension.displayName.replace(/\b\w/g, c => c.toUpperCase()), kind: "extension", extension: name,
        enabled: config.showExtensions && config.enabledExtensions.includes(name) }] : [];
    }
    if (id.startsWith("app:")) {
      const app = activeSet?.items.find(item => appItemId(activeSet.id, item.id) === id);
      if (extensions.some(extension => extension.name === "docked-apps")) return [];
      return app ? [{ id, label: app.name, kind: "app", app, enabled: config.showDockArea && !app.hidden }] : [];
    }
    if (id === "pin" || id === "extensions") return [];
    const section = id as SectionId;
    const flag = flags[section];
    return [{ id, section, kind: "native", label: labels[section] || section, enabled: (!flag || !!config[flag])
      && (section !== "run" || config.showDockArea) && (section !== "spacer" || !config.freeFloat || config.barLengthMode !== "auto") }];
  });
}
export function barItemStyle(config: BetterBarConfig, id: BarItemId) {
  const name = extensionName(id);
  const legacySection = name ? EXTENSION_REPLACEMENTS.find(item => item.name === name)?.section || "extensions" : id.startsWith("app:") ? "pin" : id as SectionId;
  return config.sectionStyles?.[legacySection];
}
