// Makes boards.js for the creation-flow mockups from the real sketchpad, picture and solver code.
// Run from app/: npx vite-node --config vitest.config.ts ../docs/creation-flow-mockups/make-boards.ts ../docs/creation-flow-mockups/boards.js
import { readFileSync, writeFileSync } from "node:fs";
import { makePuzzle } from "~site/engine/puzzle.ts";
import { solve } from "~site/engine/solve.ts";
import type { GridSpec } from "~site/engine/types.ts";
import { pictureSvg } from "~site/game-types/grid/picture.ts";
import * as m from "~/sketchpad/model";
import { gridSvg, itemSvg, penVars, stampSvg } from "~/sketchpad/draw";
import { specOf, toDrawing, FOLDER_GENRE } from "~/sketchpad/from-puzzle";
import { kindName } from "~/games/kinds";

const ROOT = new URL("../../", import.meta.url).pathname;
const OUT = process.argv[2];
const load = (folder: string, n: number): GridSpec => {
  const genre = FOLDER_GENRE[folder] ?? folder;
  return specOf(genre, JSON.parse(readFileSync(`${ROOT}src/games/${folder}/${n}.json`, "utf8")));
};

/** The sketchpad's SVG body for a drawing: layers as Sketchpad.tsx renders them. */
function paper(d: m.Drawing, extra = "") {
  const layers = m.LAYERS.map((kinds) => d.items.filter((it) => kinds.includes(it.kind)));
  const mk = (it: m.Item) => itemSvg(d, it);
  const S = m.squareOf(d);
  const style = Object.entries(penVars(S)).map(([k, v]) => `${k}:${v}`).join(";");
  return `<svg class="sp-board" viewBox="0 0 ${m.PAGE} ${m.PAGE}" style="${style}"><g class="sp-ink">`
    + `<g>${layers[0].map(mk).join("")}</g>${d.grid ? `<g>${gridSvg(d.grid, m.gapsOf(d))}</g>` : ""}`
    + `<g>${layers[1].map(mk).join("")}</g><g>${layers[2].map(mk).join("")}</g><g>${layers[3].map(mk).join("")}</g></g>`
    + `<g class="mk-ui">${extra}</g></svg>`;
}
const geom = (d: m.Drawing) => d.grid && { x: d.grid.x, y: d.grid.y, S: d.grid.S, rows: d.grid.rows, cols: d.grid.cols };
const dropHeader = (d0: m.Drawing, genre: string): m.Drawing => {
  const d = { ...d0, items: d0.items.filter((it) => !(it.kind === "text" && it.text.startsWith(kindName(genre)))) };
  const g = d.grid!, sp = m.gridSpan(g), S = Math.min(g.S, (m.PAGE * 0.84) / sp.w, (m.PAGE * 0.84) / sp.h);
  return m.setGrid(d, { ...g, S, x: (m.PAGE - sp.w * S) / 2, y: (m.PAGE - sp.h * S) / 2 });
};

const out: Record<string, unknown> = {};

// ---- 2. a photo just converted: Akari, with doubts ----
{
  const spec = load("akari", 2), p = makePuzzle(spec), conv = toDrawing(p, "akari");
  let d = conv.drawing;
  // what the creator wrote at the top, as read
  d = { ...d, items: d.items.map((it) => it.kind === "text" && it.text.startsWith("Akari") ? { ...it, text: "Akari - Night Shift" } : it) };
  // a stray pen mark the reader kept (a smudge), loose on the page
  const g = d.grid!;
  d = m.add(d, { kind: "pen", weight: "medium", points: [m.loose(g, { x: g.x + g.S * 8.25, y: g.y + g.S * 6.1 }), m.loose(g, { x: g.x + g.S * 8.5, y: g.y + g.S * 6.35 }), m.loose(g, { x: g.x + g.S * 8.42, y: g.y + g.S * 6.7 })] });
  out.photo = { svg: paper(d), grid: geom(d) };
}

// ---- 3. Sudoku 6x6: a given removed, so several solutions; the difference ----
{
  const full = load("sudoku", 2);
  const spec: GridSpec = { ...full, givens: full.givens!.filter((x) => !(x.at === "cell" && x.cell[0] === 5 && x.cell[1] === 1)) };
  const p = makePuzzle(spec);
  const sols = await solve(p, 2);
  const diff: number[][] = [];
  if (sols.length === 2) for (let i = 0; i < sols[0].digit.length; i++) if (sols[0].digit[i] !== sols[1].digit[i]) diff.push([Math.floor(i / 6), i % 6, sols[0].digit[i], sols[1].digit[i]]);
  const d = dropHeader(toDrawing(p, "sudoku").drawing, "sudoku");
  out.sudoku = { svg: paper(d), grid: geom(d), solutions: sols.length, diff, givens: spec.givens };
  // a fully solved board for the test-play (some cells filled in by the creator playing)
  const one = await solve(makePuzzle(full), 2);
  const b = one[0];
  const given = new Set(full.givens!.map((g) => (g.at === "cell" ? g.cell[0] * 6 + g.cell[1] : -1)));
  const play = { ...b, digit: b.digit.map((v, i) => (given.has(i) || [0, 1, 4, 6, 7, 12, 13, 19].includes(i) ? v : 0)) as unknown as Uint8Array };
  out.testplay = { svg: pictureSvg(makePuzzle(full), play as typeof b, "Six by Six"), unique: one.length };
  // the creator's drawing of the finished puzzle: the "drawn by" thumbnail on the game page
  const dFull = dropHeader(toDrawing(makePuzzle(full), "sudoku").drawing, "sudoku");
  out.sudokuDrawn = { svg: paper(dFull), grid: geom(dFull) };
  // two broken rules: a second 5 in row 6, a second 3 in the top-right box. The solver finds none.
  const broken: GridSpec = { ...full, givens: [...full.givens!,
    { at: "cell", cell: [5, 4], kind: "number", value: 5 }, { at: "cell", cell: [0, 5], kind: "number", value: 3 }] } as GridSpec;
  const pb = makePuzzle(broken);
  const none = await solve(pb, 2);
  const dBroken = dropHeader(toDrawing(pb, "sudoku").drawing, "sudoku");
  out.sudokuBroken = { svg: paper(dBroken), grid: geom(dBroken), solutions: none.length };
}

// ---- 4. Panel: stones, crests, a triangle, dots, gaps ----
{
  const C = (r: number, c: number): [number, number] => [r, c];
  const spec: GridSpec = { genre: "panel", size: [4, 4], givens: [
    { at: "corner", corner: C(4, 0), kind: "start" }, { at: "corner", corner: C(0, 4), kind: "end" },
    { at: "cell", cell: C(0, 0), kind: "square", color: "black" }, { at: "cell", cell: C(1, 1), kind: "square", color: "black" },
    { at: "cell", cell: C(0, 2), kind: "square", color: "white" }, { at: "cell", cell: C(2, 3), kind: "square", color: "white" },
    { at: "cell", cell: C(3, 0), kind: "star", color: "orange" }, { at: "cell", cell: C(3, 2), kind: "star", color: "orange" },
    { at: "cell", cell: C(2, 1), kind: "triangle", value: 2, color: "orange" },
    { at: "corner", corner: C(2, 2), kind: "hexagon" },
    { at: "line", corners: [C(1, 4), C(2, 4)], kind: "gap" },
  ] } as GridSpec;
  const p = makePuzzle(spec);
  const sols = await solve(p, 2);
  const d = dropHeader(toDrawing(p, "panel").drawing, "panel");
  out.panel = { svg: paper(d), grid: geom(d), solutions: sols.length, solution: sols[0] ? pictureSvg(p, sols[0], "A solution") : "" };
}

// ---- 5. Honeycomb Paths ----
{
  const spec = load("honeycomb-paths", 3), p = makePuzzle(spec);
  const sols = await solve(p, 2);
  const d = dropHeader(toDrawing(p, "honeycomb-paths").drawing, "honeycomb-paths");
  out.honey = { svg: paper(d), grid: geom(d), solutions: sols.length };
}

// ---- 6. the type picker: the unknown drawing (numbers in a grid) and each candidate's example ----
{
  const spec = load("nurikabe", 1), p = makePuzzle(spec);
  const d = dropHeader(toDrawing(p, "nurikabe").drawing, "nurikabe");
  out.unknown = { svg: paper(d), grid: geom(d) };
  const as: Record<string, unknown> = {};
  for (const genre of ["nurikabe", "shikaku", "fillomino", "hidoku"]) {
    const q = makePuzzle({ ...spec, genre } as GridSpec);
    const n = (await solve(q, 2)).length;
    as[genre] = { svg: pictureSvg(q, null, genre), solutions: n };
  }
  out.as = as;
  console.log("as", Object.fromEntries(Object.entries(as).map(([k, v]) => [k, (v as { solutions: number }).solutions])));
  const thumbs: Record<string, string> = {};
  for (const [folder, n] of [["nurikabe", 1], ["shikaku", 1], ["fillomino", 1], ["hidoku", 1], ["sudoku", 1], ["akari", 1], ["masyu", 1], ["slitherlink", 1], ["star-battle", 1], ["skyscrapers", 1], ["panel", 2], ["honeycomb-paths", 1], ["akari", 2], ["sudoku", 2], ["star-battle", 2], ["nurikabe", 2]] as const) {
    const sp = load(folder, n);
    thumbs[`${folder}${n > 1 ? n : ""}`] = pictureSvg(makePuzzle(sp), null, kindName(sp.genre!));
  }
  out.thumbs = thumbs;
}

// ---- stamp icons ----
{
  const s = (st: Partial<m.Stamp> & { stamp: m.StampKind }) => `<svg viewBox="0 0 32 32">${stampSvg(st as m.Stamp, 16, 16, ({ rock: 20, stone: 36, star: 34, galaxy: 40, x: 40, dot: 48, end: 48, diamond: 44, "open-diamond": 44 } as Record<string, number>)[st.stamp] ?? 40)}</svg>`;
  out.stamps = {
    stone: s({ stamp: "stone", color: "black" }), white: s({ stamp: "stone", color: "white" }), star: s({ stamp: "star" }), rock: s({ stamp: "rock" }),
    galaxy: s({ stamp: "galaxy" }), x: s({ stamp: "x" }), dot: s({ stamp: "dot" }), diamond: s({ stamp: "diamond" }), "open-diamond": s({ stamp: "open-diamond" }),
    hoshi: s({ stamp: "hoshi" }), start: s({ stamp: "start" }), end: s({ stamp: "end" }), crest: s({ stamp: "crest", color: "orange" }),
    triangle: s({ stamp: "triangle", count: 1, color: "orange" }), shape: s({ stamp: "shape", cells: [[0, 0], [1, 0], [1, 1]], color: "yellow" }), eraser: s({ stamp: "eraser", color: "white" }),
  };
}

writeFileSync(OUT, `// Generated from the real sketchpad and picture code (from-puzzle.ts, draw.ts, picture.ts) and the solver.\nwindow.BOARDS = ${JSON.stringify(out)};\n`);
console.log("ok", Object.keys(out), (out.sudoku as { diff: unknown }).diff, "broken:", (out.sudokuBroken as { solutions: number }).solutions, (out.panel as { solutions: number }).solutions, (out.honey as { solutions: number }).solutions);
