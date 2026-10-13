// Difficulty bands as technique sets, for making puzzles that afford techniques (gen-set.ts): a
// puzzle is in a band when the deduction solver (deduce.ts), limited to the band's techniques,
// solves it with no case split or search (no step of tier 2 or 3). Each band holds the one before:
//
//   easy    t0: one row, column, area, box, neighbourhood or clue at a time
//   medium  + two overlapping windows (pairs) and two neighbouring rows or columns (strips)
//   hard    everything the solver has by default: + two areas and a line (triples), counting
//           across units, the line families the mining harness kept, the premature-loop lemma
//   expert  + what's off by default, not yet priced: components and their exits (connection),
//           loop parity, two clues' overlapping reach, the families mined from people's stuck
//           moments (MINED_FAMILIES) and pockets (a loop's open areas)
//
// A technique is *required* by a puzzle when the band's solver solves it and gets stuck with that
// one technique taken away (requiredOf). The checks use deduce's quick mode: facts are settled as
// found, unexplained, which is all a yes or no needs.
import { genres, makePuzzle } from "../../src/engine/puzzle.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { deduce, MINED_FAMILIES, REACH_FAMILY, type Options } from "./deduce.ts";

export interface Band {
  name: string;
  /** deduce's stages: families in a stage joined by "+", stages by "," */
  stages: string;
  lemmas: string[];
  /** the line families (deduce's DEFAULT_FAMILIES, technique "lines") */
  lines: boolean;
  /** the clue-reach family (technique "reach") */
  reach: boolean;
  /** the mined families (technique "mined") */
  mined?: boolean;
}

export const BAND_LIST: Band[] = [
  { name: "easy", stages: "t0", lemmas: [], lines: false, reach: false },
  { name: "medium", stages: "t0,pairs+strips", lemmas: [], lines: false, reach: false },
  { name: "hard", stages: "t0,pairs+strips+triples,count,extra+components", lemmas: ["loop"], lines: true, reach: false },
  { name: "expert", stages: "t0,pairs+strips+triples,count,extra+components+pockets", lemmas: ["loop", "component", "parity"], lines: true, reach: true, mined: true },
];
export const bandNamed = (name: string) => {
  const b = BAND_LIST.find((x) => x.name === name);
  if (!b) throw new Error(`no band "${name}" (${BAND_LIST.map((x) => x.name).join(", ")})`);
  return b;
};

/** The techniques a band holds, by the names quick steps carry (deduce's Options.quick). */
export function techniquesOf(b: Band): string[] {
  const out = new Set<string>();
  for (const fam of b.stages.split(",").flatMap((s) => s.split("+"))) {
    if (fam === "t0") continue;
    if (fam === "extra") { if (b.lines) out.add("lines"); if (b.reach) out.add("reach"); if (b.mined) out.add("mined"); continue; }
    if (fam === "components") { for (const l of b.lemmas) if (l !== "parity") out.add(l); continue; }
    out.add(fam);
  }
  if (b.lemmas.includes("parity")) out.add("parity");
  return [...out];
}

/** A band with one technique taken away. */
export function without(b: Band, technique: string): Band {
  const stageFams = ["pairs", "strips", "triples", "count", "pockets"];
  if (stageFams.includes(technique)) {
    const stages = b.stages.split(",").map((s) => s.split("+").filter((f) => f !== technique).join("+")).filter(Boolean).join(",");
    return { ...b, stages };
  }
  if (technique === "lines") return { ...b, lines: false };
  if (technique === "reach") return { ...b, reach: false };
  if (technique === "mined") return { ...b, mined: false };
  if (["loop", "component", "parity"].includes(technique)) return { ...b, lemmas: b.lemmas.filter((l) => l !== technique) };
  throw new Error(`no technique "${technique}"`);
}

/** Whether expert adds a technique for a genre: since it holds the mined families (clue chains,
 *  2 × 2 blocks with a line) as well as connection, parity and reach, every genre; a genre where
 *  none of them bites stops after a few attempts that come out easier (gen-set.ts). */
export function expertApplies(_genre: string): boolean {
  return true;
}

/** deduce's options for a band. */
export function optionsOf(b: Band, extra: Options = {}): Options {
  return { stages: b.stages, lemmas: b.lemmas, defaultFamilies: b.lines, families: [...(b.reach ? [REACH_FAMILY] : []), ...(b.mined ? MINED_FAMILIES : [])], maxTier: 1, ...extra };
}

export interface Quick { solved: boolean; ms: number; used: string[]; steps: number; error?: string }

/** Does the band's solver solve it, with no case split or search? (quick mode, capped) */
export async function quickSolve(spec: GridSpec, b: Band, budgetMs = 8000): Promise<Quick> {
  const t = Date.now();
  try {
    const { path, profile } = await deduce(spec, optionsOf(b, { quick: true, budgetMs }));
    const used = [...new Set(path.flatMap((s) => s.uses))].sort();
    return { solved: profile.solved, ms: Date.now() - t, used, steps: path.length };
  } catch (e) {
    return { solved: false, ms: Date.now() - t, used: [], steps: 0, error: String((e as Error).message ?? e).slice(0, 200) };
  }
}

/** The easiest band that solves it without search (its index in BAND_LIST), or -1. Bands below
 *  `known` (an index known to solve it) are tried from the easiest up. */
export async function bandOf(spec: GridSpec, known = BAND_LIST.length - 1, budgetMs = 8000): Promise<number> {
  for (let k = 0; k < known; k++) if ((await quickSolve(spec, BAND_LIST[k], budgetMs)).solved) return k;
  return (await quickSolve(spec, BAND_LIST[known], budgetMs)).solved ? known : -1;
}

/** The techniques the band's solver can't do without on this puzzle: those it used, each taken
 *  away in turn (parity can't be seen in a step, so it's tried whenever the puzzle has a loop). */
export async function requiredOf(spec: GridSpec, b: Band, used: string[], budgetMs = 8000): Promise<string[]> {
  const out: string[] = [];
  const loop = makePuzzle(spec).rules.some((r) => r.rule === "loop");
  const tryList = techniquesOf(b).filter((t) => used.includes(t) || (t === "parity" && loop));
  for (const t of tryList) if (!(await quickSolve(spec, without(b, t), budgetMs)).solved) out.push(t);
  return out;
}
