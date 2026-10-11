// The window ranker: a logistic regression on cheap, type-free features of a window check
// (ranker-collect.ts's trace), predicting whether the window finds a fact. Trained on 70% of the
// puzzles, tested on the rest the way the solver would use it: check the top-scored share of a
// round's windows first, and the rest only if none of those finds anything.
//
// Result (October 2026, 307,000 checks from 256 puzzles): not worth using. About 70% of checks are
// in rounds where no window finds anything, which must check every window before the solver
// turns to harder reasoning, so ranking can save at most about 30%, and it defers facts to later
// rounds, which changes the path and the scores (5% checked first: 71% of checks, 69% of facts
// deferred).
//
//   node puzzles/difficulty/ranker-train.ts        prints the test, writes references/ranker/ranker.json
import { readFileSync, writeFileSync } from "node:fs";
import type { TraceRow } from "./deduce.ts";

const repo = new URL("../../", import.meta.url).pathname;
type Row = TraceRow & { puzzle: string; genre: string };
const rows: Row[] = readFileSync(`${repo}references/ranker/trace.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l));

export const KINDS = ["row", "column", "area", "box", "around", "clue", "pair", "strip", "count"];
/** The features: kind, size, share open, what changed, what the last check found. */
export function features(r: Pick<TraceRow, "kind" | "size" | "marks" | "open" | "changed" | "before">): number[] {
  return [
    1,
    ...KINDS.map((k) => (r.kind === k ? 1 : 0)),
    Math.log(1 + r.size) / 5,
    r.marks ? r.open / r.marks : 0,
    r.marks ? r.changed / r.marks : 0,
    Math.log(1 + r.changed) / 5,
    r.before === 1 ? 1 : 0, r.before === 0 ? 1 : 0,
  ];
}
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const score = (w: number[], x: number[]) => sigmoid(x.reduce((a, v, i) => a + v * w[i], 0));

// split by puzzle (a stable hash), so a puzzle's rounds never sit on both sides
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 2 ** 32; };
const train = rows.filter((r) => hash(r.puzzle) < 0.7), test = rows.filter((r) => hash(r.puzzle) >= 0.7);

// logistic regression, full-batch gradient descent, positives weighted up (they're rare)
const X = train.map(features), y = train.map((r) => (r.facts > 0 ? 1 : 0));
const pos = y.filter(Boolean).length, wPos = (y.length - pos) / Math.max(1, pos);
let w = new Array(X[0].length).fill(0);
for (let it = 0; it < 400; it++) {
  const g = new Array(w.length).fill(0);
  X.forEach((x, i) => { const e = (score(w, x) - y[i]) * (y[i] ? wPos : 1); x.forEach((v, j) => { g[j] += e * v; }); });
  w = w.map((v, j) => v - (0.5 * g[j]) / X.length - 1e-4 * v);
}

// the test: each round's check of one stage (the windows checked together) is a group
const stage = (k: string) => (k === "count" ? 2 : k === "pair" || k === "strip" ? 1 : 0);
const groups = new Map<string, Row[]>();
for (const r of test) { const k = `${r.puzzle}|${r.round}|${stage(r.kind)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
console.log(`${rows.length} checks (${rows.filter((r) => r.facts).length} found facts) from ${new Set(rows.map((r) => r.puzzle)).size} puzzles; testing on ${groups.size} groups`);
console.log("share checked first | checks done | groups missing some fact | facts missed");
for (const frac of [0.05, 0.1, 0.2, 0.3, 0.5]) {
  let checks = 0, all = 0, missGroups = 0, missed = 0, facts = 0;
  for (const g of groups.values()) {
    const n = g.length, k = Math.max(3, Math.ceil(frac * n));
    all += n;
    const sorted = [...g].sort((a, b) => score(w, features(b)) - score(w, features(a)));
    const top = sorted.slice(0, k), gotAny = top.some((r) => r.facts > 0);
    checks += gotAny ? Math.min(k, n) : n;
    const total = g.reduce((a, r) => a + r.facts, 0), got = gotAny ? top.reduce((a, r) => a + r.facts, 0) : total;
    facts += total; missed += total - got;
    if (got < total) missGroups++;
  }
  console.log(`${String(frac).padStart(19)} | ${(100 * checks / all).toFixed(0).padStart(10)}% | ${(100 * missGroups / groups.size).toFixed(0).padStart(22)}% | ${(100 * missed / Math.max(1, facts)).toFixed(0).padStart(11)}%`);
}
writeFileSync(`${repo}references/ranker/ranker.json`, JSON.stringify({ features: ["bias", ...KINDS, "logSize", "openShare", "changedShare", "logChanged", "foundLast", "emptyLast"], weights: w.map((v) => +v.toFixed(4)) }, null, 1));
console.log("weights:", w.map((v) => v.toFixed(2)).join(" "));
