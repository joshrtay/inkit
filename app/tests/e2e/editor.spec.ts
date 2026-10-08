// The editor, for every puzzle type: it opens, each kind of tool changes the saved puzzle, and an
// unfinished puzzle stays on screen and still saves. Each test edits one draft made by setup.ts
// and checks what was saved in the local database.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { q, RUN_FILE, sql, type Run } from "./db";

const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
type Given = Record<string, unknown> & { at: string; kind: string };
interface Saved { size: number[]; givens?: Given[]; areas?: string[]; rules?: Record<string, unknown>[]; picture?: { rows: string[] } }

/** The draft's saved puzzle (the JSON after the type line). */
function saved(kind: string): Saved {
  const [row] = sql<{ sketch: string }>(`select sketch from games where id = ${q(run.drafts[kind])}`);
  return JSON.parse(row.sketch.slice(row.sketch.indexOf("\n") + 1));
}
/** Whether a list of clues has one with all these fields. */
const has = (gs: Given[] | undefined, want: Record<string, unknown>) =>
  (gs ?? []).some((g) => Object.entries(want).every(([k, v]) => JSON.stringify(g[k]) === JSON.stringify(v)));
/** Wait until the saved draft passes `check` (drafts save themselves a moment after a change). */
const eventually = (kind: string, check: (s: Saved) => boolean) =>
  expect.poll(() => check(saved(kind)), { timeout: 15_000, intervals: [500, 1000] }).toBe(true);

async function open(page: Page, kind: string) {
  await page.goto(`/g/${run.drafts[kind]}/edit`);
  await expect(page.locator(".be-board .grid-game svg, .studio-board svg").first()).toBeVisible();
}

/** Where a point of the grid is on screen: (r, c) in squares from the grid's top-left. */
async function at(page: Page, r: number, c: number) {
  return page.locator(".be-board").evaluate((board, [r, c]) => {
    const l = JSON.parse((board as HTMLElement).dataset.layout!);
    const point = () => { const svg = board.querySelector(".grid-game svg")!.getBoundingClientRect(), k = svg.width / l.W; return { x: svg.left + (l.ML + c * l.S) * k, y: svg.top + (l.MT + r * l.S) * k }; };
    // the point in the middle of the window, clear of the sticky top bar and toolbar
    window.scrollBy(0, point().y - window.innerHeight / 2);
    return point();
  }, [r, c]);
}
async function tap(page: Page, r: number, c: number) {
  const { x, y } = await at(page, r, c);
  await page.mouse.click(x, y);
}
async function drag(page: Page, points: [number, number][]) {
  const first = await at(page, ...points[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of points.slice(1)) { const { x, y } = await at(page, ...p); await page.mouse.move(x, y, { steps: 4 }); }
  await page.mouse.up();
}
async function type(page: Page, text: string) {
  const box = page.locator(".be-clue input");
  await expect(box).toBeFocused();
  await box.fill(text);
  await box.press("Enter");
}
const tool = (page: Page, name: string) => page.locator(".studio-tools").getByRole("button", { name, exact: true }).click();

test("every type's editor opens without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const kind of Object.keys(run.drafts)) {
    await open(page, kind);
    await expect(page.locator(".check-chip")).not.toHaveText("Checking…", { timeout: 15_000 });
  }
  expect(errors).toEqual([]);
});

test("numbers: type, Enter moves on, arrows move", async ({ page }) => {
  await open(page, "sudoku");
  await tap(page, 0.5, 0.5);
  await type(page, "3");
  await type(page, "4");
  const box = page.locator(".be-clue input");
  await box.fill("2");
  await box.press("ArrowDown");
  await box.press("Escape");
  await eventually("sudoku", (s) => has(s.givens, { cell: [0, 0], value: 3 }) && has(s.givens, { cell: [0, 1], value: 4 }) && has(s.givens, { cell: [0, 2], value: 2 }));
});

test("sudoku sizes", async ({ page }) => {
  await open(page, "sudoku");
  await tool(page, "6×6");
  await eventually("sudoku", (s) => s.size[0] === 6 && s.size[1] === 6);
});

test("rocks: a drag paints them; Akari numbers sit on black squares", async ({ page }) => {
  await open(page, "akari");
  await drag(page, [[0.5, 0.5], [0.5, 1.5], [0.5, 2.5]]);
  await tool(page, "Number");
  await tap(page, 5.5, 5.5);
  await type(page, "1");
  await eventually("akari", (s) => [0, 1, 2].every((c) => has(s.givens, { cell: [0, c], kind: "block" }))
    && has(s.givens, { cell: [5, 5], kind: "number", value: 1 }) && has(s.givens, { cell: [5, 5], kind: "block" }));
});

test("walls: click the line between squares; erase removes them", async ({ page }) => {
  await open(page, "simple-loop");
  await tool(page, "Wall");
  await tap(page, 1.0, 1.5);
  await eventually("simple-loop", (s) => has(s.givens, { kind: "wall", cells: [[0, 1], [1, 1]] }));
  await tool(page, "Erase");
  await tap(page, 1.02, 1.5);
  await eventually("simple-loop", (s) => !has(s.givens, { kind: "wall", cells: [[0, 1], [1, 1]] }));
});

test("pearls cycle white, black, none", async ({ page }) => {
  await open(page, "masyu");
  await tap(page, 1.5, 1.5);
  await tap(page, 2.5, 1.5);
  await tap(page, 2.5, 1.5);
  await eventually("masyu", (s) => has(s.givens, { cell: [1, 1], value: "white" }) && has(s.givens, { cell: [2, 1], value: "black" }));
});

test("galaxy circles go on centres, lines and corners", async ({ page }) => {
  await open(page, "spiral-galaxies");
  await tap(page, 1.0, 1.0);
  await eventually("spiral-galaxies", (s) => has(s.givens, { kind: "galaxy", point: [2, 2] }));
});

test("thermometers: drag from the bulb", async ({ page }) => {
  await open(page, "thermo-sudoku");
  await tool(page, "Thermometer");
  await drag(page, [[2.5, 0.5], [3.5, 0.5], [4.5, 0.5]]);
  await eventually("thermo-sudoku", (s) => has(s.givens, { kind: "thermo", cells: [[2, 0], [3, 0], [4, 0]] }));
});

test("numbers and letters outside the grid", async ({ page }) => {
  await open(page, "skyscrapers");
  await tap(page, -0.6, 2.5);
  await type(page, "2");
  await eventually("skyscrapers", (s) => has(s.givens, { kind: "skyscraper", side: "top", cell: [0, 2], value: 2 }));
  await open(page, "easy-as-abc");
  await tap(page, 2.5, -0.6);
  await type(page, "c");
  await eventually("easy-as-abc", (s) => has(s.givens, { kind: "first", side: "left", cell: [2, 0], value: 3 }));
});

test("a maze without its doors stays on screen and saves", async ({ page }) => {
  await open(page, "maze");
  await tap(page, 2.05, 1.95);
  await type(page, "3");
  const door = saved("maze").givens!.find((g) => g.kind === "door" && g.role === "in") as unknown as { cell: number[]; side: string };
  await tool(page, "Door");
  // the way-in door: in -> out (the old way out goes) -> none, leaving no doors at all
  const [r, c] = door.cell;
  const outside = ({ top: [-0.6, c + 0.5], bottom: [r + 1.6, c + 0.5], left: [r + 0.5, -0.6], right: [r + 0.5, c + 1.6] } as Record<string, [number, number]>)[door.side];
  await tap(page, ...outside);
  await tap(page, ...outside);
  await expect(page.locator(".be-board .grid-game svg")).toBeVisible();
  await expect(page.locator(".check-chip")).toContainText("Can't be played");
  await eventually("maze", (s) => has(s.givens, { kind: "count", corner: [2, 2], value: 3 }) && !(s.givens ?? []).some((g) => g.kind === "door"));
});

test("areas: paint squares into another area; totals beside rows", async ({ page }) => {
  await open(page, "aquarium");
  await tool(page, "Line total");
  await tap(page, 2.5, -0.5);
  await type(page, "4");
  await tool(page, "Areas");
  await page.locator(".be-areas").getByRole("button", { name: "Area B" }).click();
  await drag(page, [[5.5, 0.5], [5.5, 1.5]]);
  await eventually("aquarium", (s) => has(s.givens, { at: "row", index: 2, kind: "total", value: 4 }) && s.areas?.[5].slice(0, 2) === "bb");
});

test("Star Battle: stars per row, and a new area", async ({ page }) => {
  await open(page, "star-battle");
  await tool(page, "2 stars");
  await tool(page, "+ Area");
  await drag(page, [[0.5, 0.5], [1.5, 0.5]]);
  await eventually("star-battle", (s) => has(s.rules as Given[], { rule: "shaded-per-line", n: 2 }) && !!s.areas && s.areas[0][0] === s.areas[1][0]
    && !s.areas.slice(2).join("").includes(s.areas[0][0]));
});

test("Panes: compass, diamonds, symbols, and its rules", async ({ page }) => {
  await open(page, "panes");
  await tool(page, "Compass");
  await tap(page, 0.5, 0.5);
  await type(page, "1 - 2 -");
  await tool(page, "◆ / ◇");
  await tap(page, 0.5, 3.0);
  await tool(page, "Symbol");
  await tap(page, 3.5, 3.5);
  await eventually("panes", (s) => has(s.givens, { kind: "compass", cell: [0, 0], value: { n: 1, s: 2 } })
    && has(s.givens, { kind: "twins", cells: [[0, 2], [0, 3]] }) && has(s.givens, { kind: "symbol", cell: [3, 3] }));
  await expect(page.locator(".ge-section summary", { hasText: "Rules" })).toBeVisible();
});

test("Panes: palisade marks, colored symbols, holes and walls", async ({ page }) => {
  await open(page, "panes");
  await tool(page, "Palisade");
  await tap(page, 1.5, 1.5);
  await tap(page, 1.5, 1.5);
  await tool(page, "Symbol");
  await tool(page, "Red");
  await tap(page, 2.5, 2.5);
  await tool(page, "Rock");
  await tap(page, 3.5, 0.5);
  await tool(page, "Wall");
  await tap(page, 2.0, 1.5);
  await eventually("panes", (s) => has(s.givens, { kind: "palisade", cell: [1, 1], value: 1 }) && has(s.givens, { kind: "symbol", cell: [2, 2], value: "red" })
    && has(s.givens, { kind: "block", cell: [3, 0] }) && has(s.givens, { kind: "wall", cells: [[1, 1], [2, 1]] }));
});

test("Panes: Glimmith's signs, differences, watchtowers, shapes and the shape bank", async ({ page }) => {
  await open(page, "panes");
  await tool(page, "< sign");
  await tap(page, 0.5, 1.0);   // the line between (0,0) and (0,1): points to (0,0)
  await tool(page, "Difference");
  await tap(page, 1.0, 2.5);   // the line between (0,2) and (1,2)
  await type(page, "2");
  await tool(page, "Watchtower");
  await tap(page, 2, 2);
  await type(page, "3");
  await tool(page, "Shape");
  await page.locator(".studio-tools").getByRole("button", { name: "Two in a row", exact: true }).click();
  await tap(page, 3.5, 3.5);
  await tool(page, "Shape bank");
  await page.locator(".studio-tools").getByRole("button", { name: "Square of four", exact: true }).click();
  await tool(page, "Add to the bank");
  await eventually("panes", (s) => has(s.givens, { kind: "inequality", cells: [[0, 0], [0, 1]] })
    && has(s.givens, { kind: "difference", cells: [[0, 2], [1, 2]], value: 2 }) && has(s.givens, { kind: "watchtower", corner: [2, 2], value: 3 })
    && has(s.givens, { kind: "shape", cell: [3, 3], value: [[0, 0], [0, 1]] }) && has(s.givens, { at: "aside", kind: "bank", value: [[0, 0], [0, 1], [1, 0], [1, 1]] }));
});

test("Nonogram: paint the picture, or type the numbers", async ({ page }) => {
  await open(page, "nonogram");
  const before = saved("nonogram").picture!.rows[4];
  await drag(page, [[4.5, 0.5], [4.5, 1.5]]);
  await eventually("nonogram", (s) => s.picture?.rows[4] !== before);
  await tool(page, "Numbers only");
  await tap(page, 1.5, -0.5);
  await type(page, "1 1");
  await eventually("nonogram", (s) => !s.picture && has(s.givens, { at: "row", index: 1, kind: "runs", value: [1, 1] }));
});

test("panels: starts, ends, gaps, dots and symbols", async ({ page }) => {
  await open(page, "panel");
  await tool(page, "Start");
  await tap(page, 2.05, 1.95);
  await tool(page, "End");
  await tap(page, 4.1, 4.05);
  await tool(page, "Gap");
  await tap(page, 1.05, 2.5);
  await tool(page, "Dot");
  await tap(page, 3.02, 1.5);
  await tool(page, "Square");
  await tool(page, "Red");
  await tap(page, 0.5, 0.5);
  await tool(page, "Triangle");
  await tap(page, 2.5, 0.5);
  await tap(page, 2.5, 0.5);
  await tool(page, "Shape");
  await tool(page, "T of four");
  await tool(page, "Hollow");
  await tap(page, 1.5, 2.5);
  await eventually("panel", (s) => has(s.givens, { kind: "start", corner: [2, 2] }) && has(s.givens, { kind: "end", corner: [4, 4] })
    && has(s.givens, { kind: "gap", corners: [[1, 2], [1, 3]] }) && has(s.givens, { kind: "hexagon", corners: [[3, 1], [3, 2]] })
    && has(s.givens, { kind: "square", cell: [0, 0], color: "red" }) && has(s.givens, { kind: "triangle", cell: [2, 0], value: 2 })
    && has(s.givens, { kind: "shape", cell: [1, 2], value: [[0, 0], [0, 1], [0, 2], [1, 1]], negative: true }));
  await tool(page, "Erase");
  await tap(page, 2.0, 2.0);
  await eventually("panel", (s) => !has(s.givens, { kind: "start", corner: [2, 2] }));
});

test("panel symmetry: turned on, mirrored starts, colored dots, and off again", async ({ page }) => {
  await open(page, "panel");
  await tool(page, "Left–right");
  await tool(page, "Start");
  await tap(page, 2, 1);
  await tool(page, "Dot");
  await tool(page, "Blue");
  await tap(page, 1, 2);
  await eventually("panel", (s) => has(s.givens, { kind: "start", corner: [2, 1], color: "blue" }) && has(s.givens, { kind: "start", corner: [2, s.size[1] - 1], color: "yellow" })
    && has(s.givens, { kind: "hexagon", corner: [1, 2], color: "blue" }) && has(s.rules as Given[], { rule: "panel-line", symmetry: "left-right" }));
  await tool(page, "Up–down");
  await eventually("panel", (s) => has(s.rules as Given[], { rule: "panel-line", symmetry: "up-down" }));
  await tool(page, "None");
  await eventually("panel", (s) => !(s.rules ?? []).some((r) => r.rule === "panel-line"));
});

test("undo", async ({ page }) => {
  await open(page, "minesweeper");
  await tap(page, 0.5, 0.5);
  await type(page, "5");
  await page.locator(".be-clue input").press("Escape");
  await eventually("minesweeper", (s) => has(s.givens, { cell: [0, 0], value: 5 }));
  await page.getByRole("button", { name: /Undo/ }).click();
  await eventually("minesweeper", (s) => !has(s.givens, { cell: [0, 0], value: 5 }));
});

test("a panel with more than one solution can still be published", async ({ page }) => {
  // a bare 2 × 2 panel: many lines from the start to the end
  const sketch = `panel\n${JSON.stringify({ size: [2, 2], givens: [{ at: "corner", corner: [2, 0], kind: "start" }, { at: "corner", corner: [0, 2], kind: "end" }] })}`;
  sql(`update games set sketch = ${q(sketch)} where id = ${q(run.drafts.panel)}`);
  await open(page, "panel");
  await expect(page.locator(".check-chip")).toHaveText("✓ Solvable", { timeout: 15_000 });
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("button[name=intent][value=publish]")).toBeEnabled();
});
