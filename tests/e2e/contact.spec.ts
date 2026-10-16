import { closeDialogs, expect, loadSample, openApp, test } from "./fixtures";
import type { Page } from "@playwright/test";

async function historyEntries(page: Page): Promise<number> {
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const count = await page.getByRole("dialog").getByRole("listitem").count();
  await closeDialogs(page);
  return count;
}

test("a failed copy does not say Copied", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  await page.getByRole("row", { name: /Amelia Hart/ }).click();
  await page.getByRole("complementary", { name: "Amelia Hart" }).getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByText("Couldn't copy", { exact: true })).toBeVisible();
  await expect(page.getByText("Copied", { exact: true })).toHaveCount(0);
});

test("two quick inline edits are both saved", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, message: unknown, ...rest: unknown[]) {
      const path = (message as { path?: string[] } | null)?.path;
      if (Array.isArray(path) && path[0] === "saveContact") {
        window.setTimeout(() => (original as (...args: unknown[]) => void).call(this, message, ...rest), 400);
        return;
      }
      return (original as (...args: unknown[]) => void).call(this, message, ...rest);
    } as typeof Worker.prototype.postMessage;
  });
  await openApp(page);
  await loadSample(page);
  await page.getByRole("row", { name: /Ava Thompson/ }).click();
  const detail = page.getByRole("complementary", { name: "Ava Thompson" });
  await detail.getByRole("button", { name: "Phone" }).first().click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("+1 646 555 9999");
  await page.keyboard.press("Enter");
  await detail.getByRole("button", { name: "Email" }).first().click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("fast@example.com");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await page.reload();
  await page.getByRole("row", { name: /Ava Thompson/ }).click();
  const after = page.getByRole("complementary", { name: "Ava Thompson" });
  await expect(after.getByRole("button", { name: "Phone" }).first()).toHaveText("+1 646 555 9999");
  await expect(after.getByRole("button", { name: "Email" }).first()).toHaveText("fast@example.com");
});

test("one inline edit makes exactly one history entry", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  await page.getByRole("row", { name: /Amelia Hart/ }).click();
  const before = await historyEntries(page);
  const detail = page.getByRole("complementary", { name: "Amelia Hart" });
  await detail.getByRole("button", { name: "Name" }).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Amelia H");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Amelia H" })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await historyEntries(page)).toBe(before + 1);
});
