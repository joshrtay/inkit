// Our difficulty against Beast Academy's Puzzle Lab sequences: their sets (kept locally in
// references/beast-academy, never published) converted to our puzzles and run through the deduction
// solver. Each set's puzzles are in Beast Academy's order (easiest to hardest), and each set has a
// tier (1 moon, 2 comet, 3 Saturn, 4 galaxy). Does our estimate rise within sets and across tiers?
//
//   node puzzles/difficulty/ba-run.ts
import { readFileSync, writeFileSync } from "node:fs";
import { deduce } from "./deduce.ts";
import { spearman } from "./calibrate.ts";

const root = new URL("../../references/beast-academy/", import.meta.url).pathname;
type Raw = { t: number; s: string; p: Record<string, any>[] };
const sets = JSON.parse(readFileSync(`${root}lab-sample.json`, "utf8")) as Raw[];

// Beast Academy's order of sets per type, and their tiers (from the Puzzle Lab report)
const ORDER: Record<number, [string, number][]> = {
  14: [["Agoraphobia", 1], ["Countdown", 1], ["Cipher 1", 2], ["Cipher 2", 3], ["Single Layout", 3], ["Cipher 3", 4], ["Cipher Monster", 4]],
  9: [["Evens", 1], ["Gerrymandering", 1], ["Nooks and Crannies", 2], ["Quintets", 3], ["Stairs", 3]],
  18: [["Straddling", 1], ["Checkerboard", 1], ["Cornerstones", 2], ["Centered", 3]],
};
const GENRE: Record<number, string> = { 14: "akari", 9: "fillomino", 18: "spiral-galaxies" };

type Givens = { at: string; [k: string]: unknown }[];
function convert(t: number, c: Record<string, any>) {
  if (t === 14) {
    // walls [x, y, n?] on a [width, height] grid; a cipher letter becomes the number the answer gives it
    const [w, h] = c.gridSize as [number, number];
    const bulbs = new Set((c.lightbulbSolution as number[][]).map(([x, y]) => `${x},${y}`));
    const givens: Givens = [];
    for (const [x, y, n] of c.walls as [number, number, number | string | undefined][]) {
      givens.push({ at: "cell", cell: [y, x], kind: "block" });
      if (n === undefined) continue;
      const value = typeof n === "number" ? n : [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => bulbs.has(`${x + dx},${y + dy}`)).length;
      givens.push({ at: "cell", cell: [y, x], kind: "number", value });
    }
    return { genre: "akari", size: [h, w], givens };
  }
  if (t === 9) {
    // grid rows: -1 a hole, 0 empty, n a clue; values: the sizes allowed
    const g = c.grid as number[][];
    const givens: Givens = [];
    g.forEach((row, r) => row.forEach((v, col) => {
      if (v === -1) givens.push({ at: "cell", cell: [r, col], kind: "block" });
      else if (v > 0) givens.push({ at: "cell", cell: [r, col], kind: "number", value: v });
    }));
    return { genre: "fillomino", size: [g.length, g[0].length], givens, rules: [{ rule: "size-clue" }, { rule: "neighbors-differ-size" }, { rule: "allowed-sizes", sizes: c.values }] };
  }
  // galaxies [x, y] in cells (a half is on a border); our points count half-cells from the corner
  const [w, h] = c.gridSize as [number, number];
  return { genre: "spiral-galaxies", size: [h, w], givens: (c.galaxies as number[][]).map(([x, y]) => ({ at: "point", point: [2 * y + 1, 2 * x + 1], kind: "galaxy" })) };
}

type Row = { type: string; set: string; tier: number; setAt: number; at: number; cells: number; solved: boolean; estimate: number; maxCost: number; steps: number; ruleLoad: number; notes: string; ms: number };
const rows: Row[] = [];
for (const t of [9, 18, 14]) {
  for (const [setAt, [name, tier]] of ORDER[t].entries()) {
    const set = sets.find((s) => s.t === t && s.s === name);
    if (!set) { console.log(`missing ${name}`); continue; }
    for (const [at, c] of set.p.entries()) {
      const spec = convert(t, c) as any;
      const t0 = Date.now();
      try {
        const { profile } = await deduce(spec, { budgetMs: 15000 });
        rows.push({ type: GENRE[t], set: name, tier, setAt, at, cells: spec.size[0] * spec.size[1], solved: profile.solved, estimate: profile.estimate, maxCost: profile.maxCost, steps: profile.steps, ruleLoad: profile.ruleLoad, notes: profile.notes.join("; "), ms: Date.now() - t0 });
        process.stderr.write(profile.solved ? "." : "u");
      } catch (e) {
        rows.push({ type: GENRE[t], set: name, tier, setAt, at, cells: spec.size[0] * spec.size[1], solved: false, estimate: NaN, maxCost: NaN, steps: 0, ruleLoad: 0, notes: String(e).slice(0, 120), ms: Date.now() - t0 });
        process.stderr.write("x");
      }
    }
  }
  process.stderr.write("\n");
}
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
