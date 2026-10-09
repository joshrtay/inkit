// The site's confirm dialog (components/ConfirmDialog.tsx) in paint: Clear the page asks first, in
// the dialog rather than the browser's confirm(); Cancel (or Escape) keeps the drawing, Clear clears
// it, and Undo brings it back. Focus goes back to the … button, since its menu has closed.
import { expect, test, type Page } from "@playwright/test";
import { draftOf, openPaint, puzzleKey } from "./paint-helpers";

// CONFIRM_SHOTS=<folder> saves the Clear dialog, light and dark
const shot = async (page: Page, name: string) => {
  if (process.env.CONFIRM_SHOTS) await page.screenshot({ path: `${process.env.CONFIRM_SHOTS}/${name}.png` });
};

test("paint's Clear the page: the dialog, Cancel, Escape and Clear", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => { errors.push(`a browser dialog: ${d.message()}`); void d.dismiss(); });
  const id = draftOf("akari");
  await openPaint(page, id);
  const original = await puzzleKey(page);
  expect(original).not.toBe("");
  const more = page.locator(".sp-doc-slot").getByRole("button", { name: "More" });
  const dialog = page.getByRole("alertdialog", { name: "Clear the page?" });
  const clear = async () => { await more.click(); await page.getByRole("menuitem", { name: "Clear the page" }).click(); await expect(dialog).toBeVisible(); };

  // Cancel: nothing changes
  await clear();
  await expect(dialog.getByRole("button", { name: "Clear" })).toHaveClass(/\bdanger\b/);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();
  expect(await puzzleKey(page)).toBe(original);

  // Escape: the same, and paint's own keys don't see it
  await clear();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();
  expect(await puzzleKey(page)).toBe(original);

  if (process.env.CONFIRM_SHOTS) {
    for (const theme of ["dark", "light"]) {
      await page.evaluate((t) => { localStorage.setItem("inkit:theme", t); }, theme);
      await openPaint(page, id);
      await clear();
      await page.waitForTimeout(300);
      await shot(page, `clear-${theme}`);
      await page.keyboard.press("Escape");
    }
    await page.evaluate(() => localStorage.removeItem("inkit:theme"));
  }

  // Clear: the page is empty; Undo brings it back
  await clear();
  await dialog.getByRole("button", { name: "Clear" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => puzzleKey(page)).not.toBe(original);
  await page.locator(".sp-doc-slot").getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => puzzleKey(page)).toBe(original);
  expect(errors).toEqual([]);
});

test("on a phone, the dialog fits the screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openPaint(page, draftOf("akari"));
  const more = page.locator(".sp-doc:visible").getByRole("button", { name: "More" });
  await more.click();
  await page.getByRole("menuitem", { name: "Clear the page" }).click();
  const box = await page.getByRole("alertdialog", { name: "Clear the page?" }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(box!.y + box!.height).toBeLessThanOrEqual(812);
  await shot(page, "clear-phone");
  await page.keyboard.press("Escape");
});
