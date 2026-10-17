import { expect, loadSample, openApp, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadSample(page);
});

test("the menu opens the sidebar drawer and choosing a filter closes it", async ({ page }) => {
  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.getByRole("button", { name: /^Starred/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Starred");
  await expect(page.getByRole("navigation")).toBeHidden();
});

test("tapping a row opens the detail sheet and Back closes it", async ({ page }) => {
  await page.getByRole("row", { name: /Amelia Hart/ }).tap();
  const detail = page.getByRole("complementary", { name: "Amelia Hart" });
  await expect(detail).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(detail).toBeHidden();
});

test("a long press selects a row and a tap then selects another", async ({ page }) => {
  const first = page.getByRole("row", { name: /Amelia Hart/ });
  await first.evaluate((el) => {
    el.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true, clientX: 100, clientY: 100 }));
  });
  await page.waitForTimeout(650);
  await first.evaluate((el) => {
    el.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", bubbles: true, clientX: 100, clientY: 100 }));
  });
  await expect(page.getByText(/^1\s*selected$/)).toBeVisible();
  await page.getByRole("row", { name: /Ava Thompson/ }).tap();
  await expect(page.getByText(/^2\s*selected$/)).toBeVisible();
});

test("the back chevron is mirrored in Arabic", async ({ page }) => {
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Type a command/).fill("العربية");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("row").first().tap();
  await expect(page.getByRole("complementary")).toBeVisible();
  const rotate = await page.evaluate(() => {
    const svg = document.querySelector("svg.lucide-chevron-left");
    return svg ? getComputedStyle(svg).rotate : "missing";
  });
  expect(["missing", "none"]).not.toContain(rotate);
});

test("share as vCard falls back to a download when the share sheet fails", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: () => Promise.reject(new DOMException("blocked", "NotAllowedError")) });
  });
  await page.getByRole("row", { name: /Amelia Hart/ }).tap();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Share as vCard" }).click()]);
  expect(download.suggestedFilename()).toBe("Amelia Hart.vcf");
});

test("share as vCard does nothing extra when the user cancels the share sheet", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: () => Promise.reject(new DOMException("cancelled", "AbortError")) });
  });
  await page.getByRole("row", { name: /Amelia Hart/ }).tap();
  let downloaded = false;
  page.on("download", () => {
    downloaded = true;
  });
  await page.getByRole("button", { name: "Share as vCard" }).click();
  await page.waitForTimeout(800);
  expect(downloaded).toBe(false);
});
