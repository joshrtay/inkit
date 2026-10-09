// Paint's chrome and workspace (components/Sketchpad.tsx, Paint.tsx, Tooltips.tsx): tooltips in
// their own top layer, on top of everything; the top bar without a title, the save state after
// Type; the open paper that pans and zooms, Fit showing the puzzle itself, a new grid fitted; and
// drawings saved before the open paper still opening as they were.
// PAINT_SHOTS=<folder> also saves a screenshot of each main state there.
import { expect, test, type Page } from "@playwright/test";
import { q, sql } from "./db";
import { blankDraft, drag, P, run, tap, tool } from "./paint-helpers";
import type * as m from "~/sketchpad/model";

const shot = async (page: Page, name: string) => {
  if (process.env.PAINT_SHOTS) await page.screenshot({ path: `${process.env.PAINT_SHOTS}/${name}.png` });
};
const open = async (page: Page, id: string) => {
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();
  await expect(page.locator(".sp-board")).not.toHaveAttribute("data-view", "");
};
/** A page point where it is on screen now (through the view). */
const onScreen = (page: Page, p: m.XY) => page.locator(".sp-board").evaluate((svg: SVGSVGElement, p) => {
  const t = svg.getScreenCTM()!;
  return { x: t.a * p.x + t.c * p.y + t.e, y: t.b * p.x + t.d * p.y + t.f };
}, p);
/** The grid's box on the page (data-grid-box: x, y, width, height in page units). */
async function gridBox(page: Page) {
  const [x, y, w, h] = (await page.locator(".sp-board").getAttribute("data-grid-box"))!.split(",").map(Number);
  return { x, y, w, h };
}
/** The grid's box on screen, through the view. */
async function gridOnScreen(page: Page) {
  const g = await gridBox(page);
  const a = await onScreen(page, { x: g.x, y: g.y }), b = await onScreen(page, { x: g.x + g.w, y: g.y + g.h });
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}
/** The tooltip showing, and whether it's the topmost thing at its middle. */
async function tooltip(page: Page) {
  const tip = page.locator(".tip-layer[data-open]");
  await expect(tip).toBeVisible();
  const onTop = await tip.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el;
  });
  return { tip, onTop };
}

test("tooltips are on top of everything: a rail tool's beside the palette, and Add a grid's", async ({ page }) => {
  await open(page, blankDraft("tips"));
  // the Text tool, on the rail right beside the palette: its tip shows over the palette
  await page.locator(".sp-tools").getByRole("button", { name: "Text", exact: true }).hover();
  let t = await tooltip(page);
  await expect(t.tip).toHaveText("Text (T)");
  expect(t.onTop).toBe(true);
  const tipBox = (await t.tip.boundingBox())!, pal = (await page.locator(".sp-palette").boundingBox())!;
  expect(tipBox.x + tipBox.width).toBeGreaterThan(pal.x);   // it reaches over the palette, and is still seen
  await shot(page, "tip-rail");
  // the accessible name stays the button's
  await expect(page.locator(".sp-tools").getByRole("button", { name: "Text", exact: true })).toHaveAttribute("aria-label", "Text");

  // Add a grid, in the palette
  const add = page.locator(".sp-palette").getByRole("button", { name: "Add a grid" });
  await add.hover();
  t = await tooltip(page);
  await expect(t.tip).toContainText("6 × 6 grid");
  expect(t.onTop).toBe(true);
  await shot(page, "tip-add-grid");
  // it goes when the pointer leaves, and a tap doesn't leave one behind
  await page.mouse.move(5, 500);
  await expect(page.locator(".tip-layer[data-open]")).toHaveCount(0);
  // the keyboard shows it too
  await page.locator(".sp-tools").getByRole("button", { name: "Grid", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  t = await tooltip(page);
  await expect(t.tip).toHaveText("Pen (P)");
});

test("the top bar: no title (it's named on the publish page), the save state after Type", async ({ page }) => {
  await open(page, blankDraft("topbar"));
  const top = page.locator(".studio-top");
  await expect(top.locator(".paint-title")).toHaveCount(0);
  await expect(top).not.toContainText("Untitled");
  const type = (await top.locator(".paint-type").boundingBox())!, saved = (await top.locator(".paint-saved").boundingBox())!;
  expect(saved.x).toBeGreaterThan(type.x + type.width);
  expect(await top.locator(".paint-type").evaluate((el) => el.nextElementSibling?.classList.contains("paint-saved"))).toBe(true);
  await expect(top.locator(".paint-saved")).toHaveText("Saved");
});

test("the open paper: a new grid is fitted; Fit fills the view; it pans and zooms", async ({ page }) => {
  await open(page, blankDraft("pan"));
  // with the drawer open, Fit has the room beside the palette: the grid fills most of it
  const room = async () => {
    const c = (await page.locator(".sp-canvas").boundingBox())!, p = (await page.locator(".sp-palette").boundingBox())!;
    return { w: c.x + c.width - (p.x + p.width), h: c.height };
  };
  await drag(page, [{ x: 300, y: 300 }, { x: 396, y: 396 }]);
  await expect(page.locator(".sp-board")).toHaveAttribute("data-grid", "2x2");
  const beside = await room();
  await expect.poll(async () => (await gridOnScreen(page)).w / Math.min(beside.w, beside.h)).toBeGreaterThan(0.75);
  // folded, the workspace is wider: a new grid is fitted at once, at least 60% of its smaller side
  await page.getByRole("button", { name: "Collapse the drawer" }).click();
  await page.getByRole("button", { name: "Zoom to fit" }).click();
  await page.locator(".sp-tools").getByRole("button", { name: "Grid", exact: true }).click();
  const canvas = (await page.locator(".sp-canvas").boundingBox())!;
  const side = Math.min(canvas.width, canvas.height);
  await expect.poll(async () => (await gridOnScreen(page)).w / side).toBeGreaterThan(0.6);
  await shot(page, "fit-new-grid");

  // zoomed out, then Fit: the grid fills the view again, clear of the palette
  await page.keyboard.press("ControlOrMeta+-");
  await page.keyboard.press("ControlOrMeta+-");
  expect((await gridOnScreen(page)).w / side).toBeLessThan(0.6);
  await page.getByRole("button", { name: "Zoom to fit" }).click();
  const fitted = await gridOnScreen(page), pal = (await page.locator(".sp-palette").boundingBox())!;
  expect(Math.min(fitted.w, fitted.h) / side).toBeGreaterThan(0.6);
  expect(fitted.x).toBeGreaterThan(pal.x + pal.width);

  // the wheel pans: the paper moves with it
  const before = await gridOnScreen(page);
  await page.mouse.move(canvas.x + canvas.width * 0.7, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => Math.round(before.y - (await gridOnScreen(page)).y)).toBe(120);
  // Ctrl or Cmd with the wheel zooms at the pointer
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await gridOnScreen(page)).w).toBeGreaterThan(before.w * 1.2);

  // Space held, a drag pans (whatever the tool), and draws nothing
  await tool(page, "Pen");
  const items = await page.locator(".sp-board").getAttribute("data-items");
  const g0 = await gridOnScreen(page), from = { x: canvas.x + canvas.width * 0.6, y: canvas.y + canvas.height * 0.5 };
  await page.mouse.move(from.x, from.y);
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(from.x - 80, from.y + 50, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const g1 = await gridOnScreen(page);
  expect(Math.round(g1.x - g0.x)).toBe(-80);
  expect(Math.round(g1.y - g0.y)).toBe(50);
  await expect(page.locator(".sp-board")).toHaveAttribute("data-items", items!);
  // the middle button drags it too
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(from.x + 30, from.y - 20, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  const g2 = await gridOnScreen(page);
  expect(Math.round(g2.x - g1.x)).toBe(30);
  await expect(page.locator(".sp-board")).toHaveAttribute("data-items", items!);

  // drawing still lands where it's drawn, wherever the view is: fitted, moved, and a stone in the grid's first square
  await page.getByRole("button", { name: "Zoom to fit" }).click();
  await page.mouse.move(canvas.x + canvas.width * 0.7, canvas.y + canvas.height / 2);
  await page.mouse.wheel(-40, 60);
  await tool(page, "Stamp");
  await page.getByRole("button", { name: "Stone", exact: true }).click();
  const r = await gridBox(page);
  await tap(page, { x: r.x + r.w / 4, y: r.y + r.w / 4 });
  const stone = page.locator(".sp-board .sp-ink .stone circle").first();
  await expect(stone).toHaveCount(1);
  expect(Number(await stone.getAttribute("cx"))).toBeCloseTo(r.x + r.w / 4, 0);
});

test("Add a grid: a 6 × 6 grid in the middle of the view, fitted", async ({ page }) => {
  await open(page, blankDraft("addgrid"));
  await page.locator(".sp-palette").getByRole("button", { name: "Add a grid" }).click();
  await expect(page.locator(".sp-board")).toHaveAttribute("data-grid", "6x6");
  const canvas = (await page.locator(".sp-canvas").boundingBox())!;
  const g = await gridOnScreen(page);
  expect(g.w / Math.min(canvas.width, canvas.height)).toBeGreaterThan(0.6);
  expect(g.x).toBeGreaterThan(canvas.x);
  expect(g.x + g.w).toBeLessThan(canvas.x + canvas.width);
});

test("a drawing saved before the open paper opens as it was, and its puzzle is the same", async ({ page }) => {
  // as paint saved it then: page units on the 560-unit page, a 4 × 4 Sudoku with three digits
  const grid: m.Grid = { x: 88, y: 88, rows: 4, cols: 4, S: 96 };
  const text = (r: number, c: number, t: string, id: number) => ({ id, kind: "text", at: { at: "cell", r, c }, text: t });
  const saved = { drawing: { grid, items: [text(0, 0, "1", 1), text(1, 2, "3", 2), text(3, 3, "2", 3)], next: 4 }, genre: "sudoku", settings: {} };
  const id = `e2e-old-drawing-${Date.now().toString(36)}`;
  sql(`insert into games (id, collection_id, author_id, title, description, sketch, sketch_version, kind, parse_notes, kind_choices, state, drawing)
    values (${q(id)}, ${q(run.collectionId)}, ${q(run.userId)}, 'Untitled', '', '', 1, 'sudoku', '[]', '[]', 'draft', ${q(JSON.stringify(saved))})`);
  await open(page, id);
  const board = page.locator(".sp-board");
  await expect(board).toHaveAttribute("data-grid", "4x4");
  await expect(board.locator("text.sp-text")).toHaveCount(3);
  await expect(page.locator(".paint-type-name")).toHaveText("Sudoku");
  await page.locator(".paint-verdict-btn").click();
  await expect(page.locator(".paint-verdict-btn")).toHaveText(/solution/, { timeout: 15_000 });
  // fitted: the grid fills the view
  const canvas = (await page.locator(".sp-canvas").boundingBox())!;
  expect((await gridOnScreen(page)).h / Math.min(canvas.width, canvas.height)).toBeGreaterThan(0.6);
  // a digit typed into its last empty square of the first row lands in that square
  await tool(page, "Text");
  await tap(page, P(grid, { at: "cell", r: 0, c: 3 }));
  await page.locator(".sp-typing").fill("4");
  await page.locator(".sp-typing").press("Enter");
  await expect(board.locator("text.sp-text")).toHaveCount(4);
  await expect.poll(() => {
    const row = sql<{ drawing: string }>(`select drawing from games where id = ${q(id)}`)[0];
    return JSON.parse(row.drawing).drawing.items.some((it: { text?: string; at: { r: number; c: number } }) => it.text === "4" && it.at.r === 0 && it.at.c === 3);
  }, { timeout: 15_000 }).toBe(true);
  // the drafts list calls it by its type and size, not "Untitled"
  await page.goto(`/${run.handle}?tab=drafts`);
  await expect(page.locator(".cards")).toContainText("Sudoku · 4 × 4");
  await expect(page.locator(".cards")).not.toContainText("Untitled");
});

test("a phone: the paper fills the space above the sheet's handle, the palette strip and the tools", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, blankDraft("phone-ws"));
  await page.locator(".sp-palette").getByRole("button", { name: "Add a grid" }).click();
  const canvas = (await page.locator(".sp-canvas").boundingBox())!, strip = (await page.locator(".sp-palette").boundingBox())!;
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(strip.y + 1);
  const g = await gridOnScreen(page);
  expect(g.w / canvas.width).toBeGreaterThan(0.6);
  expect(g.x).toBeGreaterThanOrEqual(canvas.x);
  expect(g.x + g.w).toBeLessThanOrEqual(canvas.x + canvas.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, "phone-workspace");
});
