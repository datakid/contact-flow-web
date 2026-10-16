import { TEMPLATE_ROWS } from "../../src/core/formats/templates";
import { expect, importFile, libraryCount, openApp, test } from "./fixtures";
import type { Page } from "@playwright/test";

const templateCount = TEMPLATE_ROWS.length;

async function exportAs(page: Page, format: string, savePath: string): Promise<void> {
  await page.getByRole("button", { name: "Export" }).first().click();
  await page.getByRole("combobox", { name: "Format" }).click();
  await page.getByRole("option", { name: format }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /save file/i }).click()]);
  await download.saveAs(savePath);
}

for (const [file, label] of [["template.vcf", "vCard"], ["contacts.json", "JSON"], ["template.csv", "CSV"]] as const) {
  test(`imports ${label} with the expected number of contacts`, async ({ page }) => {
    await openApp(page);
    await importFile(page, file);
    await expect.poll(() => libraryCount(page)).toBe(templateCount);
  });
}

for (const [format, extension] of [["CSV", "csv"], ["vCard", "vcf"]] as const) {
  test(`exports ${format} and imports it back to the same total`, async ({ page, browser }, testInfo) => {
    await openApp(page);
    await importFile(page, "template.csv");
    const original = await libraryCount(page);
    const saved = testInfo.outputPath(`export.${extension}`);
    await exportAs(page, format, saved);
    const context = await browser.newContext();
    const fresh = await context.newPage();
    await openApp(fresh);
    await importFile(fresh, saved);
    await expect.poll(() => libraryCount(fresh)).toBe(original);
    await context.close();
  });
}
