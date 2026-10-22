import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect, installRuntime, seed } from "./fixtures";

// Extension sources remain private and local. Only synthetic notes enter these tests.
const sourcePath = fileURLToPath(new URL("../../extensions/Standup Update/main.tsx", import.meta.url));
const source = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8") : "";
test.skip(!source, "Install the local Standup Update extension to run its browser scenarios.");
const registryExtensions = [{ name: "Standup Update", display_name: "Standup Update", content: source }];
const label = "ext_Standup_Update" as const;

test("Standup refresh loads new content, prevents duplicate reads, and supports keyboard refresh", async ({ page }, testInfo) => {
  await installRuntime(page, { label, registryExtensions, standupResponses: [
    { text: "# Daily update\n\n## Yesterday\n- Finished the draft.\n\n## Today\n- Review the changes.\n\n## Blockers\nNone." },
    { text: "# Refreshed update\n\nThe latest note is ready.", delayMs: 250 },
    { text: "# Keyboard update\n\nReloaded with the shortcut." },
  ] });
  await page.goto("/?ext=Standup%20Update");
  await expect(page.getByRole("heading", { name: "Daily update", exact: true })).toBeVisible();
  const refresh = page.getByRole("button", { name: "Refresh", exact: true });
  await refresh.click();
  await expect(refresh).toBeDisabled();
  await expect(page.getByRole("main", { name: "Standup note" })).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("ControlOrMeta+r");
  await expect(page.getByRole("heading", { name: "Refreshed update" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "read_standup_file").length)).toBe(2);
  await page.keyboard.press("ControlOrMeta+r");
  await expect(page.getByRole("heading", { name: "Keyboard update" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Updated");
  await testInfo.attach("standup-light.png", { body: await page.screenshot(), contentType: "image/png" });
});

test("Standup keeps the existing note after refresh failure and offers retry", async ({ page }) => {
  await installRuntime(page, { label, registryExtensions, standupResponses: [
    { text: "# Saved update\n\nKeep this visible." }, { error: true }, { text: "# Recovered update" },
  ] });
  await page.goto("/?ext=Standup%20Update");
  await expect(page.getByRole("heading", { name: "Saved update" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your previous note is still shown");
  await expect(page.getByRole("heading", { name: "Saved update" })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Recovered update" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Standup has readable empty and error states and a compact dark layout", async ({ page }, testInfo) => {
  await installRuntime(page, { label, registryExtensions, config: { ...seed, settingsAppearance: "dark" }, standupResponses: [{ error: true }, { text: "" }, { text: "# Daily update\n\n## Today\n- Readable in dark mode.\n\n## Blockers\nNone." }] });
  await page.setViewportSize({ width: 380, height: 520 });
  await page.goto("/?ext=Standup%20Update");
  await expect(page.getByRole("heading", { name: "Standup unavailable" })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "No standup content yet" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Daily update", exact: true })).toBeVisible();
  await expect(page.locator(".su-window")).toHaveCSS("background-color", "rgb(31, 32, 35)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Copy Markdown" })).toBeEnabled();
  await testInfo.attach("standup-dark-compact.png", { body: await page.screenshot(), contentType: "image/png" });
});
