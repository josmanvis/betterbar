import { test, expect, installRuntime, savedConfig, seed } from "./fixtures";
import { existsSync, readFileSync } from "node:fs";

const tile = { name: "drag-source", display_name: "Drag Source", content: `
  import React from "react";
  import { useDragSource } from "@betterbar/api";
  export default function Source() {
    const [message,setMessage] = React.useState("Ready");
    const {dragProps,dragging} = useDragSource({paths:["/Applications/Example.app"],onDragEnd:setMessage,onError:()=>setMessage("Failed")});
    return <><button {...dragProps} onClick={()=>invoke("launch_app",{path:"/Applications/Example.app"})}>Example app</button><span role="status">{dragging?"Dragging":message}</span></>;
  }` };

for (const outcome of ["dropped", "cancelled", "failure"]) {
  test(`extension window native drag: ${outcome} suppresses launch and allows the next click`, async ({ page }) => {
    await installRuntime(page, { label: "ext_drag_source", registryExtensions: [tile], dragOutcome: outcome, dragFailure: outcome === "failure", dragDelayMs: 200 });
    await page.goto("/?ext=drag-source");
    const button = page.getByRole("button", { name: "Example app", exact: true });
    const box = await button.boundingBox();
    await page.mouse.move(box!.x + 10, box!.y + box!.height / 2); await page.mouse.down();
    await page.mouse.move(box!.x + 30, box!.y + box!.height / 2, { steps: 5 }); await page.mouse.up();
    await expect(page.getByRole("status")).toHaveText(outcome === "failure" ? "Failed" : outcome);
    const calls = await page.evaluate(() => (window as any).__ipcCalls);
    expect(calls.filter((call: any) => call.cmd === "start_extension_drag")).toHaveLength(1);
    expect(calls.find((call: any) => call.cmd === "start_extension_drag").args.paths).toEqual(["/Applications/Example.app"]);
    expect(calls.filter((call: any) => call.cmd === "launch_app")).toHaveLength(0);
    expect((await savedConfig(page)).sets).toEqual(seed.sets);
    await button.click();
    expect(await page.evaluate(() => (window as any).__ipcCalls.filter((call: any) => call.cmd === "launch_app"))).toHaveLength(1);
  });
}

test("native drag highlights the bar, pins only on drop, and deduplicates subsequent drops", async ({ page }) => {
  await installRuntime(page, { label: "main", pickedTargets: [{ name: "Example", path: "/Applications/Example.app", kind: "app", bundleId: "com.example.App" }] });
  await page.goto("/");
  const bar = page.locator(".bb-scanlines").first(); await expect(bar).toBeVisible();
  const emit = (event: string) => page.evaluate(event => (window as any).__TAURI_INTERNALS__.invoke("plugin:event|emit", {
    event: `tauri://drag-${event}`, payload: { paths: ["/Applications/Example.app"], position: { x: 20, y: 20 } },
  }), event);
  await emit("enter"); await expect(page.locator("[data-bb-drop-target]")).toHaveCount(1);
  expect((await savedConfig(page)).sets).toEqual(seed.sets);
  await emit("leave"); await expect(page.locator("[data-bb-drop-target]")).toHaveCount(0);
  await emit("enter"); await emit("drop");
  await expect(page.getByRole("button", { name: "Example", exact: true })).toBeVisible();
  await expect(page.locator("[data-bb-drop-target]")).toHaveCount(0);
  await emit("drop");
  await expect.poll(async () => (await savedConfig(page)).sets[0].items.filter(item => item.path === "/Applications/Example.app").length).toBe(1);
  await page.reload(); await expect(page.getByRole("button", { name: "Example", exact: true })).toBeVisible();
});

// The drawer remains local-only; clean public checkouts test the generic API above.
for (const layout of ["library", "panel"]) {
  test(`local Apps Drawer ${layout} keeps search and visibility during a drag`, async ({ page }, testInfo) => {
    const file = "extensions/apps-drawer/main.tsx";
    test.skip(!existsSync(file), "Apps Drawer is installed locally only");
    await installRuntime(page, { label: "ext_apps_drawer", dragDelayMs: 1000,
      registryExtensions: [{ name: "apps-drawer", display_name: "Apps Drawer", content: readFileSync(file, "utf8") }],
      installedApps: [{ name: "Example", path: "/Applications/Example.app", bundle_id: "com.example.App" }],
    });
    await page.addInitScript(layout => localStorage.setItem("bb-apps-drawer-settings", JSON.stringify({ layout, dismissOnBlur: true })), layout);
    await page.goto("/?ext=apps-drawer");
    const search = page.getByRole("searchbox", { name: "Search applications" }); await search.fill("Example");
    const app = page.getByRole("button", { name: "Example", exact: true }); await expect(app).toBeVisible();
    const box = await app.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 20, box!.y + box!.height / 2, { steps: 5 });
    await expect(app).toHaveAttribute("data-dragging", "true");
    await page.evaluate(() => (window as any).__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://blur", payload: null }));
    await page.mouse.up();
    await expect(app).not.toHaveAttribute("data-dragging", "true");
    await expect(search).toHaveValue("Example");
    const calls = await page.evaluate(() => (window as any).__ipcCalls);
    expect(calls.filter((call: any) => ["launch_app", "plugin:window|hide"].includes(call.cmd))).toHaveLength(0);
    await testInfo.attach(`drawer-${layout}.png`, { body: await page.screenshot(), contentType: "image/png" });
  });
}
