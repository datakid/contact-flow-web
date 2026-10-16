import { expect, loadSample, openApp, test } from "./fixtures";
import type { Page } from "@playwright/test";

async function switchToArabic(page: Page): Promise<void> {
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Type a command/).fill("العربية");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
}

test("the sidebar sits on the right of the list in Arabic", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  await switchToArabic(page);
  const sidebar = await page.getByRole("navigation").first().boundingBox();
  const list = await page.getByRole("grid").boundingBox();
  expect(sidebar!.x).toBeGreaterThan(list!.x);
});

test("the A to Z rail shows Arabic letters in Arabic", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  await switchToArabic(page);
  const rail = await page.locator("[role=grid]").evaluate((el) => (el.closest("section")?.innerText ?? "").match(/[\u0621-\u064a]/g)?.length ?? 0);
  expect(rail).toBeGreaterThan(5);
});

test("no button keeps English-only text in Arabic", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  await switchToArabic(page);
  await page.getByRole("row").first().click();
  const names = await page.evaluate(() => [...document.querySelectorAll("button, [role=combobox]")].map((el) => (el.getAttribute("aria-label") ?? (el as HTMLElement).innerText ?? "").trim()));
  const bad = names.filter((name) => /^(More|Label|Close|Loading|Sort|Columns|Back)$/.test(name));
  expect(bad).toEqual([]);
});
