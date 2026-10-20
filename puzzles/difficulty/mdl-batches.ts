// Contrast batches for the analyst (docs/research-trajectory.md, phase 1: "the model as analyst"):
// where the fitted language (mdl.ts, richer atoms) visibly misses something, pairs of example
// groups for a model to tell apart. No API calls here: this writes the batches for review.
//
// Two kinds, each from the training half only (a third, cost, compared cheap and dear uses of one
// label, but the gap was mostly where the step happened, which a local grid can't show):
//   outcome  one label, different results (what the step decides: line or cross, bulb or no
//            bulb): something in the grid flips it. Group A one result, B the other.
//   phrase   two labels that often follow each other at a fixed offset: a run of steps to name.
//            Group A the pair at its usual offset, B the same two labels apart.
// A pattern's worth: the bits a better description could save (outcome: the outcome's entropy times its uses; phrase: uses times
// the bits the second step spends on its place). The top N become batches.
//
// Each example: the rows around the step as known after it (llm-label.ts's drawGrid, cropped),
// with ^ under what it decided; types whose drawing can't show what's known are left out. At most two examples a puzzle and
// a setter in a batch; four of each group held back, for checking a proposal before the corpus run.
//
//   node --no-warnings puzzles/difficulty/mdl-batches.ts [--top 20] [--frac 0.25] [--per 12]
import { mkdirSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { drawGrid, rulesOf } from "./llm-label.ts";
import { CTX, corpusSpec, fit, half, loadCorpus, MDL_DIR, RICH, type Coded, type PStep } from "./mdl.ts";

const args = process.argv.slice(2);
const opt = (name: string, d: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const TOP = +opt("top", "20"), PER = +opt("per", "12"), HOLD = 4, frac = +opt("frac", "0.25");
RICH.on = true; CTX.prev = true;

const bucket = (key: string) => { let h = 7; for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i) * 2654435761) >>> 0; return ((h ^ (h >>> 15)) >>> 0) / 2 ** 32; };
const train = loadCorpus(["bulk"]).filter((p) => half(p.key) === 0 && bucket(p.key) < frac);
console.error(`fitting on ${train.length} puzzles`);
const f = fit(train, { max: 200, top: 30, minCount: 5, greedy: true, em: 1 }, () => {});

// the types whose drawing shows what's known (llm-label.ts's drawGrid); the others can't show a step
const DRAWN = new Set(["akari", "slitherlink", "masyu", "hitori", "nurikabe", "cave", "star-battle", "sudoku", "skyscrapers"]);
interface Ex { c: Coded; i: number; label: string; bits: number; outcome: string }
const label = (c: Coded, i: number) => c.occs[i].map((o) => o.sym.key).join(" | ");
const outcome = (s: PStep) => s.facts.map((m) => m.split("=")[1]).sort().join("");
const all: Ex[] = [];
for (const c of f.coded) c.steps.forEach((s, i) => { if (!s.insts[0].atom.startsWith("unexplained")) all.push({ c, i, label: label(c, i), bits: c.bits[i], outcome: outcome(s) }); });
const byLabel = new Map<string, Ex[]>();
for (const e of all) { if (!DRAWN.has(e.c.p.genre)) continue; const k = `${e.c.p.genre} :: ${e.label}`; (byLabel.get(k) ?? byLabel.set(k, []).get(k)!).push(e); }

interface Pattern { kind: "outcome" | "phrase"; key: string; worth: number; a: Ex[]; b: Ex[]; question: string }
const pats: Pattern[] = [];
const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
for (const [key, es] of byLabel) {
  if (es.length < 40) continue;
  const outs = new Map<string, Ex[]>();
  for (const e of es) (outs.get(e.outcome) ?? outs.set(e.outcome, []).get(e.outcome)!).push(e);
  const top2 = [...outs.values()].sort((x, y) => y.length - x.length).slice(0, 2);
  if (top2.length === 2 && top2[1].length >= 0.2 * es.length) {
    const p1 = top2[0].length / (top2[0].length + top2[1].length), h = -(p1 * Math.log2(p1) + (1 - p1) * Math.log2(1 - p1));
    pats.push({ kind: "outcome", key: `${key} → ${top2[0][0].outcome} or ${top2[1][0].outcome}`, worth: h * es.length, a: top2[0], b: top2[1],
      question: "Both groups are the same kind of step by our current description, but they decide different things: group A's steps conclude one way, group B's the other. What in the grid decides which way it goes?" });
  }
}
// phrases: consecutive steps, by their labels and the second's offset from the first
const runs = new Map<string, { at: Ex[]; off: Map<string, Ex[]> }>();
const exAt = new Map<string, Ex>();
for (const e of all) exAt.set(`${e.c.p.key}#${e.i}`, e);
for (const e of all) {
  if (!DRAWN.has(e.c.p.genre)) continue;
  const n = exAt.get(`${e.c.p.key}#${e.i + 1}`);
  if (!n) continue;
  const a = e.c.steps[e.i].insts[0].g, b = n.c.steps[n.i].insts[0].g;
  const key = `${e.c.p.genre} :: ${e.label}  then  ${n.label}`, off = `${Math.round(b.cr - a.cr)},${Math.round(b.cc - a.cc)}`;
  const r = runs.get(key) ?? runs.set(key, { at: [], off: new Map() }).get(key)!;
  r.at.push(e);
  (r.off.get(off) ?? r.off.set(off, []).get(off)!).push(n);
}
for (const [key, r] of runs) {
  if (r.at.length < 40) continue;
  const [[off, near]] = [...r.off.entries()].sort((x, y) => y[1].length - x[1].length);
  const far = [...r.off.entries()].filter(([o]) => o !== off).flatMap(([, xs]) => xs);
  if (near.length < 20 || far.length < 10) continue;
  pats.push({ kind: "phrase", key: `${key} (usual offset ${off})`, worth: near.length * mean(near.map((e) => e.bits)) / 4, a: near, b: far,
    question: "Each example is the second of two steps in a row. In group A it came at the usual spot relative to the first step, in group B somewhere else. Describe the two-step move in group A as one named move: what does the first step set up, and where does the second follow?" });
}

// ---------- drawing the examples ----------
const spec = (c: Coded): GridSpec => ({ ...corpusSpec(c.p.genre, c.p.id), genre: c.p.genre });
const known = (c: Coded, i: number, after: boolean) => {
  const k = new Map<string, boolean>(), s = c.steps[i];
  for (const t of c.p.steps) if (t.round < s.round || (after && t === s)) for (const m of t.facts) { const [mark, v] = m.split("="); k.set(mark, v === "1"); }
  return k;
};
/** keep the legend and header, and the drawn rows from r(a) to r(b) */
function crop(text: string, a: number, b: number) {
  const lines = text.split("\n"), first = lines.findIndex((l) => /^r\d+\s/.test(l));
  if (first < 0) return text;
  const row = (l: string) => +(/^r(\d+)\s/.exec(l)?.[1] ?? NaN);
  let cur = 0;
  return lines.filter((l, j) => { if (j < first) return true; const r = row(l); if (!isNaN(r)) cur = r; return cur >= a && cur <= b; }).join("\n");
}
function draw(e: Ex) {
  const s = e.c.steps[e.i], sp = spec(e.c), rows = s.cells.map((x) => Math.floor(x / e.c.p.cols));
  const a = Math.max(1, Math.min(...rows)), b = Math.min(e.c.p.rows, Math.max(...rows) + 2);
  // the grid after the step, with ^ under what the step decided
  const before = crop(drawGrid(sp, known(e.c, e.i, false)), a, b).split("\n"), after = crop(drawGrid(sp, known(e.c, e.i, true)), a, b).split("\n");
  const out: string[] = [];
  after.forEach((l, j) => {
    out.push(l);
    const o = before[j] ?? "", marks = [...l].map((ch, x) => ch !== o[x] ? "^" : " ").join("").trimEnd();
    if (marks) out.push(marks);
  });
  return `${out.slice(1).join("\n")}\n(the solver's reason: ${s.insts.map((x) => x.atom).join(" + ")})`;
}
function pick(es: Ex[], n: number, seed: string) {
  const out: Ex[] = [], perP = new Map<string, number>(), perS = new Map<string, number>();
  for (const e of [...es].sort((x, y) => bucket(seed + x.c.p.key + x.i) - bucket(seed + y.c.p.key + y.i))) {
    const setter = String((e.c.p.meta.setters as string[] | undefined)?.[0] ?? e.c.p.key);
    if ((perP.get(e.c.p.key) ?? 0) >= 2 || (perS.get(setter) ?? 0) >= 2) continue;
    try { if (!corpusSpec(e.c.p.genre, e.c.p.id)) continue; } catch { continue; }
    out.push(e); perP.set(e.c.p.key, (perP.get(e.c.p.key) ?? 0) + 1); perS.set(setter, (perS.get(setter) ?? 0) + 1);
    if (out.length >= n) break;
  }
  return out;
}

const dir = `${MDL_DIR}batches/`;
mkdirSync(dir, { recursive: true });
const chosen = pats.sort((x, y) => y.worth - x.worth).slice(0, TOP);
const index: unknown[] = [];
chosen.forEach((p, k) => {
  const A = pick(p.a, PER + HOLD, `a${k}`), B = pick(p.b, PER + HOLD, `b${k}`);
  const show = (es: Ex[], g: string) => es.slice(0, PER).map((e, j) => `### ${g}${j + 1}\n${draw(e)}`).join("\n\n");
  const genre = A[0]?.c.p.genre ?? "";
  const legend = A[0] ? drawGrid(spec(A[0].c)).split("\n")[0] : "";
  const text = `# Batch ${k + 1}: ${p.kind}\n\nPattern: ${p.key}\nWorth: about ${Math.round(p.worth)} bits on the training half\n\n## The puzzle type\n${A[0] ? rulesOf(spec(A[0].c)) : genre}\n\nEach example shows the rows around one step, as known after it, with ^ under what the step decided. ${legend}\n\n## The question\n${p.question}\n\nAnswer with up to five candidate descriptions. Write each as a TypeScript function \`(grid, step) => boolean\` over the drawn local grid (givens, what was known before the step, the cells it decided), true for group B's kind of case, with one line saying what it captures. Prefer descriptions a solver would name as a technique.\n\n## Group A\n\n${show(A, "A")}\n\n## Group B\n\n${show(B, "B")}\n`;
  const name = `${String(k + 1).padStart(2, "0")}-${p.kind}-${genre}`;
  writeFileSync(`${dir}${name}.md`, text);
  index.push({ name, kind: p.kind, pattern: p.key, worth: Math.round(p.worth), a: p.a.length, b: p.b.length,
    heldBack: { a: A.slice(PER).map((e) => `${e.c.p.key}#${e.i}`), b: B.slice(PER).map((e) => `${e.c.p.key}#${e.i}`) } });
  console.log(`${name}: ${p.key} (worth ${Math.round(p.worth)} bits; ${p.a.length} against ${p.b.length})`);
});
writeFileSync(`${dir}index.json`, JSON.stringify({ at: new Date().toISOString(), train: train.length, batches: index }, null, 1));
