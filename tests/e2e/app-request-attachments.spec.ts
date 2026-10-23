import { readFileSync } from "node:fs";
import { test, expect, installRuntime, seed } from "./fixtures";
const content = readFileSync(new URL("../../extensions/app-requests/main.tsx", import.meta.url), "utf8");
const registryExtensions = [{ name: "app-requests", display_name: "App Requests", content }];
const label = "ext_app_requests" as const;
const pickedTargets = [
  { name: "screenshot.png", path: "/Reference Files/screenshot.png", kind: "file" as const },
  { name: "notes '$(literal)'.txt", path: "/Reference Files/notes '$(literal)'.txt", kind: "file" as const },
];
async function drop(page: import("@playwright/test").Page, paths: string[], type = "drop") {
  await expect(page.getByRole("button", { name: "Attach files", exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as any).__nativeListeners)).toContain("tauri://drag-leave");
  await page.evaluate(({ paths, type }) => {
    const win = window as any;
    win.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: `tauri://drag-${type}`, payload: { paths, position: { x: 100, y: 220 } } });
  }, { paths, type });
}

test("browsing, native drops, deduplication, removal and draft restoration", async ({ page }, testInfo) => {
  await installRuntime(page, { label, registryExtensions, pickedTargets });
  await page.goto("/?ext=app-requests");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await expect(page.locator(".ar-attachment-list li")).toHaveCount(2);
  await drop(page, [pickedTargets[0].path], "enter");
  await expect(page.getByText("Drop files to attach", { exact: true })).toBeVisible();
  await drop(page, [pickedTargets[0].path, "/Reference Files/design.pdf"]);
  await expect(page.locator(".ar-attachment-list li")).toHaveCount(3);
  await page.getByRole("button", { name: "Remove screenshot.png", exact: true }).click();
  await page.getByLabel("What would you like to build or change?").fill("Use these references");
  await page.reload();
  await expect(page.locator(".ar-attachment-list li")).toHaveCount(2);
  await expect(page.getByLabel("What would you like to build or change?")).toHaveValue("Use these references");
  await page.screenshot({ path: testInfo.outputPath("attachments-light.png") });
  await testInfo.attach("attachments-light.png", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByRole("button", { name: "Start request" }).click();
  await expect(page.locator(".ar-attachment-list li")).toHaveCount(0);
  const calls = await page.evaluate(() => (window as any).__ipcCalls);
  const snapshot = calls.find((call: any) => call.cmd === "snapshot_request_attachments");
  expect(snapshot.args.paths).toEqual([pickedTargets[1].path, "/Reference Files/design.pdf"]);
  const start = calls.find((call: any) => call.cmd === "start_app_request");
  expect(start.args.prompt).toContain("Use these references\n\nATTACHED FILES");
  expect(start.args.prompt).toContain("/private/snapshots/1-notes '$(literal)'.txt");
  expect(start.args.prompt).toContain("/private/snapshots/2-design.pdf");
  expect(start.args.prompt).not.toContain("/Reference Files/");
  expect(calls.some((call: any) => call.cmd === "discard_request_attachments")).toBe(false);
  await expect(page.locator(".ar-task-prompt")).toHaveText("Use these references");
});

test("failed submission cleans snapshots and retains prompt and selections", async ({ page }) => {
  await installRuntime(page, { label, registryExtensions, pickedTargets, appRequestStartFailure: true });
  await page.goto("/?ext=app-requests");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await page.getByLabel("What would you like to build or change?").fill("Keep my draft");
  await page.getByRole("button", { name: "Start request" }).click();
  await expect(page.getByRole("alert")).toContainText("Choose an existing working folder");
  await expect(page.locator(".ar-attachment-list li")).toHaveCount(2);
  await expect(page.getByLabel("What would you like to build or change?")).toHaveValue("Keep my draft");
  await expect.poll(() => page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "discard_request_attachments").length)).toBe(1);
});

test("unavailable files, folders, oversized selection and picker cancellation preserve draft", async ({ page }) => {
  await installRuntime(page, { label, registryExtensions });
  await page.goto("/?ext=app-requests");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await expect(page.locator(".ar-attachment-list li")).toHaveCount(0);
  await drop(page, ["/Reference Files/keep.txt"]);
  await expect(page.locator(".ar-attachment-list li")).toHaveCount(1);
  await drop(page, ["/Reference Files/folder"]);
  await expect(page.getByRole("alert")).toContainText("Attach individual files");
  await drop(page, Array.from({ length: 11 }, (_, index) => `/Reference Files/${index}.txt`));
  await expect(page.getByRole("alert")).toContainText("Attach up to 10 files");
  await page.evaluate(() => { (window as any).__attachmentFailure = true; });
  await page.getByLabel("What would you like to build or change?").fill("Retry later");
  await page.getByRole("button", { name: "Start request" }).click();
  await expect(page.getByRole("alert")).toContainText("no longer available");
  await expect(page.locator(".ar-attachment-list li")).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__ipcCalls.some((call: any) => call.cmd === "start_app_request"))).toBe(false);
});

test("compact dark attachments wrap without horizontal overflow", async ({ page }, testInfo) => {
  await installRuntime(page, { label, registryExtensions, pickedTargets, config: { ...seed, enabledExtensions: ["app-requests"], settingsAppearance: "dark" } });
  await page.setViewportSize({ width: 720, height: 620 });
  await page.goto("/?ext=app-requests");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await expect(page.locator(".ar-attachment-list li")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("attachments-dark.png") });
  await testInfo.attach("attachments-dark.png", { body: await page.screenshot(), contentType: "image/png" });
});


test("consecutive native drops retain both batches while inspection is pending", async ({ page }) => {
  await installRuntime(page, { label, registryExtensions });
  await page.goto("/?ext=app-requests");
  await expect.poll(() => page.evaluate(() => (window as any).__nativeListeners)).toContain("tauri://drag-leave");
  await page.evaluate(async () => {
    const win = window as any;
    win.__attachmentDelay = 200;
    for (const name of ["first.png", "second.txt"]) {
      await win.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://drag-drop", payload: { paths: [`/Reference Files/${name}`], position: { x: 100, y: 220 } } });
    }
  });
  await expect(page.locator(".ar-attachment-list li")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Attach files", exact: true })).toBeEnabled();
});
