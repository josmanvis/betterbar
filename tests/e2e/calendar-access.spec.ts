import { test, expect, installRuntime, seed } from "./fixtures";

const registryExtensions = [{ name: "apple-calendar", display_name: "Apple Calendar", content: "export default function Calendar() { return <button>Calendar</button>; }" }];

for (const status of ["not-determined", "write-only"]) {
  test(`Calendar ${status} access can be connected without changing other grants`, async ({ page }) => {
    await installRuntime(page, { registryExtensions, config: { ...seed, enabledExtensions: [] }, calendarAccess: { status, delayMs: 500 } });
    await page.goto("/");
    await page.getByRole("tab", { name: "Permissions", exact: true }).click();
    await expect(page.getByText(`[ ${status === "not-determined" ? "NOT CONNECTED" : status === "write-only" ? "WRITE ONLY" : "RESTRICTED"} ]`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Connect calendars", exact: true }).click();
    await expect(page.getByRole("button", { name: "Waiting for macOS…", exact: true })).toBeDisabled();
    await expect(page.getByText("[ GRANTED ]", { exact: true })).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Connect calendars", exact: true })).toHaveCount(0);
  });
}

for (const status of ["denied", "restricted"]) {
  test(`Calendar ${status} access stays unavailable until System Settings grants it`, async ({ page }) => {
    await installRuntime(page, { registryExtensions, config: { ...seed, enabledExtensions: [] }, calendarAccess: { status, result: status, delayMs: 100 } });
    await page.goto("/");
    await page.getByRole("tab", { name: "Permissions", exact: true }).click();
    await page.getByRole("button", { name: "Connect calendars", exact: true }).click();
    // Let the pending request finish before simulating a later Settings grant.
    await expect(page.getByRole("button", { name: "Connect calendars", exact: true })).toBeEnabled();
    await expect(page.getByText(`[ ${status.toUpperCase()} ]`, { exact: true })).toBeVisible();
    await expect(page.getByText("[ GRANTED ]", { exact: true })).toHaveCount(2);
    await page.evaluate(() => { (window as any).__calendarStatus = "authorized"; });
    await page.getByRole("button", { name: "Re-check Permissions", exact: true }).click();
    await expect(page.getByText("[ GRANTED ]", { exact: true })).toHaveCount(3);
  });
}

test("Calendar request errors are visible and the user can retry", async ({ page }) => {
  const error = "Calendar access: The operation couldn’t be completed. (EKErrorDomain 29).";
  await installRuntime(page, { registryExtensions, config: { ...seed, enabledExtensions: [] }, calendarAccess: { status: "not-determined", error } });
  await page.goto("/");
  await page.getByRole("tab", { name: "Permissions", exact: true }).click();
  await page.getByRole("button", { name: "Connect calendars", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(error);
  await expect(page.getByRole("button", { name: "Connect calendars", exact: true })).toBeEnabled();
  await expect(page.getByText("[ GRANTED ]", { exact: true })).toHaveCount(2);
});
