// Paint as a draft's editor (/g/<id>/draw: components/Paint.tsx): draw a puzzle, choose its type,
// and Check says whether it's a puzzle, live. Each test starts from a blank draft of its own
// (made here in the local database, as /new will make one), and checks what was saved.
// PAINT_SHOTS=<folder> also saves a screenshot of each main state there.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { q, RUN_FILE, sql, type Run } from "./db";

const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
const PAGE = 560;   // the sketchpad's page, in its own units (sketchpad/model.ts)
const shot = async (page: Page, name: string) => {
  if (process.env.PAINT_SHOTS) await page.screenshot({ path: `${process.env.PAINT_SHOTS}/${name}.png` });
};

/** A blank draft: no type, no sketch, no drawing. */
function blankDraft(name: string) {
  const id = `e2e-paint-${name}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  sql(`insert into games (id, collection_id, author_id, title, description, sketch, sketch_version, kind, parse_notes, kind_choices, state)
    values (${q(id)}, ${q(run.collectionId)}, ${q(run.userId)}, 'Untitled', '', '', 1, '', '[]', '[]', 'draft')`);
  return id;
}
const saved = (id: string) => sql<{ drawing: string | null; kind: string; sketch: string; title: string }>(`select drawing, kind, sketch, title from games where id = ${q(id)}`)[0];

async function at(page: Page, x: number, y: number) {
  const box = (await page.locator(".sp-board").boundingBox())!;
  return { x: box.x + (x / PAGE) * box.width, y: box.y + (y / PAGE) * box.height };
}
async function tap(page: Page, x: number, y: number) { const p = await at(page, x, y); await page.mouse.click(p.x, p.y); }
async function drag(page: Page, [x0, y0]: [number, number], [x1, y1]: [number, number]) {
  const a = await at(page, x0, y0), b = await at(page, x1, y1);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
}
const tool = (page: Page, name: string) => page.locator(".sp-tools").getByRole("button", { name, exact: true }).click();
/** The middle of square (r, c) of a grid of 48-unit squares at (60, 60). */
const sq = (r: number, c: number): [number, number] => [60 + 48 * c + 24, 60 + 48 * r + 24];
async function write(page: Page, r: number, c: number, text: string) {
  await tap(page, ...sq(r, c));
  const box = page.locator(".sp-typing");
  await expect(box).toBeFocused();
  await box.fill(text);
  await box.press("Enter");
}
async function chooseType(page: Page, name: RegExp) {
  await page.locator(".paint-type").click();
  const picker = page.getByRole("dialog", { name: "Puzzle type" });
  await expect(picker.getByRole("button", { name }).first()).toBeVisible();
  await picker.getByRole("button", { name }).first().click();
  await expect(picker).toHaveCount(0);
}
const chip = (page: Page) => page.locator(".paint-chip").first();

test("a 6 × 6 Sudoku: type, a broken rule found and marked, fixed, and it all survives a reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = blankDraft("sudoku");
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();

  // no type yet: Check and Publish look disabled, and say so when clicked
  const check = page.getByRole("button", { name: "Check", exact: true }), publish = page.getByRole("button", { name: "Publish", exact: true });
  await expect(check).toHaveAttribute("aria-disabled", "true");
  await expect(publish).toHaveAttribute("aria-disabled", "true");
  await expect(chip(page)).toHaveText("No type yet, so nothing to check");

  // a 6 × 6 grid (288 units: six of a board's 48-unit squares)
  await drag(page, [60, 60], [348, 348]);
  await expect(page.locator(".sp-board")).toHaveAttribute("data-grid", "6x6");
  await shot(page, "1-no-type");

  await chooseType(page, /^Sudoku/);
  await expect(page.locator(".paint-type-name")).toHaveText("Sudoku");
  await expect(check).not.toHaveAttribute("aria-disabled", "true");
  await expect(publish).not.toHaveAttribute("aria-disabled", "true");
  // the type's tools only, and All tools for the rest
  await expect(page.locator(".sp-tools .sp-tool")).toHaveCount(3);
  await expect(page.locator(".sp-tools").getByRole("button", { name: "Pen", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sudoku rules" })).toBeVisible();

  // a conflicting digit: No solution at once, the rule listed and marked
  await tool(page, "Text");
  await write(page, 0, 3, "2");
  await write(page, 5, 0, "5");
  await write(page, 5, 4, "5");
  await expect(chip(page)).toHaveText(/No solution · 1 broken rule/);
  await chip(page).click();
  const panel = page.getByRole("region", { name: "Check" });
  await expect(panel.locator(".paint-verdict")).toContainText("No solution");
  await expect(panel.getByRole("button", { name: /Two 5s in row 6/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".sp-mark.selected .sp-mark-ring")).toHaveCount(2);
  await expect(page.locator(".paint-tip")).toContainText("Each row holds 1 to 6 once");
  await shot(page, "3-broken-rule");

  // fixed: the verdict updates (a few clues: several solutions), and Check offers a difference
  await write(page, 5, 4, "3");
  await expect(chip(page)).toHaveText(/Several solutions/, { timeout: 15_000 });
  await expect(panel.locator(".paint-verdict")).toContainText("Several solutions");
  await panel.getByRole("button", { name: "Show a difference" }).click();
  await expect(page.locator(".paint-tip")).toContainText(/can be a .+ or a/);
  await shot(page, "4-several");

  // saved to the server: the drawing, the type and the converted sketch
  await expect(page.locator(".paint-saved")).toHaveText("Saved", { timeout: 15_000 });
  await expect.poll(() => saved(id).kind, { timeout: 10_000 }).toBe("sudoku");
  const row = saved(id);
  expect(JSON.parse(row.drawing!).genre).toBe("sudoku");
  expect(row.sketch.startsWith("sudoku\n")).toBe(true);
  expect(JSON.parse(row.sketch.slice(row.sketch.indexOf("\n") + 1)).givens).toHaveLength(3);

  // a reload brings it all back from the server (this browser's copy is cleared first)
  await page.evaluate((k) => localStorage.removeItem(k), `inkit:draw:${id}`);
  await page.reload();
  await expect(page.locator(".paint-type-name")).toHaveText("Sudoku");
  await expect(page.locator(".sp-board text.sp-text")).toHaveCount(3);
  await expect(chip(page)).toHaveText(/Several solutions/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("Check and Publish without a type: the reminder, and the Type button bounces", async ({ page }) => {
  const id = blankDraft("remind");
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();
  // aria-disabled, not disabled: they still take a click (force: Playwright waits for "enabled" otherwise)
  await page.getByRole("button", { name: "Check", exact: true }).click({ force: true });
  await expect(page.getByRole("alertdialog", { name: "Choose a type first" })).toBeVisible();
  await expect(page.locator(".paint-type")).toHaveClass(/bounce/);
  await expect(page.locator(".paint-type")).toHaveClass(/ringed/);
  await shot(page, "2-needs-type");
  // a click elsewhere closes it; Publish opens it again
  await page.locator(".sp-status-facts").click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Publish", exact: true }).click({ force: true });
  await expect(page.getByRole("alertdialog", { name: "Choose a type first" })).toBeVisible();
  await expect(page.locator(".paint-type")).toHaveClass(/bounce/);
  // Choose a type opens the picker
  await page.getByRole("alertdialog").getByRole("button", { name: "Choose a type" }).click();
  await expect(page.getByRole("dialog", { name: "Puzzle type" })).toBeVisible();
  expect(saved(id).drawing).toBeNull();   // nothing drawn, nothing saved
});

test("a Panel on tracks, with a start and an end, is Solvable", async ({ page }) => {
  const id = blankDraft("panel");
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();
  await drag(page, [60, 60], [252, 252]);   // 4 × 4
  await expect(page.locator(".sp-board")).toHaveAttribute("data-grid", "4x4");
  await chooseType(page, /^Panel/);
  // the grid takes the panel's look: tracks
  await expect.poll(() => page.locator(".sp-board .panel-track").count()).toBeGreaterThan(0);
  await expect(page.locator(".sp-tools .sp-tool")).toHaveCount(3);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await tap(page, 60, 252);
  await page.getByRole("button", { name: "End", exact: true }).click();
  await tap(page, 252, 60);
  await page.getByRole("button", { name: "Stone", exact: true }).click();
  await tap(page, ...sq(1, 1));
  await expect(chip(page)).toHaveText(/Solvable/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Check", exact: true }).click();
  const panel = page.getByRole("region", { name: "Check" });
  await expect(panel.locator(".paint-verdict")).toContainText("Solvable");
  await expect(panel.locator(".paint-solution svg")).toBeVisible();
  await panel.getByRole("switch", { name: "Draw it on the board" }).check();
  await expect.poll(() => page.locator(".sp-solution .sp-sol-line").count()).toBeGreaterThan(2);
  await shot(page, "5-panel-solvable");
  // a number doesn't fit a panel: flagged, and left out
  await page.getByRole("button", { name: "All tools" }).click();
  await tool(page, "Text");
  await write(page, 3, 3, "3");
  await expect(panel.getByRole("button", { name: /isn't part of Panel/ })).toBeVisible();
  await panel.getByRole("button", { name: /isn't part of Panel/ }).click();
  await expect(page.locator(".sp-mark.misfit.selected .sp-mark-box")).toHaveCount(1);
  await expect(chip(page)).toHaveText(/Solvable/);
  await shot(page, "6-panel-doesnt-fit");
});

test("Panel minimised to a tab, and a phone's layout", async ({ page }) => {
  const id = blankDraft("phone");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();
  await drag(page, [60, 60], [348, 348]);
  await chooseType(page, /^Sudoku/);
  await tool(page, "Text");
  await write(page, 0, 0, "1");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByRole("button", { name: "Minimise" }).click();
  await expect(page.locator(".paint-check-tab")).toBeVisible();
  await shot(page, "7-phone");
});
