// Opening a puzz.link link (app/lib/import-link.ts): each of our examples written as a puzz.link link
// (by the encoder below, after pzprjs's Encode code) reads back as itself, has one solution, and
// opens in paint as itself; puzz.link's own test puzzles read too; a type we don't have comes back
// as unsupported with its name, and a link that isn't one, as unreadable.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makePuzzle, type GenreName } from "~site/engine/puzzle.ts";
import { solve } from "~site/engine/solve.ts";
import type { Given, GridSpec } from "~site/engine/types.ts";
import { readLink } from "~/lib/import-link";
import { FOLDER_GENRE, specOf } from "~/sketchpad/from-puzzle";
import { convert, normalSpec } from "~/sketchpad/to-puzzle";
import { paintFromSketch } from "~/games/paint-save";
import { specToSketch } from "~/games/sketch";

const GAMES = new URL("../../../src/games/", import.meta.url).pathname;
const examples = (folder: string) => readdirSync(`${GAMES}${folder}`).filter((x) => x.endsWith(".json")).sort()
  .map((f) => ({ name: `${folder}/${f}`, spec: specOf(FOLDER_GENRE[folder] ?? folder, JSON.parse(readFileSync(`${GAMES}${folder}/${f}`, "utf8"))) }));

// ---- writing a link (pzprjs's encoders, for the tests) ----

type Cell = number | undefined;
const cellsOf = (spec: GridSpec, f: (g: Given) => number | undefined): Cell[] => {
  const [rows, cols] = spec.size, out: Cell[] = new Array(rows * cols);
  for (const g of spec.givens ?? []) if (g.at === "cell") { const v = f(g); if (v !== undefined) out[g.cell[0] * cols + g.cell[1]] = v; }
  return out;
};
function four(vals: Cell[]) {
  let cm = "", count = 0;
  for (let c = 0; c < vals.length; c++) {
    let p = "";
    const qn = vals[c];
    if (qn !== undefined && qn >= 0) {
      if (c + 1 < vals.length && vals[c + 1] !== undefined) p = qn.toString(16);
      else if (c + 2 < vals.length && vals[c + 2] !== undefined) { p = (5 + qn).toString(16); c++; }
      else { p = (10 + qn).toString(16); c += 2; }
    } else if (qn === -2) p = ".";
    else count++;
    if (count === 0) cm += p;
    else if (p || count === 20) { cm += (count + 15).toString(36) + p; count = 0; }
  }
  return count > 0 ? cm + (count + 15).toString(36) : cm;
}
const write16 = (qn: number) => (qn === -2 ? "." : qn < 16 ? qn.toString(16) : qn < 256 ? `-${qn.toString(16)}` : `+${qn.toString(16)}`);
function number16(vals: Cell[]) {
  let cm = "", count = 0;
  for (const qn of vals) {
    const p = qn === undefined ? "" : write16(qn);
    if (!p) count++;
    if (count === 0) cm += p;
    else if (p || count === 20) { cm += (15 + count).toString(36) + p; count = 0; }
  }
  return count > 0 ? cm + (15 + count).toString(36) : cm;
}
function bits(on: boolean[]) {
  let cm = "";
  for (let i = 0; i < on.length; i += 5) cm += on.slice(i, i + 5).reduce((n, b, w) => n + (b ? 16 >> w : 0), 0).toString(32);
  return cm;
}
function borders(areas: string[]) {
  const rows = areas.length, cols = areas[0].length, v: boolean[] = [], h: boolean[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) v.push(areas[r][c] !== areas[r][c + 1]);
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols; c++) h.push(areas[r][c] !== areas[r + 1][c]);
  return bits(v) + bits(h);
}
function three(vals: number[]) {
  let cm = "";
  for (let i = 0; i < vals.length; i += 3) cm += [9, 3, 1].reduce((n, t, w) => n + (vals[i + w] ?? 0) * t, 0).toString(27);
  return cm;
}
/** the numbers all round a grid: top, bottom, left, right */
function around(spec: GridSpec, kind: "first" | "skyscraper") {
  const [rows, cols] = spec.size, out: Cell[] = new Array(2 * (rows + cols));
  for (const g of spec.givens ?? []) if (g.at === "edge" && g.kind === kind) {
    const i = g.side === "top" ? g.cell[1] : g.side === "bottom" ? cols + g.cell[1] : g.side === "left" ? 2 * cols + g.cell[0] : 2 * cols + rows + g.cell[0];
    out[i] = g.value;
  }
  return number16(out);
}
function dots(spec: GridSpec) {
  const [rows, cols] = spec.size, w = 2 * cols - 1, on = new Array<boolean>(w * (2 * rows - 1)).fill(false);
  for (const g of spec.givens ?? []) if (g.at === "point") on[(g.point[0] - 1) * w + (g.point[1] - 1)] = true;
  let cm = "", count = 0;
  for (let s = 0; s < on.length; s++) {
    let p = "";
    if (on[s]) {
      for (let i = 1; i <= 7; i++) if (on[s + i]) { p = (2 * (i - 1)).toString(16); s += i - 1; break; }
      if (!p) { p = (13 + 1).toString(16); s += 7; }
    } else count++;
    if (count === 0) cm += p;
    else if (p || count === 20) { cm += (count + 15).toString(36) + p; count = 0; }
  }
  return count > 0 ? cm + (count + 15).toString(36) : cm;
}
const nums = (spec: GridSpec) => cellsOf(spec, (g) => (g.kind === "number" ? g.value : undefined));
const hasRule = (spec: GridSpec, rule: string) => (spec.rules ?? []).some((s) => s.rule === rule);

/** One of our puzzles as a puzz.link link, or null when puzz.link's type can't say it. */
function toLink(spec: GridSpec): string | null {
  const [rows, cols] = spec.size, at = (pid: string, body: string) => `https://puzz.link/p?${pid}/${cols}/${rows}/${body}`;
  switch (spec.genre) {
    case "slitherlink": return at("slither", four(nums(spec)));
    case "nurikabe": return at("nurikabe", number16(nums(spec)));
    case "simple-loop":
      if (spec.givens?.some((g) => g.kind === "wall")) return null;
      return at("simpleloop", bits(cellsOf(spec, (g) => (g.kind === "block" ? 1 : undefined)).map((v) => v === 1)));
    case "star-battle": return at("starbattle", `1/${borders(spec.areas!)}`);
    case "akari": {
      if (spec.givens?.some((g) => g.kind === "number" && g.letter)) return null;   // a cipher
      const blocks = cellsOf(spec, (g) => (g.kind === "block" ? -2 : undefined)), n = nums(spec);
      return at("akari", four(blocks.map((b, i) => n[i] ?? b)));
    }
    case "shikaku": return at("shikaku", number16(nums(spec)));
    case "numberlink": return at(hasRule(spec, "links") ? "arukone" : "numlin", number16(nums(spec)));
    case "masyu": return at("mashu", three(cellsOf(spec, (g) => (g.kind === "pearl" ? (g.value === "white" ? 1 : 2) : undefined)).map((v) => v ?? 0)));
    case "cave": return at("cave", number16(nums(spec)));
    case "aquarium": {
      const out: Cell[] = new Array(cols + rows);
      for (const g of spec.givens ?? []) if (g.kind === "total") out[g.at === "col" ? g.index : cols + g.index] = g.value;
      return at("aquarium", `${borders(spec.areas!)}/${number16(out)}`);
    }
    case "square-jam": return at("squarejam", number16(nums(spec)));
    case "wittgenstein-briquet": return at("wittgen", four(nums(spec)));
    case "hitori": return at("hitori", nums(spec).map((v) => (v === undefined ? "." : v.toString(36))).join(""));
    case "minesweeper": return at("mines", number16(nums(spec)));
    case "spiral-galaxies": return at("tentaisho", dots(spec) + bits(new Array(rows * cols).fill(false)));
    case "skyscrapers": return at("skyscrapers", around(spec, "skyscraper") + number16(nums(spec)));
    case "easy-as-abc": return at("easyasabc", `3/${around(spec, "first")}${number16(nums(spec))}`);
    case "nonogram": {
      // the clues flushed against the grid, nearest first
      const p = makePuzzle(spec), above = (rows + 1) >> 1, beside = (cols + 1) >> 1, out: Cell[] = [];
      const slots = (runs: number[], n: number) => { const r = runs.filter((x) => x > 0).reverse(); return Array.from({ length: n }, (_, k) => r[k]); };
      for (let c = 0; c < cols; c++) out.push(...slots(p.colRuns.get(c)!, above));
      for (let r = 0; r < rows; r++) out.push(...slots(p.rowRuns.get(r)!, beside));
      return at("nonogram", number16(out));
    }
    case "sudoku": return at("sudoku", number16(nums(spec)));
    case "fillomino": return hasRule(spec, "allowed-sizes") ? null : at("fillomino", number16(nums(spec)));
    default: return null;
  }
}

const FOLDERS = ["slitherlink", "nurikabe", "round-the-bend", "star-battle", "akari", "shikaku", "numberlink", "masyu", "cave", "aquarium",
  "square-jam", "wittgenstein-briquet", "hitori", "minesweeper", "spiral-galaxies", "skyscrapers", "easy-as-abc", "picture-squares", "sudoku", "fillomino"];

/** Read a link that should be a puzzle, and check it has exactly one solution. */
async function opens(link: string) {
  const got = await readLink(link);
  expect(got.kind, link).toBe("puzzle");
  const spec = (got as Extract<typeof got, { kind: "puzzle" }>).spec;
  expect((await solve(makePuzzle(spec), 2)).length, link).toBe(1);
  return spec;
}

describe("our examples as puzz.link links", () => {
  for (const folder of FOLDERS) {
    it(`${folder}: reads back as itself, with one solution, and opens in paint`, async () => {
      let tried = 0;
      for (const { name, spec } of examples(folder)) {
        const link = toLink(spec);
        if (!link) continue;
        tried++;
        const got = await opens(link);
        expect(normalSpec(got), name).toEqual(normalSpec(spec));
        // paint draws it (as a photo's reading is drawn) and converts it back to itself
        const save = paintFromSketch(specToSketch(got));
        expect(save, name).not.toBeNull();
        const back = convert(save!.drawing, save!.genre as GenreName, save!.settings);
        expect(back.problems, name).toEqual([]);
        expect(normalSpec(back.spec!), name).toEqual(normalSpec(got));
      }
      expect(tried).toBeGreaterThan(0);
    }, 120_000);
  }
});

// pzprjs's own test puzzles (test/script/<type>.js; MIT), written by puzz.link itself
describe("puzz.link's test puzzles", () => {
  const LINKS: [string, string][] = [
    ["slither", "5/5/cbcbcddad"], ["nurikabe", "5/5/g5k2o1k3g"], ["simpleloop", "5/5/sg020"], ["starbattle", "6/6/1/4ilbhgdnmhou"],
    ["akari", "6/6/nekcakbl"], ["shikaku", "6/6/j3g56h6t6h23g5j"], ["numlin", "5/5/1j2h3m1h2j3"], ["mashu", "6/6/1063000i3000"],
    ["cave", "6/6/g3q2h3jbj3i3i2g"], ["aquarium", "4/4/bu8i90/i3213g"], ["squarejam", "6/6/i3s32s1i"], ["wittgen", "6/6/n0drchbj"],
    ["hitori", "4/4/1114142333214213"], ["mines", "5/5/g2m13l13g0j"],
    ["skyscrapers", "4/4/k13h4j3g"], ["easyasabc", "4/4/3/1m2h3g3h"], ["nonogram", "6/6/12g1111h11112j12g11g21j11g3h"],
    ["sudoku", "4/4/g1k23k3g"], ["fillomino", "6/6/h4j53g2k5233k2g14j3h"],
  ];
  for (const [pid, rest] of LINKS) it(`${pid}: ${rest}`, async () => { await opens(`https://puzz.link/p?${pid}/${rest}`); }, 60_000);
});

describe("walls", () => {
  // puzz.link's Aquarium lets a wall end in open water (Puzzle Square JP 3887, solved by 256 there);
  // our areas need closed tanks, so such a link is a variant we don't have, not a broken puzzle
  it("a wall that doesn't close an area is a variant", async () => {
    const r = await readLink("https://puzz.link/p?aquarium/7/7/2fu93dr7000les8c0g/g5444i54j");
    expect(r.kind).toBe("unsupported");
    expect(r.kind === "unsupported" && r.variant).toBe("with walls that don't close");
  });
  it("closed tanks still open", async () => {
    expect((await readLink("https://puzz.link/p?aquarium/7/7/93hv7se4g672q2q730/g22g22g2g222h")).kind).toBe("puzzle");
  });
});

describe("other links", () => {
  it("reads the address every way it's written", async () => {
    for (const link of ["http://pzv.jp/p.html?slither/5/5/cbcbcddad", "puzz.link/p?slither_edit/5/5/cbcbcddad",
      "https://puzz.link/p?type=editor&slither/5/5/cbcbcddad", "  https://puzz.link/p?slitherlink/5/5/cbcbcddad/  "])
      expect((await readLink(link)).kind, link).toBe("puzzle");
  });
  it("a type we don't have: unsupported, with puzz.link's name", async () => {
    expect(await readLink("https://puzz.link/p?heyawake/6/6/aa0a0a00g0e0")).toEqual({ kind: "unsupported", source: "puzzlink", genreId: "heyawake", genreName: "Heyawake" });
    expect(await readLink("https://puzz.link/p?yajirin/5/5/a")).toMatchObject({ kind: "unsupported", genreId: "yajilin" });
  });
  it("a variant ours doesn't match: unsupported, saying what differs", async () => {
    expect(await readLink("https://puzz.link/p?nurikabe/3/3/.m")).toMatchObject({ kind: "unsupported", genreId: "nurikabe", genreName: "Nurikabe", variant: "with ? clues" });
    // puzz.link's test Tentaisho has a hole in its grid
    expect(await readLink("https://puzz.link/p?tentaisho/5/5/6fl94fi65en8dbf10000")).toMatchObject({ kind: "unsupported", genreName: "Tentaisho", variant: "with holes" });
    expect(await readLink("https://puzz.link/p?slither/f/3/3/j")).toMatchObject({ kind: "unsupported", variant: "through every dot" });
    expect(await readLink("https://puzz.link/p?fillomino/2/2/3g1g80")).toMatchObject({ kind: "unsupported", variant: "with given borders" });
    expect(await readLink("https://puzz.link/p?sudoku/40/40/")).toMatchObject({ kind: "unsupported", variant: "over 30 × 30" });
  });
  it("Masyu through every cell keeps that rule", async () => {
    const got = await readLink("https://puzz.link/p?mashu/f/6/6/1063000i3000");
    expect(got.kind === "puzzle" && got.spec.rules).toEqual([{ rule: "loop", of: "loop", cover: true }]);
  });
  it("Star Battle with two stars", async () => {
    const got = await readLink("https://puzz.link/p?starbattle/6/6/2/4ilbhgdnmhou");
    expect(got.kind === "puzzle" && got.spec.rules).toEqual([{ rule: "shaded-per-line", n: 2 }, { rule: "shaded-per-area", n: 2 }]);
  });
  it("garbage: unreadable", async () => {
    for (const link of ["", "hello", "https://example.com/", "https://puzz.link/p?notatype/5/5/abc", "https://puzz.link/p?slither/x/y/abc",
      "https://puzz.link/p?nurikabe/5/5/~~~", "https://puzz.link/p?sudoku/5/5/1", "https://puzz.link/p?starbattle/6/6/zz/4ilbhgdnmhou"])
      expect((await readLink(link)).kind, link).toBe("unreadable");
  });
});
