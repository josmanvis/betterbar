import { test, expect, installRuntime, savedConfig, seed } from "./fixtures";
const source = (version = "1.0.0", marker = "first") => `
export const name = "Permission Sample";
export const version = "${version}";
export const permissions = ["network", "files", "clipboard", "apps", "shell", "calendar", "system", "future-access"];
window.__${marker}Executed = true;
export default function Sample(){return <button>Permission Sample ${version}</button>;}
export function Settings(){return <p>Private extension options</p>;}`;
const entry = (content = source()) => ({ name: "permission-sample", display_name: "Permission Sample", content });
const config = { ...seed, enabledExtensions: ["permission-sample"] };

test("unapproved code is blocked everywhere; cancellation and approval persist and synchronize", async ({ page, context }, testInfo) => {
  const options = { config, requireApproval: true, registryExtensions: [entry()] };
  await installRuntime(page, { ...options, label: "main" }); await page.goto("/");
  const settings = await context.newPage(); await installRuntime(settings, options); await settings.goto("/");
  const extension = await context.newPage(); await installRuntime(extension, { ...options, label: "ext_permission-sample" }); await extension.goto("/?ext=permission-sample");
  for (const view of [page, settings, extension]) expect(await view.evaluate(() => (window as any).__firstExecuted)).toBeUndefined();
  await expect(page.getByRole("button", { name: "Review extension permissions" })).toBeVisible();
  await expect(extension.getByRole("status")).toContainText("awaiting permission approval");
  await page.getByRole("button", { name: "Review extension permissions" }).click();
  await expect(settings.getByRole("button", { name: "Review permissions", exact: true })).toBeVisible();
  await settings.getByRole("button", { name: "Review permissions", exact: true }).click();
  let dialog = settings.getByRole("dialog");
  for (const title of ["Network", "Files and folders", "Clipboard", "Apps and windows", "Commands", "Calendar", "System information and controls", "future-access"]) await expect(dialog.getByText(title, { exact: true })).toBeVisible();
  await expect(dialog).toContainText("they do not restrict code");
  await expect(dialog.getByRole("button", { name: "Not now" })).toBeFocused();
  await settings.keyboard.press("Shift+Tab"); await expect(dialog.getByRole("button", { name: "Allow extension" })).toBeFocused();
  await expect(dialog.getByText("Extensions run inside BetterBar", { exact: false })).toBeInViewport();
  await expect(dialog.getByRole("heading", { name: "Allow Permission Sample?" })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Allow extension" })).toBeInViewport();
  await testInfo.attach("permission-review.png", { body: await settings.screenshot({ path: testInfo.outputPath("permission-review.png") }), contentType: "image/png" });
  await settings.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await settings.reload(); await settings.getByRole("button", { name: "Review permissions", exact: true }).click();
  expect(await settings.evaluate(() => (window as any).__firstExecuted)).toBeUndefined();
  await settings.getByRole("button", { name: "Allow extension", exact: true }).click();
  await expect(page.getByRole("button", { name: "Permission Sample 1.0.0", exact: true })).toBeVisible();
  await expect(extension.getByRole("button", { name: "Permission Sample 1.0.0", exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("button", { name: "Permission Sample 1.0.0", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review extension permissions" })).toHaveCount(0);
  await settings.getByRole("button", { name: "Configure Permission Sample" }).click();
  // Approval opens settings initially; a reload resets only the expansion state.
  if (!await settings.getByRole("button", { name: "Revoke approval" }).isVisible()) await settings.getByRole("button", { name: "Configure Permission Sample" }).click();
  await expect(settings.getByText("Private extension options")).toBeVisible();
  await settings.getByRole("button", { name: "Revoke approval", exact: true }).click();
  await expect(page.getByRole("button", { name: "Permission Sample 1.0.0", exact: true })).toHaveCount(0);
  await expect(extension.getByRole("button", { name: "Permission Sample 1.0.0", exact: true })).toHaveCount(0);
  expect((await savedConfig(settings)).sets).toEqual(seed.sets);
  expect(await extension.evaluate(() => (window as any).__unexpectedIPC)).toEqual([]);
  await settings.close(); await extension.close();
});

for (const [version, marker] of [["1.1.0", "upgrade"], ["1.0.0", "sameVersion"]]) {
  test(`${marker} source changes require fresh approval before evaluating new code`, async ({ page, context }) => {
    const options = { config, requireApproval: true, registryExtensions: [entry()], dropPlans: [] };
    await installRuntime(page, { ...options, label: "main" }); await page.goto("/");
    const settings = await context.newPage(); await installRuntime(settings, options); await settings.goto("/");
    await settings.getByRole("tab", { name: "Extensions", exact: true }).click();
    await settings.getByRole("button", { name: "Review permissions", exact: true }).click();
    await settings.getByRole("button", { name: "Allow extension", exact: true }).click();
    await expect(page.getByRole("button", { name: "Permission Sample 1.0.0", exact: true })).toBeVisible();
    await settings.evaluate(newEntry => localStorage.setItem("__betterbar_test_registry", JSON.stringify([newEntry])), entry(source(version, marker)));
    await settings.getByRole("button", { name: "Reload extensions", exact: true }).click();
    await expect(page.getByRole("button", { name: "Review extension permissions" })).toBeVisible();
    await expect(page.getByRole("button", { name: `Permission Sample ${version}`, exact: true })).toHaveCount(0);
    for (const view of [page, settings]) expect(await view.evaluate(key => (window as any)[key], `__${marker}Executed`)).toBeUndefined();
    await settings.getByRole("button", { name: "Review permissions", exact: true }).click();
    await settings.getByRole("button", { name: "Allow extension", exact: true }).click();
    await expect(page.getByRole("button", { name: `Permission Sample ${version}`, exact: true })).toBeVisible();
    expect(await page.evaluate(key => (window as any)[key], `__${marker}Executed`)).toBe(true);
    await settings.close();
  });
}

test("enabling a legacy extension requires full access approval and does not change other preferences", async ({ page }) => {
  await installRuntime(page, { requireApproval: true, config: { ...config, enabledExtensions: [] }, registryExtensions: [entry('window.__legacyExecuted = true; export default function Legacy(){return <button>Legacy</button>;}')] });
  await page.goto("/"); await page.getByRole("tab", { name: "Extensions", exact: true }).click();
  await page.getByRole("switch", { name: "Enable Permission Sample", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Full BetterBar access");
  expect((await savedConfig(page)).enabledExtensions).toEqual([]);
  expect(await page.evaluate(() => (window as any).__legacyExecuted)).toBeUndefined();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  expect((await savedConfig(page)).enabledExtensions).toEqual([]);
  await page.getByRole("switch", { name: "Enable Permission Sample", exact: true }).click();
  await page.getByRole("button", { name: "Allow extension", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Disable Permission Sample", exact: true })).toBeChecked();
  await expect(page.getByRole("button", { name: "Revoke approval", exact: true })).toBeVisible();
  expect((await savedConfig(page)).sets).toEqual(seed.sets);
});
