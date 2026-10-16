import { expect, loadSample, openApp, test } from "./fixtures";
import type { Page } from "@playwright/test";

async function setPhone(page: Page, contactName: string, number: string): Promise<void> {
  await page.getByRole("row", { name: new RegExp(contactName) }).click();
  const detail = page.getByRole("complementary", { name: contactName });
  await detail.getByRole("button", { name: "Phone" }).first().click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type(number);
  await page.keyboard.press("Enter");
  await expect(detail.getByRole("button", { name: "Phone" }).first()).toHaveText(number);
}

test.beforeEach(async ({ page }) => {
  await page.context().route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "ok" }));
  await page.context().route("https://signal.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "ok" }));
});

test("whatsapp and signal links are valid international links and open", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  await setPhone(page, "Daniel Kim", "+961 3 123 456");
  const detail = page.getByRole("complementary", { name: "Daniel Kim" });
  const whatsapp = detail.getByRole("link", { name: "WhatsApp" });
  const signal = detail.getByRole("link", { name: "Signal" });
  await expect(whatsapp).toHaveAttribute("href", "https://wa.me/9613123456");
  await expect(signal).toHaveAttribute("href", "https://signal.me/#p/+9613123456");
  const [popup] = await Promise.all([page.waitForEvent("popup"), whatsapp.click()]);
  await popup.waitForURL(/^https:\/\/wa\.me\//);
});

test("a number that cannot be converted disables the controls and says why", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  await setPhone(page, "Daniel Kim", "12");
  const detail = page.getByRole("complementary", { name: "Daniel Kim" });
  await expect(detail.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("aria-disabled", "true");
  await expect(detail.getByTitle("Add a country code to this number").first()).toBeVisible();
});

test("the row menu offers valid message links", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  await setPhone(page, "Daniel Kim", "+961 3 123 456");
  await page.getByRole("row", { name: /Daniel Kim/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Message" }).hover();
  await expect(page.getByRole("menuitem", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/9613123456");
  await expect(page.getByRole("menuitem", { name: "Signal" })).toHaveAttribute("href", "https://signal.me/#p/+9613123456");
});
