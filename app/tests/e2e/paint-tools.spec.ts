// What the old editor (BoardEditor) could do, done in paint (docs/creation-flow.md §6, phase 6):
// numbers typed with the arrows, areas painted, clues outside the grid, a panel's symbols, shape
// banks, a fill-in's list, Panes' clues, hexagons and lattices, rocks dragged, and the settings that
// were in the old toolbar. Each test edits a draft of an example made before paint and checks what
// was saved in the local database.
import { expect, test } from "@playwright/test";
import * as m from "~/sketchpad/model";
import {
  cell, draftOf, drag, eventually, exampleSpec, gridOf, has, openPaint, P, palette, row, savedSpec, stamp, tap, tool, verdict, write,
} from "./paint-helpers";
import { paintFromSketch } from "~/games/paint-save";

test("numbers: typed in a square, the arrows move on", async ({ page }) => {
  const id = draftOf("sudoku"), g = gridOf(exampleSpec("sudoku"));
  await openPaint(page, id);
  await tool(page, "Text");
  await tap(page, cell(g, 0, 0));
  const box = page.locator(".sp-typing");
  await box.fill("3");
  await box.press("ArrowRight");
  await expect(box).toBeFocused();
  await box.fill("4");
  await box.press("ArrowDown");
  await box.fill("2");
  await box.press("Enter");
  await eventually(id, (s) => has(s.givens, { cell: [0, 0], value: 3 }) && has(s.givens, { cell: [0, 1], value: 4 }) && has(s.givens, { cell: [1, 1], value: 2 }));
});

test("areas: squares dragged into an area, and a new area; the borders follow", async ({ page }) => {
  // Aquarium: (5,1) is in f's area, (5,3) in c's: dragged from (5,3) across them, they join c's
  const aq = draftOf("aquarium"), ga = gridOf(exampleSpec("aquarium"));
  await openPaint(page, aq);
  await tool(page, "Areas");
  await drag(page, [cell(ga, 5, 3), cell(ga, 5, 2), cell(ga, 5, 1)]);
  await eventually(aq, (s) => s.areas?.[5][1] === s.areas?.[5][3] && s.areas?.[5][2] === s.areas?.[5][3] && s.areas?.[4][4] === s.areas?.[5][3]);
  // Star Battle: two stars, and a new area of two squares
  const sb = draftOf("star-battle"), gs = gridOf(exampleSpec("star-battle"));
  await openPaint(page, sb);
  await tool(page, "Areas");
  await palette(page).getByRole("button", { name: "New area" }).click();
  await drag(page, [cell(gs, 0, 0), cell(gs, 1, 0)]);
  await eventually(sb, (s) => !!s.areas && s.areas[0][0] === s.areas[1][0] && !s.areas.join("").replace(/./g, (ch, k) => (k === 0 || k === 5 ? "" : ch)).includes(s.areas[0][0]));
  // the pen's borders are still there to draw by hand; the rule's setting on its line
  await page.locator(".paint-drawer").getByRole("spinbutton", { name: "how many" }).first().fill("2");
  await eventually(sb, (s) => has(s.rules, { rule: "shaded-per-line", n: 2 }));
});

test("clues outside the grid: numbers, letters and totals", async ({ page }) => {
  const sk = draftOf("skyscrapers"), gk = gridOf(exampleSpec("skyscrapers"));
  await openPaint(page, sk);
  await tool(page, "Text");
  await write(page, cell(gk, -1, 2), "2");
  await eventually(sk, (s) => has(s.givens, { kind: "skyscraper", side: "top", cell: [0, 2], value: 2 }));
  const abc = draftOf("easy-as-abc"), gb = gridOf(exampleSpec("easy-as-abc"));
  await openPaint(page, abc);
  await tool(page, "Text");
  await write(page, cell(gb, 2, -1), "C");
  await eventually(abc, (s) => has(s.givens, { kind: "first", side: "left", cell: [2, 0], value: 3 }));
  const aq = draftOf("aquarium"), ga = gridOf(exampleSpec("aquarium"));
  await openPaint(page, aq);
  await tool(page, "Text");
  await write(page, cell(ga, 2, -1), "4");
  await eventually(aq, (s) => has(s.givens, { at: "row", index: 2, kind: "total", value: 4 }));
});

test("a panel's symbols: start, end, dot, coloured square, triangles, a hollow shape, an eraser, a gap", async ({ page }) => {
  const id = draftOf("panel"), g = gridOf(exampleSpec("panel"));
  await openPaint(page, id);
  await stamp(page, "Start");
  await tap(page, P(g, { at: "corner", r: 2, c: 2 }));
  await stamp(page, "End");
  await tap(page, P(g, { at: "corner", r: 4, c: 4 }));
  await stamp(page, "Hoshi dot");
  await tap(page, P(g, { at: "edge", side: "top", r: 3, c: 2 }));
  await stamp(page, "Stone");
  await palette(page).getByRole("group", { name: "Stone colour" }).getByRole("button", { name: "Red" }).click();
  await tap(page, cell(g, 0, 2));
  await stamp(page, "Triangles");
  await palette(page).getByRole("group", { name: "How many" }).getByRole("button", { name: "2" }).click();
  await tap(page, cell(g, 2, 0));
  await stamp(page, "Shape");
  await palette(page).getByRole("group", { name: "Shape" }).getByRole("button", { name: "T of four" }).click();
  await palette(page).getByRole("button", { name: "Hollow" }).click();
  await tap(page, cell(g, 1, 2));
  await stamp(page, "Eraser symbol");
  await tap(page, cell(g, 3, 3));
  // a gap: the eraser along a track
  await tool(page, "Eraser");
  await tap(page, P(g, { at: "edge", side: "left", r: 2, c: 4 }));
  await eventually(id, (s) => has(s.givens, { kind: "start", corner: [2, 2] }) && has(s.givens, { kind: "end", corner: [4, 4] })
    && has(s.givens, { kind: "hexagon", corners: [[3, 2], [3, 3]] }) && has(s.givens, { kind: "square", cell: [0, 2], color: "red" })
    && has(s.givens, { kind: "triangle", cell: [2, 0], value: 2 }) && has(s.givens, { kind: "shape", cell: [1, 2], value: [[0, 0], [0, 1], [0, 2], [1, 1]], negative: true })
    && has(s.givens, { kind: "eraser", cell: [3, 3] }) && has(s.givens, { kind: "gap", corners: [[2, 4], [3, 4]] }));
  // two lines, mirrored: the setting on the line rule
  await page.locator(".paint-drawer").getByRole("group", { name: "two lines, mirrored" }).getByRole("button", { name: "Left-right" }).click();
  await eventually(id, (s) => has(s.rules, { rule: "panel-line", symmetry: "left-right" }));
});

test("shape banks: a shape stamped off the grid goes in the bank", async ({ page }) => {
  const id = draftOf("polyomino-packing"), g = gridOf(exampleSpec("polyomino-packing"));
  await openPaint(page, id);
  await stamp(page, "Shape");
  await palette(page).getByRole("group", { name: "Shape" }).getByRole("button", { name: "Two in a row" }).click();
  const banks = (exampleSpec("polyomino-packing").givens ?? []).filter((x) => x.kind === "bank").length;
  // to the right of the grid, clear of the bank already drawn under it
  await tap(page, { x: Math.min(m.PAGE - 30, g.x + (g.cols + 1.2) * g.S), y: g.y + g.S });
  await eventually(id, (s) => (s.givens ?? []).filter((x) => x.kind === "bank").length === banks + 1 && has(s.givens, { kind: "bank", value: [[0, 0], [0, 1]] }));
});

test("a fill-in's list: written under the grid", async ({ page }) => {
  const id = draftOf("fill-in"), g = gridOf(exampleSpec("fill-in"));
  await openPaint(page, id);
  // the list as drawn: change its last line
  const list = paintFromSketch(row(id).sketch)!.drawing.items.filter((it) => it.kind === "text" && m.pointOf(g, it.at).y > g.y + g.rows * g.S);
  expect(list.length).toBeGreaterThan(0);
  await tool(page, "Text");
  const last = list.at(-1) as Extract<m.Item, { kind: "text" }>;
  await tap(page, m.pointOf(g, last.at));
  const box = page.locator(".sp-typing");
  await expect(box).toBeFocused();
  await box.fill(`${last.text} 98`);
  await box.press("Enter");
  await eventually(id, (s) => (s.entries ?? []).map(String).includes("98") && (s.entries ?? []).length === (exampleSpec("fill-in").entries ?? []).length + 1);
});

test("Panes: compass, watchtower, difference, sign, diamonds, star, palisade, rock and its rules", async ({ page }) => {
  const id = draftOf("panes"), g = gridOf(exampleSpec("panes"));
  await openPaint(page, id);
  await tool(page, "Text");
  await palette(page).getByRole("group", { name: "Text size" }).getByRole("button", { name: "Small" }).click();
  await write(page, P(g, { at: "inset", r: 0, c: 3, spot: "n" }), "1");
  await write(page, P(g, { at: "inset", r: 0, c: 3, spot: "s" }), "2");
  await write(page, P(g, { at: "corner", r: 2, c: 2 }), "3");
  await write(page, P(g, { at: "edge", side: "top", r: 1, c: 2 }), "2");
  await stamp(page, "Inequality");
  await tap(page, P(g, { at: "edge", side: "left", r: 3, c: 3 }));
  await stamp(page, "Filled diamond");
  await tap(page, P(g, { at: "edge", side: "left", r: 1, c: 2 }));
  await stamp(page, "Star");
  await tap(page, cell(g, 3, 0));
  await stamp(page, "Palisade mark");
  await tap(page, cell(g, 1, 1));
  await stamp(page, "Shaded square");
  await tap(page, cell(g, 0, 1));
  await eventually(id, (s) => has(s.givens, { kind: "compass", cell: [0, 3], value: { n: 1, s: 2 } }) && has(s.givens, { kind: "watchtower", corner: [2, 2], value: 3 })
    && has(s.givens, { kind: "difference", cells: [[0, 2], [1, 2]], value: 2 }) && has(s.givens, { kind: "inequality", cells: [[3, 2], [3, 3]] })
    && has(s.givens, { kind: "twins", cells: [[1, 1], [1, 2]] }) && has(s.givens, { kind: "symbol", cell: [3, 0] })
    && has(s.givens, { kind: "palisade", cell: [1, 1] }) && has(s.givens, { kind: "block", cell: [0, 1] }));
  // its rules, as a list with each a switch
  await expect(page.locator(".paint-panes")).toBeVisible();
});

test("hexagons and lattices: a number and a rock in a hexagon; a dot, the lengths and the moves on a lattice", async ({ page }) => {
  const hx = draftOf("honeycomb-paths"), gh = gridOf(exampleSpec("honeycomb-paths"));
  await openPaint(page, hx);
  await tool(page, "Text");
  await write(page, cell(gh, 1, 2), "17");
  await stamp(page, "Shaded square");
  await tap(page, cell(gh, 2, 0));
  await eventually(hx, (s) => has(s.givens, { cell: [1, 2], value: 17 }) && has(s.givens, { cell: [2, 0], kind: "block" }));

  const lt = draftOf("pythagorean-paths"), gl = gridOf(exampleSpec("pythagorean-paths"));
  await openPaint(page, lt);
  await stamp(page, "Stone");
  await tap(page, cell(gl, 3, 3));
  // the lengths, as written under it: rewritten
  const lengths = paintFromSketch(row(lt).sketch)!.drawing.items.find((it) => it.kind === "text" && m.pointOf(gl, it.at).y > gl.y + gl.rows * gl.S) as Extract<m.Item, { kind: "text" }>;
  await tool(page, "Text");
  await tap(page, m.pointOf(gl, lengths.at));
  const box = page.locator(".sp-typing");
  await expect(box).toBeFocused();
  await box.fill("1 √2 r5 2");
  await box.press("Enter");
  await page.locator(".paint-drawer").getByRole("group", { name: "segments run" }).getByRole("button", { name: "Queen" }).click();
  await eventually(lt, (s) => has(s.givens, { cell: [3, 3], kind: "peg" }) && has(s.givens, { kind: "lengths", value: [1, 2, 5, 4] })
    && has(s.rules, { rule: "distance-path", moves: "queen" }));
});

test("rocks: a drag stamps them across squares; a drag from one takes them off", async ({ page }) => {
  const id = draftOf("akari"), g = gridOf(exampleSpec("akari"));
  await openPaint(page, id);
  await stamp(page, "Shaded square");
  await drag(page, [cell(g, 5, 3), cell(g, 5, 4), cell(g, 5, 5)]);
  await eventually(id, (s) => [3, 4, 5].every((c) => has(s.givens, { cell: [5, c], kind: "block" })));
  await drag(page, [cell(g, 5, 4), cell(g, 5, 5)]);
  await eventually(id, (s) => has(s.givens, { cell: [5, 3], kind: "block" }) && ![4, 5].some((c) => has(s.givens, { cell: [5, c], kind: "block" })));
});

test("settings from the old toolbar: Hidoku's corners, Fillomino's sizes, Abstract Art's extra rules", async ({ page }) => {
  const hd = draftOf("hidoku");
  await openPaint(page, hd);
  await page.locator(".paint-drawer").getByRole("switch", { name: /touching at a corner counts/i }).uncheck();
  await eventually(hd, (s) => (s.rules ?? []).some((r) => r.rule === "number-path" && !r.diagonals));

  const fo = draftOf("fillomino");
  await openPaint(page, fo);
  const sizes = page.locator(".paint-drawer").getByRole("textbox", { name: /sizes/i });
  await sizes.fill("1 2 3 4 5");
  await sizes.blur();
  await eventually(fo, (s) => has(s.rules, { rule: "allowed-sizes", sizes: [1, 2, 3, 4, 5] }));
  await verdict(page).click();
  await expect(verdict(page)).toHaveAttribute("data-verdict", "one", { timeout: 30_000 });

  const aa = draftOf("abstract-art");
  await openPaint(page, aa);
  await page.locator(".paint-drawer").getByRole("switch", { name: /No three in a row/ }).check();
  await eventually(aa, (s) => has(s.rules, { rule: "no-three-in-a-row" }));
  expect(savedSpec(aa).genre).toBe("abstract-art");
});
