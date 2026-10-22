import { test, expect, installRuntime, savedConfig, seed } from "./fixtures";
import { readFileSync } from "node:fs";

const extension = { name: "apps-drawer", display_name: "Drawer", content: readFileSync("extensions/apps-drawer/main.tsx", "utf8") };
const folder = { name: "Project Files", path: "/tmp/Project Files", kind: "folder" as const };
const app = { name: "Example", path: "/Applications/Example.app", bundle_id: "com.example.App" };

for (const layout of ["library", "panel"]) {
  test(`Drawer ${layout}: add, search, pin, open, persist and remove a folder`, async ({ page }, testInfo) => {
    await installRuntime(page, { label: "ext_apps_drawer", registryExtensions: [extension], installedApps: [app], pickedTargets: [folder, folder] });
    await page.addInitScript(layout => {
      if (!localStorage.getItem("bb-apps-drawer-settings")) localStorage.setItem("bb-apps-drawer-settings", JSON.stringify({ layout, closeOnLaunch: false, dismissOnBlur: false }));
    }, layout);
    await page.goto("/?ext=apps-drawer");
    await expect(page.getByRole("heading", { name: "Drawer", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add folders", exact: true }).click();
    const item = page.getByRole("button", { name: folder.name, exact: true });
    await expect(item).toHaveCount(1);
    await expect(item).toBeVisible();
    await page.getByRole("button", { name: "Add folders", exact: true }).click();
    await expect(item).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Add folders", exact: true })).toBeEnabled();
    const search = page.getByRole("searchbox", { name: "Search apps, files and folders" });
    await search.fill("project");
    await search.press("Enter");
    await expect.poll(() => page.evaluate(() => (window as any).__ipcCalls.filter((c: any) => c.cmd === "launch_app").map((c: any) => c.args.path))).toContain(folder.path);
    await expect(search).toHaveValue("project");
    await page.getByRole("button", { name: "Edit pins", exact: true }).click();
    await page.getByRole("button", { name: `Pin ${folder.name}`, exact: true }).click();
    await expect(page.getByRole("button", { name: `Unpin ${folder.name}`, exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: /^Folders/ }).click();
    await expect(item).toBeVisible();
    await testInfo.attach(`drawer-folders-${layout}.png`, { body: await page.screenshot(), contentType: "image/png" });
    await page.getByRole("button", { name: "Edit pins", exact: true }).click();
    await page.getByRole("button", { name: `Remove folder ${folder.name}`, exact: true }).click();
    await expect(item).toHaveCount(0);
    const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem("bb-apps-drawer-settings")!));
    expect(preferences.folders).toEqual([]);
    expect(preferences.pins).not.toContain(folder.path);
    expect((await savedConfig(page)).sets).toEqual(seed.sets);
  });
}

test("Drawer includes active bar folders and mixed recents without changing bar settings", async ({ page }) => {
  const config = { ...seed, activeSetId: "test", sets: [{ ...seed.sets[0], items: [...seed.sets[0].items, { ...folder, id: "folder", order: 1 }] }] };
  await installRuntime(page, { config, label: "ext_apps_drawer", registryExtensions: [extension], installedApps: [app] });
  await page.addInitScript(folder => {
    localStorage.setItem("bb-apps-drawer-settings", JSON.stringify({ layout: "library", closeOnLaunch: false, folders: [folder] }));
    localStorage.setItem("bb-apps-drawer-recents", JSON.stringify([folder.path, "/Applications/Example.app"]));
  }, folder);
  await page.goto("/?ext=apps-drawer");
  await expect(page.getByRole("button", { name: folder.name, exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Recent", exact: true }).click();
  await expect(page.getByRole("button", { name: folder.name, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: app.name, exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("Project");
  await page.getByRole("searchbox").press("ArrowDown");
  await expect(page.getByRole("button", { name: folder.name, exact: true })).toBeFocused();
  expect((await savedConfig(page)).sets).toEqual(config.sets);
  expect((await savedConfig(page)).enabledExtensions).toEqual(config.enabledExtensions);
});

test("Drawer stays open during the native folder picker; cancel and errors keep shortcuts", async ({ page }) => {
  await installRuntime(page, { label: "ext_apps_drawer", registryExtensions: [extension], pickerDelayMs: 500, pickerFailure: true });
  await page.goto("/?ext=apps-drawer");
  await page.getByRole("button", { name: "Add folders", exact: true }).click();
  await page.evaluate(() => (window as any).__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://blur", payload: null }));
  await expect(page.getByRole("alert")).toContainText("Could not add folders");
  expect(await page.evaluate(() => (window as any).__ipcCalls.filter((c: any) => c.cmd === "plugin:window|hide"))).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem("bb-apps-drawer-settings"))).toBeNull();
});

test("Drawer picker cancellation leaves preferences unchanged", async ({ page }) => {
  await installRuntime(page, { label: "ext_apps_drawer", registryExtensions: [extension], pickedTargets: [] });
  await page.goto("/?ext=apps-drawer");
  await page.getByRole("button", { name: "Add folders", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add folders", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("bb-apps-drawer-settings"))).toBeNull();
});

test("Drawer retains an unavailable folder and reports a readable error", async ({ page, runtimeErrors }) => {
  await installRuntime(page, { label: "ext_apps_drawer", registryExtensions: [extension], launchFailure: true });
  await page.addInitScript(folder => localStorage.setItem("bb-apps-drawer-settings", JSON.stringify({ folders: [folder] })), folder);
  await page.goto("/?ext=apps-drawer");
  await page.getByRole("button", { name: folder.name, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("It may have moved or been removed.");
  await expect(page.getByRole("button", { name: folder.name, exact: true })).toBeVisible();
  expect(runtimeErrors.splice(0)).toEqual(["Drawer operation failed."]);
});


test("Drawer folder opens respect close-on-open and populate recents", async ({ page }) => {
  await installRuntime(page, { label: "ext_apps_drawer", registryExtensions: [extension] });
  await page.addInitScript(folder => localStorage.setItem("bb-apps-drawer-settings", JSON.stringify({ folders: [folder] })), folder);
  await page.goto("/?ext=apps-drawer");
  await page.getByRole("button", { name: folder.name, exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__ipcCalls.filter((c: any) => c.cmd === "plugin:window|hide").length)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bb-apps-drawer-recents")!))).toEqual([folder.path]);
});

test("Drawer folders drag to the bar using their literal path without opening", async ({ page }) => {
  await installRuntime(page, { label: "ext_apps_drawer", registryExtensions: [extension], dragDelayMs: 300 });
  await page.addInitScript(folder => localStorage.setItem("bb-apps-drawer-settings", JSON.stringify({ folders: [folder] })), folder);
  await page.goto("/?ext=apps-drawer");
  const item = page.getByRole("button", { name: folder.name, exact: true });
  const box = await item.boundingBox();
  await page.mouse.move(box!.x + 15, box!.y + 20); await page.mouse.down();
  await page.mouse.move(box!.x + 40, box!.y + 20, { steps: 5 });
  await expect(item).toHaveAttribute("data-dragging", "true");
  await page.mouse.up();
  await expect(item).not.toHaveAttribute("data-dragging", "true");
  const calls = await page.evaluate(() => (window as any).__ipcCalls);
  expect(calls.find((c: any) => c.cmd === "start_extension_drag").args.paths).toEqual([folder.path]);
  expect(calls.filter((c: any) => ["launch_app", "plugin:window|hide"].includes(c.cmd))).toHaveLength(0);
});
