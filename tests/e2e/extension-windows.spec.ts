import { test, expect, installRuntime, savedConfig, seed } from "./fixtures";

test("extension windows follow the selected theme, including loading and native chrome", async ({ page }) => {
  await installRuntime(page, { label: "ext_sample", config: { ...seed, settingsAppearance: "dark" } });
  await page.goto("/?ext=sample-clock");
  const surface = page.locator(".bb-extension-window");
  await expect(surface).toHaveCSS("background-color", "rgb(43, 44, 48)");
  await expect(surface).toHaveCSS("color", "rgb(245, 245, 247)");
  await expect(page.getByRole("button", { name: "09:41", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "plugin:window|set_theme").at(-1)?.args?.value)).toBe("dark");
});

test("changing appearance in Settings updates an already open extension without changing the bar palette", async ({ context, page }) => {
  await installRuntime(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "Style", exact: true }).click();
  const extension = await context.newPage();
  await installRuntime(extension, { label: "ext_sample" });
  await extension.goto("/?ext=sample-clock");
  await expect(extension.getByRole("button", { name: "09:41", exact: true })).toBeVisible();
  for (const [name, mode, background] of [["Dark", "dark", "rgb(43, 44, 48)"], ["Light", "light", "rgb(255, 255, 255)"]] as const) {
    await page.getByRole("group", { name: "Window appearance" }).getByRole("button", { name, exact: true }).click();
    await expect(extension.locator(".bb-extension-window")).toHaveCSS("background-color", background);
    await expect.poll(() => extension.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "plugin:window|set_theme").at(-1)?.args?.value)).toBe(mode);
    expect((await savedConfig(page)).accentColor).toBe(seed.accentColor);
  }
  await page.getByRole("button", { name: "Automatic", exact: true }).click();
  await extension.emulateMedia({ colorScheme: "dark" });
  await expect(extension.locator(".bb-extension-window")).toHaveCSS("background-color", "rgb(43, 44, 48)");
  expect(await extension.evaluate(() => (window as any).__unexpectedIPC)).toEqual([]);
  await extension.close();
});

for (const position of ["bottom", "left"] as const) {
  test(`app labels display for pinned and running apps on a ${position} bar`, async ({ page }) => {
    await installRuntime(page, {
      label: "main", config: { ...seed, position, barSize: 36, showLabels: true, showRunningApps: true },
      runningApps: [{ name: "Calendar", bundle_id: "com.apple.Calendar", pid: 202, is_active: true }],
    });
    await page.goto("/");
    const pinned = page.locator('[data-bb-app-label]').filter({ hasText: "Notes" });
    const running = page.locator('[data-bb-app-label]').filter({ hasText: "Calendar" });
    await expect(pinned).toBeVisible();
    await expect(running).toBeVisible();
    await expect(page.getByRole("button", { name: "09:41", exact: true })).toBeVisible();
    for (const label of [pinned, running]) {
      const box = await label.boundingBox();
      expect(box!.width).toBeGreaterThan(4);
      expect(box!.height).toBeGreaterThan(3);
    }
  });
}

test("the label switch updates pinned and running apps without affecting extension labels", async ({ page, context }) => {
  await installRuntime(page, { label: "main", config: { ...seed, showLabels: false, showRunningApps: true }, runningApps: [{ name: "Calendar", bundle_id: "com.apple.Calendar", pid: 202, is_active: false }] });
  await page.goto("/");
  await expect(page.locator("[data-bb-app-label]")).toHaveCount(0);
  const settings = await context.newPage();
  await installRuntime(settings);
  await settings.goto("/");
  await settings.getByRole("tab", { name: "Behaviour", exact: true }).click();
  await settings.getByRole("switch", { name: /SHOW LABELS/ }).click();
  await expect(page.locator("[data-bb-app-label]")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "09:41", exact: true })).toBeVisible();
  await settings.getByRole("switch", { name: /SHOW LABELS/ }).click();
  await expect(page.locator("[data-bb-app-label]")).toHaveCount(0);
  expect(await settings.evaluate(() => (window as any).__unexpectedIPC)).toEqual([]);
  await settings.close();
});
