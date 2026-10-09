// Makes v3-boards.js for the v3 creation-flow mockups (docs/creation-flow.md, "v3 layout") from the
// real sketchpad, converter, Check, suggestion, picture and solver code: the drawings, the marks on
// them (check.ts's highlight / doubtHighlight / marksSvg), the problems (to-puzzle.ts's convert,
// check.ts's checkList), the verdicts (the solver), the solutions (picture.ts, check.ts's
// solutionSvg) and the type suggestions (suggest.ts). The rule lines are the guides' (guides.ts).
// Run from app/: npx vite-node --config vitest.config.ts ../docs/creation-flow-mockups/v3-make-boards.ts ../docs/creation-flow-mockups/v3-boards.js
import { readFileSync, writeFileSync } from "node:fs";
import { makePuzzle } from "~site/engine/puzzle.ts";
import { solve } from "~site/engine/solve.ts";
import type { GridSpec } from "~site/engine/types.ts";
import { pictureSvg } from "~site/game-types/grid/picture.ts";
import { guides } from "~site/guides/guides.ts";
import * as m from "~/sketchpad/model";
import { gridSvg, itemSvg, penVars, stampSvg } from "~/sketchpad/draw";
import { specOf, toDrawing, FOLDER_GENRE } from "~/sketchpad/from-puzzle";
import { convert } from "~/sketchpad/to-puzzle";
import { checkList, doubtHighlight, highlight, marksSvg, solutionSvg } from "~/sketchpad/check";
import { fitsOf, fitWords, rankSuggestions, SAID_WORDS, saidBeforeSolving, saidOf, type Said } from "~/sketchpad/suggest";
import { drawingSvg } from "~/sketchpad/picture";
import { layoutOf } from "~/games/layout-of";
import { kindName } from "~/games/kinds";
import type { Doubt } from "~/games/doubts";

const ROOT = new URL("../../", import.meta.url).pathname;
const OUT = process.argv[2];
const load = (folder: string, n: number): GridSpec => {
  const genre = FOLDER_GENRE[folder] ?? folder;
  return specOf(genre, JSON.parse(readFileSync(`${ROOT}src/games/${folder}/${n}.json`, "utf8")));
};

/** The sketchpad's SVG for a drawing, as Sketchpad.tsx renders it: the ink layers, the grid with
 *  `underlay` (a sudoku's box lines), then `overlay` (Paint's marks and solution) in `.sp-marks`. */
function paper(d: m.Drawing, overlay = "", underlay = "") {
  const layers = m.LAYERS.map((kinds) => d.items.filter((it) => kinds.includes(it.kind)));
  const mk = (it: m.Item) => itemSvg(d, it);
  const style = Object.entries(penVars(m.squareOf(d))).map(([k, v]) => `${k}:${v}`).join(";");
  return `<svg class="sp-board" viewBox="0 0 ${m.PAGE} ${m.PAGE}" style="${style}"><g class="sp-ink">`
    + `<g>${layers[0].map(mk).join("")}</g>${d.grid ? `<g>${gridSvg(d.grid, m.gapsOf(d))}${underlay}</g>` : ""}`
    + `<g>${layers[1].map(mk).join("")}</g><g>${layers[2].map(mk).join("")}</g><g>${layers[3].map(mk).join("")}</g></g>`
    + (overlay ? `<g class="sp-marks">${overlay}</g>` : "") + `</svg>`;
}
/** Paint.tsx's boxLines: a sudoku's box lines, drawn with its grid. */
function boxLines(g: m.Grid, box: [number, number]): string {
  let out = "";
  const line = (x1: number, y1: number, x2: number, y2: number) => { out += `<line class="sp-pen medium" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; };
  for (let r = box[0]; r < g.rows; r += box[0]) line(g.x, g.y + r * g.S, g.x + g.cols * g.S, g.y + r * g.S);
  for (let c = box[1]; c < g.cols; c += box[1]) line(g.x + c * g.S, g.y, g.x + c * g.S, g.y + g.rows * g.S);
  return out;
}
/** Centre the grid on the page, a little smaller (the type's heading, written above it, dropped). */
const centred = (d0: m.Drawing, genre: string, keepTitle = false): m.Drawing => {
  const d = keepTitle ? d0 : { ...d0, items: d0.items.filter((it) => !(it.kind === "text" && it.text.startsWith(kindName(genre)))) };
  const g = d.grid!, sp = m.gridSpan(g), S = Math.min(g.S, (m.PAGE * 0.84) / sp.w, (m.PAGE * 0.84) / sp.h);
  return m.setGrid(d, { ...g, S, x: (m.PAGE - sp.w * S) / 2, y: (m.PAGE - sp.h * S) / 2 });
};
const round = (p: m.XY | null) => p && { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
/** A guide's rule lines (the checklist's lines) and the engine rules each one checks. */
const ruleLines = (genre: string, pick?: number[]) => {
  const rules = guides[genre as keyof typeof guides].rules;
  return (pick ? pick.map((i) => rules[i]) : rules).map((r) => ({ text: r.text, checks: r.checks ?? [] }));
};
const verdictOfCount = (genre: string, n: number) => (n === 0 ? "none" : n === 1 ? "one" : genre === "panel" ? "solvable" : "several");

const out: Record<string, unknown> = {};

// ---- 1 and 7: Sudoku 6 × 6 with two broken rules (a second 5 in row 6, a second 3 in a box) ----
{
  const full = load("sudoku", 2);
  const broken = { ...full, givens: [...full.givens!,
    { at: "cell", cell: [5, 4], kind: "number", value: 5 }, { at: "cell", cell: [0, 5], kind: "number", value: 3 }] } as GridSpec;
  const d = centred(toDrawing(makePuzzle(broken), "sudoku").drawing, "sudoku");
  const conv = convert(d, "sudoku");
  const list = checkList(conv, { digits: "1 to 6" });
  const lights = list.map((x) => ({ x, h: highlight(d, x) }));
  const marks = (sel: number | null) => `<g class="sp-marks-all${sel ? " has-selection" : ""}">${lights.map(({ x, h }) => marksSvg(h, x.kind === "rule" ? "error" : "misfit", x.n, x.n === sel)).join("")}</g>`;
  const under = boxLines(d.grid!, [2, 3]);
  const none = await solve(makePuzzle(broken), 2);
  out.sudokuBroken = {
    svg: paper(d, marks(1), under), svgPlain: paper(d, marks(null), under), solutions: none.length,
    list: list.map((x) => ({ n: x.n, kind: x.kind, place: x.place, text: x.text, tip: x.tip })),
    tips: Object.fromEntries(lights.map(({ x, h }) => [x.n, { tip: round(h.tip), bounds: h.bounds }])),
    rules: ruleLines("sudoku"),
  };
  // the same puzzle without the two extra digits, drawn before a type is set (no box lines yet)
  const dn = centred(toDrawing(makePuzzle(full), "sudoku").drawing, "sudoku");
  out.sudokuNoType = { svg: paper(dn) };
  console.log("sudoku broken:", list.map((x) => x.text), "solutions", none.length);
}

// ---- 3: Panel, solvable, with a 3 written in a square (panels have no numbers) ----
{
  const C = (r: number, c: number): [number, number] => [r, c];
  const spec = { genre: "panel", size: [4, 4], givens: [
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
  let d = centred(toDrawing(p, "panel").drawing, "panel");
  d = m.add(d, { kind: "text", at: { at: "cell", r: 3, c: 3 }, text: "3" });
  const conv = convert(d, "panel");
  const list = checkList(conv);
  const marks = `<g class="sp-marks-all">${list.map((x) => marksSvg(highlight(d, x), x.kind === "rule" ? "error" : "misfit", x.n, false)).join("")}</g>`;
  const pc = makePuzzle(conv.spec!);
  const sc = await solve(pc, 2);
  out.panel = {
    svg: paper(d, marks), svgSolution: paper(d, solutionSvg(pc, sc[0], d.grid!) + marks),
    solutions: sc.length, verdict: verdictOfCount("panel", sc.length),
    solution: pictureSvg(pc, sc[0], "A solution"),
    list: list.map((x) => ({ n: x.n, kind: x.kind, place: x.place, text: x.text, tip: x.tip })),
    // the guide's lines for the symbols this panel has: the line, dots, squares, stars, triangles
    rules: ruleLines("panel", [0, 1, 2, 3, 4]),
  };
  console.log("panel:", sols.length, "with the 3:", sc.length, list.map((x) => x.text));
}

// ---- 4: Akari, just read from a photo: the reader's doubts (amber, lettered) and a smudge it kept ----
{
  const spec = load("akari", 2), p = makePuzzle(spec);
  let d = centred(toDrawing(p, "akari").drawing, "akari", true);
  d = { ...d, items: d.items.map((it) => it.kind === "text" && it.text.startsWith("Akari") ? { ...it, text: "Akari - Night Shift" } : it) };
  const g = d.grid!;
  d = m.add(d, { kind: "pen", weight: "medium", points: [m.loose(g, { x: g.x + g.S * 8.18, y: g.y + g.S * 3.1 }), m.loose(g, { x: g.x + g.S * 8.42, y: g.y + g.S * 3.35 }), m.loose(g, { x: g.x + g.S * 8.34, y: g.y + g.S * 3.7 })] });
  // doubts as the reader writes them (games/doubts.ts): on a black cell's number, a row, the whole
  const numbered = spec.givens!.filter((x) => x.at === "cell" && x.kind === "number") as { cell: [number, number]; value: number }[];
  const a = numbered[1], b = numbered[numbered.length - 1];
  const doubts: Doubt[] = [
    { text: `Is this a ${a.value} or a ${a.value + 1}? The pen skipped.`, place: "cell", row: a.cell[0], col: a.cell[1] },
    { text: "Is this square black, or a shadow on the paper?", place: "cell", row: b.cell[0], col: b.cell[1] },
    { text: "Row 1 was creased; check its black squares.", place: "rows", row: 0 },
  ];
  const conv = convert(d, "akari");
  const list = checkList(conv);
  const dl = doubts.map((x) => doubtHighlight(d, x));
  const marks = `<g class="sp-marks-all has-selection">${list.map((x) => marksSvg(highlight(d, x), x.kind === "rule" ? "error" : "misfit", x.n, false)).join("")}`
    + dl.map((h, i) => marksSvg(h, "doubt", String.fromCharCode(65 + i), i === 0)).join("") + "</g>";
  const pa = makePuzzle(conv.spec!), sols = await solve(pa, 2);
  out.photo = {
    solution: pictureSvg(pa, sols[0], "The solution"),
    svg: paper(d, marks), size: [g.rows, g.cols], solutions: sols.length, verdict: verdictOfCount("akari", sols.length),
    doubts: doubts.map((x, i) => ({ ...x, tip: round(dl[i].tip), bounds: dl[i].bounds })),
    list: list.map((x) => ({ n: x.n, kind: x.kind, place: x.place, text: x.text, tip: x.tip })),
    rules: ruleLines("akari", [0, 1, 2]),
    // the photo: the puzzle as printed, for the photo card's picture
    printed: pictureSvg(p, null, "The photo"),
  };
  console.log("akari:", sols.length, list.map((x) => x.text));
}

// ---- 5: Honeycomb Paths, with a pen flourish (decoration: not part of the type) ----
{
  const spec = load("honeycomb-paths", 3), p = makePuzzle(spec);
  let d = centred(toDrawing(p, "honeycomb-paths").drawing, "honeycomb-paths");
  const g = d.grid!, sp = m.gridSpan(g), y = g.y + sp.h * g.S + 18;
  const wave = Array.from({ length: 13 }, (_, k) => ({ x: g.x + 30 + k * ((sp.w * g.S - 60) / 12), y: y + (k % 2 ? 7 : -5) }));
  d = m.add(d, { kind: "pen", weight: "medium", points: wave.map((q) => m.loose(g, q)) });
  const conv = convert(d, "honeycomb-paths");
  const list = checkList(conv);
  const marks = `<g class="sp-marks-all">${list.map((x) => marksSvg(highlight(d, x), "misfit", x.n, false)).join("")}</g>`;
  const sols = await solve(makePuzzle(conv.spec!), 2);
  out.honey = { svg: paper(d, marks), solutions: sols.length, verdict: verdictOfCount("honeycomb-paths", sols.length), list: list.map((x) => ({ n: x.n, kind: x.kind, text: x.text })), rules: ruleLines("honeycomb-paths") };
  console.log("honey:", sols.length, list.map((x) => x.text));
}

// ---- 6: What type is this? A drawing with no type (numbers in a grid), as the picker ranks it ----
{
  const spec = load("nurikabe", 1);
  const d = centred(toDrawing(makePuzzle(spec), "nurikabe").drawing, "nurikabe");
  const fits = fitsOf(d).slice(0, 8);
  const said: { fit: (typeof fits)[number]; said: Said }[] = [];
  for (const fit of fits) {
    const before = saidBeforeSolving(fit);
    if (before || !fit.conv.spec) { said.push({ fit, said: before ?? "incomplete" }); continue; }
    const n = (await solve(makePuzzle(fit.conv.spec), 2)).length as 0 | 1 | 2;
    said.push({ fit, said: saidOf(fit.genre, n) });
  }
  const top = rankSuggestions(said).slice(0, 3);
  out.unknown = { svg: paper(d) };
  out.suggest = top.map(({ fit, said: s }) => ({
    genre: fit.genre, name: kindName(fit.genre), said: s, words: SAID_WORDS[s], fits: fitWords(fit), wontFit: fit.wontFit,
    about: guides[fit.genre].summary, picture: pictureSvg(makePuzzle(fit.conv.spec!), null, kindName(fit.genre)),
  }));
  console.log("suggest:", top.map((x) => `${x.fit.genre}:${x.said}`));
}

// ---- type list thumbnails (the guides' examples, as the picker shows them) ----
{
  const thumbs: Record<string, { name: string; summary: string; svg: string; ink: string }> = {};
  for (const genre of ["sudoku", "akari", "nurikabe", "masyu", "slitherlink", "star-battle", "skyscrapers", "panel", "honeycomb-paths", "shikaku", "fillomino", "hidoku", "thermo-sudoku", "irregular-sudoku"]) {
    const gd = guides[genre as keyof typeof guides];
    const [folder, n] = gd.example!.replace(".json", "").split("/");
    thumbs[genre] = { name: gd.name, summary: gd.summary, ink: gd.ink ?? "", svg: pictureSvg(makePuzzle(load(folder, Number(n))), null, gd.name) };
  }
  out.thumbs = thumbs;
}

// ---- 8: the publish step: the real player's puzzle, its card picture, the drawing ----
{
  const spec = load("sudoku", 2), p = makePuzzle(spec);
  const sols = await solve(p, 2);
  const given = new Set(spec.givens!.map((x) => (x.at === "cell" ? x.cell[0] * 6 + x.cell[1] : -1)));
  // the creator's play so far: about two thirds filled in (the last square left finishes it)
  const left = Array.from({ length: 36 }, (_, i) => i).filter((i) => !given.has(i)).filter((_, k) => k % 3 === 1);
  const digit = Array.from(sols[0].digit, (v, i) => (given.has(i) || left.includes(i) ? 0 : v));
  const dn = centred(toDrawing(p, "sudoku").drawing, "sudoku");
  out.publish = {
    spec, layout: layoutOf(spec), solutions: sols.length, solution: Array.from(sols[0].digit), progress: { digit }, left,
    card: pictureSvg(p, null, "Six by Six"), drawn: drawingSvg(dn, "Six by Six, as drawn by @josh"),
  };
}

// ---- stamp icons, for the Stamp palette (as Sketchpad's StampIcon) ----
{
  const s = (st: Partial<m.Stamp> & { stamp: m.StampKind }) => `<svg viewBox="0 0 32 32">${stampSvg(st as m.Stamp, 16, 16, ({ rock: 20, stone: 36, star: 34, galaxy: 40, x: 40, dot: 48, end: 48 } as Record<string, number>)[st.stamp] ?? 40)}</svg>`;
  out.stamps = {
    rock: s({ stamp: "rock" }), start: s({ stamp: "start" }), end: s({ stamp: "end" }), hoshi: s({ stamp: "hoshi" }), stone: s({ stamp: "stone", color: "black" }),
    crest: s({ stamp: "crest", color: "orange" }), triangle: s({ stamp: "triangle", count: 2, color: "orange" }),
    shape: s({ stamp: "shape", cells: [[0, 0], [1, 0], [1, 1]], color: "yellow" }), eraser: s({ stamp: "eraser", color: "white" }),
  };
}

writeFileSync(OUT, `// Generated by v3-make-boards.ts from the real sketchpad, converter, Check, picture and solver code.\nwindow.BOARDS = ${JSON.stringify(out)};\n`);
console.log("ok", Object.keys(out));
