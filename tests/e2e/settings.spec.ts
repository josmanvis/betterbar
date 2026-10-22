import { test, expect, installRuntime, savedConfig, seed } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await installRuntime(page);
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Layout", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect.poll(async () => (await savedConfig(page)).barOrder).toContain("extension:sample-clock");
});

test("native sidebar supports keyboard navigation, persistence, and all settings pages", async ({ page }) => {
  const layout = page.getByRole("tab", { name: "Layout", exact: true });
  await layout.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("tab", { name: "Style", exact: true })).toBeFocused();
  await expect(page.getByRole("group", { name: "Settings appearance" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab", { name: "Style", exact: true })).toHaveAttribute("aria-selected", "true");
  for (const name of ["Icons", "Apps & Sets", "Bar items", "Extensions", "Behaviour", "Permissions", "About"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
  }
  await page.getByRole("tab", { name: "About", exact: true }).focus();
  await page.keyboard.press("Home");
  await expect(layout).toBeFocused();
});

test("search reveals saved bar controls and supports keyboard selection, no results, and Escape", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+f");
  const search = page.getByRole("combobox", { name: "Search settings" });
  await expect(search).toBeFocused();
  await search.fill("opacity");
  await expect(page.getByRole("option", { name: /Background opacity/ })).toBeVisible();
  await search.press("Enter");
  await expect(page.getByRole("slider", { name: "Background opacity", exact: true })).toBeVisible();
  await page.getByRole("slider", { name: "Background opacity", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await savedConfig(page)).appearance?.opacity).toBe(seed.appearance!.opacity - 1);
  await search.fill("no-matching-setting");
  await expect(page.getByText("No settings found. Try another word.")).toBeVisible();
  await search.press("Escape");
  await expect(search).toHaveAttribute("aria-expanded", "false");
});

test("settings Light and Dark persist without changing the taskbar palette or layout", async ({ page }, testInfo) => {
  const before = await savedConfig(page);
  await page.getByRole("tab", { name: "Style", exact: true }).click();
  const group = page.getByRole("group", { name: "Settings appearance" });
  for (const [name, mode, color] of [["Dark", "dark", "rgb(31, 32, 35)"], ["Light", "light", "rgb(245, 245, 247)"]] as const) {
    await group.getByRole("button", { name, exact: true }).click();
    await expect(group.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".bb-settings main")).toHaveCSS("background-color", color);
    await expect.poll(async () => (await savedConfig(page)).settingsAppearance).toBe(mode);
    await testInfo.attach(`settings-${mode}.png`, { body: await page.screenshot(), contentType: "image/png" });
    const after = await savedConfig(page);
    const { settingsAppearance: _beforeMode, ...restBefore } = before;
    const { settingsAppearance: _afterMode, ...restAfter } = after;
    expect(restAfter).toEqual(restBefore);
  }
  await page.reload();
  await expect(group.getByRole("button", { name: "Light", exact: true })).toHaveAttribute("aria-pressed", "true");
  await group.getByRole("button", { name: "Automatic", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".bb-settings main")).toHaveCSS("background-color", "rgb(31, 32, 35)");
});

test("layout controls remain functional and respect disabled bar length", async ({ page }) => {
  const length = page.getByRole("combobox", { name: "Bar length mode" });
  await expect(length).toBeDisabled();
  await page.getByRole("button", { name: "Enable floating bar" }).click();
  await expect(length).toBeEnabled();
  await length.selectOption("custom");
  await expect(page.getByRole("slider", { name: "Bar length", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Bar position", exact: true }).selectOption("left");
  await expect.poll(async () => (await savedConfig(page)).position).toBe("left");
  const size = page.getByRole("spinbutton", { name: "Bar size value" });
  await size.fill("80");
  await size.press("Enter");
  await expect.poll(async () => (await savedConfig(page)).barSize).toBe(80);
  await page.reload();
  await expect(size).toHaveValue("80");
});

test("extensions retain filtering, configuration, and enable switches", async ({ page }) => {
  await page.getByRole("tab", { name: "Extensions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sample Clock", exact: true })).toBeVisible();
  const toggle = page.getByRole("switch", { name: /Sample Clock/ });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: /Configure Sample Clock/ }).click();
  await expect(page.getByRole("textbox", { name: "Sample clock label" })).toBeVisible();
  await toggle.click();
  await expect.poll(async () => (await savedConfig(page)).enabledExtensions).toEqual([]);
});

test("reset dialog traps focus, cancels with Escape, and resets only when confirmed", async ({ page }) => {
  await page.getByRole("tab", { name: "About", exact: true }).click();
  const before = await savedConfig(page);
  const reset = page.getByRole("button", { name: /Reset All Settings to Default/i });
  await reset.click();
  const dialog = page.getByRole("dialog", { name: "Confirm" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Reset settings" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(reset).toBeFocused();
  expect(await savedConfig(page)).toEqual(before);
  await reset.click();
  await dialog.getByRole("button", { name: "Reset settings" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await savedConfig(page)).accentColor).toBe("#c5f500");
});

test("minimum window width and reduced motion retain readable, reachable controls", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 720, height: 520 });
  await expect(page.locator(".bb-settings-sidebar")).toHaveCSS("width", "190px");
  await expect(page.getByRole("combobox", { name: "Bar position", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("settings-layout-720.png") });
  await page.getByRole("tab", { name: "Style", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("settings-style-720.png") });
});
