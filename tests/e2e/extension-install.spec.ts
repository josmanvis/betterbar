import type { Page } from "@playwright/test";
import { test, expect, installRuntime, savedConfig, seed } from "./fixtures";
const source = (version: string) => `export const name = "Drop Sample"; export const version = "${version}"; export default function Sample(){return <button>Drop Sample ${version}</button>;}`;
const registry = [{ name: "drop-sample", display_name: "Drop Sample", content: source("1.0.0") }];
const plan = (change: string, incoming = "1.1.0", previous: string | null = "1.0.0") => ({ token: "synthetic-drop-plan", name: "drop-sample", displayName: "Drop Sample", incomingVersion: incoming, installedVersion: previous, existing: change !== "install", change, content: source(incoming) });
async function drop(page: Page) {
  await expect(page.locator(".bb-scanlines").first()).toBeVisible();
  await page.evaluate(() => (window as any).__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://drag-drop", payload: { paths: ["/synthetic/drop-sample.betterbar.tsx"], position: { x: 20, y: 20 } } }));
}

test("a new dropped extension installs, enables, appears immediately, and survives reload", async ({ page }) => {
  await installRuntime(page, { label: "main", config: { ...seed, showExtensions: false, enabledExtensions: [] }, registryExtensions: [], dropPlans: [plan("install")] });
  await page.goto("/"); await drop(page);
  await expect(page.getByRole("button", { name: "Drop Sample 1.1.0", exact: true })).toBeVisible();
  const config = await savedConfig(page);
  expect(config.showExtensions).toBe(true); expect(config.enabledExtensions).toContain("drop-sample");
  expect(config.sets).toEqual(seed.sets);
  expect(await page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "open_settings_window"))).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Drop Sample 1.1.0", exact: true })).toBeVisible();
});

test("dropping a regular file reveals Docked Apps even when sections were hidden", async ({ page }) => {
  const registryExtensions = [{name:"docked-apps",display_name:"Docked Apps",content:'import {NativeSection} from "@betterbar/api"; export default function Docked(){return <NativeSection name="docked-apps"/>;}'}];
  await installRuntime(page, {label:"main",config:{...seed,showDockArea:false,showExtensions:false,enabledExtensions:[]},registryExtensions,pickedTargets:[{name:"Dropped.txt",path:"/synthetic/Dropped.txt",kind:"file"}]});
  await page.goto("/"); await drop(page);
  await expect(page.getByRole("button",{name:"Dropped.txt",exact:true})).toBeVisible();
  const config=await savedConfig(page); expect(config.enabledExtensions).toContain("docked-apps"); expect(config.showExtensions).toBe(true);
});

test("unsupported extension imports are rejected before installation", async ({ page }) => {
  const invalid={...plan("install"),content:'import Thing from "not-a-betterbar-module"; '+source("1.1.0").replace('<button>Drop Sample 1.1.0</button>','<Thing/>')};
  await installRuntime(page,{label:"main",config:{...seed,enabledExtensions:[]},registryExtensions:[],dropPlans:[invalid]});
  await page.goto("/"); await drop(page);
  await expect(page.getByRole("alert")).toContainText("does not support");
  expect(await page.evaluate(() => (window as any).__ipcCalls.some((call:any)=>call.cmd==="install_dropped_extension"))).toBe(false);
});

for (const [change, incoming, action] of [["upgrade", "1.1.0", "Upgrade extension"], ["downgrade", "0.9.0", "Downgrade extension"], ["same", "1.0.0", "Replace same version"]]) {
  test(`a dropped ${change} waits for version confirmation before changing the running extension`, async ({ page, context }, testInfo) => {
    const config = { ...seed, enabledExtensions: ["drop-sample"] };
    const dropPlans = [{ ...plan(change, incoming), content: "window.__pendingExtensionExecuted = true; " + source(incoming) }];
    await installRuntime(page, { label: "main", config, registryExtensions: registry, dropPlans });
    const settings = await context.newPage();
    await installRuntime(settings, { config, registryExtensions: registry, dropPlans });
    await page.goto("/"); await settings.goto("/"); await drop(page);
    const dialog = settings.getByRole("dialog");
    await expect(dialog).toContainText("Installed version"); await expect(dialog).toContainText("1.0.0"); await expect(dialog).toContainText(incoming);
    expect(await page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "install_dropped_extension"))).toHaveLength(0);
    expect(await page.evaluate(() => (window as any).__pendingExtensionExecuted)).toBeUndefined();
    await expect(page.getByRole("button", { name: "Drop Sample 1.0.0", exact: true })).toBeVisible();
    await expect(settings.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await settings.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: action, exact: true })).toBeFocused();
    await testInfo.attach(`${change}-confirmation.png`, { body: await settings.screenshot(), contentType: "image/png" });
    await dialog.getByRole("button", { name: action, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Drop Sample ${incoming}`, exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as any).__pendingExtensionExecuted)).toBe(true);
    expect(await settings.evaluate(() => (window as any).__ipcCalls.some((call: any) => call.cmd === "install_dropped_extension" && call.args.confirm === true))).toBe(true);
    expect(await settings.evaluate(() => (window as any).__unexpectedIPC)).toEqual([]);
    await settings.close();
  });
}

test("cancelling an unversioned replacement leaves the installed extension untouched and stores no source", async ({ page, context }) => {
  const config = { ...seed, enabledExtensions: ["drop-sample"] };
  const dropPlans = [{ ...plan("replace"), incomingVersion: null, installedVersion: null }];
  await installRuntime(page, { label: "main", config, registryExtensions: registry, dropPlans });
  const settings = await context.newPage();
  await installRuntime(settings, { config, registryExtensions: registry, dropPlans });
  await page.goto("/"); await settings.goto("/"); await drop(page);
  await expect(settings.getByRole("dialog")).toContainText("lack a comparable version");
  const review = await settings.evaluate(() => JSON.parse(localStorage.getItem("betterbar-extension-install-review")!));
  expect(review[0]).not.toHaveProperty("content");
  await settings.keyboard.press("Escape");
  await expect(settings.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Drop Sample 1.0.0", exact: true })).toBeVisible();
  expect(await settings.evaluate(() => (window as any).__ipcCalls.some((call: any) => call.cmd === "install_dropped_extension"))).toBe(false);
  expect(await settings.evaluate(() => (window as any).__unexpectedIPC)).toEqual([]);
  await settings.close();
});

test("invalid extension syntax never installs or executes", async ({ page }) => {
  const invalid = { ...plan("install"), content: 'window.__extensionExecuted = true; export const name = "Bad"; export default function Broken( { return <button>;' };
  await installRuntime(page, { label: "main", config: { ...seed, enabledExtensions: [] }, registryExtensions: [], dropPlans: [invalid] });
  await page.goto("/"); await drop(page);
  await expect(page.getByRole("alert")).toContainText("invalid TypeScript or JSX");
  expect(await page.evaluate(() => (window as any).__extensionExecuted)).toBeUndefined();
  expect(await page.evaluate(() => (window as any).__ipcCalls.some((call: any) => call.cmd === "install_dropped_extension"))).toBe(false);
});

test("an update conflict remains reviewable and never removes the old extension", async ({ page, context }) => {
  const config = { ...seed, enabledExtensions: ["drop-sample"] }; const dropPlans = [plan("upgrade")];
  await installRuntime(page, { label: "main", config, registryExtensions: registry, dropPlans });
  const settings = await context.newPage();
  await installRuntime(settings, { config, registryExtensions: registry, dropPlans, installFailure: true });
  await page.goto("/"); await settings.goto("/"); await drop(page);
  await settings.getByRole("button", { name: "Upgrade extension", exact: true }).click();
  await expect(settings.getByRole("alert")).toContainText("may have changed");
  await expect(page.getByRole("button", { name: "Drop Sample 1.0.0", exact: true })).toBeVisible();
  await settings.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await settings.evaluate(() => (window as any).__unexpectedIPC)).toEqual([]);
  await settings.close();
});
