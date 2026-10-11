// Rate a Sudoku with the technique solver.
//
//   node puzzles/difficulty/sudoku/cli.ts <file | puzzle string> [--json] [--brief]
//
// A puzzle is an example (src/games/<genre>/<n>.json, the genre taken from its folder), any JSON
// with a "grid" naming its genre, or a string of n² characters ('.' or '0' empty). A text file
// of puzzle strings (one per line; anything after the first space is ignored) prints one profile
// line per puzzle, tab-separated, for rating datasets.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { GridSpec } from "../../../src/engine/types.ts";
import { fromSpec, fromString, type SudokuPuzzle } from "./grid.ts";
import { rate, type Profile } from "./solve.ts";

export function puzzleFromJson(text: string, file?: string): SudokuPuzzle {
  const d = JSON.parse(text);
  const grid = d.grid ?? d;
  const spec: GridSpec = { genre: grid.genre ?? (file ? basename(dirname(file)) : "sudoku"), ...grid, name: d.name };
  return fromSpec(spec);
}

const COLUMNS = ["puzzle", "solved", "se", "hardest", "estimate", "steps", "effort", "dep_start", "dep_mean", "trials", "refutation", "ms", "techniques"];
const line = (text: string, p: Profile) => [text, p.solved ? 1 : 0, p.se, p.hardest, p.estimate, p.steps, p.effort, p.dependency.start, p.dependency.mean, p.trials, p.refutation, p.ms,
  Object.entries(p.byTechnique).map(([t, k]) => `${t}:${k}`).join(",")].join("\t");

function printOne(puzzle: SudokuPuzzle, args: string[]) {
  const { path, profile } = rate(puzzle);
  if (args.includes("--json")) { console.log(JSON.stringify({ profile, path }, null, 1)); return; }
  if (!args.includes("--brief")) path.forEach((st, k) => console.log(`${String(k + 1).padStart(3)}. ${st.se.toFixed(1)} ${st.technique}: ${st.text}`));
  const p = profile;
  console.log(`\n${p.solved ? "solved" : "NOT solved"}${p.unique ? "" : " (not unique)"} in ${p.ms} ms: ${p.n} × ${p.n}, ${p.givens} givens`);
  console.log(`SE ${p.se} (${p.hardest || "nothing"})  estimate ${p.estimate}  effort ${p.effort}  steps ${p.steps} (${p.placements} placed, ${p.eliminations} removed)`);
  console.log(`dependency: ${p.dependency.start} single moves at the start, ${p.dependency.mean} on average over the first steps`);
  if (p.trials) console.log(`trials ${p.trials}, refutation ${p.refutation}`);
  console.log(`by technique: ${Object.entries(p.byTechnique).map(([t, k]) => `${t} ${k}`).join(", ")}`);
  if (p.notes.length) console.log(`notes: ${p.notes.join("; ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), what = args.find((a) => !a.startsWith("--"));
  if (!what) { console.error("usage: node puzzles/difficulty/sudoku/cli.ts <file | puzzle string> [--json] [--brief]"); process.exit(1); }
  if (!existsSync(what)) printOne(fromString(what), args);
  else {
    const text = readFileSync(what, "utf8");
    if (text.trimStart().startsWith("{")) printOne(puzzleFromJson(text, what), args);
    else {
      const puzzles = text.split(/\r?\n/).map((l) => l.trim().split(/\s+/)[0]).filter((l) => l && !l.startsWith("#"));
      if (puzzles.length === 1 && !args.includes("--batch")) printOne(fromString(puzzles[0]), args);
      else {
        console.log(COLUMNS.join("\t"));
        for (const t of puzzles) {
          try { const { profile } = rate(fromString(t)); console.log(args.includes("--json") ? JSON.stringify({ puzzle: t, ...profile }) : line(t, profile)); }
          catch (e) { console.log(`${t}\terror: ${(e as Error).message}`); }
        }
      }
    }
  }
}
