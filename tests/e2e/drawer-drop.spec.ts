import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { test, expect, installRuntime, savedConfig, seed } from "./fixtures";

const extension = { name: "apps-drawer", display_name: "Drawer", content: readFileSync("extensions/apps-drawer/main.tsx", "utf8") };
const folder = { name: "Dropped Projects", path: "/tmp/Dropped Projects", kind: "folder" as const };
const file = { name: "Report $(literal) 日本語.txt", path: "/tmp/Report $(literal) 日本語.txt", kind: "file" as const };
const app = { name: "Example", path: "/Applications/Example.app", kind: "app" as const, bundleId: "com.example.App" };
const previousFolder = { name: "Existing folder", path: "/tmp/Existing folder" };
const preferences = { pins: [previousFolder.path], folders: [previousFolder], density: "compact", closeOnLaunch: false, accentColor: "#336699", doubleTapCommand: false };

async function nativeEvent(page: Page, type: string, paths = [folder.path, file.path, app.path]) {
  await expect.poll(() => page.evaluate(() => (window as any).__nativeListeners.includes("tauri://drag-leave"))).toBe(true);
  await page.evaluate(({ type, paths }) => (window as any).__TAURI_INTERNALS__.invoke("plugin:event|emit", {
    event: `tauri://${type}`, payload: { paths, position: { x: 30, y: 30 } },
  }), { type, paths });
}

for (const layout of ["library", "panel"]) {
  test(`Drawer ${layout}: Finder drops pin files and folders, persist, search, open, unpin and remove`, async ({ page }, testInfo) => {
    await installRuntime(page, { label: "ext_apps_drawer", registryExtensions: [extension], pickedTargets: [folder, file, app],
      installedApps: [{ name: app.name, path: app.path, bundle_id: app.bundleId }] });
    await page.addInitScript(prefs => {
      if (!localStorage.getItem("bb-apps-drawer-settings")) localStorage.setItem("bb-apps-drawer-settings", JSON.stringify(prefs));
    }, { ...preferences, layout });
    await page.goto("/?ext=apps-drawer");
    await expect(page.getByRole("heading", { name: "Drawer", exact: true })).toBeVisible();
    const originalConfig = await savedConfig(page);
    await page.getByRole("searchbox").fill("no matches");
    await nativeEvent(page, "drag-enter");
    await expect(page.getByText("Drop files and folders to pin", { exact: true })).toBeVisible();
    await nativeEvent(page, "blur");
    await testInfo.attach(`drawer-drop-${layout}.png`, { body: await page.screenshot(), contentType: "image/png" });
    await nativeEvent(page, "drag-drop");
    await expect(page.getByRole("button", { name: "Pinned", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("searchbox")).toHaveValue("");
    for (const target of [folder, file, app]) await expect(page.getByRole("button", { name: target.name, exact: true })).toHaveCount(1);
    await nativeEvent(page, "drag-drop");
    await expect(page.getByText("Pinning items…", { exact: true })).toHaveCount(0);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("bb-apps-drawer-settings")!));
    expect(saved).toMatchObject({ ...preferences, folders: [previousFolder, { name: folder.name, path: folder.path }], layout, pins: [previousFolder.path, folder.path, file.path, app.path] });
    expect(saved.folders).toEqual([previousFolder, { name: folder.name, path: folder.path }]);
    expect(saved.shortcuts).toEqual([file, app]);
    expect(await savedConfig(page)).toEqual(originalConfig);
    let calls = await page.evaluate(() => (window as any).__ipcCalls);
    expect(calls.find((call: any) => call.cmd === "inspect_dock_paths").args.paths).toEqual([folder.path, file.path, app.path]);
    expect(calls.some((call: any) => ["launch_app", "plugin:window|hide", "inspect_bar_drop", "install_dropped_extension"].includes(call.cmd))).toBe(false);
    await expect.poll(() => page.evaluate(path => (window as any).__ipcCalls.some((call: any) => call.cmd === "get_path_icon" && call.args.path === path), file.path)).toBe(true);
    await page.reload();
    await page.getByRole("button", { name: "Pinned", exact: true }).click();
    await expect(page.getByRole("button", { name: file.name, exact: true })).toBeVisible();
    await page.getByRole("searchbox").fill("日本語");
    await page.getByRole("searchbox").press("Enter");
    await expect.poll(() => page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "launch_app").map((call: any) => call.args.path))).toEqual([file.path]);
    await page.getByRole("button", { name: "Pinned", exact: true }).click();
    await page.getByRole("button", { name: folder.name, exact: true }).click();
    await page.getByRole("button", { name: "Edit pins", exact: true }).click();
    await page.getByRole("button", { name: `Unpin ${file.name}`, exact: true }).click();
    await expect(page.getByRole("button", { name: `Pin ${file.name}`, exact: true })).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: `Remove shortcut ${file.name}`, exact: true }).click();
    await expect(page.getByRole("button", { name: file.name, exact: true })).toHaveCount(0);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("bb-apps-drawer-settings")!));
    expect(after.pins).not.toContain(file.path); expect(after.shortcuts).toEqual([app]);
    expect((await savedConfig(page)).sets).toEqual(seed.sets);
    calls = await page.evaluate(() => (window as any).__ipcCalls);
    expect(calls.filter((call: any) => call.cmd === "launch_app").map((call: any) => call.args.path)).toEqual([file.path, folder.path]);
    expect(calls.some((call: any) => call.cmd === "plugin:window|hide")).toBe(false);
  });
}

test("leaving a Finder drag clears the highlight without changing preferences", async ({ page }) => {
  await installRuntime(page, { label: "ext_apps_drawer", registryExtensions: [extension] });
  await page.goto("/?ext=apps-drawer");
  await nativeEvent(page, "drag-enter");
  await nativeEvent(page, "drag-over");
  await expect(page.getByText("Drop files and folders to pin", { exact: true })).toBeVisible();
  await nativeEvent(page, "drag-leave");
  await expect(page.getByText("Drop files and folders to pin", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("bb-apps-drawer-settings"))).toBeNull();
});

test("invalid drops report an error and preserve existing shortcuts", async ({ page }) => {
  await installRuntime(page, { label: "ext_apps_drawer", registryExtensions: [extension], inspectFailure: true });
  await page.addInitScript(prefs => localStorage.setItem("bb-apps-drawer-settings", JSON.stringify(prefs)), preferences);
  await page.goto("/?ext=apps-drawer");
  await nativeEvent(page, "drag-drop");
  await expect(page.getByRole("alert")).toContainText("Could not pin these items");
  await expect(page.getByText("Pinning items…", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-apps-drawer-settings")!))).toEqual(preferences);
});

test("queued drops merge both batches and edits made during inspection; blur keeps Drawer open", async ({ page }) => {
  await installRuntime(page, { label: "ext_apps_drawer", registryExtensions: [extension], pickedTargets: [folder, file], inspectDelayMs: 600 });
  await page.goto("/?ext=apps-drawer");
  await nativeEvent(page, "drag-drop", [folder.path]);
  await expect(page.getByText("Pinning items…", { exact: true })).toBeVisible();
  await nativeEvent(page, "drag-drop", [file.path]);
  await page.evaluate(() => localStorage.setItem("bb-apps-drawer-settings", JSON.stringify({ pins: ["/tmp/Another pin"], showLabels: false })));
  await nativeEvent(page, "blur");
  await expect(page.getByText("Pinning items…", { exact: true })).toHaveCount(0);
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("bb-apps-drawer-settings")!));
  expect(prefs.pins).toEqual(["/tmp/Another pin", folder.path, file.path]);
  expect(prefs.showLabels).toBe(false);
  expect(await page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "plugin:window|hide"))).toHaveLength(0);
});

test("a drag beginning in Finder keeps Drawer open before hover, while an outside click still dismisses", async ({ page }) => {
  await installRuntime(page, { label: "ext_apps_drawer", registryExtensions: [extension], pickedTargets: [file] });
  await page.goto("/?ext=apps-drawer");
  await page.evaluate(() => { (window as any).__primaryMouseDown = true; });
  await nativeEvent(page, "blur");
  // Wait for several button checks: the drag has not entered Drawer yet.
  await expect.poll(() => page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "is_primary_mouse_button_down").length)).toBeGreaterThan(2);
  expect(await page.evaluate(() => (window as any).__ipcCalls.some((call: any) => call.cmd === "plugin:window|hide"))).toBe(false);
  await nativeEvent(page, "drag-enter", [file.path]);
  await page.evaluate(() => { (window as any).__primaryMouseDown = false; });
  await nativeEvent(page, "drag-drop", [file.path]);
  await expect(page.getByRole("button", { name: file.name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__ipcCalls.some((call: any) => call.cmd === "plugin:window|hide"))).toBe(false);
  // A fresh mount has no drag grace period; an ordinary outside click closes it.
  await page.reload();
  await nativeEvent(page, "blur");
  await expect.poll(() => page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "plugin:window|hide").length)).toBe(1);
});

test("releasing the outside click without entering Drawer ends the dismissal deferral", async ({ page }) => {
  await installRuntime(page, { label: "ext_apps_drawer", registryExtensions: [extension] });
  await page.goto("/?ext=apps-drawer");
  await page.evaluate(() => { (window as any).__primaryMouseDown = true; });
  await nativeEvent(page, "blur");
  await expect.poll(() => page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "is_primary_mouse_button_down").length)).toBeGreaterThan(1);
  await page.evaluate(() => { (window as any).__primaryMouseDown = false; });
  await expect.poll(() => page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "plugin:window|hide").length)).toBe(1);
});
