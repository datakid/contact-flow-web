import AxeBuilder from "@axe-core/playwright";
import { closeDialogs, expect, loadSample, openApp, test } from "./fixtures";
import type { Page } from "@playwright/test";

async function seriousViolations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadSample(page);
});

test("main view has no serious accessibility violations", async ({ page }) => {
  expect(await seriousViolations(page)).toEqual([]);
});

test("detail pane has no serious accessibility violations", async ({ page }) => {
  await page.getByRole("row", { name: /Amelia Hart/ }).click();
  await expect(page.getByRole("complementary", { name: "Amelia Hart" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("palette has no serious accessibility violations", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox")).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

for (const label of ["New contact", "Import", "Export", "Batch edit", "Message queue", "History", "Find duplicates", "Keyboard shortcuts"]) {
  test(`${label} dialog has no serious accessibility violations`, async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.keyboard.type(label);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(500);
    expect(await seriousViolations(page)).toEqual([]);
    await closeDialogs(page);
  });
}

test("settings dialog has no serious accessibility violations", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("confirm delete dialog has no serious accessibility violations", async ({ page }) => {
  await page.getByRole("row", { name: /Amelia Hart/ }).click();
  await page.keyboard.press("Delete");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await seriousViolations(page)).toEqual([]);
});
