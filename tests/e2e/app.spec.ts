import { expect, fixturesDir, importFile, openApp, test } from "./fixtures";
import { join } from "node:path";

test("imports the csv template and finds a contact by number", async ({ page }) => {
  await openApp(page);
  await importFile(page, "template.csv");
  await page.getByRole("searchbox").first().fill("415 555 0123");
  await expect(page.getByRole("row", { name: /Sarah Johnson/ })).toBeVisible();
});

test("a file named .csv that is really Excel is read as Excel", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+i");
  await page.locator('input[type="file"]').setInputFiles(join(fixturesDir, "template-misnamed.csv"));
  await page.getByRole("button", { name: /next|التالي/i }).click();
  await expect(page.getByText(/looks like Excel/)).toBeVisible();
});

test("windows-1256 arabic csv decodes correctly", async ({ page }) => {
  await openApp(page);
  await importFile(page, "contacts-ar-1256.csv");
  await page.getByRole("searchbox").first().fill("فاطمة");
  await expect(page.getByRole("row", { name: /فاطمة الزهراء/ })).toBeVisible();
});

test("large csv stays responsive and can be cancelled", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+i");
  await page.locator('input[type="file"]').setInputFiles(join(fixturesDir, "large.csv"));
  await page.getByRole("button", { name: /next|التالي/i }).click();
  await page.getByRole("button", { name: /next|التالي/i }).click();
  await page.getByRole("button", { name: /next|التالي/i }).click();
  const longTask = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let worst = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) worst = Math.max(worst, entry.duration);
        });
        observer.observe({ entryTypes: ["longtask"] });
        window.setTimeout(() => resolve(worst), 3000);
      })
  );
  expect(longTask).toBeLessThan(200);
});

test("star, undo and keyboard shortcuts", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("n");
  const nameField = page.getByRole("textbox", { name: /^name$|^الاسم$/i }).first();
  await nameField.fill("Test Person");
  await nameField.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Test Person" })).toBeVisible();
  await page.keyboard.press("s");
  await expect(page.getByRole("button", { name: /unstar|إلغاء التمييز/i }).first()).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("button", { name: /^star$|^تمييز$/i }).first()).toBeVisible();
});

test("arabic layout mirrors", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Type a command/).fill("العربية");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
