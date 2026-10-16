import { expect, test as base } from "@playwright/test";
import type { Page } from "@playwright/test";
import { isAbsolute, join } from "node:path";

export { expect };

export const fixturesDir = join(process.cwd(), "tests", "fixtures");

export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      await use(errors);
      expect(errors, "page and console errors").toEqual([]);
    },
    { auto: true }
  ]
});

export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("searchbox").first()).toBeVisible({ timeout: 30000 });
}

export async function closeDialogs(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        if ((await page.getByRole("dialog").count()) === 0) return 0;
        await page.keyboard.press("Escape");
        return page.getByRole("dialog").count();
      },
      { timeout: 10000 }
    )
    .toBe(0);
}

export async function libraryCount(page: Page): Promise<number> {
  const text = await page.getByRole("button", { name: /^All contacts/ }).first().innerText();
  const digits = text.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export async function loadSample(page: Page): Promise<void> {
  const menu = page.getByRole("button", { name: "Library" });
  const compact = (await menu.count()) > 0;
  if (compact) await menu.click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /sample/i }).click();
  await expect(page.getByText(/^Imported \d+|^تم استيراد/).first()).toBeVisible();
  await closeDialogs(page);
  if (compact) await expect(page.getByRole("row").first()).toBeVisible();
  else await expect.poll(() => libraryCount(page)).toBeGreaterThan(0);
}

type UploadSource = string | { name: string; mimeType: string; buffer: Buffer };

async function runImport(page: Page, source: UploadSource): Promise<void> {
  await page.keyboard.press("Control+i");
  await page.locator('input[type="file"]').setInputFiles(typeof source === "string" ? (isAbsolute(source) ? source : join(fixturesDir, source)) : source);
  await page.getByRole("button", { name: /next|التالي/i }).click();
  await page.getByRole("button", { name: /next|التالي/i }).click();
  await page.getByRole("button", { name: /next|التالي/i }).click();
  await expect(page.getByText(/New contacts|جهات جديدة/).first()).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: /^import \d|^استيراد \d/i }).click();
  await expect(page.getByText(/Import complete|اكتمل الاستيراد/)).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: /^close$|^إغلاق$/i }).last().click();
}

export async function importFile(page: Page, file: string): Promise<void> {
  await runImport(page, file);
}

export async function importGenerated(page: Page, count: number, prefix = "Test Person"): Promise<void> {
  const lines = ["Name,Phone"];
  for (let i = 0; i < count; i++) lines.push(`${prefix} ${String(i).padStart(4, "0")},+1 415 ${200 + (i % 700)} ${String(i).padStart(4, "0")}`);
  await runImport(page, { name: "generated.csv", mimeType: "text/csv", buffer: Buffer.from(lines.join("\n") + "\n") });
}

export async function bulkCount(page: Page): Promise<number | null> {
  const bar = page.getByText(/^[\d,.]+\s*selected$/);
  if ((await bar.count()) === 0) return null;
  return Number((await bar.first().innerText()).replace(/\D/g, ""));
}
