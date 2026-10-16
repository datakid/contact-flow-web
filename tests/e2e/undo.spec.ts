import { expect, loadSample, openApp, test } from "./fixtures";
import type { Page } from "@playwright/test";

async function starredCount(page: Page): Promise<number> {
  const text = await page.getByRole("button", { name: /^Starred/ }).first().innerText();
  return Number(text.replace(/\D/g, ""));
}

test("undo on a toast reverts exactly the action that toast reported", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  const start = await starredCount(page);
  await page.getByRole("row", { name: /Amelia Hart/ }).click();
  await page.keyboard.press("s");
  await expect(page.getByRole("listitem").filter({ hasText: "Unstarred 1" })).toBeVisible();
  await page.getByRole("row", { name: /Ava Thompson/ }).click();
  await page.keyboard.press("s");
  await expect(page.getByRole("listitem").filter({ hasText: /^Starred 1/ })).toBeVisible();
  await expect.poll(() => starredCount(page)).toBe(start);
  await page.getByRole("listitem").filter({ hasText: "Unstarred 1" }).getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => starredCount(page)).toBe(start + 1);
});

test("undo with nothing to undo says so", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+z");
  await expect(page.getByText("Nothing to undo", { exact: true })).toBeVisible();
});
