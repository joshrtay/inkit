// How often does one recorded solve of a Janko puzzle predict another solve of the same puzzle?
// The ceiling for "the top guess is among the person's next 3 moves" (research review 2026-10-24,
// idea 1). Janko's files hold one solver each, so repeats are rare: the same grid published twice
// (matched on the puzzle and solution sections) and the few files with two [moves] blocks.
//
// For each ordered pair (A predicts B) and each of B's positions (the marks B settled before its
// k-th settling move), A's guess is the open mark A settled first (ties by name); a hit when it is
// among the first 3 marks B settles next. Only marks both settled count. Beside it random's line
// (3 / open marks, capped at 1) and the whole-order Spearman on the shared marks.
//
//   JANKO_DIR=… node puzzles/difficulty/janko-repeats.ts
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spearman } from "./calibrate.ts";
import { JANKO_DIR, JANKO_TYPES, READERS, type Janko } from "./janko.ts";

const tmp = mkdtempSync(join(tmpdir(), "janko-repeats-"));

/** Each solve in a file: the file itself, or one copy per [moves] block when it has several. */
function solvesOf(path: string): string[] {
  const text = readFileSync(path, "utf8");
  const blocks = [...text.matchAll(/\[moves\]\n[\s\S]*?(?=\n\[)/g)].map((m) => m[0]);
  if (blocks.length < 2) return [path];
  const bare = text.replace(/\[moves\]\n[\s\S]*?(?=\n\[)\n/g, "");
  return blocks.map((b, i) => {
    const out = join(tmp, `${createHash("md5").update(path).digest("hex")}-${i}.txt`);
    writeFileSync(out, bare.replace("[end]", `${b}\n[end]`));
    return out;
  });
}

const key = (text: string) =>
  createHash("md5").update((/\n(\[(?:problem|areas|clabels|rlabels)\][\s\S]*?)\n\[solution\]/.exec(text)?.[1] ?? "")
    + "|" + (/\[solution\]\n([\s\S]*?)\n\[/.exec(text)?.[1] ?? "")).digest("hex");

/** B's positions scored with A's order as the guess. */
function predict(a: Janko, b: Janko) {
  const shared = [...b.settled.keys()].filter((m) => a.settled.has(m));
  const byB = shared.sort((x, y) => b.settled.get(x)! - b.settled.get(y)! || x.localeCompare(y));
  const byA = [...shared].sort((x, y) => a.settled.get(x)! - a.settled.get(y)! || x.localeCompare(y));
  let hits = 0, aligned = 0, rand = 0, n = 0;
  for (let k = 0; k < byB.length; k++) {
    if (k > 0 && b.settled.get(byB[k]) === b.settled.get(byB[k - 1])) continue; // one position a move
    const done = new Set(byB.slice(0, k)), next = new Set(byB.slice(k, k + 3));
    const guess = byA.find((m) => !done.has(m))!;
    hits += next.has(guess) ? 1 : 0;
    // aligned: resume A's order from the point where A's settled marks best match B's position
    // (most marks in common, fewest A had that B hasn't), so A starts where B is working
    let best = 0, bestAt = 0, score = 0;
    byA.forEach((m, t) => { score += done.has(m) ? 1 : -1; if (score > best) { best = score; bestAt = t + 1; } });
    const resumed = byA.slice(bestAt).find((m) => !done.has(m)) ?? guess;
    aligned += next.has(resumed) ? 1 : 0; rand += Math.min(1, 3 / (byB.length - k)); n++;
  }
  const rho = spearman(shared.map((m) => a.settled.get(m)!), shared.map((m) => b.settled.get(m)!));
  return { hits, aligned, rand, n, rho, shared: shared.length };
}

const rows: { type: string; a: string; b: string; same: boolean; hits: number; aligned: number; rand: number; n: number; rho: number }[] = [];
for (const [type, { folder }] of Object.entries(JANKO_TYPES)) {
  const groups = new Map<string, string[]>();
  let dir: string[] = [];
  try { dir = readdirSync(JANKO_DIR + folder); } catch { continue; }
  for (const f of dir.filter((f) => f.endsWith(".txt"))) {
    const path = JANKO_DIR + folder + "/" + f, text = readFileSync(path, "utf8");
    if (!text.includes("[moves]")) continue;
    const k = key(text);
    groups.set(k, [...(groups.get(k) ?? []), ...solvesOf(path)]);
  }
  for (const [, files] of groups) {
    if (files.length < 2) continue;
    const solves = files.map((f) => READERS[type](f)).filter((j): j is Janko => !!j && j.agree > 0.9 && j.settled.size > 0);
    for (const a of solves) for (const b of solves) {
      if (a === b) continue;
      // the same recording filed twice is not a second solve
      if (a.settled.size === b.settled.size && [...a.settled].every(([m, k]) => b.settled.get(m) === k)) continue;
      const r = predict(a, b);
      if (r.n < 5) continue;
      rows.push({ type, a: a.solver, b: b.solver, same: a.solver.toLowerCase() === b.solver.toLowerCase(), ...r });
    }
  }
}

const sum = (xs: typeof rows, label: string) => {
  if (!xs.length) return;
  const h = xs.reduce((s, r) => s + r.hits, 0), n = xs.reduce((s, r) => s + r.n, 0), rd = xs.reduce((s, r) => s + r.rand, 0);
  const rhos = xs.map((r) => r.rho).sort((x, y) => x - y);
  const al = xs.reduce((s, r) => s + r.aligned, 0);
  const mean = xs.reduce((s, r) => s + r.hits / r.n, 0) / xs.length;
  console.log(`${label.padEnd(28)} pairs ${String(xs.length / 2).padStart(4)}  positions ${String(n).padStart(6)}  next-3 ${(100 * h / n).toFixed(0).padStart(3)}%  aligned ${(100 * al / n).toFixed(0).padStart(3)}%  random ${(100 * rd / n).toFixed(0).padStart(3)}%  (pair mean ${(100 * mean).toFixed(0)}%)  order rho median ${rhos[rhos.length >> 1].toFixed(2)}`);
};
sum(rows, "all repeats");
sum(rows.filter((r) => r.same), "same person");
sum(rows.filter((r) => !r.same), "different people");
for (const t of [...new Set(rows.map((r) => r.type))]) sum(rows.filter((r) => r.type === t), `  ${t}`);
// each pair counted once a direction; per-pair figures for the record
for (const r of rows) console.log(`  ${r.type} ${r.a} -> ${r.b}: ${r.hits}/${r.n}, aligned ${r.aligned} (random ${(r.rand).toFixed(1)}), rho ${r.rho.toFixed(2)}`);
