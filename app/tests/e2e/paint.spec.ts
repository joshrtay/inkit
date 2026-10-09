// Paint as a draft's editor (/g/<id>/draw: components/Paint.tsx): draw a puzzle, choose its type,
// and Check says whether it's a puzzle, live. Each test starts from a blank draft of its own
// (made here in the local database, as /new will make one), and checks what was saved.
// PAINT_SHOTS=<folder> also saves a screenshot of each main state there.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { q, sql } from "./db";
import { blankDraft } from "./paint-helpers";

const shot = async (page: Page, name: string) => {
  if (process.env.PAINT_SHOTS) await page.screenshot({ path: `${process.env.PAINT_SHOTS}/${name}.png` });
};

const saved = (id: string) => sql<{ drawing: string | null; kind: string; sketch: string; title: string }>(`select drawing, kind, sketch, title from games where id = ${q(id)}`)[0];

async function at(page: Page, x: number, y: number) {
  // the page point through the sketchpad's view (pans and zooms: sketchpad/view.ts), in the window's pixels
  return page.locator(".sp-board").evaluate((svg: SVGSVGElement, p) => {
    const t = svg.getScreenCTM()!;
    return { x: t.a * p.x + t.c * p.y + t.e, y: t.b * p.x + t.d * p.y + t.f };
  }, { x, y });
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
/** Type ▾, then a type's ✓ ("Use …") in the list. */
async function chooseType(page: Page, name: string) {
  await page.locator(".paint-type").click();
  await expect(tab(page, "Types")).toHaveAttribute("aria-selected", "true");
  const use = page.locator(".paint-type-list").getByRole("button", { name: `Use ${name}`, exact: true });
  await expect(use).toBeVisible();
  await use.click();
  // the type is applied; the drawer stays at Types and nothing is checked yet
  await expect(page.locator(".paint-type-name")).toHaveText(name);
  await expect(tab(page, "Types")).toHaveAttribute("aria-selected", "true");
  await expect(verdict(page)).toHaveAttribute("data-verdict", "unchecked");
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

  await chooseType(page, "Sudoku");
  await expect(page.locator(".paint-type-name")).toHaveText("Sudoku");
  await expect(verdict(page)).not.toHaveAttribute("aria-disabled", "true");
  // the type's tools only, and All tools for the rest
  await expect(page.locator(".sp-tools .sp-tool")).toHaveCount(3);
  await expect(page.locator(".sp-tools").getByRole("button", { name: "Pen", exact: true })).toHaveCount(0);
  // This puzzle: the guide's rules as a checklist, with the solution line last; not checked yet
  await tab(page, "This puzzle").click();
  await expect(page.locator(".paint-pill")).toHaveText("Not checked yet");
  const rules = page.getByRole("list", { name: "Rules" });
  await expect(rules.locator(".paint-line")).toHaveCount(3);
  await expect(rules.locator(".paint-line").first()).toContainText("Every row and every column has each digit once.");
  await expect(rules.locator(".paint-line").last()).toContainText("Exactly one solution");
  // the box rule carries its setting
  await expect(rules.locator(".paint-line").nth(1).getByRole("group", { name: "Box shape" })).toBeVisible();

  // a conflicting digit: nothing marked, no verdict, until Check
  await tool(page, "Text");
  await write(page, 0, 3, "2");
  await write(page, 5, 0, "5");
  await write(page, 5, 4, "5");
  await expect(page.locator(".sp-mark")).toHaveCount(0);
  await expect(verdict(page)).toHaveAttribute("data-verdict", "unchecked");
  await expect(publish).not.toHaveAttribute("aria-disabled", "true");
  // Check: No solution at once, the rule crossed with its problem under it
  await verdict(page).click();
  await expect(verdict(page)).toHaveText(/No solution/);
  await expect(publish).toHaveAttribute("aria-disabled", "true");
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
  // a new visit: not checked until Check
  await expect(verdict(page)).toHaveAttribute("data-verdict", "unchecked");
  await verdict(page).click();
  await expect(verdict(page)).toHaveText(/Several solutions/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("choosing a type checks nothing; Check runs the solver, shows the verdict and opens This puzzle; a new type resets it", async ({ page }) => {
  let workers = 0;
  page.on("worker", () => { workers++; });
  const id = blankDraft("check-later");
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();
  await drag(page, [60, 60], [204, 204]);   // 3 × 3
  await chooseType(page, "Sudoku");
  await expect(verdict(page)).toContainText("Check");
  await page.waitForTimeout(1500);   // longer than the solver's wait after a change
  expect(workers).toBe(0);
  await expect(verdict(page)).toHaveAttribute("data-verdict", "unchecked");
  await verdict(page).click();
  await expect(tab(page, "This puzzle")).toHaveAttribute("aria-selected", "true");
  await expect(verdict(page)).not.toHaveAttribute("data-verdict", /^(unchecked|checking)$/, { timeout: 30_000 });
  await expect(page.locator(".paint-pill")).not.toHaveText("Not checked yet");
  // live from now on: a change is checked again
  await tool(page, "Text");
  await write(page, 0, 0, "1");
  await expect(verdict(page)).not.toHaveAttribute("data-verdict", /^(unchecked|checking)$/, { timeout: 30_000 });
  // a new type: back to Check
  await chooseType(page, "Akari");
  await expect(verdict(page)).toHaveAttribute("data-verdict", "unchecked");
  await expect(page.locator(".sp-mark")).toHaveCount(0);
});

test("Publish with a type but no check: it checks first, then opens This puzzle when it doesn't pass", async ({ page }) => {
  const id = blankDraft("publish-check");
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();
  await drag(page, [60, 60], [252, 252]);   // an empty 4 × 4: several solutions
  await chooseType(page, "Sudoku");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(verdict(page)).toHaveText(/Several solutions/, { timeout: 30_000 });
  await expect(tab(page, "This puzzle")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/draw$/);
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
  await chooseType(page, "Panel");
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
  await verdict(page).click();
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
  // a row is for browsing: clicked, it shows the type's guide and chooses nothing
  await page.locator(".paint-type-list").getByRole("button", { name: "Akari: more about it" }).click();
  const about = page.getByRole("region", { name: "About Akari" });
  await expect(about.getByRole("heading", { name: "Akari" })).toBeVisible();
  await expect(page.locator(".paint-type-name")).toHaveText("Not set");
  await expect(tab(page, "Types")).toHaveAttribute("aria-selected", "true");
  await shot(page, "9-about-type");
  // back to the list; its ✓ chooses it
  await page.getByRole("button", { name: "← All types" }).click();
  await page.locator(".paint-type-list").getByRole("button", { name: "Use Akari", exact: true }).click();
  await expect(page.locator(".paint-type-name")).toHaveText("Akari");
  await expect(tab(page, "Types")).toHaveAttribute("aria-selected", "true");   // the drawer stays put
  // the ✓ shows the type in use
  await page.locator(".paint-type").click();
  await expect(page.locator(".paint-type-list").getByRole("button", { name: "Akari: in use" })).toHaveAttribute("aria-pressed", "true");
  // on a guide, "Use …" chooses: Nurikabe's, from its row
  await page.locator(".paint-type-list").getByRole("button", { name: "Nurikabe: more about it" }).click();
  await page.getByRole("region", { name: "About Nurikabe" }).getByRole("button", { name: "Use Nurikabe" }).click();
  await expect(page.locator(".paint-type-name")).toHaveText("Nurikabe");
  // More about (This puzzle's foot): the guide, the type in use, and a way back
  await tab(page, "This puzzle").click();
  await page.locator(".paint-drawer").getByRole("button", { name: "More about Nurikabe" }).click();
  await expect(page.getByRole("region", { name: "About Nurikabe" })).toContainText("In use");
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
  await chooseType(page, "Sudoku");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".paint-drawer")).toHaveCount(0);
  await tool(page, "Text");
  await expect(page.locator(".sp-palette").getByRole("group", { name: "Text size" })).toBeVisible();
  await expect(page.locator(".sp-palette").getByRole("button", { name: "Undo" })).toBeVisible();
  await write(page, 5, 0, "5");
  await write(page, 5, 4, "5");
  await expect(page.locator(".paint-sheet-handle")).toContainText("Check");
  await shot(page, "7-phone");
  await verdict(page).click();
  await expect(page.locator(".paint-drawer")).toBeVisible();
  await page.locator(".paint-drawer-close").click();
  await expect(page.locator(".paint-sheet-handle")).toContainText("1 broken rule");
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

// ---- the sketchpad's own (it was /new/draw before paint) ----

test("a grid, a stone and a number; undo and redo by key; the drawing downloaded as a PNG", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/g/${blankDraft("png")}/draw`);
  const board = page.locator(".sp-board");
  await expect(board).toBeVisible();
  // with no type, every stamp, in one list (many belong to several types)
  await tool(page, "Stamp");
  await expect(page.getByRole("group", { name: "Stamps" }).getByRole("button")).toHaveCount(18);

  // a grid: 336 units across is 7 squares of a board's 48; then one row fewer
  await tool(page, "Grid");
  await drag(page, [60, 60], [396, 396]);
  await expect(board).toHaveAttribute("data-grid", "7x7");
  await page.getByRole("button", { name: "Fewer rows" }).click();
  await expect(board).toHaveAttribute("data-grid", "6x7");

  // a black stone, snapped to the middle of the top-left square
  await tool(page, "Stamp");
  await page.getByRole("button", { name: "Stone", exact: true }).click();
  await tap(page, 60 + 48 * 0.3, 60 + 48 * 0.7);
  await expect(board.locator(".sp-ink .stone")).toHaveCount(1);
  const stone = board.locator(".sp-ink .stone circle").first();
  expect(Number(await stone.getAttribute("cx"))).toBeCloseTo(84, 0);
  expect(Number(await stone.getAttribute("cy"))).toBeCloseTo(84, 0);

  // a number in the square below and to the right of it; undo takes it away, redo brings it back
  await tool(page, "Text");
  await write(page, 1, 1, "5");
  await expect(board.locator("text.sp-text")).toHaveText("5");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(board.locator("text.sp-text")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(board.locator("text.sp-text")).toHaveText("5");

  // the picture: a PNG 1600px across on paper, cropped to the drawing (the 7 × 6 grid at (60, 60)
  // with a margin of 12 units: view.ts's fitBox), with the stone's ink where the stone is
  const download = page.waitForEvent("download");
  await page.locator(".studio-top").getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Download a picture" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("untitled.png");
  const png = readFileSync((await file.path())!);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const box = { x: 48, y: 48, w: 360, h: 312 };
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1600, Math.round(1600 * box.h / box.w)]);
  const shades = await page.evaluate(async ({ data, box }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const k = img.width / box.w, light = (x: number, y: number) => { const [r, g, b] = ctx.getImageData(Math.round((x - box.x) * k), Math.round((y - box.y) * k), 1, 1).data; return (r + g + b) / 3; };
    // the stone, and an empty square's middle (row 5, column 6)
    return { stone: light(84, 84), paper: light(324, 276) };
  }, { data: png.toString("base64"), box }).then((x) => x);
  expect(shades.stone).toBeLessThan(110);
  expect(shades.paper).toBeGreaterThan(230);
  expect(errors).toEqual([]);
});

test("the tool rail: arrow keys and letters; zoom", async ({ page }) => {
  await page.goto(`/g/${blankDraft("keys")}/draw`);
  const rail = page.getByRole("toolbar", { name: "Tools" });
  const pen = rail.getByRole("button", { name: "Pen", exact: true });
  // (again until the page has hydrated and the rail listens for its arrow keys)
  await expect(async () => {
    await rail.getByRole("button", { name: "Grid", exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(pen).toBeFocused({ timeout: 500 });
  }).toPass();
  await page.keyboard.press("Enter");
  await expect(pen).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  // a letter picks a tool
  await page.keyboard.press("w");
  await expect(rail.getByRole("button", { name: "Wash", exact: true })).toHaveAttribute("aria-pressed", "true");
  // zoom: Cmd/Ctrl + zooms in a step, 0 fits again
  const board = page.locator(".sp-board"), fit = page.getByRole("button", { name: "Zoom to fit" });
  const k = async () => Number((await board.getAttribute("data-view"))!.split(",")[2]);
  const k0 = await k(), shown = await fit.textContent();
  expect(shown).toBe(`${Math.round(k0 * 100)}%`);
  await page.keyboard.press("ControlOrMeta+=");
  await expect.poll(k).toBeCloseTo(k0 * 1.25, 3);
  await page.keyboard.press("ControlOrMeta+0");
  await expect.poll(k).toBeCloseTo(k0, 3);
  await expect(fit).toHaveText(shown!);
});
