import { bulkCount, expect, importGenerated, libraryCount, loadSample, openApp, test } from "./fixtures";

test("selection counts during a search match what the action changes", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  await importGenerated(page, 1200);
  await expect.poll(() => libraryCount(page)).toBe(1230);
  await page.getByRole("searchbox").first().fill("Test Person");
  await expect(page.getByText("Showing first 500 of 1,200")).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await page.keyboard.press("Control+a");
  await expect.poll(() => bulkCount(page)).toBe(1200);
  await page.keyboard.press("Delete");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Delete 1,200 contacts?")).toBeVisible();
  await dialog.getByRole("button", { name: "Delete 1,200" }).click();
  await expect.poll(() => libraryCount(page)).toBe(30);
});

test("escape in a dialog closes the dialog and keeps the selection", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  for (const name of [/Amelia Hart/, /Ava Thompson/, /Daniel Kim/]) await page.getByRole("row", { name }).click({ modifiers: ["Control"] });
  await expect.poll(() => bulkCount(page)).toBe(3);
  await page.keyboard.press("Control+Shift+E");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => bulkCount(page)).toBe(3);
  await page.keyboard.press("Escape");
  await expect.poll(() => bulkCount(page)).toBeNull();
});

test("row checkboxes, ranges, header select-all, exclusions, delete and undo", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  const total = await libraryCount(page);
  const rows = page.getByRole("row");
  const rowCheckbox = (index: number) => rows.nth(index).getByRole("checkbox");

  await rowCheckbox(0).click();
  await expect(rowCheckbox(0)).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => bulkCount(page)).toBe(1);

  await rowCheckbox(4).click({ modifiers: ["Shift"] });
  await expect.poll(() => bulkCount(page)).toBe(5);

  const header = page.getByRole("checkbox", { name: "Select all" });
  await expect(header).toHaveAttribute("aria-checked", "mixed");
  await header.click();
  await expect(header).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => bulkCount(page)).toBe(total);

  await rowCheckbox(2).click();
  await expect(header).toHaveAttribute("aria-checked", "mixed");
  await expect.poll(() => bulkCount(page)).toBe(total - 1);

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(`Delete ${(total - 1).toLocaleString()} contacts?`)).toBeVisible();
  await dialog.getByRole("button", { name: `Delete ${(total - 1).toLocaleString()}` }).click();
  await expect.poll(() => libraryCount(page)).toBe(1);

  await page.getByRole("listitem").filter({ hasText: /^Deleted/ }).getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => libraryCount(page)).toBe(total);
});

test("select all in the table view selects every contact, not only loaded rows", async ({ page }) => {
  await openApp(page);
  await importGenerated(page, 600);
  await expect.poll(() => libraryCount(page)).toBe(600);
  await page.keyboard.press("Control+2");
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  await page.mouse.click(box!.x + 16, box!.y + 18);
  await expect.poll(() => bulkCount(page)).toBe(600);
});

test("bulk star and unstar change the Starred count by the selection size", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  const starred = async (): Promise<number> => Number((await page.getByRole("button", { name: /^Starred/ }).first().innerText()).replace(/\D/g, ""));
  const start = await starred();
  for (const name of [/Ava Thompson/, /Chloé Martin/, /Daniel Kim/]) await page.getByRole("row", { name }).click({ modifiers: ["Control"] });
  await expect.poll(() => bulkCount(page)).toBe(3);
  await page.getByRole("button", { name: "Star", exact: true }).last().click();
  await expect.poll(starred).toBe(start + 3);
  await page.getByRole("button", { name: "Unstar", exact: true }).last().click();
  await expect.poll(starred).toBe(start);
});
