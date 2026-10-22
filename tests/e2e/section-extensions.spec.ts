import { test, expect, installRuntime, savedConfig, seed } from "./fixtures";
const sections = ["docked-apps", "opened-apps", "terminal", "spaces", "caffeine", "app-sets", "simulators", "settings"];
const registryExtensions = sections.map(name => ({ name, display_name: name.replace(/-/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()), content: `import {NativeSection} from "@betterbar/api"; export default function Section(){return <NativeSection name="${name}"/>;}` }));
registryExtensions[0].content += ' import {DockSettings} from "@betterbar/api"; export function Settings(props){return <DockSettings {...props}/>;}';
const config = { ...seed, showLabels: true, showRunningApps: true, enabledExtensions: [] };
const runningApps = [{ name: "Notes", bundle_id: "com.apple.Notes", pid: 101, is_active: true }, { name: "Safari", bundle_id: "com.apple.Safari", pid: 102, is_active: false }];
const targets = [{ name: "Work files", path: "/synthetic/Work files", kind: "folder" as const }, { name: "Plan.txt", path: "/synthetic/Plan.txt", kind: "file" as const }];

test("section extensions retain workspace, caffeine, simulator, terminal, set, and settings controls", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 2400, height: 1000 });
  await installRuntime(page, { label: "main", registryExtensions, spaces: [{ id: 1, name: "Desktop 1", is_current: true }, { id: 2, name: "Desktop 2", is_current: false }], config: {
    ...config, barSize: 48, showCaffeine: true, showSimIcons: true, showSpaces: true,
    sets: [...config.sets, { id: "personal", name: "Personal", items: [] }],
  } });
  await page.goto("/");
  for (const name of sections) await expect(page.locator(`[data-bb-item="extension:${name}"]`)).toBeVisible();
  await expect(page.locator('[data-bb-item="terminal"], [data-bb-item="spaces"], [data-bb-item="caffeine"], [data-bb-item="sets"], [data-bb-item="sims"], [data-bb-item="cog"]')).toHaveCount(0);
  await page.getByTitle("Desktop 2", { exact: true }).click();
  await page.getByTitle(/Caffeine: Inactive/).click();
  await page.getByTitle("iPad", { exact: true }).click();
  await testInfo.attach("native-section-controls.png", {body:await page.screenshot(),contentType:"image/png"});
  await testInfo.attach("terminal-geometry.json", {body:JSON.stringify(await page.getByTitle("Run Terminal Command",{exact:true}).evaluate(node => ({rect:node.getBoundingClientRect().toJSON(), parents:[node.parentElement?.outerHTML.slice(0,400),node.parentElement?.parentElement?.outerHTML.slice(0,400)]}))),contentType:"application/json"});
  await page.getByTitle("Run Terminal Command", { exact: true }).click();
  await expect(page.getByPlaceholder("Enter shell command...")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTitle("Personal", { exact: true }).click();
  await expect.poll(async () => (await savedConfig(page)).activeSetId).toBe("personal");
  await page.getByTitle("COG", { exact: true }).click();
  const calls = await page.evaluate(() => (window as any).__ipcCalls.map((call: any) => call.cmd));
  for (const command of ["switch_to_space", "toggle_caffeine", "launch_simulator", "open_settings_window"]) expect(calls).toContain(command);
});

test("Docked Apps and Opened Apps migrate separately, retain native actions, and toggle independently", async ({ page, context }, testInfo) => {
  await installRuntime(page, { label: "main", config, registryExtensions, runningApps });
  await page.goto("/");
  const docked = page.locator('[data-bb-item="extension:docked-apps"]');
  const opened = page.locator('[data-bb-item="extension:opened-apps"]');
  await expect(docked.getByRole("button", { name: "Notes", exact: true })).toBeVisible();
  await expect(opened.getByRole("button", { name: "Safari", exact: true })).toBeVisible();
  await expect(page.locator('[data-bb-item^="app:"]')).toHaveCount(0);
  await expect(page.locator('[data-bb-item="run"]')).toHaveCount(0);
  await opened.getByRole("button", { name: "Safari", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__ipcCalls.some((call: any) => call.cmd === "focus_app" && call.args.bundleId === "com.apple.Safari"))).toBe(true);
  const settings = await context.newPage();
  await installRuntime(settings, { config, registryExtensions, runningApps });
  await settings.goto("/");
  await settings.getByRole("tab", { name: "Extensions", exact: true }).click();
  await settings.getByRole("switch", { name: "Disable Docked Apps", exact: false }).click();
  await expect(docked).toHaveCount(0);
  await expect(opened).toBeVisible();
  await page.reload();
  await expect(opened).toBeVisible();
  await expect(docked).toHaveCount(0);
  expect((await savedConfig(page)).sets).toEqual(config.sets);
  await settings.getByRole("switch", { name: "Enable Docked Apps", exact: false }).click();
  await expect(docked).toBeVisible();
  await testInfo.attach("separate-app-extensions.png", { body: await page.screenshot(), contentType: "image/png" });
  expect(await settings.evaluate(() => (window as any).__unexpectedIPC)).toEqual([]);
  await settings.close();
});

test("native file and folder picks survive restart, deduplicate, reorder, open, and undock", async ({ page, context }) => {
  await installRuntime(page, { config, registryExtensions, pickedTargets: targets });
  await page.goto("/");
  await page.getByRole("tab", { name: "Extensions", exact: true }).click();
  await page.getByRole("button", { name: "Configure Docked Apps", exact: true }).click();
  await page.getByRole("button", { name: "Dock folders…", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undock Work files", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dock files…", exact: true }).click();
  expect((await savedConfig(page)).sets[0].items).toHaveLength(3);
  await page.getByRole("button", { name: "Move Plan.txt earlier", exact: true }).click();
  expect((await savedConfig(page)).sets[0].items.map(item => item.name)).toEqual(["Notes", "Plan.txt", "Work files"]);
  const bar = await context.newPage();
  await installRuntime(bar, { label: "main", config, registryExtensions });
  await bar.goto("/");
  for (const name of ["Plan.txt", "Work files"]) await bar.getByRole("button", { name, exact: true }).click();
  const paths = await bar.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "launch_app").map((call: any) => call.args.path));
  expect(paths).toEqual(["/synthetic/Plan.txt", "/synthetic/Work files"]);
  await bar.reload();
  await expect(bar.getByRole("button", { name: "Work files", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undock Plan.txt", exact: true }).click();
  await expect(bar.getByRole("button", { name: "Plan.txt", exact: true })).toHaveCount(0);
  expect((await savedConfig(page)).sets[0].items.map(item => item.name)).toEqual(["Notes", "Work files"]);
  expect(await bar.evaluate(() => (window as any).__unexpectedIPC)).toEqual([]);
  await bar.close();
});

test("Finder drops dock native file and folder paths", async ({ page }) => {
  await installRuntime(page, { label: "main", config, registryExtensions, pickedTargets: targets });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Notes", exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://drag-drop", payload: { paths: ["/synthetic/Work files", "/synthetic/Plan.txt"], position: { x: 20, y: 20 } } }));
  await expect(page.getByRole("button", { name: "Plan.txt", exact: true })).toBeVisible();
  expect((await savedConfig(page)).sets[0].items.map(item => item.kind)).toEqual([undefined, "folder", "file"]);
});

test("file picker errors are actionable and leave saved app sets intact", async ({ page }) => {
  await installRuntime(page, { config, registryExtensions, pickerFailure: true });
  await page.goto("/");
  await page.getByRole("tab", { name: "Apps & Sets", exact: true }).click();
  await page.getByRole("button", { name: "Dock files…", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Check that they are still available");
  expect((await savedConfig(page)).sets).toEqual(config.sets);
});

test("enabling and reloading another extension preserves mounted extension state", async ({ page, context }) => {
  const registry = [{ name: "counter", display_name: "Counter", content: 'import React from "react"; export default function Counter(){const [n,set]=React.useState(0); return <button onClick={()=>set(n+1)}>Count {n}</button>;}' }, { name: "extra", display_name: "Extra", content: 'export default function Extra(){return <button>Extra</button>;}' }];
  await installRuntime(page, { label: "main", registryExtensions: registry, config: { ...seed, enabledExtensions: ["counter"] } });
  await page.goto("/");
  await page.getByRole("button", { name: "Count 0", exact: true }).click();
  const settings = await context.newPage();
  await installRuntime(settings, { registryExtensions: registry });
  await settings.goto("/");
  await settings.getByRole("tab", { name: "Extensions", exact: true }).click();
  await settings.getByRole("switch", { name: "Enable Extra", exact: true }).click();
  await expect(page.getByRole("button", { name: "Extra", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Count 1", exact: true })).toBeVisible();
  await settings.getByRole("button", { name: "Reload extensions", exact: true }).click();
  await expect(settings.getByRole("status")).toContainText("Extensions reloaded.");
  await expect(page.getByRole("button", { name: "Count 1", exact: true })).toBeVisible();
  expect(await settings.evaluate(() => (window as any).__unexpectedIPC)).toEqual([]);
  await settings.close();
});
