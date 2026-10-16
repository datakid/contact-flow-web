import { expect, importGenerated, loadSample, openApp, test } from "./fixtures";
import type { Page } from "@playwright/test";

async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const list = document.querySelector("[role=grid]");
    if (!list) return ["no listbox"];
    const slots = [...list.querySelectorAll(":scope > div > div")] as HTMLElement[];
    const boxes = slots.map((slot) => {
      const rect = slot.getBoundingClientRect();
      const isRow = slot.querySelector("[data-row-id]") !== null;
      return { top: rect.top, height: rect.height, isRow, label: (slot.innerText || "").split("\n").filter(Boolean)[0] ?? "" };
    });
    const problems: string[] = [];
    for (const box of boxes) if (box.isRow && Math.abs(box.height - 56) > 1) problems.push(`row ${box.label} has height ${Math.round(box.height)}`);
    const sorted = [...boxes].sort((a, b) => a.top - b.top);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      if (prev.top + prev.height > sorted[i]!.top + 1) problems.push(`${prev.label} overlaps ${sorted[i]!.label}`);
    }
    return problems;
  });
}

async function scrollTo(page: Page, fraction: number): Promise<void> {
  await page.evaluate((f) => {
    const list = document.querySelector("[role=grid]") as HTMLElement | null;
    if (list) list.scrollTop = (list.scrollHeight - list.clientHeight) * f;
  }, fraction);
  await page.waitForTimeout(300);
}

async function scrollTop(page: Page): Promise<number> {
  return page.evaluate(() => (document.querySelector("[role=grid]") as HTMLElement).scrollTop);
}

test("rows keep their size and never overlap after a rename moves a letter", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  expect(await layoutProblems(page)).toEqual([]);
  await page.getByRole("row", { name: /Amelia Hart/ }).click();
  const detail = page.getByRole("complementary", { name: "Amelia Hart" });
  await detail.getByRole("button", { name: "Name" }).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Chloe Hart");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Chloe Hart" })).toBeVisible();
  await page.waitForTimeout(800);
  expect(await layoutProblems(page)).toEqual([]);
});

for (const sort of ["Name A–Z", "Name Z–A"]) {
  test(`layout is sound at every scroll position in ${sort}`, async ({ page }) => {
    await openApp(page);
    await loadSample(page);
    await importGenerated(page, 400, "Zed Person");
    if (sort !== "Name A–Z") {
      await page.getByRole("combobox", { name: "Sort" }).click();
      await page.getByRole("option", { name: sort }).click();
    }
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      await scrollTo(page, fraction);
      if (fraction > 0) expect(await scrollTop(page), `scrolled to ${fraction}`).toBeGreaterThan(0);
      expect(await layoutProblems(page), `at ${fraction}`).toEqual([]);
    }
  });
}

test("starring while scrolled does not move the list or show skeletons", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  await importGenerated(page, 400, "Zed Person");
  await scrollTo(page, 0.5);
  const before = await page.evaluate(() => (document.querySelector("[role=grid]") as HTMLElement).scrollTop);
  const first = await page.locator("[data-row-id]").first().innerText();
  const visibleId = await page.evaluate(() => {
    const grid = document.querySelector("[role=grid]") as HTMLElement;
    const view = grid.getBoundingClientRect();
    const row = [...grid.querySelectorAll("[data-row-id]")].find((el) => {
      const box = el.getBoundingClientRect();
      return box.top >= view.top + 40 && box.bottom <= view.bottom - 40;
    });
    return row?.getAttribute("data-row-id") ?? "";
  });
  expect(visibleId).not.toBe("");
  await page.locator(`[data-row-id="${visibleId}"]`).click();
  await page.keyboard.press("s");
  await expect(page.getByRole("listitem").filter({ hasText: /^(Starred|Unstarred) 1/ })).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => (document.querySelector("[role=grid]") as HTMLElement).scrollTop);
    expect(Math.abs(after - before)).toBeLessThan(2);
    expect(await page.locator("[data-row-id]").first().innerText()).toBe(first);
  }
});

test("every sidebar filter shows the same number as its badge", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  for (const name of [/^All contacts/, /^Starred/, /^Recently added/, /^Recently edited/, /^No number/, /^No name/, /^Family/, /^Work/]) {
    const button = page.getByRole("button", { name }).first();
    const badge = Number((await button.innerText()).replace(/\D/g, ""));
    await button.click();
    await expect(page.getByText(new RegExp(`^${badge.toLocaleString()} contacts?$`)).first()).toBeVisible();
  }
});

test("arrow keys move the focused row", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  await page.getByRole("row", { name: /Amelia Hart/ }).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("row", { selected: true })).toContainText("Daniel Kim");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("row", { selected: true })).toContainText("Chloé Martin");
});
