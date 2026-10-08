// The on-puzzle editor's actions (app/editor/ops.ts).
import { describe, expect, it } from "vitest";
import type { GridSpec } from "~site/engine/types.ts";
import * as ops from "~/editor/ops";

const grid = (genre: string, size: [number, number] = [4, 4], extra: Partial<GridSpec> = {}): GridSpec => ({ genre, size, givens: [], ...extra });

describe("numbers", () => {
  it("puts a number in a square, replaces it, and clears it", () => {
    let s = ops.setNumber(grid("sudoku"), [0, 0], 3);
    expect(s.givens).toEqual([{ at: "cell", cell: [0, 0], kind: "number", value: 3 }]);
    s = ops.setNumber(s, [0, 0], 4);
    expect(s.givens).toEqual([{ at: "cell", cell: [0, 0], kind: "number", value: 4 }]);
    expect(ops.setNumber(s, [0, 0], null).givens).toEqual([]);
  });
  it("makes an Akari number's square black, and keeps it black when the number goes", () => {
    const s = ops.setNumber(grid("akari"), [1, 1], 2);
    expect(s.givens).toContainEqual({ at: "cell", cell: [1, 1], kind: "block" });
    expect(ops.setNumber(s, [1, 1], null).givens).toEqual([{ at: "cell", cell: [1, 1], kind: "block" }]);
  });
  it("returns the same puzzle when nothing changes", () => {
    const s = ops.setNumber(grid("sudoku"), [0, 0], 3);
    expect(ops.setNumber(s, [0, 0], 3)).toBe(s);
  });
});

describe("rocks", () => {
  it("replace what's in a square, except a number on a black square (Akari)", () => {
    const sudoku = ops.setNumber(grid("simple-loop"), [0, 0], 1);
    expect(ops.setBlock(sudoku, [0, 0], true).givens).toEqual([{ at: "cell", cell: [0, 0], kind: "block" }]);
    const akari = ops.setNumber(grid("akari"), [0, 0], 1);
    expect(ops.setBlock(ops.setBlock(akari, [0, 0], false), [0, 0], true).givens).toHaveLength(1);
  });
});

describe("lines between squares", () => {
  it("toggle a wall whichever way round the squares are given", () => {
    const s = ops.toggleBorder(grid("simple-loop"), [0, 0], [0, 1], "wall");
    expect(s.givens).toEqual([{ at: "border", cells: [[0, 0], [0, 1]], kind: "wall" }]);
    expect(ops.toggleBorder(s, [0, 1], [0, 0], "wall").givens).toEqual([]);
  });
  it("cycle ◆, ◇, none", () => {
    let s = ops.toggleBorder(grid("panes"), [1, 1], [2, 1], "diamond");
    expect(s.givens?.[0]).toMatchObject({ kind: "twins" });
    s = ops.toggleBorder(s, [1, 1], [2, 1], "diamond");
    expect(s.givens?.[0]).toMatchObject({ kind: "opposites" });
    expect(ops.toggleBorder(s, [1, 1], [2, 1], "diamond").givens).toEqual([]);
  });
});

describe("pearls, galaxies, symbols", () => {
  it("cycle a pearl white, black, none", () => {
    let s = ops.cyclePearl(grid("masyu"), [2, 2]);
    expect(s.givens).toEqual([{ at: "cell", cell: [2, 2], kind: "pearl", value: "white" }]);
    s = ops.cyclePearl(s, [2, 2]);
    expect(s.givens).toEqual([{ at: "cell", cell: [2, 2], kind: "pearl", value: "black" }]);
    expect(ops.cyclePearl(s, [2, 2]).givens).toEqual([]);
  });
  it("toggle a galaxy circle", () => {
    const s = ops.toggleGalaxy(grid("spiral-galaxies"), [2, 2]);
    expect(s.givens).toEqual([{ at: "point", point: [2, 2], kind: "galaxy" }]);
    expect(ops.toggleGalaxy(s, [2, 2]).givens).toEqual([]);
  });
  it("toggle a symbol", () => {
    const s = ops.toggleSymbol(grid("panes"), [0, 0]);
    expect(ops.toggleSymbol(s, [0, 0]).givens).toEqual([]);
  });
  it("a colored symbol replaces another color, and the same color takes it off", () => {
    const red = ops.toggleSymbol(grid("panes"), [0, 0], "red");
    const blue = ops.toggleSymbol(red, [0, 0], "blue");
    expect(blue.givens).toEqual([{ at: "cell", cell: [0, 0], kind: "symbol", value: "blue" }]);
    expect(ops.toggleSymbol(blue, [0, 0], "blue").givens).toEqual([]);
  });
  it("a palisade mark steps through 0, 1, 2 at a corner, 2 opposite, 3, 4 and off", () => {
    let s = grid("panes");
    const seen: string[] = [];
    for (let k = 0; k < 6; k++) {
      s = ops.cyclePalisade(s, [1, 1]);
      const g = s.givens?.find((x) => x.kind === "palisade");
      seen.push(g && g.kind === "palisade" ? `${g.value}${g.opposite ? "o" : ""}` : "-");
    }
    expect(seen).toEqual(["0", "1", "2", "2o", "3", "4"]);
    expect(ops.cyclePalisade(s, [1, 1]).givens).toEqual([]);
  });
});

describe("thermometers", () => {
  it("need two squares, and a click on one removes it", () => {
    expect(ops.addThermo(grid("thermo-sudoku"), [[0, 0]]).givens).toEqual([]);
    const s = ops.addThermo(grid("thermo-sudoku"), [[0, 0], [1, 0], [1, 1]]);
    expect(s.givens).toHaveLength(1);
    expect(ops.removeThermoAt(s, [1, 1]).givens).toEqual([]);
  });
});

describe("doors", () => {
  it("cycle in, out, none, keeping one of each", () => {
    let s = ops.cycleDoor(grid("maze"), [0, 1], "top");
    expect(s.givens).toEqual([{ at: "edge", cell: [0, 1], side: "top", kind: "door", role: "in" }]);
    s = ops.cycleDoor(s, [3, 3], "right");
    expect(s.givens?.filter((g) => g.kind === "door" && g.role === "in")).toHaveLength(1);
    expect(s.givens?.find((g) => g.kind === "door" && g.role === "in")).toMatchObject({ cell: [3, 3] });
  });
});

describe("clues outside the grid and line clues", () => {
  it("set and clear a number outside", () => {
    const s = ops.setOutside(grid("skyscrapers"), [0, 2], "top", "skyscraper", 3);
    expect(s.givens).toEqual([{ at: "edge", cell: [0, 2], side: "top", kind: "skyscraper", value: 3 }]);
    expect(ops.setOutside(s, [0, 2], "top", "skyscraper", null).givens).toEqual([]);
  });
  it("set a line's total and a nonogram line's runs", () => {
    expect(ops.setLine(grid("aquarium"), "row", 2, { kind: "total", value: 4 }).givens).toEqual([{ at: "row", index: 2, kind: "total", value: 4 }]);
    expect(ops.setLine(grid("nonogram"), "col", 1, { kind: "runs", value: [1, 2] }).givens).toEqual([{ at: "col", index: 1, kind: "runs", value: [1, 2] }]);
  });
});

describe("resizing", () => {
  it("drops clues that fall off and keeps the rest", () => {
    const s = ops.setNumber(ops.setNumber(grid("sudoku", [6, 6]), [0, 0], 1), [5, 5], 2);
    expect(ops.resize(s, 4, 4).givens).toEqual([{ at: "cell", cell: [0, 0], kind: "number", value: 1 }]);
  });
  it("moves clues on the bottom and right edges with the edge", () => {
    const s = ops.setOutside(grid("skyscrapers"), [3, 1], "bottom", "skyscraper", 2);
    expect(ops.resize(s, 5, 5).givens).toEqual([{ at: "edge", cell: [4, 1], side: "bottom", kind: "skyscraper", value: 2 }]);
  });
  it("pads areas and pictures", () => {
    const s = ops.resize(grid("star-battle", [2, 2], { areas: ["ab", "ab"] }), 3, 3);
    expect(s.areas).toEqual(["abb", "abb", "abb"]);
    const p = ops.resize(grid("nonogram", [2, 2], { givens: undefined, picture: { rows: ["a.", ".a"], palette: { ".": "#fff", a: "#000" } } }), 2, 3);
    expect(p.picture?.rows).toEqual(["a..", ".a."]);
  });
  it("keeps sizes between 2 and 30", () => {
    expect(ops.resize(grid("sudoku"), 1, 50).size).toEqual([2, 30]);
  });
});

describe("nonogram pictures", () => {
  it("paint, clear, and drop colors no longer used", () => {
    const pal = { ".": "#fff", a: "#f00", b: "#00f" };
    let s = ops.toPicture(grid("nonogram", [2, 2]));
    s = ops.paintSquare(s, [0, 0], "a", pal);
    expect(s.picture?.rows).toEqual(["a.", ".."]);
    expect(Object.keys(s.picture!.palette).sort()).toEqual([".", "a"]);
    expect(ops.paintSquare(s, [0, 0], ".", pal).picture?.rows).toEqual(["..", ".."]);
  });
  it("turn a picture into its numbers", () => {
    const s = ops.toNumbers(grid("nonogram", [2, 3], { givens: undefined, picture: { rows: ["aa.", "a.a"], palette: { ".": "#fff", a: "#000" } } }));
    expect(s.picture).toBeUndefined();
    expect(s.givens).toContainEqual({ at: "row", index: 1, kind: "runs", value: [1, 1] });
    expect(s.givens).toContainEqual({ at: "col", index: 0, kind: "runs", value: [2] });
  });
});

describe("Star Battle stars", () => {
  it("set per row, column and area, and back to the type's one", () => {
    const two = ops.setStars(grid("star-battle"), 2);
    expect(ops.starsOf(two)).toBe(2);
    expect(two.rules).toHaveLength(2);
    expect(ops.setStars(two, 1).rules).toBeUndefined();
  });
});

describe("Panes' Glimmith clues", () => {
  it("cycle a < sign on a border: pointing to one side, the other, none", () => {
    let s = ops.cycleInequality(grid("panes"), [0, 0], [0, 1]);
    expect(s.givens).toEqual([{ at: "border", cells: [[0, 0], [0, 1]], kind: "inequality" }]);
    s = ops.cycleInequality(s, [0, 0], [0, 1]);
    expect(s.givens).toEqual([{ at: "border", cells: [[0, 1], [0, 0]], kind: "inequality" }]);
    expect(ops.cycleInequality(s, [0, 0], [0, 1]).givens).toEqual([]);
  });
  it("set a difference on a border and a watchtower on a corner, and clear them", () => {
    const s = ops.setWatchtower(ops.setDifference(grid("panes"), [1, 1], [2, 1], 2), [2, 2], 3);
    expect(s.givens).toEqual([{ at: "border", cells: [[1, 1], [2, 1]], kind: "difference", value: 2 }, { at: "corner", corner: [2, 2], kind: "watchtower", value: 3 }]);
    expect(ops.setWatchtower(s, [2, 2], 5).givens).toHaveLength(1);   // a watchtower counts 1 to 4
    expect(ops.setDifference(s, [2, 1], [1, 1], null).givens).toHaveLength(1);
  });
  it("add shapes to the bank (once each) and take them out; resizing keeps them", () => {
    let s = ops.addToBank(grid("panes"), [[0, 0], [0, 1]]);
    expect(ops.addToBank(s, [[0, 1], [0, 0]])).toBe(s);
    s = ops.addToBank(s, [[0, 0], [1, 0], [1, 1]]);
    expect(ops.bankOf(s)).toEqual([[[0, 0], [0, 1]], [[0, 0], [1, 0], [1, 1]]]);
    expect(ops.bankOf(ops.resize(s, 3, 3))).toHaveLength(2);
    expect(ops.bankOf(ops.removeFromBank(s, 0))).toEqual([[[0, 0], [1, 0], [1, 1]]]);
  });
  it("move a drawn shape to the top-left", () => {
    expect(ops.normalShape([[2, 3], [1, 3], [2, 4]])).toEqual([[0, 0], [1, 0], [1, 1]]);
  });
});

describe("a type's own settings (Fillomino, Sum Regions, Symmetry Cut, Critter Connecting, Kinship)", () => {
  it("keeps a setting as the puzzle's own rule only while it differs from the type's", () => {
    let s = ops.setRuleSetting(grid("sum-regions"), "region-sum", "is", 12);
    expect(s.rules).toEqual([{ rule: "region-sum", is: 12 }]);
    expect(ops.ruleSetting(s, "region-sum", "is")).toBe(12);
    s = ops.setRuleSetting(s, "region-sum", "is", 10);
    expect(s.rules).toBeUndefined();
    expect(ops.ruleSetting(s, "region-sum", "is")).toBe(10);
  });
  it("adds a rule the type doesn't have, and drops it when it's empty", () => {
    let s = ops.setRuleSetting(grid("fillomino"), "allowed-sizes", "sizes", [4, 6], true);
    expect(s.rules).toEqual([{ rule: "allowed-sizes", sizes: [4, 6] }]);
    s = ops.setRuleSetting(s, "allowed-sizes", "sizes", undefined, true);
    expect(s.rules).toBeUndefined();
    expect(ops.setRuleSetting(grid("critters"), "pieces", "flip", true).rules).toEqual([{ rule: "pieces", flip: true }]);
    expect(ops.setRuleSetting(grid("kinship"), "tiles", "kinds", 3).rules).toEqual([{ rule: "tiles", kinds: 3, colors: 3 }]);
  });
  it("places a Kinship tile, and takes it out again", () => {
    const s = ops.toggleTile(grid("kinship", [1, 6]), [0, 2], 4);
    expect(s.givens).toEqual([{ at: "cell", cell: [0, 2], kind: "number", value: 4 }]);
    expect(ops.toggleTile(s, [0, 2], 4).givens).toEqual([]);
  });
});
