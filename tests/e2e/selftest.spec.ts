import { closeDialogs, expect, libraryCount, loadSample, openApp, test } from "./fixtures";

test("the in-app self-test passes and leaves the library unchanged", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  const before = await libraryCount(page);
  await page.goto("/?selftest=1");
  await expect(page.getByRole("dialog", { name: "Self-test" })).toBeVisible({ timeout: 30000 });
  const summary = page.getByTestId("selftest-summary");
  await expect(summary).toHaveText(/\d+ passed, \d+ warnings, 0 failed/, { timeout: 120000 });
  await closeDialogs(page);
  await expect.poll(() => libraryCount(page)).toBe(before);
});

test("the self-test can be opened from Settings and cancelled", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Run self-test" }).click();
  await expect(page.getByRole("dialog", { name: "Self-test" })).toBeVisible();
  await page.getByRole("button", { name: "Run self-test" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Stopped before finishing")).toBeVisible();
});
