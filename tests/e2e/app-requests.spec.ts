import { existsSync, readFileSync } from "node:fs";
import { test, expect, installRuntime, seed } from "./fixtures";

const source = new URL("../../extensions/app-requests/main.tsx", import.meta.url);
const content = existsSync(source) ? readFileSync(source, "utf8") : "";
test.skip(!content, "Install the local App Requests extension to run its browser scenarios.");
const registryExtensions = [{ name: "app-requests", display_name: "App Requests", content }];
const label = "ext_app_requests" as const;
const task = { id: "existing-request", prompt: "Add a keyboard shortcut for App Requests", target: "both", repository: "/tmp/example-app", status: "running", created_at: "2026-10-22T15:00:00Z", started_at: "2026-10-22T15:00:01Z", log: "[2026-10-22T15:00:01Z] Running checks…", branch: "app-requests/existing-request", workspace: "/tmp/example-workspace", child_pid: 1234 };

test("all targets submit exact prompts once and tasks survive reopening", async ({ page }, testInfo) => {
  await installRuntime(page, { label, registryExtensions });
  await page.goto("/?ext=app-requests");
  await expect(page.getByText("Your next idea starts here.")).toBeVisible();
  await expect(page.getByLabel("Working folder", { exact: true })).toHaveValue("/tmp/example-app");
  for (const [target, title] of [["my_mac", "My Mac"], ["mainline", "Mainline"], ["both", "My Mac + Mainline"]]) {
    const prompt = `A request for ${target}: $(echo test) 'quoted'\nwith a second line`;
    await expect(page.getByRole("radio", { name: title, exact: false }).first()).toBeVisible();
    await page.locator(`input[name="target"][value="${target}"]`).check();
    await page.getByLabel("What would you like to build or change?").fill(prompt);
    await page.getByRole("button", { name: "Start request" }).click();
    await expect(page.getByLabel("What would you like to build or change?")).toHaveValue("");
    await expect(page.getByRole("tabpanel")).toContainText("Running checks");
    const calls = await page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "start_app_request"));
    expect(calls.at(-1).args).toEqual({ prompt, target, repository: "/tmp/example-app" });
    await expect(page.locator(".ar-running")).toContainText(`${calls.length} active`);
  }
  expect(await page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "start_app_request").length)).toBe(3);
  await page.reload();
  await expect(page.locator(".ar-task")).toHaveCount(3);
  await expect(page.getByRole("tabpanel")).toContainText("Running checks");
  await testInfo.attach("app-requests-light.png", { body: await page.screenshot(), contentType: "image/png" });
  await page.screenshot({ path: testInfo.outputPath("app-requests-light.png") });
});

test("cancels a task, opens its terminal and reuses its prompt", async ({ page }) => {
  await installRuntime(page, { label, registryExtensions, appRequests: [task] });
  await page.goto("/?ext=app-requests");
  await expect(page.getByRole("tabpanel")).toContainText("Running checks");
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "open_app_request_terminal").at(-1)?.args)).toEqual({ id: task.id });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".ar-detail-toolbar")).toContainText("Cancelled");
  await expect(page.getByText("Changes, installations or merges completed before cancellation are retained.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Use prompt" }).click();
  await expect(page.getByLabel("What would you like to build or change?")).toHaveValue(task.prompt);
  await expect(page.locator('input[value="both"]')).toBeChecked();
  await page.getByLabel("Filter requests").selectOption("active");
  await expect(page.getByText("No matching requests.")).toBeVisible();
  await page.getByLabel("Filter requests").selectOption("finished");
  await expect(page.locator(".ar-task")).toHaveCount(1);
});

test("keeps draft and task output through start, cancel and refresh errors", async ({ page }) => {
  await installRuntime(page, { label, registryExtensions, appRequests: [task], appRequestStartFailure: true });
  await page.goto("/?ext=app-requests");
  await expect(page.getByRole("tabpanel")).toContainText("Running checks");
  await page.getByLabel("What would you like to build or change?").fill("Keep my draft");
  await page.getByLabel("What would you like to build or change?").press("Meta+Enter");
  await expect(page.getByRole("alert")).toContainText("Choose an existing working folder");
  await expect(page.getByLabel("What would you like to build or change?")).toHaveValue("Keep my draft");
  await page.evaluate(() => { (window as any).__appRequestCancelFailure = true; });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not cancel");
  await page.evaluate(() => { (window as any).__appRequestsFailure = true; });
  await page.getByRole("button", { name: "Refresh requests" }).click();
  await expect(page.getByText("Could not refresh tasks. Previous results may be out of date.")).toBeVisible();
  await expect(page.getByRole("tabpanel")).toContainText("Running checks");
  await page.reload();
  await expect(page.getByLabel("What would you like to build or change?")).toHaveValue("Keep my draft");
});

test("compact dark window has readable final response and no horizontal overflow", async ({ page }, testInfo) => {
  await installRuntime(page, { label, registryExtensions, config: { ...seed, enabledExtensions: ["app-requests"], settingsAppearance: "dark" }, appRequests: [{ ...task, status: "completed", response: "Implemented the shortcut. All checks passed. https://github.com/example/project/pull/1" }] });
  await page.setViewportSize({ width: 720, height: 620 });
  await page.goto("/?ext=app-requests");
  await page.getByRole("tab", { name: "Final response" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("All checks passed");
  await expect(page.getByRole("tabpanel")).toBeInViewport({ ratio: .5 });
  expect((await page.getByRole("tabpanel").boundingBox())!.height).toBeGreaterThanOrEqual(80);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await testInfo.attach("app-requests-dark-compact.png", { body: await page.screenshot(), contentType: "image/png" });
  await page.screenshot({ path: testInfo.outputPath("app-requests-dark-compact.png") });
});
