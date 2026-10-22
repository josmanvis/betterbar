import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect, installRuntime, seed } from "./fixtures";
const sourcePath = fileURLToPath(new URL("../../extensions/wifi-status/main.tsx", import.meta.url));
const content = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8") : "";
test.skip(!content, "Requires the local WiFi Status extension.");
const registryExtensions = [{ name: "wifi-status", display_name: "WiFi Status", content }];
const wifiStatus = { interface: "en0", ssid: "Example Wi-Fi", ipv4: "192.0.2.20", ipv6: "2001:db8::20", connected: true, signal_dbm: -52, noise_dbm: -91, link_mbps: 866, download_bps: 1250000, upload_bps: 250000, speed_test: null, testing: false };
const config = { ...seed, enabledExtensions: ["wifi-status"] };

test("Wi-Fi display fields and units sync across windows and survive reload", async ({ page, context }, testInfo) => {
  await installRuntime(page, { registryExtensions, config, wifiStatus });
  await page.goto("/");
  await page.getByRole("tab", { name: "Extensions", exact: true }).click();
  await page.getByRole("button", { name: "Configure WiFi Status", exact: true }).click();
  const bar = await context.newPage();
  await installRuntime(bar, { label: "main", registryExtensions, config, wifiStatus });
  await bar.goto("/");
  const item = bar.locator('[data-bb-item="extension:wifi-status"]');
  await expect(item).toContainText("10.0 Mbps");
  await expect(item).toContainText("2.00 Mbps");
  await page.getByRole("checkbox", { name: "Download", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "IP address", exact: true }).check();
  await expect(item).not.toContainText("10.0 Mbps");
  await expect(item).toContainText("192.0.2.20");
  await page.getByRole("combobox", { name: "Transfer units", exact: true }).selectOption("bytes");
  await expect(item).toContainText("0.25 MB/s");
  await bar.reload();
  await expect(item).toContainText("0.25 MB/s");
  await expect(item).toContainText("192.0.2.20");
  await expect(item).not.toContainText("10.0 Mbps");
  const image = testInfo.outputPath("wifi-status-settings.png");
  await page.screenshot({ path: image });
  await testInfo.attach("wifi-status-settings.png", { path: image, contentType: "image/png" });
  expect(await bar.evaluate(() => (window as any).__unexpectedIPC)).toEqual([]);
  await bar.close();
});

test("Wi-Fi details run speed tests only on request and retain readings on failure", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 560, height: 760 });
  await installRuntime(page, { label: "ext_wifi_status", registryExtensions, config, wifiStatus });
  await page.goto("/?ext=wifi-status");
  await expect(page.getByRole("heading", { name: "WiFi Status", exact: true })).toBeVisible();
  await expect(page.getByText("192.0.2.20", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "test_wifi_speed"))).toHaveLength(0);
  await page.getByRole("button", { name: "Run speed test", exact: true }).click();
  await expect(page.getByText("Download: 120 Mbps · Upload: 24.0 Mbps", { exact: true })).toBeVisible();
  const image = testInfo.outputPath("wifi-status-details.png");
  await page.screenshot({ path: image });
  await testInfo.attach("wifi-status-details.png", { path: image, contentType: "image/png" });
  await page.evaluate(() => { (window as any).__wifiTestFailure = true; });
  await page.getByRole("button", { name: "Run speed test", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Speed test failed");
  await expect(page.getByText("Download: 120 Mbps · Upload: 24.0 Mbps", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open WiFiStatusApp", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__ipcCalls.some((call: any) => call.cmd === "open_wifi_status_app"))).toBe(true);
  await page.evaluate(() => { (window as any).__wifiFailure = true; });
  await expect(page.getByText("Last reading · unavailable now", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run speed test", exact: true })).toBeDisabled();
  await page.getByText("Bar display", { exact: true }).click();
  await page.getByRole("checkbox", { name: "IP address", exact: true }).check();
  await page.getByRole("button", { name: "Open WiFiStatusApp", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Open WiFiStatusApp", exact: true })).toBeInViewport();
});

test("compact vertical Wi-Fi retains essential rates with extension labels hidden", async ({ page }) => {
  await installRuntime(page, { label: "main", registryExtensions, config: { ...config, barSize: 32, position: "left", showExtensionLabels: false }, wifiStatus });
  await page.goto("/");
  const item = page.locator('[data-bb-item="extension:wifi-status"]');
  await expect(item).toContainText("10.0 Mbps");
  await expect(item).toContainText("2.00 Mbps");
  const bounds = await item.boundingBox();
  expect(bounds?.width).toBeLessThanOrEqual(32);
});

test("disconnected Wi-Fi disables testing and never starts an automatic test", async ({ page }) => {
  await installRuntime(page, { label: "ext_wifi_status", registryExtensions, config, wifiStatus: { ...wifiStatus, connected: false, ssid: null, ipv4: null, ipv6: null, signal_dbm: null, link_mbps: null } });
  await page.goto("/?ext=wifi-status");
  await expect(page.getByRole("button", { name: "Run speed test", exact: true })).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("Wi-Fi disconnected");
  expect(await page.evaluate(() => (window as any).__ipcCalls.some((call: any) => call.cmd === "test_wifi_speed"))).toBe(false);
});
