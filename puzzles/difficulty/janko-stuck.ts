// What do people do where our solver gets stuck? For each of Janko's puzzles of a type (local
// only; the puzzles janko-order.ts studies): the first moment our solver needed a case split or
// search, what it knew then, the facts it searched for, and the person's next moves from there (of
// the marks still open, the ones they settled earliest). Saved for study in
// references/janko/stuck-<type>.json.
//
//   node puzzles/difficulty/janko-stuck.ts [type …] [--max-size 10] [--limit 80]
import { writeFileSync } from "node:fs";
import { JANKO_DIR } from "./janko.ts";
import { deduceCached, jankoArgs, studied } from "./janko-order.ts";
import { mapPool } from "./pool.ts";

const { types, maxSize, limit } = jankoArgs(process.argv.slice(2));
const summary: string[] = [];
for (const type of types) {
  const puzzles = studied(type, maxSize, limit);
  let done = 0;
  const rows = await mapPool(puzzles, async ({ f, j }) => {
    const r = await deduceCached(j.spec).catch(() => null);
    console.error(`${type} ${++done}/${puzzles.length} ${f}`);
    if (!r || !r.profile.solved) return { f, solved: false as const };
    const steps = r.path.filter((s) => !s.choice);
    const k = steps.findIndex((s) => s.tier >= 2);
    if (k < 0) return { f, solved: true as const, stuck: false as const };
    // what our solver knew just before: mark → value
    const known = new Map<string, boolean>();
    for (const x of r.initial ?? []) { const m = /^(.*)=(true|false)$/.exec(x); if (m) known.set(m[1], m[2] === "true"); }
    for (const s of steps.slice(0, k)) for (const x of s.facts) known.set(x.mark, x.value);
    const searched = steps[k].facts.map((x) => ({ mark: x.mark, value: x.value }));
    // the marks the person settled that were still open, in their order
    const open = [...j.settled.keys()].filter((m) => !known.has(m)).sort((a, b) => j.settled.get(a)! - j.settled.get(b)!);
    const humanNext = open.slice(0, 3).map((m) => ({ mark: m, value: j.truth.get(m)! }));
    return {
      f, solved: true as const, stuck: true as const, size: j.spec.size, spec: j.spec, solver: j.solver, tier: steps[k].tier, where: steps[k].where,
      known: [...known].map(([m, v]) => [m, v ? 1 : 0] as [string, number]), searched, humanNext,
      // where our searched marks sit in the person's order of the open marks (0: their very next;
      // -1: a mark the person never settled)
      searchedRank: searched.map((x) => open.indexOf(x.mark)),
      open: open.length,
    };
  });
  const solved = rows.filter((r) => r.solved);
  const ok = rows.filter((r): r is Extract<typeof r, { stuck: true }> => r.solved && "stuck" in r && r.stuck);
  writeFileSync(`${JANKO_DIR}stuck-${type}.json`, JSON.stringify(ok, null, 1));
  const ranks = ok.map((r) => Math.min(...r.searchedRank.filter((x) => x >= 0)) / Math.max(1, r.open - 1)).filter(Number.isFinite);
  const median = [...ranks].sort((a, b) => a - b)[Math.floor(ranks.length / 2)];
  const next3 = ok.filter((r) => r.searchedRank.some((x) => x >= 0 && x < 3)).length;
  const never = ok.filter((r) => r.searchedRank.every((x) => x < 0)).length;
  const line = `${type}: stuck on ${ok.length} of ${solved.length} solved (${puzzles.length} tried); searched fact among the person's next 3: ${next3}; never settled by the person: ${never}; its place in the person's order of the open marks: median ${ranks.length ? (100 * median).toFixed(0) : "–"}% of the way through`;
  console.log(line);
  summary.push(line);
}
if (summary.length > 1) console.log(summary.join("\n"));
