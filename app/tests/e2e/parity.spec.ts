// Paint can edit every type the old editor could (docs/creation-flow.md §6, phase 6): for each
// example puzzle (src/games/<type>/1.json, RYB aside: it keeps its figure editor), a draft made
// before paint (a sketch, no drawing) opens in paint drawn in ink; the drawing converts back to the
// same puzzle in the browser (the round trip); a small edit with paint's eraser changes the puzzle
// and the verdict; undo brings both back; and Publish reaches the publish page.
import { expect, test } from "@playwright/test";
import type { GridSpec } from "~site/engine/types.ts";
import { convert, specKey } from "~/sketchpad/to-puzzle";
import { paintFromSketch } from "~/games/paint-save";
import { specToSketch } from "~/games/sketch";
import * as m from "~/sketchpad/model";
import { q, sql } from "./db";
import { exampleSpec, FOLDERS, genreOf, insertGames, puzzleKey, tap, verdict } from "./paint-helpers";

const stamp = Date.now().toString(36);
interface Example { folder: string; genre: string; spec: GridSpec; sketch: string; id: string }
const examples: Example[] = FOLDERS.map((folder) => {
  const spec = exampleSpec(folder);
  return { folder, genre: genreOf(folder), spec, sketch: specToSketch(spec), id: `e2e-parity-${stamp}-${folder}` };
});

// every example as a draft from before paint: its sketch, no drawing
test.beforeAll(() => insertGames(examples.map((x) => ({ id: x.id, spec: x.spec, title: `${x.folder} parity` }))));

/** What the eraser may take off, best first: things the puzzle uses (a panel's end first, so it
 *  isn't solvable any more; clues before lines). The first whose loss changes the verdict is used. */
function targets(x: Example): { point: m.XY; what: string }[] {
  const save = paintFromSketch(x.sketch)!;
  const { used } = convert(save.drawing, save.genre!, save.settings);
  const g = save.drawing.grid!;
  const items = save.drawing.items.filter((it) => used.has(it.id));
  const mid = (a: m.XY, b: m.XY) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const where = (it: m.Item) => it.kind === "line" ? mid(m.pointOf(g, it.from), m.pointOf(g, it.to))
    : it.kind === "pen" || it.kind === "brush" ? m.pointOf(g, it.points[Math.floor(it.points.length / 2)])
    : it.kind === "thermo" ? m.pointOf(g, { at: "cell", r: it.cells[0][0], c: it.cells[0][1] })
    : m.pointOf(g, it.at);
  // a maze's door is a line outside the grid: before the clues, which a maze has plenty of
  const outside = (p: m.XY) => p.x < g.x || p.y < g.y || p.x > g.x + g.cols * g.S || p.y > g.y + g.rows * g.S;
  const rank = (i: m.Item) => (i.kind === "stamp" && i.stamp === "end" ? 0 : (i.kind === "line" || i.kind === "pen") && outside(where(i)) ? 0 : i.kind === "line" || i.kind === "pen" ? 2 : 1);
  const length = (i: m.Item) => { if (i.kind !== "line") return 0; const a = m.pointOf(g, i.from), b = m.pointOf(g, i.to); return Math.hypot(a.x - b.x, a.y - b.y); };
  return [...items].sort((a, b) => rank(a) - rank(b) || length(b) - length(a)).slice(0, 6).map((it) => ({ what: it.kind === "stamp" ? it.stamp : it.kind, point: where(it) }));
}

for (const x of examples) {
  test(`${x.folder}: opens in paint, round-trips, edits, and reaches the publish page`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/g/${x.id}/draw`);
    await expect(page.locator(".sp-board")).toBeVisible();

    // the drawing made from the sketch is the same puzzle again
    const original = specKey(x.spec);
    await expect.poll(() => puzzleKey(page)).toBe(original);
    // nothing's checked until Check
    await expect(verdict(page)).toHaveAttribute("data-verdict", "unchecked");
    await verdict(page).click();
    await expect(verdict(page)).toHaveAttribute("data-verdict", /^(one|solvable)$/, { timeout: 30_000 });
    // opening it saved its drawing (a game from before paint has none)
    await expect.poll(() => sql<{ drawing: string | null }>(`select drawing from games where id = ${q(x.id)}`)[0].drawing !== null, { timeout: 15_000 }).toBe(true);

    // the eraser takes something off: the puzzle changes, and the verdict with it (a clue the
    // puzzle didn't need leaves it passing: undo, and try the next)
    await page.locator(".sp-tools").getByRole("button", { name: "Eraser", exact: true }).click();
    let changed = "";
    for (const { point, what } of targets(x)) {
      await tap(page, point);
      await expect.poll(() => puzzleKey(page), { message: `erasing the ${what} changes the puzzle` }).not.toBe(original);
      await expect(verdict(page)).not.toHaveAttribute("data-verdict", "checking", { timeout: 30_000 });
      const now = await verdict(page).getAttribute("data-verdict");
      if (now !== "one" && now !== "solvable") { changed = `${what}: ${now}`; break; }
      await page.locator(".sp-doc-slot").getByRole("button", { name: "Undo" }).click();
      await expect.poll(() => puzzleKey(page)).toBe(original);
    }
    expect(changed, "an edit that changes the verdict").not.toBe("");

    // undo: the same puzzle, passing again
    await page.locator(".sp-doc-slot").getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => puzzleKey(page)).toBe(original);
    await expect(verdict(page)).toHaveAttribute("data-verdict", /^(one|solvable)$/, { timeout: 30_000 });

    // Publish: the draft's publish page, with the real player
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/g/${x.id}/publish$`), { timeout: 15_000 });
    await expect(page.locator(".publish-paper .grid-game svg.board")).toBeVisible();
    expect(errors).toEqual([]);
  });
}
