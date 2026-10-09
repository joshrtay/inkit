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
/** The drawer's tabs and the verdict button (docs/creation-flow.md, "v3 layout"). */
const tab = (page: Page, name: "This puzzle" | "Types") => page.getByRole("tab", { name });
const verdict = (page: Page) => page.locator(".paint-verdict-btn");
async function chooseType(page: Page, name: RegExp) {
  await page.locator(".paint-type").click();
  await expect(tab(page, "Types")).toHaveAttribute("aria-selected", "true");
  const list = page.locator(".paint-type-list");
  await expect(list.getByRole("button", { name }).first()).toBeVisible();
  await list.getByRole("button", { name }).first().click();
  await expect(tab(page, "This puzzle")).toHaveAttribute("aria-selected", "true");
}
/** A problem in This puzzle: a link that points at the canvas. */
const problem = (page: Page, name: RegExp) => page.locator(".paint-drawer").getByRole("button", { name });

test("a 6 × 6 Sudoku: type, a broken rule found and marked, fixed, and it all survives a reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = blankDraft("sudoku");
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();

  // no type yet: Check and Publish look disabled
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await expect(verdict(page)).toHaveText(/Check/);
  await expect(verdict(page)).toHaveAttribute("aria-disabled", "true");
  await expect(publish).toHaveAttribute("aria-disabled", "true");

  // a 6 × 6 grid (288 units: six of a board's 48-unit squares)
  await drag(page, [60, 60], [348, 348]);
  await expect(page.locator(".sp-board")).toHaveAttribute("data-grid", "6x6");
  await shot(page, "1-no-type");

  await chooseType(page, /^Sudoku/);
  await expect(page.locator(".paint-type-name")).toHaveText("Sudoku");
  await expect(verdict(page)).not.toHaveAttribute("aria-disabled", "true");
  // the type's tools only, and All tools for the rest
  await expect(page.locator(".sp-tools .sp-tool")).toHaveCount(3);
  await expect(page.locator(".sp-tools").getByRole("button", { name: "Pen", exact: true })).toHaveCount(0);
  // This puzzle: the guide's rules as a checklist, with the solution line last
  const rules = page.getByRole("list", { name: "Rules" });
  await expect(rules.locator(".paint-line")).toHaveCount(3);
  await expect(rules.locator(".paint-line").first()).toContainText("Every row and every column has each digit once.");
  await expect(rules.locator(".paint-line").last()).toContainText("Exactly one solution");
  // the box rule carries its setting
  await expect(rules.locator(".paint-line").nth(1).getByRole("group", { name: "Box shape" })).toBeVisible();

  // a conflicting digit: No solution at once, the rule crossed with its problem under it
  await tool(page, "Text");
  await write(page, 0, 3, "2");
  await write(page, 5, 0, "5");
  await write(page, 5, 4, "5");
  await expect(verdict(page)).toHaveText(/No solution/);
  await expect(publish).toHaveAttribute("aria-disabled", "true");
  await verdict(page).click();
  await expect(tab(page, "This puzzle")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".paint-pill")).toContainText("No solution");
  const latin = rules.locator(".paint-line").first();
  await expect(latin).toHaveAttribute("data-mark", "bad");
  await expect(latin.getByRole("button", { name: /Two 5s in row 6/ })).toHaveAttribute("aria-pressed", "true");
  await expect(rules.locator(".paint-line").last()).toHaveAttribute("data-mark", "none");
  await expect(page.locator(".sp-mark.selected .sp-mark-ring")).toHaveCount(2);
  await expect(page.locator(".paint-tip")).toContainText("Each row holds 1 to 6 once");
  await shot(page, "3-broken-rule");

  // the error link points at the canvas: off, then on again, its mark selected on the paper
  await problem(page, /Two 5s in row 6/).click();
  await expect(page.locator(".sp-mark.selected")).toHaveCount(0);
  await expect(page.locator(".paint-tip")).toHaveCount(0);
  await problem(page, /Two 5s in row 6/).click();
  await expect(page.locator('.sp-mark.selected[data-n="1"] .sp-mark-ring')).toHaveCount(2);
  await expect(page.locator(".sp-paper-tip .paint-tip")).toBeVisible();

  // fixed: the verdict updates (a few clues: several solutions), the difference under the solution line
  await write(page, 5, 4, "3");
  await expect(verdict(page)).toHaveText(/Several solutions/, { timeout: 15_000 });
  await expect(latin).toHaveAttribute("data-mark", "ok");
  const last = rules.locator(".paint-line").last();
  await expect(last).toHaveAttribute("data-mark", "bad");
  await last.getByRole("button", { name: /can be a .+ or a/ }).first().click();
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
  await expect(verdict(page)).toHaveText(/Several solutions/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("Check and Publish without a type: the reminder in Types, and the Type button bounces", async ({ page }) => {
  const id = blankDraft("remind");
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();
  // with no type the drawer starts at Types; This puzzle says there's nothing to check yet
  await expect(tab(page, "Types")).toHaveAttribute("aria-selected", "true");
  await tab(page, "This puzzle").click();
  await expect(page.locator(".paint-puzzle")).toContainText("No type yet");
  // aria-disabled, not disabled: they still take a click (force: Playwright waits for "enabled" otherwise)
  await verdict(page).click({ force: true });
  await expect(tab(page, "Types")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("alert").filter({ hasText: "Choose a type first" })).toBeVisible();
  await expect(page.locator(".paint-type")).toHaveClass(/bounce/);
  await expect(page.locator(".paint-type")).toHaveClass(/ringed/);
  await shot(page, "2-needs-type");
  // Publish does the same, from This puzzle
  await tab(page, "This puzzle").click();
  await page.getByRole("button", { name: "Publish", exact: true }).click({ force: true });
  await expect(tab(page, "Types")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("alert").filter({ hasText: "Choose a type first" })).toBeVisible();
  await expect(page.locator(".paint-type")).toHaveClass(/bounce/);
  expect(saved(id).drawing).toBeNull();   // nothing drawn, nothing saved
});

test("a Panel on tracks, with a start and an end, is Solvable; its solution shows on the board while pointed at", async ({ page }) => {
  const id = blankDraft("panel");
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();
  await drag(page, [60, 60], [252, 252]);   // 4 × 4
  await expect(page.locator(".sp-board")).toHaveAttribute("data-grid", "4x4");
  await chooseType(page, /^Panel/);
  // the grid takes the panel's look: tracks
  await expect.poll(() => page.locator(".sp-board .panel-track").count()).toBeGreaterThan(0);
  await expect(page.locator(".sp-tools .sp-tool")).toHaveCount(3);
  // the Stamp palette: the panel's stamps and their colours
  await tool(page, "Stamp");
  const palette = page.getByRole("region", { name: "Stamp options" });
  await palette.getByRole("button", { name: "Start", exact: true }).click();
  await tap(page, 60, 252);
  await palette.getByRole("button", { name: "End", exact: true }).click();
  await tap(page, 252, 60);
  await palette.getByRole("button", { name: "Stone", exact: true }).click();
  await expect(palette.getByRole("group", { name: "Stone colour" })).toBeVisible();
  await tap(page, ...sq(1, 1));
  await expect(verdict(page)).toHaveText(/Solvable/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Publish", exact: true })).not.toHaveAttribute("aria-disabled", "true");
  await verdict(page).click();
  const rules = page.getByRole("list", { name: "Rules" });
  // the line, the squares (the stone), and At least one solution: no lines for symbols it doesn't use
  await expect(rules.locator(".paint-line")).toHaveCount(3);
  await expect(rules.locator(".paint-line").last()).toContainText("At least one solution");
  await expect(rules.locator('.paint-line[data-mark="ok"]')).toHaveCount(3);
  // the line rule carries the panel's Lines setting
  await expect(rules.locator(".paint-line").first().locator(".paint-field, .paint-switch").first()).toBeVisible();
  const solution = page.locator(".paint-solution");
  await expect(solution.locator("svg")).toBeVisible();
  await expect(page.locator(".sp-solution")).toHaveCount(0);
  await solution.hover();
  await expect.poll(() => page.locator(".sp-solution .sp-sol-line").count()).toBeGreaterThan(2);
  await shot(page, "5-panel-solvable");
  await page.locator(".sp-status").hover();
  await expect(page.locator(".sp-solution")).toHaveCount(0);
  // a number doesn't fit a panel: flagged under Your drawing, and left out
  await page.getByRole("button", { name: "All tools" }).click();
  await tool(page, "Text");
  await write(page, 3, 3, "3");
  const yours = page.getByRole("list", { name: "Your drawing" });
  await expect(yours.getByRole("button", { name: /isn't part of Panel/ })).toBeVisible();
  await yours.getByRole("button", { name: /isn't part of Panel/ }).click();
  await expect(page.locator(".sp-mark.misfit.selected .sp-mark-box")).toHaveCount(1);
  await expect(verdict(page)).toHaveText(/Solvable/);
  await shot(page, "6-panel-doesnt-fit");
});

test("the palette stays put across tools and is always open; the drawer folds to a strip; Type opens Types", async ({ page }) => {
  const id = blankDraft("chrome");
  await page.addInitScript(() => { if (!sessionStorage.getItem("keep")) { localStorage.removeItem("inkit:paint-drawer"); } });
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();
  await page.getByRole("button", { name: "Add a grid" }).click();
  // one place, whichever tool: the header names the tool, the contents swap
  const palette = page.locator(".sp-palette");
  const box0 = (await palette.boundingBox())!;
  const places: { x: number; y: number }[] = [];
  for (const [name, has] of [["Pen", "Pen weight"], ["Stamp", "Stamps"], ["Wash", "Wash colour"], ["Text", "Text size"], ["Eraser", null], ["Grid", "Grid look"]] as const) {
    await tool(page, name);
    await expect(palette.locator(".sp-pal-head strong")).toHaveText(name);
    if (has) await expect(palette.getByRole("group", { name: has })).toBeVisible();
    else await expect(palette).toContainText("rub it out");   // the eraser has nothing to set: its hint
    const b = (await palette.boundingBox())!;
    places.push({ x: Math.round(b.x), y: Math.round(b.y) });
  }
  expect(places.every((p) => p.x === Math.round(box0.x) && p.y === Math.round(box0.y))).toBe(true);

  // always open: there's nothing to fold it away with
  await expect(palette.getByRole("button", { name: /Hide the tool options/ })).toHaveCount(0);
  await expect(palette.locator(".sp-pal-head small")).toHaveCount(0);   // no stray shortcut letter

  // the drawer folds to a strip of icons, and opens again
  await page.getByRole("button", { name: "Collapse the drawer" }).click();
  await expect(page.locator(".paint-drawer")).toHaveCount(0);
  const strip = page.getByRole("navigation", { name: /folded/ });
  await expect(strip).toBeVisible();
  // the drawer folded: the paper has the room (the palette stays)
  await shot(page, "8-folded");
  // Type opens the drawer at Types
  await page.locator(".paint-type").click();
  await expect(tab(page, "Types")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".paint-type")).toHaveAttribute("aria-expanded", "true");
  await page.locator(".paint-type-list").getByRole("button", { name: /^Akari/ }).first().click();
  await expect(tab(page, "This puzzle")).toHaveAttribute("aria-selected", "true");
  // More about: the type's guide in the drawer, with a way back
  await page.locator(".paint-drawer").getByRole("button", { name: "More about Akari" }).click();
  await expect(tab(page, "Types")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "About Akari" }).getByRole("heading", { name: "Akari" })).toBeVisible();
  await page.getByRole("button", { name: "← All types" }).click();
  await expect(page.locator(".paint-type-list")).toBeVisible();
  // the strip's This puzzle opens it there
  await page.getByRole("button", { name: "Collapse the drawer" }).click();
  await strip.getByRole("button", { name: /This puzzle/ }).click();
  await expect(tab(page, "This puzzle")).toHaveAttribute("aria-selected", "true");
});

test("a phone: the drawer as a bottom sheet with its handle, the palette a strip above the tools", async ({ page }) => {
  const id = blankDraft("phone");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();
  await expect(page.locator(".paint-drawer")).toHaveCount(0);
  await drag(page, [60, 60], [348, 348]);
  await chooseType(page, /^Sudoku/);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".paint-drawer")).toHaveCount(0);
  await tool(page, "Text");
  await expect(page.locator(".sp-palette").getByRole("group", { name: "Text size" })).toBeVisible();
  await expect(page.locator(".sp-palette").getByRole("button", { name: "Undo" })).toBeVisible();
  await write(page, 5, 0, "5");
  await write(page, 5, 4, "5");
  await expect(page.locator(".paint-sheet-handle")).toContainText("1 broken rule");
  await shot(page, "7-phone");
  await verdict(page).click();
  await expect(page.locator(".paint-drawer")).toBeVisible();
  await expect(problem(page, /Two 5s in row 6/)).toHaveAttribute("aria-pressed", "true");
  await shot(page, "7-phone-sheet");
  // a problem tapped: the sheet makes way for the paper and its tip
  await problem(page, /Two 5s in row 6/).click();
  await problem(page, /Two 5s in row 6/).click();
  await expect(page.locator(".paint-drawer")).toHaveCount(0);
  await expect(page.locator(".paint-tip")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
