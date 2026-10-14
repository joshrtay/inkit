// Audit generated puzzles (gen-set.ts, gathered by puzzles/cloud/gather-gen.sh): a random sample,
// spread over every (genre, band), each re-proved from scratch. Exactly one solution (the engine's
// solver, as the site build proves it), and the band it's filed under (bands.ts bandOf: the
// easiest band that solves it with no search), and for a puzzle made with a symmetric layout
// (gen-set.ts GEN_HUMAN, sym=...), that its clues are symmetric. Prints each failure and a summary.
//
//   node puzzles/difficulty/gen-audit.ts <gathered dir> [share=0.003] [shard/shards, e.g. 1/3]
import { readdirSync, readFileSync } from "node:fs";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { solve } from "../../src/engine/solve.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { isSymmetric, type Symmetry } from "../grid/generate.ts";
import { BAND_LIST, bandOf } from "./bands.ts";

const dir = process.argv[2], share = Number(process.argv[3]) || 0.003;
const [shard, shards] = (process.argv[4] ?? "1/1").split("/").map(Number);
// a seeded shuffle, so every shard sees the same sample
let seed = 12345;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
const cells = new Map<string, { spec: GridSpec; band: string; key: string; symmetry?: Symmetry }[]>();
for (const f of readdirSync(`${dir}/generated`).filter((x) => x.endsWith(".jsonl"))) {
  for (const line of readFileSync(`${dir}/generated/${f}`, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    const k = `${r.genre}|${r.band}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k)!.push({ spec: r.spec, band: r.band, key: r.key, symmetry: r.symmetry });
  }
}
// at least 3 from every (genre, band), then the share of the rest
const sample: { spec: GridSpec; band: string; key: string; cell: string; symmetry?: Symmetry }[] = [];
for (const [cell, rows] of [...cells].sort()) {
  const n = Math.min(rows.length, Math.max(3, Math.round(rows.length * share)));
  const picked = new Set<number>();
  while (picked.size < n) picked.add(Math.floor(rand() * rows.length));
  for (const i of picked) sample.push({ ...rows[i], cell });
}
const mine = sample.filter((_, i) => i % shards === shard - 1);
console.error(`${sample.length} sampled from ${[...cells.values()].reduce((a, r) => a + r.length, 0)}; this shard ${mine.length}`);

let ok = 0, notUnique = 0, wrongBand = 0, asymmetric = 0, errors = 0;
for (const [i, s] of mine.entries()) {
  try {
    const sols = await solve(makePuzzle(s.spec), 2);
    if (sols.length !== 1) { notUnique++; console.log(`NOT UNIQUE (${sols.length} solutions): ${s.key}`); continue; }
    if (s.symmetry && !isSymmetric(s.spec, s.symmetry)) { asymmetric++; console.log(`NOT ${s.symmetry.toUpperCase()}: ${s.key}`); continue; }
    const b = BAND_LIST[await bandOf(s.spec)]?.name ?? "none";
    if (b !== s.band) { wrongBand++; console.log(`BAND ${s.band} → ${b}: ${s.key}`); continue; }
    ok++;
  } catch (e) { errors++; console.log(`ERROR ${s.key}: ${(e as Error).message.slice(0, 120)}`); }
  if ((i + 1) % 25 === 0) console.error(`${i + 1}/${mine.length}`);
}
console.log(`shard ${shard}/${shards}: ${mine.length} audited, ${ok} ok, ${notUnique} not unique, ${asymmetric} not symmetric, ${wrongBand} in another band, ${errors} errors`);
