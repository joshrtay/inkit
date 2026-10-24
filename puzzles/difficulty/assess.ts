// One puzzle's assessment: the deduction solver's difficulty and the bad-puzzle checks
// (quality.ts), in the shape the site stores (app/app/games/assessment.ts, the `assessments`
// table). Used by the AI creators' generator (scorer.ts, withQualityChecks) and by the batch that
// assesses every newly published puzzle (assess-site.ts).
//
// Difficulty is the solver's estimate (deduce.ts estimateOf: soft-max of step costs plus rule
// load), the default for types the fitted model hasn't seen (docs/research-state.md, "The
// logic-settled share"). The fitted solver + logic score is within-type and needs a no-split pass
// besides, so it isn't computed here; its solver features are logged (measures) for when it is.
// The site shows the estimate only when the solve finished; an unfinished one is logged.
import { genres, makePuzzle, needsOneSolution, type Genre } from "../../src/engine/puzzle.ts";
import { program } from "../../src/engine/encode.ts";
import type { Given, GridSpec } from "../../src/engine/types.ts";
import { clingoJson, loadClingo } from "./clingo.ts";
import type { deduce, Step } from "./deduce.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { qualityOf } from "./quality.ts";

/** Bumped when what an assessment means changes (the solver's settings, the checks), so the site's
 *  batch assesses every puzzle again. */
export const ASSESS_VERSION = 1;

export interface Assessment {
  version: number;
  /** the solve finished without running out of calls or time */
  solved: boolean;
  /** the solver's difficulty, 0..1 (null if it failed) */
  estimate: number | null;
  /** 0..1 (quality.ts) */
  quality: number;
  flags: string[];
  /** the solver's features and the checks' measures, for the record */
  measures: Record<string, number | null>;
  ms: number;
}

export interface AssessOptions {
  /** the solver's budget in clingo calls (deterministic), and a wall-clock guard */
  budgetCalls?: number;
  budgetMs?: number;
  /** kill a solve that runs this long (one clingo call can't be interrupted) */
  capMs?: number;
  /** look for single clues that could go (one solve per clue; the generator's puzzles are minimal
   *  already). Kinds that could go are always looked for (a solve per kind) */
  redundancy?: boolean;
}

/** The batch's settings: the guard's call budget (aim 4), with room for slow types. */
export const SITE_BUDGET: AssessOptions = { budgetCalls: 1000, budgetMs: 120000, capMs: 180000, redundancy: true };

const STRUCTURE = new Set(["block", "wall", "gap", "start", "end", "door", "bank", "lengths"]);
const where = (g: Given) => (g.at === "cell" ? `${g.kind} at r${g.cell[0] + 1}c${g.cell[1] + 1}` : g.kind);

/** The clues that removing leaves exactly one solution: clues that do nothing. None for a type
 *  that may have several answers (a panel), where removing a symbol never loses the line;
 *  undefined (not checked) past `max` clues or `maxMs`. */
export async function redundantClues(spec: GridSpec, max = 120, maxMs = 60000): Promise<string[] | undefined> {
  if (!needsOneSolution(spec.genre)) return [];
  const t0 = Date.now();
  const givens = spec.givens ?? [];
  const clues = givens.map((g, i) => [g, i] as const).filter(([g]) => !STRUCTURE.has(g.kind));
  if (!clues.length) return [];
  if (clues.length > max) return undefined;
  await loadClingo();
  const out: string[] = [];
  for (const [g, i] of clues) {
    // out of time: not checked, rather than a partial answer
    if (Date.now() - t0 > maxMs) return undefined;
    const fewer: GridSpec = { ...spec, givens: givens.filter((_, j) => j !== i) };
    try {
      const res = clingoJson(program(makePuzzle(fewer)), 2, ["--project=show"]);
      if ((res.Call?.[0]?.Witnesses?.length ?? 0) === 1) out.push(where(g));
    } catch { /* not a puzzle without it: it's needed */ }
  }
  return out;
}

/** The kinds of clue ("clue:number") and the added rules (beyond the type's own) that removing all
 *  of leaves exactly one solution: kinds that do nothing. None for a type that may have several
 *  answers, and none when there's only one kind (removing every clue is no puzzle). */
export async function idleKinds(spec: GridSpec): Promise<string[]> {
  if (!needsOneSolution(spec.genre)) return [];
  const own = new Set(((genres as Record<string, Genre>)[spec.genre ?? ""]?.rules ?? []).map((r) => r.rule));
  const givens = spec.givens ?? [];
  const kinds = [...new Set(givens.filter((g) => !STRUCTURE.has(g.kind)).map((g) => g.kind))];
  const extra = [...new Set((spec.rules ?? []).map((r) => r.rule).filter((r) => !own.has(r)))];
  const tries: [string, GridSpec][] = [
    ...(kinds.length > 1 ? kinds.map((k): [string, GridSpec] => [`clue:${k}`, { ...spec, givens: givens.filter((g) => g.kind !== k) }]) : []),
    ...extra.map((r): [string, GridSpec] => [r, { ...spec, rules: (spec.rules ?? []).filter((x) => x.rule !== r) }]),
  ];
  if (!tries.length) return [];
  await loadClingo();
  const out: string[] = [];
  for (const [name, fewer] of tries) {
    try { if ((clingoJson(program(makePuzzle(fewer)), 2, ["--project=show"]).Call?.[0]?.Witnesses?.length ?? 0) === 1) out.push(name); }
    catch { /* not a puzzle without it: it's needed */ }
  }
  return out;
}

export async function assess(spec: GridSpec, o: AssessOptions = {}): Promise<Assessment> {
  const t0 = Date.now();
  const redundant = o.redundancy ? await redundantClues(spec).catch(() => undefined) : undefined;
  const idle = await idleKinds(spec).catch(() => undefined);
  let r: Awaited<ReturnType<typeof deduce>> | null = null, error = "";
  try { r = await deduceGuarded(spec, { budgetMs: o.budgetMs ?? 15000, ...(o.budgetCalls ? { budgetCalls: o.budgetCalls } : {}) }, o.capMs ?? 60000); }
  catch (e) { error = (e as Error).message.slice(0, 160); }
  if (!r) {
    // no path: only the redundancy check can say anything
    const q = qualityOf({ spec, path: [], profile: { solved: false, entryPoints: 0, notes: [error ? `stuck: the solver failed (${error})` : "out of time: capped"] }, redundant, idle });
    return { version: ASSESS_VERSION, solved: false, estimate: error ? null : 1, quality: q.score, flags: q.flags, measures: { ...q.measures, capped: error ? 0 : 1 }, ms: Date.now() - t0 };
  }
  const { profile: p, path, usage } = r;
  const q = qualityOf({ spec, path: path as Step[], profile: p, usage, redundant, idle });
  return {
    version: ASSESS_VERSION, solved: p.solved, estimate: p.estimate, quality: q.score, flags: q.flags,
    measures: {
      ...q.measures, dSteps: p.dSteps, costSum: p.totalCost, costPeak: p.maxCost, hardStretch: p.hardStretch, ruleLoad: p.ruleLoad,
      tier0: p.perTier[0], tier1: p.perTier[1], tier2: p.perTier[2], tier3: p.perTier[3], rounds: p.rounds, clingoCalls: p.clingoCalls,
    },
    ms: Date.now() - t0,
  };
}
