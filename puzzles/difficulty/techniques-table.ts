// The periodic table from the solver's own explanations: every step of every puzzle in the corpus
// (corpus.ts) by its signature (signatures.ts), counted per type. Signatures found in several types
// are cross-type techniques; the rest are a type's own. Every step is saved, with its type,
// signature, tier and cost, to references/ml/steps.jsonl (local only).
//
//   node puzzles/difficulty/techniques-table.ts [perSourceAndType]
import { mkdirSync, writeFileSync } from "node:fs";
import { corpus } from "./corpus.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { mapPool } from "./pool.ts";
import { coarse, signature } from "./signatures.ts";

const repo = new URL("../../", import.meta.url).pathname;
const items = corpus(Number(process.argv[2]) || 12);
console.error(`${items.length} puzzles`);
let done = 0;
const steps = (await mapPool(items, async (it) => {
  const r = await deduceGuarded(it.spec, { budgetMs: 20000 }, 90000).catch(() => null);
  if (++done % 50 === 0) console.error(`${done}/${items.length}`);
  return (r?.path ?? []).filter((s) => !s.choice).map((s) => ({ genre: it.genre, source: it.source, puzzle: it.name, sig: signature(s), tier: s.tier, cost: s.cost }));
})).flat();
mkdirSync(`${repo}references/ml`, { recursive: true });
writeFileSync(`${repo}references/ml/steps.jsonl`, steps.map((s) => JSON.stringify(s)).join("\n") + "\n");

// the table: signatures (coarse: which primitive@unit kinds take part) by type
const table = new Map<string, Map<string, number>>();
for (const s of steps) {
  const k = coarse(s.sig);
  if (!table.has(k)) table.set(k, new Map());
  table.get(k)!.set(s.genre, (table.get(k)!.get(s.genre) ?? 0) + 1);
}
const types = [...new Set(steps.map((s) => s.genre))].sort();
const rows = [...table].map(([sig, by]) => ({ sig, by, types: by.size, total: [...by.values()].reduce((a, b) => a + b, 0) }))
  .filter((r) => r.total >= 5).sort((a, b) => b.types - a.types || b.total - a.total);
console.log(`${steps.length} steps from ${items.length} puzzles, ${types.length} types, ${table.size} signatures (${rows.filter((r) => r.types >= 2).length} in two or more types)\n`);
console.log("| Signature | Types | Steps | Where |\n|---|---|---|---|");
for (const r of rows.slice(0, 40)) console.log(`| ${r.sig} | ${r.types} | ${r.total} | ${[...r.by].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g, n]) => `${g} ${n}`).join(", ")} |`);
