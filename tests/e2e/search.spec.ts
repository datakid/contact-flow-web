import { expect, loadSample, openApp, test } from "./fixtures";
import type { Page } from "@playwright/test";

async function search(page: Page, text: string): Promise<void> {
  const box = page.getByRole("searchbox").first();
  await box.fill(text);
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadSample(page);
});

test("finds a contact by the start of a name", async ({ page }) => {
  await search(page, "Ame");
  await expect(page.getByRole("row", { name: /Amelia Hart/ })).toBeVisible();
});

test("finds a contact by a number in local and international format", async ({ page }) => {
  await search(page, "415 555 0101");
  await expect(page.getByRole("row", { name: /Jonathan Smith/ })).toBeVisible();
  await search(page, "+1 415-555-0101");
  await expect(page.getByRole("row", { name: /Jonathan Smith/ })).toBeVisible();
});

test("finds an Arabic name", async ({ page }) => {
  await search(page, "خالد");
  await expect(page.getByRole("row", { name: /خالد العتيبي/ })).toBeVisible();
});

test("finds accented names typed without accents", async ({ page }) => {
  await search(page, "Lea");
  await expect(page.getByRole("row", { name: /Léa Fontaine/ })).toBeVisible();
  await search(page, "Jose");
  await expect(page.getByRole("row", { name: /José Álvarez/ })).toBeVisible();
});

test("tolerates a one letter typo", async ({ page }) => {
  await search(page, "Danial Kim");
  await expect(page.getByRole("row", { name: /Daniel Kim/ })).toBeVisible();
});

test("finds a contact by alias", async ({ page }) => {
  await search(page, "Lena");
  await expect(page.getByRole("row", { name: /Elena Petrova/ })).toBeVisible();
  await search(page, "Abu Omar");
  await expect(page.getByRole("row", { name: /خالد العتيبي/ })).toBeVisible();
});

test("results follow each keystroke", async ({ page }) => {
  const box = page.getByRole("searchbox").first();
  await box.pressSequentially("Priy", { delay: 80 });
  await expect(page.getByRole("row").first()).toContainText("Priya Sharma");
});

test("searching in the main box still works after using the palette", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("Ava");
  await expect(page.getByRole("option", { name: /Ava Thompson/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await search(page, "Hart");
  await expect(page.getByRole("row", { name: /Amelia Hart/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Daniel Kim/ })).toHaveCount(0);
  await search(page, "Kim");
  await expect(page.getByRole("row", { name: /Daniel Kim/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Amelia Hart/ })).toHaveCount(0);
});
