import { expect, loadSample, openApp, test } from "./fixtures";

test("the palette focus state stays inside the dialog and uses no outline on the input", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog");
  const input = page.getByRole("combobox");
  await expect(input).toBeFocused();
  const metrics = await input.evaluate((el) => {
    const dialogEl = el.closest("[role=dialog]") as HTMLElement;
    const wrapper = el.parentElement as HTMLElement;
    const wrapperBox = wrapper.getBoundingClientRect();
    const dialogBox = dialogEl.getBoundingClientRect();
    return {
      outlineStyle: getComputedStyle(el).outlineStyle,
      wrapperInside: wrapperBox.top >= dialogBox.top && wrapperBox.bottom <= dialogBox.bottom && wrapperBox.left >= dialogBox.left && wrapperBox.right <= dialogBox.right,
      focusedBorder: getComputedStyle(wrapper).borderBottomColor,
      dialogBorder: getComputedStyle(dialogEl).borderTopColor
    };
  });
  expect(metrics.outlineStyle).toBe("none");
  expect(metrics.wrapperInside).toBe(true);
  expect(metrics.focusedBorder).not.toBe(metrics.dialogBorder);
  await expect(dialog).toBeVisible();
});

test("the active palette option does not jump when contact results arrive", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  await page.keyboard.press("Control+k");
  await page.keyboard.type("a");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const active = page.getByRole("option", { selected: true });
  const before = await active.innerText();
  await page.waitForTimeout(800);
  await expect(active).toHaveText(before);
  await expect(page.getByRole("combobox")).toHaveAttribute("aria-activedescendant", /^cmd-/);
});

test("pressing Enter while composing text does not run a command", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox");
  await input.evaluate((el) => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(input).toBeVisible();
});

test("every static palette command runs without errors", async ({ page }) => {
  await openApp(page);
  await loadSample(page);
  for (const label of ["New contact", "Import", "Export", "Batch edit", "Message queue", "History", "Find duplicates", "Keyboard shortcuts"]) {
    await page.keyboard.press("Control+k");
    await page.keyboard.type(label);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
