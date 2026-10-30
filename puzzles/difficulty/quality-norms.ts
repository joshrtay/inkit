// What the bad-puzzle checks (./quality.ts) find on human-made puzzles, per type: the yardstick
// they're measured against. The G0 baseline (docs/plan-generator-and-hints.md) found the checks
// called most published human puzzles bad (Masyu: 85% dull, 85% guessing), because setters leave
// clues that are redundant one at a time (for the look, or to ease a corner) and because the
// solver splits where people use a technique it lacks. So a puzzle loses quality only for what a
// typical human puzzle of its type doesn't have: more redundant clues (as a share of its clues)
// than the human median, or a higher split share than the human 75th percentile.
//
//   node --no-warnings puzzles/difficulty/quality-norms.ts
//       reads the human puzzles' assessments in references/ml/gen-baseline/cache/ (puzzles/ai/
//       gen-baseline.ts: Janko and puzsq puzzles, assessed with the redundancy check) and writes
//       ./quality-norms.json (numbers only)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { STRUCTURE } from "./quality.ts";

const repo = new URL("../../", import.meta.url).pathname;
const cache = `${repo}references/ml/gen-baseline/cache/`;
/** Types with fewer human puzzles than this use the pooled norm. */
const MIN_N = 12;

const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const r3 = (x: number) => +x.toFixed(3);

const by = new Map<string, { redundantShare: number[]; splitShare: number[] }>();
for (const f of readdirSync(cache)) {
  const r = JSON.parse(readFileSync(cache + f, "utf8"));
  const m = r.ev?.assess?.measures;
  if (r.source !== "human" || !m) continue;
  const clues = (r.spec.givens ?? []).filter((g: { kind: string }) => !STRUCTURE.has(g.kind)).length;
  if (!by.has(r.genre)) by.set(r.genre, { redundantShare: [], splitShare: [] });
  const g = by.get(r.genre)!;
  if (m.redundant != null && clues) g.redundantShare.push(m.redundant / clues);
  if (r.ev.assess.solved) g.splitShare.push(m.splitShare ?? 0);
}

const norm = (x: { redundantShare: number[]; splitShare: number[] }) => ({
  n: Math.max(x.redundantShare.length, x.splitShare.length),
  redundantShare: r3(q(x.redundantShare, 0.5)),
  splitShare: r3(q(x.splitShare, 0.75)),
});
const all = { redundantShare: [...by.values()].flatMap((x) => x.redundantShare), splitShare: [...by.values()].flatMap((x) => x.splitShare) };
const types = Object.fromEntries([...by].filter(([, x]) => Math.max(x.redundantShare.length, x.splitShare.length) >= MIN_N).sort().map(([g, x]) => [g, norm(x)]));
const out = {
  note: "per type, from human-made puzzles (Janko, puzsq): redundantShare = median share of clues that could go one at a time; splitShare = 75th percentile share of solver steps that are case splits. quality.ts penalises only beyond these. Written by quality-norms.ts.",
  pooled: norm(all),
  types,
};
writeFileSync(new URL("./quality-norms.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify(out, null, 1));
