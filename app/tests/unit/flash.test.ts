// The failure flash (src/game-types/grid/flash.ts): when each family of puzzle counts as finished,
// what a wrong board flashes, and that it fires once per finished board.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { check, makePuzzle } from "~site/engine/puzzle.ts";
import { emptyBoard, type Board, type Puzzle } from "~site/engine/types.ts";
import { boardKey, expectedRegions, familyOf, flashStart, flashStep, flashTargets, isDone, type FlashMoment } from "~site/game-types/grid/flash.ts";
import { FOLDER_GENRE, specOf } from "~/sketchpad/from-puzzle";

const GAMES = new URL("../../../src/games/", import.meta.url).pathname;
const example = (folder: string, n = 1) => makePuzzle(specOf(FOLDER_GENRE[folder] ?? folder, JSON.parse(readFileSync(`${GAMES}${folder}/${n}.json`, "utf8"))));
const fresh = (p: Puzzle): Board => {
  const b = emptyBoard(p.grid);
  for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number" && p.marks.includes("digit")) b.digit[i] = x.value;
  return b;
};
/** draw a line through corners (r, c) on the fence layer */
function fenceThrough(p: Puzzle, b: Board, pts: [number, number][]) {
  const g = p.grid;
  for (let k = 1; k < pts.length; k++) {
    const a = g.corner(...pts[k - 1]), z = g.corner(...pts[k]);
    const e = g.cornerBorders[a].find((x) => g.borders[x].corners.includes(z));
    if (e === undefined) throw new Error(`no line ${pts[k - 1]} to ${pts[k]}`);
    b.fence[e] = 1;
  }
}
/** draw a line through cells (r, c) on the loop layer */
function loopThrough(p: Puzzle, b: Board, cells: [number, number][]) {
  const g = p.grid;
  for (let k = 1; k < cells.length; k++) {
    const l = g.borders[g.borderBetween(g.cell(...cells[k - 1]), g.cell(...cells[k]))].link;
    b.loop[l] = 1;
  }
}
const SUDOKU = [[1, 4, 2, 3], [3, 2, 1, 4], [2, 3, 4, 1], [4, 1, 3, 2]];

describe("families", () => {
  it("sorts the types by how they finish", () => {
    expect(familyOf(example("panel"))).toBe("line");
    expect(familyOf(example("simple-path"))).toBe("line");
    expect(familyOf(example("number-line-maze"))).toBe("line");
    expect(familyOf(example("pythagorean-paths"))).toBe("line");
    expect(familyOf(example("masyu"))).toBe("loop");
    expect(familyOf(example("slitherlink"))).toBe("loop");
    expect(familyOf(example("numberlink"))).toBe("loop");
    expect(familyOf(example("sudoku"))).toBe("fill");
    expect(familyOf(example("hidoku"))).toBe("fill");
    expect(familyOf(example("binary-puzzle"))).toBe("fill");
    expect(familyOf(example("shikaku"))).toBe("regions");
    expect(familyOf(example("fillomino"))).toBe("regions");
    expect(familyOf(example("star-battle"))).toBe("regions");
    expect(familyOf(example("three-coats"))).toBe("figure");
    for (const t of ["nurikabe", "akari", "hitori", "aquarium", "cave", "minesweeper"]) expect(familyOf(example(t)), t).toBe("shade");
  });
});

describe("panels", () => {
  // Two Tones: start at corner (2, 2), end at (0, 2); black and white squares
  const p = example("panel", 2), g = p.grid;
  it("are done when the line reaches the end, not before", () => {
    const b = fresh(p);
    expect(isDone(p, b)).toBe(false);
    fenceThrough(p, b, [[2, 2], [1, 2]]);
    expect(isDone(p, b)).toBe(false);
    fenceThrough(p, b, [[1, 2], [0, 2]]);
    expect(isDone(p, b)).toBe(true);
  });
  it("flash the squares the line fails to keep apart, as their own symbols", () => {
    const b = fresh(p);
    fenceThrough(p, b, [[2, 2], [1, 2], [0, 2]]);   // cuts nothing off: every square in one region
    const targets = flashTargets(p, b, check(p, b));
    const squares = [...p.cellGivens].filter(([, gs]) => gs.some((x) => x.kind === "square")).map(([i]) => `cell:${i}`);
    expect(targets.sort()).toEqual(squares.sort());
    expect(targets.some((t) => t.startsWith("border:"))).toBe(false);
    void g;
  });
  it("flash a missed dot itself, not the lines around it", () => {
    // Dot to Dot: start (4, 0), end (0, 4); up the left side and along the top misses the inner dots
    const q = example("panel", 1), b = fresh(q);
    fenceThrough(q, b, [[4, 0], [3, 0], [2, 0], [1, 0], [0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);
    expect(isDone(q, b)).toBe(true);
    const targets = flashTargets(q, b, check(q, b));
    expect(targets).toContain(`corner:${q.grid.corner(3, 2)}`);
    expect(targets.some((t) => t.startsWith("dot:"))).toBe(true);
    expect(targets.some((t) => t.startsWith("border:"))).toBe(false);
  });
});

describe("other line types", () => {
  it("a simple path is done when its line joins the way in to the way out", () => {
    const p = example("simple-path"), b = fresh(p);   // in at the bottom of (4, 4), out at the right of (2, 4)
    loopThrough(p, b, [[4, 4], [3, 4]]);
    expect(isDone(p, b)).toBe(false);
    loopThrough(p, b, [[3, 4], [2, 4]]);
    expect(isDone(p, b)).toBe(true);
    expect(check(p, b).length).toBeGreaterThan(0);
  });
  it("a maze is done when every number has its walls, and a number's problem flashes the number", () => {
    const p = example("number-line-maze"), b = fresh(p), g = p.grid;
    expect(isDone(p, b)).toBe(false);
    const [v] = [...p.cornerGivens.keys()];
    expect(flashTargets(p, b, [{ message: "count", borders: g.cornerBorders[v] }])).toEqual([`corner:${v}`]);
    // walls that aren't exactly a number's stay walls
    expect(flashTargets(p, b, [{ message: "loose", borders: [g.cornerBorders[v][0]] }])).toEqual([`border:${g.cornerBorders[v][0]}`]);
  });
});

describe("loops", () => {
  it("are done once the line is one closed loop", () => {
    const p = example("masyu"), b = fresh(p);
    loopThrough(p, b, [[0, 0], [0, 1], [1, 1], [1, 0]]);
    expect(isDone(p, b)).toBe(false);   // open
    loopThrough(p, b, [[1, 0], [0, 0]]);
    expect(isDone(p, b)).toBe(true);
    const targets = flashTargets(p, b, check(p, b));
    expect(targets.length).toBeGreaterThan(0);
    // a second loop elsewhere: not one loop any more
    loopThrough(p, b, [[4, 4], [4, 5], [5, 5], [5, 4], [4, 4]]);
    expect(isDone(p, b)).toBe(false);
  });
  it("a fence loop (Slitherlink) closes on the corners", () => {
    const p = example("slitherlink"), b = fresh(p);
    fenceThrough(p, b, [[0, 0], [0, 1], [1, 1], [1, 0]]);
    expect(isDone(p, b)).toBe(false);
    fenceThrough(p, b, [[1, 0], [0, 0]]);
    expect(isDone(p, b)).toBe(true);
  });
});

describe("number fills", () => {
  const p = example("sudoku");
  it("are done when every square has a digit", () => {
    const b = fresh(p);
    expect(isDone(p, b)).toBe(false);
    SUDOKU.forEach((row, r) => row.forEach((d, c) => { b.digit[p.grid.cell(r, c)] = d; }));
    expect(isDone(p, b)).toBe(true);
    b.digit[p.grid.cell(0, 0)] = 0;
    expect(isDone(p, b)).toBe(false);
  });
  it("flash the clashing digits", () => {
    const b = fresh(p);
    SUDOKU.forEach((row, r) => row.forEach((d, c) => { b.digit[p.grid.cell(r, c)] = d; }));
    // swap two digits in row 0 that aren't given: (0, 0) and (0, 1) hold 1 and 4
    const a = p.grid.cell(0, 0), z = p.grid.cell(0, 2);
    [b.digit[a], b.digit[z]] = [b.digit[z], b.digit[a]];
    const targets = flashTargets(p, b, check(p, b));
    expect(targets).toContain(`cell:${a}`);
    expect(targets).toContain(`cell:${z}`);
    expect(targets.every((t) => t.startsWith("cell:"))).toBe(true);
  });
  it("Easy as ABC counts its letters (the rules' count), and its clues outside flash on their own", () => {
    const q = example("easy-as-abc"), b = fresh(q);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b.digit[q.grid.cell(r, c)] = ((r + c) % 3) + 1;
    expect(isDone(q, b)).toBe(true);
    const targets = flashTargets(q, b, check(q, b));
    // each clue that sees the wrong letter, and only those
    q.edgeClues.forEach((c, k) => {
      const alone = check({ ...q, edgeClues: [c], rules: q.rules.filter((s) => s.rule === "first-seen") }, b).length > 0;
      expect(targets.includes(`edge:${k}`), `clue ${k}`).toBe(alone);
    });
  });
});

describe("region types", () => {
  it("Shikaku is done when it's cut into as many regions as numbers", () => {
    const p = example("shikaku"), b = fresh(p), g = p.grid;
    expect(expectedRegions(p)).toBe(p.cellGivens.size);
    expect(isDone(p, b)).toBe(false);
    // cut every border: one region per cell, more than the numbers
    for (const e of g.borders) if (e.link >= 0) b.cut[e.id] = 1;
    expect(isDone(p, b)).toBe(false);
    // or painted, every square
    const c = fresh(p);
    c.color.fill(1);
    expect(isDone(p, c)).toBe(true);
  });
  it("a cut still being drawn isn't done", () => {
    const p = example("find-the-cut-line"), b = fresh(p), g = p.grid;
    expect(expectedRegions(p)).toBe(2);
    expect(isDone(p, b)).toBe(false);   // nothing cut yet
    b.cut[g.borderBetween(g.cell(1, 2), g.cell(2, 2))] = 1;   // a cut with loose ends
    expect(isDone(p, b)).toBe(false);
    b.cut[g.borderBetween(g.cell(1, 2), g.cell(2, 2))] = 0;
    b.cut[g.borderBetween(g.cell(1, 3), g.cell(1, 4))] = 1;
    b.cut[g.borderBetween(g.cell(2, 3), g.cell(2, 4))] = 1;   // the two right-hand squares cut off
    expect(isDone(p, b)).toBe(true);
  });
  it("Star Battle is done when every star is placed", () => {
    const p = example("star-battle"), b = fresh(p);
    for (let r = 0; r < 4; r++) b.shade[p.grid.cell(r, r)] = 1;
    expect(isDone(p, b)).toBe(false);
    b.shade[p.grid.cell(4, 4)] = 1;
    expect(isDone(p, b)).toBe(true);
    expect(flashTargets(p, b, check(p, b)).length).toBeGreaterThan(0);
  });
});

describe("shading types", () => {
  it("never finish, however much is shaded", () => {
    for (const t of ["nurikabe", "akari", "hitori", "aquarium", "cave", "minesweeper"]) {
      const p = example(t), b = fresh(p);
      expect(isDone(p, b), t).toBe(false);
      b.shade.fill(1);
      expect(isDone(p, b), t).toBe(false);
      b.shade.fill(2);
      expect(isDone(p, b), t).toBe(false);
    }
  });
});

describe("RYB", () => {
  it("is done when every piece is painted, and flashes the pieces", () => {
    const p = example("three-coats"), b = fresh(p);
    expect(isDone(p, b)).toBe(false);
    b.color.fill(1);
    expect(isDone(p, b)).toBe(true);
    const targets = flashTargets(p, b, check(p, b));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((t) => t.startsWith("cell:"))).toBe(true);
  });
});

describe("firing once per done moment", () => {
  const at = (over: Partial<FlashMoment>): FlashMoment => ({ done: true, solved: false, busy: false, key: "a", ...over });
  it("fires on reaching done, then not again for the same board", () => {
    let s = flashStart();
    let r = flashStep(s, at({ done: false }));
    expect(r.fire).toBe(false); s = r.state;
    r = flashStep(s, at({})); expect(r.fire).toBe(true); s = r.state;
    r = flashStep(s, at({})); expect(r.fire).toBe(false); s = r.state;   // a render, nothing changed
  });
  it("fires again after a change that reaches done again", () => {
    let s = flashStep(flashStart(), at({})).state;
    let r = flashStep(s, at({ key: "b" })); expect(r.fire).toBe(true); s = r.state;      // still done, a different board
    r = flashStep(s, at({ done: false, key: "c" })); s = r.state;
    r = flashStep(s, at({ key: "b" })); expect(r.fire).toBe(true);                        // undone and back
  });
  it("never mid-gesture, and never once solved", () => {
    let s = flashStart();
    let r = flashStep(s, at({ busy: true })); expect(r.fire).toBe(false); s = r.state;
    r = flashStep(s, at({})); expect(r.fire).toBe(true);
    expect(flashStep(flashStart(), at({ solved: true })).fire).toBe(false);
  });
  it("doesn't fire for a board as it was saved", () => {
    const s = flashStart(at({ key: "saved" }));
    expect(flashStep(s, at({ key: "saved" })).fire).toBe(false);
    expect(flashStep(s, at({ key: "next" })).fire).toBe(true);
  });
  it("tells boards apart by their marks, not pencil notes", () => {
    const p = example("sudoku"), b = fresh(p), k = boardKey(b);
    b.pencil[0] = 6;
    expect(boardKey(b)).toBe(k);
    b.digit[1] = 3;
    expect(boardKey(b)).not.toBe(k);
  });
});
