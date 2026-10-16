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
