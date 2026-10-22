export type SettingsTab = "layout" | "style" | "icons" | "sets" | "sections" | "extensions" | "behaviour" | "permissions" | "about";
export interface SettingsSearchEntry { id: string; tab: SettingsTab; label: string; section: string; keywords: string; }

const groups: [SettingsTab, string, string, string][] = [
  ["style", "THEME", "Settings appearance", "automatic light dark system macos settings appearance"],
  ["layout", "POSITION", "Bar position", "top bottom left right edge dock placement"],
  ["layout", "BAR SIZE", "Bar size", "height width thickness size"],
  ["layout", "CONTENT SCALE", "Content scale", "zoom size text icons"],
  ["layout", "BAR LENGTH", "Bar length", "auto custom edge width length"],
  ["style", "THEME", "Background opacity", "transparent transparency translucent background opacity"],
  ["style", "THEME", "Colors and presets", "theme palette accent color panels text borders warnings errors terminal midnight paper"],
  ["style", "THEME", "Backdrop blur", "blur glass background"],
  ["style", "THEME", "Corners and borders", "radius round corner border width shadow scanline texture"],
  ["style", "ACTIVE APP", "Active app", "focus active window indicator highlight border halo glow spotlight tile pill underline lift pulse strength dim inactive"],
  ["icons", "ICON SOURCE", "Icon style", "glyph native app icon letters"],
  ["icons", "ICON SOURCE", "Grayscale idle", "grayscale gray desaturate idle icons"],
  ["icons", "ICON SOURCE", "Show running", "running unpinned apps"],
  ["icons", "ICON SOURCE", "Hide self", "hide betterbar own icon"],
  ["icons", "ICON BOX", "Icon box", "chrome background tile border padding corner preset outline soft contrast"],
  ["icons", "ICON BOX", "Show icon borders", "hide remove disable border frame outline icons hover running"],
  ["sets", "SETS", "Apps and sets", "app add remove rename hide sets groups switch"],
  ["sets", "PINNED APPS", "Pinned apps", "pin app add remove rename custom icon display label hide order"],
  ["sets", "TIMEZONES", "Clocks and timezones", "clock time date timezone seconds 12 24 hour format labels"],
  ["sections", "BAR ORDER", "Bar order", "move arrange sort resort reorder drag position extension pinned independent anywhere"],
  ["sections", "VISIBLE SECTIONS", "Visible bar items", "show hide visibility features sections dock terminal music clock power battery caffeine awake settings cog simulator spaces"],
  ["extensions", "ON YOUR BAR", "Show extensions", "enable disable extensions widgets plugins"],
  ["extensions", "ON YOUR BAR", "Show extension labels", "extension names labels text hide caption icons"],
  ["extensions", "ON YOUR BAR", "Show extension borders", "hide remove disable border frame outline widget cpu monitor"],
  ["behaviour", "GENERAL", "Free float", "float free window drag move reserve position"],
  ["behaviour", "GENERAL", "Auto-hide", "auto hide reveal mouse pointer"],
  ["behaviour", "GENERAL", "Show labels", "app names labels text captions"],
  ["behaviour", "GENERAL", "Prevent overlap", "windows overlap screen space reserve"],
  ["behaviour", "GENERAL", "Strict overlap", "enforce windows resize overlap"],
  ["behaviour", "OPEN ON LOGIN", "Open on login", "startup launch login start automatically"],
  ["behaviour", "WINDOW GROUPING", "App grouping", "group ungroup running window app grouping"],
  ["behaviour", "TERMINAL", "Default terminal", "shell terminal command default open terminal"],
  ["permissions", "PERMISSIONS", "Accessibility", "permission access denied focus windows floatnote"],
  ["permissions", "PERMISSIONS", "Screen Recording", "permission screen capture thumbnails previews"],
  ["permissions", "PERMISSIONS", "App signature", "sign re-sign resign restart repair signature permissions"],
  ["permissions", "PERMISSIONS", "Calendars", "calendar access permission connect agenda apple"],
  ["about", "SOFTWARE UPDATE", "Software update", "version releases changelog download install update"],
  ["about", "BACKUP & SHARE", "Backup and share", "export import reset config settings clipboard backup"],
];

export function settingsSearchEntries(extensions: { name: string; displayName: string }[]): SettingsSearchEntry[] {
  const entries = groups.map(([tab, section, label, keywords], index) => ({ id: `setting-${index}`, tab, section, label, keywords }));
  const time = extensions.find(ext => ext.name === "time");
  if (time) Object.assign(entries.find(entry => entry.section === "TIMEZONES")!, { tab: "extensions", section: time.displayName, label: "Clocks and timezones" });
  const aliases: Record<string, string> = { "bkr-pipelines": "bkr gitlab pipeline failed failing failure warning build ci branches tags refresh glab", "gitlab-mrs": "gitlab merge requests mr count badge authored assigned reviewer refresh host glab", "apps-drawer": "launcher library launch panel pins favorites recents columns density", "apple-calendar": "calendar agenda events schedule days calendars permission titles",
    "focus-timer": "focus pomodoro timer minutes break session duration", "system-monitor": "cpu memory ram metrics performance graph refresh", time: "clock timezone format seconds date labels spacing" };
  for (const ext of extensions) entries.push({ id: `extension-${ext.name}`, tab: "extensions", section: ext.displayName, label: ext.displayName,
    keywords: `extension widget plugin appearance color opacity size labels border ${ext.name} ${aliases[ext.name] || ""}` });
  return entries;
}

export function searchSettings(query: string, entries: SettingsSearchEntry[]) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return entries.map(entry => {
    const label = entry.label.toLocaleLowerCase();
    const labelWords = label.split(/[^\p{L}\p{N}]+/u);
    const haystack = `${label} ${entry.keywords} ${entry.tab}`.toLocaleLowerCase();
    const tokens = haystack.split(/[^\p{L}\p{N}]+/u);
    return { entry, score: words.every(word => haystack.includes(word)) ? words.reduce((score, word) => score + (labelWords.includes(word) ? 8 : label.includes(word) ? 4 : tokens.includes(word) ? 3 : 1), 0) : 0 };
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score).map(result => result.entry);
}
