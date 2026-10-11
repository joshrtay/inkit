// Our difficulty against Beast Academy's Puzzle Lab sequences: their sets (kept locally in
// references/beast-academy, never published) converted to our puzzles and run through the deduction
// solver. Each set's puzzles are in Beast Academy's order (easiest to hardest), and each set has a
// tier (1 moon, 2 comet, 3 Saturn, 4 galaxy). Does our estimate rise within sets and across tiers?
//
//   node puzzles/difficulty/ba-run.ts
import { writeFileSync } from "node:fs";
import { convert, GENRE, loadSets, ORDER, root } from "./ba-convert.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { mapPool } from "./pool.ts";
import { spearman } from "./calibrate.ts";

const sets = loadSets();

type Row = { type: string; set: string; tier: number; setAt: number; at: number; cells: number; solved: boolean; estimate: number; maxCost: number; steps: number; ruleLoad: number; notes: string; ms: number };
const jobs: { t: number; name: string; tier: number; setAt: number; at: number; c: Record<string, any> }[] = [];
for (const t of (process.env.BA_TYPES ?? "9,18,14").split(",").map(Number)) {
  for (const [setAt, [name, tier]] of ORDER[t].entries()) {
    const set = sets.find((s) => s.t === t && s.s === name);
    if (!set) { console.log(`missing ${name}`); continue; }
    set.p.forEach((c, at) => jobs.push({ t, name, tier, setAt, at, c }));
  }
}
const rows: Row[] = await mapPool(jobs, async ({ t, name, tier, setAt, at, c }) => {
  const spec = convert(t, c) as any, t0 = Date.now();
  const base = { type: GENRE[t], set: name, tier, setAt, at, cells: spec.size[0] * spec.size[1] };
  try {
    const r = await deduceGuarded(spec, { budgetMs: 15000 }, 120000);
    if (!r) return { ...base, solved: false, estimate: NaN, maxCost: NaN, steps: 0, ruleLoad: 0, notes: "stopped at the 120 s cap", ms: Date.now() - t0 };
    const { profile } = r;
    process.stderr.write(profile.solved ? "." : "u");
    return { ...base, solved: profile.solved, estimate: profile.estimate, maxCost: profile.maxCost, steps: profile.steps, ruleLoad: profile.ruleLoad, notes: profile.notes.join("; "), ms: Date.now() - t0 };
  } catch (e) {
    process.stderr.write("x");
    return { ...base, solved: false, estimate: NaN, maxCost: NaN, steps: 0, ruleLoad: 0, notes: String(e).slice(0, 120), ms: Date.now() - t0 };
  }
});
process.stderr.write("\n");
const cols = Object.keys(rows[0]) as (keyof Row)[];
writeFileSync(`${root}ba-difficulty.csv`, [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c])).join(","))].join("\n"));

for (const type of ["fillomino", "spiral-galaxies", "akari"]) {
  const rs = rows.filter((r) => r.type === type && r.solved);
  const bad = rows.filter((r) => r.type === type && !r.solved);
  console.log(`\n${type}: ${rs.length} solved${bad.length ? `, ${bad.length} not (${bad.map((r) => `${r.set} ${r.at + 1}: ${r.notes || "unsolved"}`).join(" | ")})` : ""}`);
  console.log(`  estimate vs tier ${spearman(rs.map((r) => r.estimate), rs.map((r) => r.tier)).toFixed(2)}, vs set order ${spearman(rs.map((r) => r.estimate), rs.map((r) => r.setAt)).toFixed(2)}, vs size ${spearman(rs.map((r) => r.estimate), rs.map((r) => r.cells)).toFixed(2)}`);
  // within sets: does the estimate rise from each puzzle to the next?
  let up = 0, down = 0, rhos: number[] = [];
  for (const name of new Set(rs.map((r) => r.set))) {
    const s = rs.filter((r) => r.set === name).sort((a, b) => a.at - b.at);
    for (let i = 1; i < s.length; i++) { if (s[i].estimate > s[i - 1].estimate) up++; else if (s[i].estimate < s[i - 1].estimate) down++; }
    if (s.length > 2) rhos.push(spearman(s.map((r) => r.estimate), s.map((r) => r.at)));
    console.log(`  T${s[0].tier} ${name.padEnd(20)} ${s.map((r) => r.estimate.toFixed(2)).join(" ")}`);
  }
  console.log(`  within sets: ${up} steps up, ${down} down; mean rank correlation with position ${(rhos.reduce((a, b) => a + b, 0) / (rhos.length || 1)).toFixed(2)}`);
}
