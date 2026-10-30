// Aim 4's test set (docs/research-trajectory.md, "Aim 4"): a fixed sample of the hard pool, the
// human build's unique puzzles with side ≤ 20 that the solver didn't finish within 30 s, drawn
// once and only scored at a gate. Stratified by genre: equal counts where the pool allows, the
// rest shared out over the genres that have more. The dev set (the 196 of solver-speed-300-1021)
// and duplicates by content are left out.
//
//   node puzzles/difficulty/speed-test-set.ts <human-corpus-status.jsonl> [--n 400] [--seed 20261022]
//
// - Status: human-shard.ts --gather's human-corpus-status.jsonl ({ key, genre, unique,
//   solverFinished, why, ... }) for the build human-20261014-2153.
// - Specs: the corpus records, references/ml/human-corpus/*.jsonl (HUMAN_CORPUS).
// - Dev set: references/ml/solver-speed-sample/*.jsonl (SPEED_SAMPLE), its keys and contents left out.
// - Writes references/ml/solver-speed-test/test.jsonl (SPEED_TEST_OUT), corpus records as
//   solver-speed.ts reads them (run it with SPEED_SAMPLE pointing there), and prints the counts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { REFS_DIR } from "./janko.ts";
import { shuffled } from "./llm-label.ts";

const argv = process.argv.slice(2);
const opt = (name: string, d: string) => { const k = argv.indexOf(name); return k >= 0 ? argv[k + 1] : d; };
const statusFile = argv[0];
if (!statusFile || statusFile.startsWith("--")) throw new Error("usage: speed-test-set.ts <human-corpus-status.jsonl> [--n 400] [--seed S]");
const N = Number(opt("--n", "400")), SEED = opt("--seed", "20261022");
const corpusDir = process.env.HUMAN_CORPUS ?? `${REFS_DIR}ml/human-corpus/`;
const devDir = process.env.SPEED_SAMPLE ?? `${REFS_DIR}ml/solver-speed-sample/`;
const out = process.env.SPEED_TEST_OUT ?? `${REFS_DIR}ml/solver-speed-test/test.jsonl`;

const jsonl = (f: string) => readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const dirRows = (d: string) => readdirSync(d).filter((x) => x.endsWith(".jsonl")).sort().flatMap((f) => jsonl(`${d}${f}`));
const content = (r: { genre: string; spec: unknown }) => createHash("sha256").update(r.genre + JSON.stringify(r.spec)).digest("hex");

const corpus = new Map(dirRows(corpusDir).map((r) => [r.key, r]));
const dev = existsSync(devDir) ? dirRows(devDir) : [];
const devKeys = new Set(dev.map((r) => r.key)), seen = new Set(dev.map(content));
console.error(`${corpus.size} corpus records; dev set ${dev.length}`);

// the hard pool, by genre: unique, side ≤ 20, not finished in the build (stopped, killed or a skipped band)
const pool = new Map<string, any[]>();
for (const s of jsonl(statusFile)) {
  if (s.unique !== "unique" || s.solverFinished !== false || s.why === "over max side" || devKeys.has(s.key)) continue;
  const r = corpus.get(s.key);
  if (!r || Math.max(...r.spec.size) > 20) continue;
  const c = content(r);
  if (seen.has(c)) continue;
  seen.add(c);
  if (!pool.has(r.genre)) pool.set(r.genre, []);
  pool.get(r.genre)!.push(r);
}

// equal shares; what a small genre can't fill goes to the others, again equally
const want = new Map<string, number>();
let left = N, open = [...pool.keys()].sort();
while (left > 0 && open.length) {
  const share = Math.floor(left / open.length), extra = left % open.length;
  const next: string[] = [];
  open.forEach((g, i) => {
    const have = want.get(g) ?? 0, room = pool.get(g)!.length - have;
    const take = Math.min(room, share + (i < extra ? 1 : 0));
    want.set(g, have + take); left -= take;
    if (room > take) next.push(g);
  });
  open = next;
}

const picked: any[] = [];
for (const g of [...pool.keys()].sort()) picked.push(...shuffled(pool.get(g)!, `${SEED} ${g}`).slice(0, want.get(g) ?? 0));
mkdirSync(out.replace(/[^/]*$/, ""), { recursive: true });
writeFileSync(out, picked.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`hard pool ${[...pool.values()].reduce((a, x) => a + x.length, 0)}; test set ${picked.length} → ${out}`);
for (const g of [...pool.keys()].sort()) console.log(`${g}: ${want.get(g) ?? 0} of ${pool.get(g)!.length}`);
