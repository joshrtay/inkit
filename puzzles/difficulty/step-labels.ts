// Step-level labels for pricing steps: an expert solver's verdict on each of our solver's steps,
// from the same position. For Simon Tatham's Singles and Light Up (his solvers, built locally:
// references/tatham/build/*-step), the lowest of his difficulty levels whose deductions reach the
// step's fact from that position; for Sudoku, the highest community (Sudoku Explainer-style)
// rating our technique solver needs to reach it. Our steps come from a solve with every technique
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
import { fromSpec } from "./sudoku/grid.ts";
import { rate } from "./sudoku/solve.ts";
import { fromTatham } from "./tatham.ts";

const repo = new URL("../../", import.meta.url).pathname;
const per = Number(process.argv[2]) || 12;
const build = `${repo}references/tatham/build/`;
type Job = { game: string; id?: string; grade: string; spec: GridSpec; name: string };
const jobs: Job[] = [];
const tdir = `${repo}references/tatham/puzzles/`;
for (const f of readdirSync(tdir).filter((x) => /^(singles|lightup|solo)-/.test(x) && x.endsWith(".txt")).sort()) {
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
  const rows: { cost: number; feat: Record<string, number>; label: number }[] = [];
  if (j.game === "solo") {
    // Sudoku: givens plus the digits placed so far; the highest rating up to the step's fact
    const n = j.spec.size[0];
    for (const s of steps) {
      const placed = new Map<number, number>();
      for (const k of known) { const m = /^digit\((\d+),(\d+)\)=true$/.exec(k); if (m) placed.set(+m[1], +m[2]); }
      const f = s.facts[0], m = /^digit\((\d+),(\d+)\)$/.exec(f.mark);
      if (m) {
        const spec: GridSpec = { ...j.spec, givens: [...(j.spec.givens ?? []), ...[...placed].map(([c, d]) => ({ at: "cell" as const, cell: [Math.floor(c / n), c % n] as [number, number], kind: "number" as const, value: d }))] };
        const { path } = rate(fromSpec(spec), {});
        let top = 0, label = -1;
        for (const t of path) {
          top = Math.max(top, t.se);
          const hit = f.value ? t.place.some(([c, d]) => c === +m[1] && d === +m[2]) : t.remove.some(([c, d]) => c === +m[1] && d === +m[2]) || t.place.some(([c, d]) => c === +m[1] && d !== +m[2]);
          if (hit) { label = top; break; }
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
    const res = spawnSync(`${build}${j.game}-step`, { input: lines.join("\n") + "\n", maxBuffer: 1 << 28 });
    const answers = res.stdout.toString().split("\n").filter((l) => j.game === "singles" ? /^-?\d+$/.test(l) : l.startsWith("ANS ")).map((l) => Number(l.replace("ANS ", "")));
    meta.forEach((m, k) => rows.push({ ...m, label: answers[k] ?? -2 }));
  }
  return rows.map((x) => JSON.stringify({ game: j.game, grade: j.grade, puzzle: `${j.name} ${j.id?.slice(-20)}`, ...x }));
})).flat();
writeFileSync(`${repo}references/ml/step-labels.jsonl`, out.join("\n") + "\n");
console.log(`${out.length} steps labelled`);
