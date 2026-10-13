// Step-level labels for pricing steps: an expert solver's verdict on each of our solver's steps,
// from the same position. For Simon Tatham's Singles and Light Up (his solvers, built locally:
// references/tatham/build/*-step), the lowest of his difficulty levels whose deductions reach the
// step's fact from that position. Singles: which of Tatham's deductions, applied once, gives it (0
// easy, 1 tricky, 2 none: it takes a chain). Sudoku: the lowest community (Sudoku Explainer-style)
// rating at which our technique solver, given exactly what we knew, reaches it. Our steps come from a solve with every technique
// on (the component lemma, clue reach), so those are labelled too.
// → references/ml/step-labels.jsonl (local only)
//
//   node puzzles/difficulty/step-labels.ts [puzzlesPerFile]
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { REACH_FAMILY } from "./deduce.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { mapPool } from "./pool.ts";
import { bit, boardOf, fromSpec, place } from "./sudoku/grid.ts";
import { apply, nextStep, TECHNIQUES } from "./sudoku/techniques.ts";

const LEVELS = [...new Set(TECHNIQUES.map((t) => t.se))].sort((a, b) => a - b);
import { fromTatham } from "./tatham.ts";

const repo = new URL("../../", import.meta.url).pathname;
const per = Number(process.argv[2]) || 12;
const build = `${repo}references/tatham/build/`;
type Job = { game: string; id?: string; grade: string; spec: GridSpec; name: string };
const jobs: Job[] = [];
const tdir = `${repo}references/tatham/puzzles/`;
// Singles (one application of each of Tatham's deductions: references/tatham/build/singles-one) and
// Sudoku; Light Up's deductions are too entangled to apply one at a time, so it's left out
for (const f of readdirSync(tdir).filter((x) => /^(singles|solo)-/.test(x) && x.endsWith(".txt")).sort()) {
  const game = f.split("-")[0];
  for (const id of readFileSync(tdir + f, "utf8").trim().split("\n").slice(0, per)) {
    const r = fromTatham(game, id);
    if (r) jobs.push({ game, id, grade: r.grade, spec: r.spec, name: f });
  }
}
console.error(`${jobs.length} puzzles`);

process.env.DEDUCE_LEMMAS = "component";
const cellOf = (mark: string) => Number(/^shaded\((\d+)\)$/.exec(mark)?.[1] ?? -1);
let done = 0;
const out = (await mapPool(jobs, async (j) => {
  const r = await deduceGuarded(j.spec, { budgetMs: 30000, families: [REACH_FAMILY] }, 120000).catch(() => null);
  if (++done % 25 === 0) console.error(`${done}/${jobs.length}`);
  if (!r || !r.profile.solved) return [];
  const steps = r.path.filter((s) => !s.choice);
  const known: string[] = [...(r.initial ?? [])];
  const rows: { cost: number; feat: Record<string, number>; label: number; by?: string }[] = [];
  if (j.game === "solo") {
    // Sudoku: the technique solver given exactly what we knew (digits placed and candidates ruled
    // out), its techniques allowed one rating level at a time, each run until nothing changes; the
    // label is the lowest level at which the step's fact appears
    const puzzle = fromSpec(j.spec);
    for (const s of steps) {
      const f = s.facts[0], m = /^digit\((\d+),(\d+)\)$/.exec(f.mark);
      if (m) {
        const b = boardOf(puzzle.shape, puzzle.givens);
        for (const k of known) {
          const q = /^digit\((\d+),(\d+)\)=(\w+)$/.exec(k);
          if (!q) continue;
          const [c, d] = [+q[1], +q[2]];
          if (q[3] === "true") { if (!b.value[c]) place(b, c, d); } else if (!b.value[c]) b.cand[c] &= ~bit(d);
        }
        const [c, d] = [+m[1], +m[2]];
        const got = () => (f.value ? b.value[c] === d : (b.value[c] !== 0 && b.value[c] !== d) || !(b.cand[c] & bit(d)));
        let label = -1;
        for (const level of LEVELS) {
          const techs = TECHNIQUES.filter((t) => t.se <= level);
          for (let k = 0; k < 400 && !got(); k++) { const st = nextStep(b, { unique: true }, techs); if (!st) break; apply(b, st); }
          if (got()) { label = level; break; }
        }
        rows.push({ cost: s.cost, feat: s.feat ?? {}, label });
      }
      for (const x of s.facts) known.push(`${x.mark}=${x.value}`);
    }
  } else {
    // Singles and Light Up: ask Tatham's solver from the same position
    const lines: string[] = [], meta: { cost: number; feat: Record<string, number> }[] = [];
    for (const s of steps) {
      const f = s.facts[0], c = cellOf(f.mark);
      if (c >= 0) {
        const tok = (v: boolean) => (j.game === "singles" ? (v ? "b" : "w") : v ? "b" : "x");
        const k = known.flatMap((x) => { const m = /^shaded\((\d+)\)=(\w+)$/.exec(x); return m ? [`${m[1]}:${tok(m[2] === "true")}`] : []; });
        lines.push(`${j.id}\t${k.join(",") || "-"}\t${c}:${tok(f.value)}`);
        meta.push({ cost: s.cost, feat: s.feat ?? {} });
      }
      for (const x of s.facts) known.push(`${x.mark}=${x.value}`);
    }
    const res = spawnSync(`${build}${j.game}-one`, { input: lines.join("\n") + "\n", maxBuffer: 1 << 28 });
    const answers = res.stdout.toString().split("\n").filter((l) => l.startsWith("ANS ")).map((l) => l.split(" "));
    meta.forEach((m, k) => rows.push({ ...m, label: Number(answers[k]?.[1] ?? -2), by: answers[k]?.[2] ?? "-" } as typeof rows[number]));
  }
  return rows.map((x) => JSON.stringify({ game: j.game, grade: j.grade, puzzle: `${j.name} ${j.id?.slice(-20)}`, ...x }));
})).flat();
writeFileSync(`${repo}references/ml/step-labels.jsonl`, out.join("\n") + "\n");
console.log(`${out.length} steps labelled`);
