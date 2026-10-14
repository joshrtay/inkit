// A self-check for the generator's per-genre techniques (deduce.ts, bands.ts): every example of the
// genres given (src/games/<genre>/*.json, and any puzzles in the files given), solved in each band
// in quick mode, and in the expert band in full (explained) mode. deduce checks every fact it
// settles against the puzzle's solution and stops on a wrong one ("deduced a wrong fact"), so a run
// with no errors means no technique contradicted a known solution.
//
//   node puzzles/difficulty/techniques-check.ts shikaku minesweeper ...   [--full] [--file x.jsonl]
//
// A .jsonl file holds generated puzzles (gen-set.ts's lines: {spec, ...}).
import { readdirSync, readFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { EXPERT, SEARCH_FREE, optionsOf, quickSolve } from "./bands.ts";
import { deduce } from "./deduce.ts";

const args = process.argv.slice(2), full = args.includes("--full");
const files = args.flatMap((a, i) => (args[i - 1] === "--file" ? [a] : []));
const genres = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--file");
const repo = new URL("../../", import.meta.url).pathname;

const puzzles: { name: string; spec: GridSpec }[] = [];
for (const g of genres) {
  const dir = `${repo}src/games/${g}`;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const d = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    puzzles.push({ name: `${g}/${f}`, spec: { genre: g, ...(d.grid ?? d) } });
  }
}
for (const f of files) readFileSync(f, "utf8").split("\n").filter(Boolean).forEach((l, k) => {
  const r = JSON.parse(l);
  puzzles.push({ name: `${f.split("/").pop()}#${k} (${r.band ?? "?"})`, spec: r.spec });
});

let errors = 0;
for (const { name, spec } of puzzles) {
  const row: string[] = [];
  for (const b of SEARCH_FREE) {
    const q = await quickSolve(spec, b, 60000);
    if (q.error) { errors++; row.push(`${b.name}: ERROR ${q.error}`); continue; }
    row.push(`${b.name} ${q.solved ? "yes" : "no"} ${(q.ms / 1000).toFixed(1)}s${q.solved && b.name !== "easy" ? ` [${q.used.join(" ")}]` : ""}`);
  }
  if (full) {
    const t = Date.now();
    try {
      const r = await deduce(spec, optionsOf(SEARCH_FREE[EXPERT], { budgetMs: 120000 }, spec.genre));
      row.push(`full ${r.profile.solved ? "yes" : "no"} ${((Date.now() - t) / 1000).toFixed(1)}s est ${r.profile.estimate}`);
    } catch (e) { errors++; row.push(`full: ERROR ${String((e as Error).message).slice(0, 200)}`); }
  }
  console.log(`${name}: ${row.join(" | ")}`);
}
console.log(errors ? `${errors} errors` : "no errors");
process.exit(errors ? 1 : 0);
