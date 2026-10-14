// The human-or-generated classifier and Opus together (docs/research-human-gap.md, "Uncertainty
// and a cascade"). This file measures the pair puzzles the way human-gap.ts measures its sample, so
// the classifier sees them with every feature; human_cascade.py does the rest.
//
//   DEDUCE_JOBS=2 node puzzles/difficulty/human-cascade.ts measure [pairs.json …]
//       every puzzle in the pair files (default references/ml/llm-human/pairs.json and, if there,
//       references/ml/human-cascade/pairs.json), solved by human-gap.ts's measure (cached in
//       references/ml/human-gap/cache/, by the spec) → references/ml/human-cascade/measured.jsonl
//       (one row per puzzle, as human-gap.ts's measured.jsonl, plus `pair` and `side`)
//
// Opus's replies on new pairs: llm-human.ts with LLM_HUMAN_DIR=human-cascade (its own ledger).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { cache, keyOfSpec, live, measureGuarded, out as gapOut } from "./human-gap.ts";
import { JOBS, mapPool } from "./pool.ts";

const REF = gapOut.replace(/human-gap\/$/, "");
const OUT = `${REF}human-cascade/`;
mkdirSync(OUT, { recursive: true });
mkdirSync(cache, { recursive: true });

interface Side { source: string; name: string; spec: GridSpec }
interface Pair { id: string; genre: string; human: Side; gen: Side }

const args = process.argv.slice(2);
if (args[0] === "measure") {
  const files = args.slice(1).length ? args.slice(1) : [`${REF}llm-human/pairs.json`, `${OUT}pairs.json`].filter((f) => existsSync(f));
  const items: { pair: string; side: "human" | "gen"; genre: string; s: Side }[] = [];
  for (const f of files)
    for (const p of JSON.parse(readFileSync(f, "utf8")) as Pair[])
      for (const side of ["human", "gen"] as const) items.push({ pair: p.id, side, genre: p.genre, s: p[side] });
  process.on("exit", () => { for (const c of live) c.kill("SIGKILL"); });
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => process.exit(130));
  const todo = items.filter((it) => !existsSync(`${cache}${keyOfSpec(it.s.spec)}.json`));
  console.error(`${items.length} puzzles, ${todo.length} to solve, ${JOBS} at a time`);
  let done = 0;
  await mapPool(todo, async (it) => {
    const r = await measureGuarded(it.s.spec);
    writeFileSync(`${cache}${keyOfSpec(it.s.spec)}.json`, JSON.stringify(r));
    console.error(`${++done}/${todo.length} ${it.pair} ${it.side} ${r.band ?? r.error} ${(((r.ms as number) ?? 0) / 1000).toFixed(1)} s`);
  });
  const rows = items.map((it) => {
    const f = `${cache}${keyOfSpec(it.s.spec)}.json`;
    return JSON.stringify({ pair: it.pair, side: it.side, source: it.side === "gen" ? "gen" : it.s.source, genre: it.genre, name: it.s.name, spec: it.s.spec, ...JSON.parse(readFileSync(f, "utf8")) });
  });
  writeFileSync(`${OUT}measured.jsonl`, rows.join("\n") + "\n");
  console.log(`${rows.length} puzzles in ${OUT}measured.jsonl`);
} else console.error("usage: human-cascade.ts measure [pairs.json …]");
