// Nikoli's nikoli_100 (huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli, CC BY 4.0: "Please
// credit Nikoli") as our Sudoku. references/nikoli-100/ holds the dataset as published (the parquet
// file and README at one revision) and rows.json, the same rows from Hugging Face's dataset viewer
// API, which is what's read here.
//
//   node puzzles/difficulty/sources/nikoli.ts
//
// Writes references/nikoli-100/converted/sudoku.jsonl and summary.json.
import { readFileSync, writeFileSync } from "node:fs";
import type { Given } from "../../../src/engine/types.ts";
import { makePuzzle, check } from "../../../src/engine/puzzle.ts";
import { boardOf } from "../../../src/engine/encode.ts";
import { REFERENCES, writeByGenre, type Converted } from "./common.ts";
import type { Spec } from "./grids.ts";

const ROOT = `${REFERENCES}nikoli-100/`;
export const REVISION = "9034906b4ec06ab1e08daf110c6b562ef72859fd";
export const LICENCE = "CC BY 4.0 (credit: Nikoli)";

const rows: any[] = JSON.parse(readFileSync(`${ROOT}rows.json`, "utf8")).rows.map((r: any) => r.row);
const out: Converted[] = [];
let solutionsOk = 0;
for (const r of rows) {
  if (r.rows !== 9 || r.cols !== 9 || r.initial_board.length !== 81 || r.visual_elements !== "[]") continue;
  const givens: Given[] = [];
  [...r.initial_board].forEach((ch: string, i: number) => {
    if (ch !== ".") givens.push({ at: "cell", cell: [Math.floor(i / 9), i % 9], kind: "number", value: Number(ch) });
  });
  const spec: Spec = { genre: "sudoku", size: [9, 9], givens };
  // the dataset's solution, checked against our rules
  const p = makePuzzle(spec);
  const atoms = [...r.solution].map((ch: string, i: number) => `digit(${i},${ch})`);
  try { if (check(p, boardOf(p, atoms)).length === 0) solutionsOk++; } catch { /* atom names differ: not counted */ }
  out.push({
    source: "nikoli-100", sourceId: r.puzzle_id, licence: LICENCE, author: r.author || "Nikoli",
    url: `https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli`, genre: "sudoku", spec,
    meta: { title: r.title, solution: r.solution, dataset: `SakanaAI/sudoku-bench-nikoli@${REVISION.slice(0, 7)}` },
  });
}
const counts = writeByGenre(`${ROOT}converted`, out);
const summary = { revision: REVISION, licence: LICENCE, rows: rows.length, converted: counts, solutionsPassOurRules: solutionsOk };
writeFileSync(`${ROOT}summary.json`, JSON.stringify(summary, null, 1));
console.log(summary);
