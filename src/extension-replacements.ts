import type { BetterBarConfig, SectionId } from "./types";

// These extensions own their feature whenever they are installed, even disabled.
export const EXTENSION_REPLACEMENTS = [
  { name: "time", section: "time", flag: "showClocks", label: "TIME" },
  { name: "media", section: "music", flag: "showMusic", label: "MEDIA" },
  { name: "power", section: "battery", flag: "showBattery", label: "POWER" },
] as const;

export function installedReplacements(names: string[]) {
  return EXTENSION_REPLACEMENTS.filter(replacement => names.includes(replacement.name));
}

/** Carry existing visibility into the replacement once, then respect its toggle. */
export function migrateExtensionReplacements(config: BetterBarConfig, installed: string[]): BetterBarConfig {
  const pending = installedReplacements(installed).filter(replacement => !config.extensionReplacements?.includes(replacement.name));
  if (!pending.length) return config;
  return { ...config,
    enabledExtensions: [...new Set([...config.enabledExtensions, ...pending.filter(replacement => config[replacement.flag]).map(replacement => replacement.name)])],
    extensionReplacements: [...new Set([...(config.extensionReplacements || []), ...pending.map(replacement => replacement.name)])],
  };
}

export function replacementForSection(section: SectionId, names: string[]) {
  return installedReplacements(names).find(replacement => replacement.section === section);
}
