import { test, expect, installRuntime, seed } from "./fixtures";
import { readFileSync } from "node:fs";
const extension = { name: "files", display_name: "Files", content: readFileSync("extensions/files/main.tsx", "utf8") };
test.beforeEach(async ({ page }) => {
  await installRuntime(page, { label: "ext_files", files: true, config: { ...seed, enabledExtensions: ["files"] }, registryExtensions: [extension] });
  await page.goto("/?ext=files");
  await expect(page.getByRole("option", { name: "notes.txt", exact: true })).toBeVisible();
});

test("Files navigates folders, tabs, natural sort, hidden files and list/icon views", async ({ page }, testInfo) => {
  await expect(page.getByRole("listbox", { name: "Folder contents" }).getByRole("option")).toHaveCount(5);
  const names = await page.getByRole("listbox", { name: "Folder contents" }).getByRole("option").allTextContents();
  expect(names.findIndex(n => n.startsWith("report 2"))).toBeLessThan(names.findIndex(n => n.startsWith("report 10")));
  await page.getByRole("option", { name: "Documents", exact: true }).dblclick();
  await expect(page.getByRole("option", { name: "deep.txt" })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("checkbox", { name: "Show hidden files" }).check();
  await expect(page.getByRole("option", { name: ".hidden" })).toBeVisible();
  await page.getByRole("button", { name: "Icon view" }).click();
  await expect(page.locator('.files-entry[data-grid="true"]')).toHaveCount(6);
  await page.getByRole("button", { name: "New tab", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByRole("button", { name: "Close tab", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("files-icons.png") });
  await page.getByRole("button", { name: "List view" }).click();
  await page.getByRole("button", { name: "Info", exact: true }).click();
  await page.getByRole("option", { name: "notes.txt", exact: true }).click();
  await testInfo.attach("files-list.png", { body: await page.screenshot({ path: testInfo.outputPath("files-list.png") }), contentType: "image/png" });
});

test("Files filters locally, searches subfolders and opens packages instead of browsing them", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search this folder" });
  await search.fill("deep"); await expect(page.getByRole("listbox", { name: "Folder contents" }).getByRole("option")).toHaveCount(0);
  await page.getByRole("button", { name: "Search subfolders with Spotlight" }).click();
  await expect(page.getByRole("option", { name: "deep.txt" })).toBeVisible();
  await search.fill("");
  await page.getByRole("option", { name: "Example.app", exact: true }).dblclick();
  await expect.poll(() => page.evaluate(() => (window as any).__ipcCalls.some((call: any) => call.cmd === "files_action" && call.args.action === "open" && call.args.path.endsWith("Example.app")))).toBe(true);
  await expect(page.getByRole("button", { name: "Go to folder" })).toHaveText("/Files Test");
});

test("Files confirms Trash, restores with undo and preserves occupied names", async ({ page }) => {
  await page.getByRole("option", { name: "notes.txt", exact: true }).click();
  await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toContainText("1 selected items");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__ipcCalls.filter((c: any) => c.cmd === "files_action" && c.args.action === "trash"))).toHaveLength(0);
  await page.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await dialog.getByRole("button", { name: "Move to Trash", exact: true }).click();
  await expect(page.getByRole("option", { name: "notes.txt", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo last move / rename / Trash" }).click();
  await expect(page.getByRole("option", { name: "notes.txt", exact: true })).toBeVisible();
  await page.getByRole("option", { name: "notes.txt", exact: true }).click();
  await page.keyboard.press("Enter");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("report 2.txt");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText("already exists");
  await expect(page.getByRole("option", { name: "notes.txt", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "report 2.txt", exact: true })).toBeVisible();
});

test("Files copies and moves through the native clipboard and records partial completion", async ({ page }) => {
  await page.getByRole("option", { name: "notes.txt", exact: true }).click();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.getByRole("option", { name: "Documents", exact: true }).dblclick();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.getByRole("option", { name: "notes.txt", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("option", { name: "report 2.txt", exact: true }).click();
  await page.getByRole("option", { name: "report 10.txt", exact: true }).click({ modifiers: ["Meta"] });
  await page.evaluate(() => { (window as any).__filesActionFailure = "/Files Test/report 10.txt"; });
  await page.getByRole("button", { name: "Cut", exact: true }).click();
  await page.getByRole("option", { name: "Documents", exact: true }).dblclick();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Completed 1 items before an error");
  await expect(page.getByRole("option", { name: "report 2.txt", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo last move / rename / Trash" }).click();
  await expect(page.getByRole("option", { name: "report 2.txt", exact: true })).toHaveCount(0);
});

test("Files creates folders, edits tags and confirms Finder drops with a frozen destination", async ({ page }) => {
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("New folder $(literal)");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("option", { name: "New folder $(literal)" })).toBeVisible();
  await page.getByRole("option", { name: "notes.txt", exact: true }).click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Edit tags", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Edit tags" }).fill("Work, Important");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__filesTags["/Files Test/notes.txt"])).toEqual(["Work", "Important"]);
  await expect.poll(() => page.evaluate(() => (window as any).__nativeListeners.includes("tauri://drag-drop"))).toBe(true);
  await page.evaluate(() => (window as any).__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://drag-drop", payload: { paths: ["/Files Test/Documents/deep.txt"], position: { x: 400, y: 300 } } }));
  await expect(page.getByRole("dialog")).toContainText("Copy dropped items here?");
  await page.getByRole("dialog").getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByRole("option", { name: "deep.txt", exact: true })).toBeVisible();
});

test("Files hides stale results after navigation, recovers read failures and reports limits", async ({ page }) => {
  await page.evaluate(() => { (window as any).__filesReadDelay = 150; });
  await page.getByRole("option", { name: "Documents", exact: true }).dblclick();
  await expect(page.getByRole("button", { name: "Move to Trash", exact: true })).toBeDisabled();
  await expect(page.getByRole("option", { name: "deep.txt", exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).__filesReadFailure = true; });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not open this folder");
  await expect(page.getByRole("listbox", { name: "Folder contents" }).getByRole("option")).toHaveCount(0);
  await page.evaluate(() => { (window as any).__filesReadFailure = false; (window as any).__filesTruncated = true; });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("option", { name: "deep.txt", exact: true })).toBeVisible();
  await expect(page.getByText("Results limited; narrow your search or open this folder in Finder.")).toBeVisible();
});
