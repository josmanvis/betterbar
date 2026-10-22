import { test, expect, installRuntime, seed } from "./fixtures";

test("@performance production Settings starts within budget and shares native symbol requests", async ({ page }, testInfo) => {
  await installRuntime(page);
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Bar position", exact: true })).toBeVisible();
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return {
      readyMs: performance.now(), domContentLoadedMs: navigation.domContentLoadedEventEnd,
      jsBytes: performance.getEntriesByType("resource").filter(entry => entry.name.endsWith(".js"))
        .reduce((sum, entry) => sum + (entry as PerformanceResourceTiming).encodedBodySize, 0),
      symbolRequests: (window as any).__ipcCalls.filter((call: any) => call.cmd === "get_system_symbols").length,
    };
  });
  await testInfo.attach("settings-startup.json", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
  expect(metrics.readyMs, "production Settings must become interactive within 2 seconds").toBeLessThan(2000);
  expect(metrics.jsBytes, "Settings JS transfer budget (uncompressed)").toBeLessThan(1_000_000);
  expect(metrics.symbolRequests, "all sidebar symbols must share a single native render request").toBe(1);
});

test("@performance search and tab interactions render within budget without native request churn", async ({ page }, testInfo) => {
  await installRuntime(page);
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Layout", exact: true })).toBeVisible();
  const nativeBefore = await page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "get_macos_preferences").length);
  const timings: number[] = [];
  const search = page.getByRole("combobox", { name: "Search settings" });
  for (const query of ["opacity", "border", "position", "extension", "calendar", "running", "scale"]) {
    await page.evaluate(() => { (window as any).__interactionStart = performance.now(); });
    await search.fill(query);
    await expect(page.getByRole("option").first()).toBeVisible();
    timings.push(await page.evaluate(() => performance.now() - (window as any).__interactionStart));
    await search.press("Escape");
  }
  const transitions: number[] = [];
  for (const name of ["Style", "Icons", "Bar items", "Extensions", "Layout"]) {
    await page.evaluate(() => { (window as any).__interactionStart = performance.now(); });
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name, level: 1, exact: true })).toBeVisible();
    transitions.push(await page.evaluate(() => performance.now() - (window as any).__interactionStart));
  }
  const size = page.getByRole("spinbutton", { name: "Bar size value" });
  for (const value of ["60", "72", "80"]) { await size.fill(value); await size.press("Enter"); }
  const nativeAfter = await page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "get_macos_preferences").length);
  await testInfo.attach("settings-interactions.json", { body: JSON.stringify({ searchMs: timings, tabMs: transitions, nativeBefore, nativeAfter }, null, 2), contentType: "application/json" });
  expect(Math.max(...timings), "search results should render within 200ms").toBeLessThan(200);
  expect(Math.max(...transitions), "tab content should render within 250ms").toBeLessThan(250);
  expect(nativeAfter, "editing bar dimensions must not reload macOS appearance").toBe(nativeBefore);
});

test("@performance an empty app list settles instead of continuously querying native IPC", async ({ page }) => {
  await installRuntime(page, { emptyApps: true, config: { ...seed, sets: [{ id: "test", name: "Work", items: [] }] } });
  await page.goto("/");
  await page.getByRole("tab", { name: "Behaviour", exact: true }).click();
  await expect(page.getByText("No apps found", { exact: true })).toBeVisible();
  // A real observation period catches the old state-effect request loop.
  await page.waitForTimeout(350);
  const count = () => page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "get_running_apps").length);
  expect(await count()).toBe(1);
  await page.getByRole("tab", { name: "Layout", exact: true }).click();
  await page.getByRole("tab", { name: "Behaviour", exact: true }).click();
  await expect.poll(count).toBe(2);
});
