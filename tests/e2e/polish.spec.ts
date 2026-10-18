import { closeDialogs, expect, loadSample, openApp, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadSample(page);
});

test("arrow keys and Enter drive the Sort select", async ({ page }) => {
  const sort = page.getByRole("combobox", { name: /sort/i });
  const before = (await sort.innerText()).trim();
  await sort.click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(sort).not.toHaveText(before);
});

test("Ctrl+K does not replace an open import wizard", async ({ page }) => {
  await page.keyboard.press("Control+i");
  await expect(page.locator('input[type="file"]')).toBeAttached();
  await page.keyboard.press("Control+k");
  await expect(page.locator('input[type="file"]')).toBeAttached();
  await expect(page.getByPlaceholder(/Type a command/)).toHaveCount(0);
  await closeDialogs(page);
});

test("the create dialog keeps a typed trailing comma and saves two aliases", async ({ page }) => {
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name", { exact: true }).fill("Alias Tester");
  const aliases = dialog.getByLabel(/^Aliases/);
  await aliases.pressSequentially("Bob,");
  await expect(aliases).toHaveValue("Bob,");
  await aliases.pressSequentially(" Al");
  await expect(aliases).toHaveValue("Bob, Al");
  await dialog.getByRole("button", { name: "Save", exact: true }).first().click();
  const detail = page.getByRole("complementary", { name: "Alias Tester" });
  await expect(detail.getByText("Bob", { exact: true })).toBeVisible();
  await expect(detail.getByText("Al", { exact: true })).toBeVisible();
});

test("a toast stays visible while the pointer rests on it", async ({ page }) => {
  await page.getByRole("row", { name: /Amelia Hart/ }).click();
  await page.getByRole("complementary", { name: "Amelia Hart" }).getByRole("button", { name: "Copy", exact: true }).click();
  const toast = page.getByText("Couldn't copy", { exact: true });
  await expect(toast).toBeVisible();
  await toast.hover();
  await page.waitForTimeout(8000);
  await expect(toast).toBeVisible();
});

test("deleting the focused contact moves focus to a neighbouring row", async ({ page }) => {
  await page.getByRole("row", { name: /Amelia Hart/ }).click();
  await expect(page.getByRole("complementary", { name: "Amelia Hart" })).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Amelia Hart" })).toHaveCount(0);
  const detail = page.locator("aside[aria-label]");
  await expect(detail).toBeVisible();
  await expect(detail).not.toHaveAttribute("aria-label", "Amelia Hart");
});
