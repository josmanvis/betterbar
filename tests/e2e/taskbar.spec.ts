import { test, expect, installRuntime, savedConfig, seed } from "./fixtures";

test("current taskbar retains its font, chrome, palette, and settings action", async ({ page }, testInfo) => {
  await installRuntime(page, { label: "main" });
  await page.goto("/");
  const bar = page.locator(".bb-scanlines").first();
  await expect(bar).toBeVisible();
  await expect(bar).toHaveCSS("background-color", "rgba(16, 24, 32, 0.84)");
  await expect(bar).toHaveCSS("border-radius", "4px");
  await expect(bar).toHaveCSS("border-width", "1px");
  await expect(bar).toHaveCSS("backdrop-filter", "blur(12px)");
  await expect(bar).toHaveCSS("font-family", /IBM Plex Mono/);
  await expect(page.locator(".bb-settings")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "09:41", exact: true })).toBeVisible();
  await testInfo.attach("taskbar.png", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByTitle("COG", { exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "open_settings_window").length)).toBe(1);
  const calls = await page.evaluate(() => (window as any).__ipcCalls.map((call: any) => call.cmd));
  expect(calls).not.toContain("get_macos_preferences");
  expect(calls).not.toContain("get_system_symbols");
  expect(calls).not.toContain("set_native_bar_material");
});

test("settings changes sync to the bar while settings appearance stays isolated", async ({ context }) => {
  const bar = await context.newPage();
  const settings = await context.newPage();
  try {
    await installRuntime(bar, { label: "main" });
    await installRuntime(settings);
    await bar.goto("/");
    await settings.goto("/");
    const surface = bar.locator(".bb-scanlines").first();
    await expect(surface).toBeVisible();
    await settings.getByRole("tab", { name: "Style", exact: true }).click();
    await settings.getByRole("button", { name: "Dark", exact: true }).click();
    await expect.poll(async () => (await savedConfig(bar)).settingsAppearance).toBe("dark");
    await expect(surface).toHaveCSS("background-color", "rgba(16, 24, 32, 0.84)");
    await expect(surface).toHaveCSS("font-family", /IBM Plex Mono/);
    await settings.getByText("Bar colors and effects", { exact: true }).click();
    const opacity = settings.getByRole("slider", { name: "Background opacity", exact: true });
    await opacity.focus();
    await settings.keyboard.press("ArrowLeft");
    await expect(surface).toHaveCSS("background-color", "rgba(16, 24, 32, 0.83)");
    expect(await bar.evaluate(() => (window as any).__unexpectedIPC)).toEqual([]);
    expect(await settings.evaluate(() => (window as any).__unexpectedIPC)).toEqual([]);
  } finally {
    await bar.close();
    await settings.close();
  }
});

test("settings keeps CSS fallbacks when native appearance APIs fail", async ({ page }) => {
  await installRuntime(page, { nativeFailure: true, reduceTransparency: true });
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Bar position", exact: true })).toBeEnabled();
  await page.getByRole("tab", { name: "Style", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator(".bb-settings main")).toHaveCSS("background-color", "rgb(31, 32, 35)");
});


test("Settings uses the Mac accent and accessibility preferences on its scoped surface", async ({ page }) => {
  await installRuntime(page, { nativeAccent: "#aa00cc", reduceTransparency: true, increaseContrast: true });
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Layout", exact: true })).toHaveCSS("background-color", "rgb(170, 0, 204)");
  await expect(page.locator(".bb-settings-sidebar")).toHaveCSS("background-color", "rgb(245, 245, 247)");
  await expect(page.locator(".bb-setting-body")).toHaveCSS("border-color", "rgb(199, 199, 206)");
  await page.getByRole("tab", { name: "Style", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Style", exact: true })).toHaveCSS("background-color", "rgb(170, 0, 204)");
});


test("Settings stays accessible with the cog hidden through the standard preferences shortcut", async ({ page }) => {
  await installRuntime(page, { label: "main", config: { ...seed, showSettingsCog: false } });
  await page.goto("/");
  await expect(page.locator(".bb-scanlines").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+,");
  await expect.poll(() => page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "open_settings_window").length)).toBe(1);
});
