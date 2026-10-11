// Training data for the window ranker: every window check in solving the examples and a sample
// of Puzzle Square JP's puzzles (local only), with what was known then and whether the window
// found a fact. Written to references/ranker/trace.jsonl (local only).
//
//   node puzzles/difficulty/ranker-collect.ts [perType]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { genres } from "../../src/engine/puzzle.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { mapPool } from "./pool.ts";

const repo = new URL("../../", import.meta.url).pathname;
const perType = Number(process.argv[2]) || 10;
const jobs: { source: string; genre: string; name: string; spec: GridSpec }[] = [];
for (const genre of readdirSync(`${repo}src/games`).sort().filter((x) => x in genres))
  for (const f of readdirSync(`${repo}src/games/${genre}`).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(readFileSync(`${repo}src/games/${genre}/${f}`, "utf8"));
    if (d.grid) jobs.push({ source: "example", genre, name: `${genre}/${f}`, spec: { genre, ...d.grid } });
  }
const psjp = `${repo}references/psjp/`;
if (existsSync(psjp))
  for (const type of readdirSync(psjp).filter((t) => !t.includes(".") && t !== "scripts")) {
    const files = readdirSync(`${psjp}${type}`).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(b) - parseInt(a));
    for (const f of files.slice(0, perType)) {
      const d = JSON.parse(readFileSync(`${psjp}${type}/${f}`, "utf8"));
      jobs.push({ source: "psjp", genre: d.grid.genre ?? type, name: `${type}/${f}`, spec: { ...d.grid, genre: d.grid.genre ?? type } });
    }
  }

let done = 0;
const results = await mapPool(jobs, async (j) => {
  const r = await deduceGuarded(j.spec, { budgetMs: 15000, trace: true }, 120000).catch(() => null);
  console.error(`${++done}/${jobs.length} ${j.name}: ${r ? `${r.trace?.length ?? 0} checks` : "no result"}`);
  return r?.trace?.map((t) => JSON.stringify({ puzzle: j.name, source: j.source, genre: j.genre, ...t })) ?? [];
});
mkdirSync(`${repo}references/ranker`, { recursive: true });
const lines = results.flat();
writeFileSync(`${repo}references/ranker/trace.jsonl`, lines.join("\n") + "\n");
console.log(`${lines.length} window checks from ${jobs.length} puzzles`);
