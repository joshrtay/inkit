// Difficulty bands as technique sets, for making puzzles that afford techniques (gen-set.ts): a
// puzzle is in a band when the deduction solver (deduce.ts), limited to the band's techniques,
// solves it with no case split or search (no step of tier 2 or 3). Each band holds the one before:
//
//   easy    t0: one row, column, area, box, neighbourhood or clue at a time
//   medium  + two overlapping windows (pairs) and two neighbouring rows or columns (strips)
//   hard    everything the solver has by default: + two areas and a line (triples), counting
//           across units, the line families the mining harness kept, the premature-loop lemma;
//           and, for some genres, their basic per-genre techniques (HARD_TECHNIQUES)
//   expert  + what's off by default, not yet priced: components and their exits (connection),
//           loop parity, two clues' overlapping reach, the families mined from people's stuck
//           moments (MINED_FAMILIES), pockets (a loop's open areas), and every per-genre
//           technique (deduce's TECHNIQUES: Shikaku's candidate rectangles, Minesweeper's clue
//           chains, ...), each a technique of its own, in a stage of their own after counting
//           and before the mined families and pockets (those check thousands of windows a
//           round; the genre's own reasoning is cheaper, and nearer what a person reaches for)
//
// Hard by genre. For some genres the general hard techniques (triples, counting, the line
// families) add nothing over medium: they reason through a structure the windows don't see
// (symmetry, an entry list, candidate shapes). Without their own reasoning, hard is empty and
// puzzles jump from medium to expert. So hard also holds the technique a person learns first for
// the genre, the one beginners' guides teach, and expert keeps the ones guides call advanced:
//   Spiral Galaxies  mirror (a cell's mirror through the centre is in the same galaxy, and the
//                    cells a galaxy can reach that way): the genre's one idea.
//   Fill-in          slots (which entries still fit a slot, and which slots an entry still fits):
//                    how anyone starts one, from the entry list.
//   Minesweeper      mines (two numbers whose neighbourhoods overlap: the 1-1 and 1-2 patterns);
//                    expert keeps chains (three numbers in a chain).
//   Simple Path      ends (a piece of line can't close into a ring, the way in and out can't join
//                    early: the premature-loop idea, which hard has for loops); expert keeps cuts
//                    (a part of the grid crossed an even number of times: parity).
//   Simple Loop      nothing: ends doesn't apply (the premature-loop lemma is its form for loops,
//                    already in hard), and cuts is parity, which stays in expert.
//   Shikaku          rects (a number's rectangles that still fit; a cell only one number reaches):
//                    every Shikaku step is about candidate rectangles. Expert keeps rectpairs
//                    (two numbers' rectangles weighed together).
//   Hidoku           distance (k between placed a and b is within k - a steps of a): the basic
//                    Hidato move; expert keeps dead ends (a cell with one open neighbour is a
//                    chain's end), which guides teach later.
//   Numberlink       ends (pieces carrying different numbers can't join) and owners (a cell only
//                    one pair can reach is that pair's): what a beginner checks; expert keeps cuts
//                    (parity across a part of the grid).
//   Fillomino        sizes (a part with its number closes, parts too big together stay apart, a
//                    part with one way out takes it): the genre's basic moves. Expert keeps shapes
//                    (the shapes a numbered part can still grow into).
//   Easy as ABC      nothing: fish is an X-wing, an advanced technique.
//
// A technique is *required* by a puzzle when the band's solver solves it and gets stuck with that
// one technique taken away (requiredOf). The checks use deduce's quick mode: facts are settled as
// found, unexplained, which is all a yes or no needs.
import { genres, makePuzzle } from "../../src/engine/puzzle.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { deduce, MINED_FAMILIES, REACH_FAMILY, TECHNIQUES, techniqueApplies, type Options } from "./deduce.ts";

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
  /** the per-genre techniques (deduce's TECHNIQUES, each its own technique), checked in the stage
   *  family "techniques" */
  techniques?: string[];
  /** more per-genre techniques for some genres only (genre → techniques), added to `techniques`
   *  for a puzzle of that genre (forGenre) */
  byGenre?: Record<string, string[]>;
}

/** The per-genre techniques in the hard band, by genre (the header says why each). Expert holds
 *  every technique. */
export const HARD_TECHNIQUES: Record<string, string[]> = {
  "spiral-galaxies": ["mirror"],
  "fill-in": ["slots"],
  minesweeper: ["mines"],
  "simple-path": ["ends"],
  shikaku: ["rects"],
  hidoku: ["distance"],
  numberlink: ["ends", "owners"],
  fillomino: ["sizes"],
};

export const BAND_LIST: Band[] = [
  { name: "easy", stages: "t0", lemmas: [], lines: false, reach: false },
  { name: "medium", stages: "t0,pairs+strips", lemmas: [], lines: false, reach: false },
  { name: "hard", stages: "t0,pairs+strips+triples,count,techniques,extra+components", lemmas: ["loop"], lines: true, reach: false, byGenre: HARD_TECHNIQUES },
  { name: "expert", stages: "t0,pairs+strips+triples,count,techniques,extra+components+pockets", lemmas: ["loop", "component", "parity"], lines: true, reach: true, mined: true, techniques: Object.keys(TECHNIQUES) },
];
export const bandNamed = (name: string) => {
  const b = BAND_LIST.find((x) => x.name === name);
  if (!b) throw new Error(`no band "${name}" (${BAND_LIST.map((x) => x.name).join(", ")})`);
  return b;
};

/** A band as it stands for one genre: its techniques for that genre added to the rest. */
export function forGenre(b: Band, genre?: string): Band {
  if (!b.byGenre) return b;
  const { byGenre, ...rest } = b, add = (genre && byGenre[genre]) || [];
  return { ...rest, techniques: [...new Set([...(b.techniques ?? []), ...add])] };
}

/** The techniques a band holds (for a genre, if given), by the names quick steps carry (deduce's
 *  Options.quick). */
export function techniquesOf(band: Band, genre?: string): string[] {
  const b = forGenre(band, genre), out = new Set<string>();
  for (const fam of b.stages.split(",").flatMap((s) => s.split("+"))) {
    if (fam === "t0") continue;
    if (fam === "extra") { if (b.lines) out.add("lines"); if (b.reach) out.add("reach"); if (b.mined) out.add("mined"); continue; }
    if (fam === "components") { for (const l of b.lemmas) if (l !== "parity") out.add(l); continue; }
    if (fam === "techniques") { for (const t of b.techniques ?? []) out.add(t); continue; }
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
  if (technique in TECHNIQUES) {
    const drop = (ts: string[]) => ts.filter((t) => t !== technique);
    return { ...b, techniques: drop(b.techniques ?? []), ...(b.byGenre ? { byGenre: Object.fromEntries(Object.entries(b.byGenre).map(([g, ts]) => [g, drop(ts)])) } : {}) };
  }
  if (["loop", "component", "parity"].includes(technique)) return { ...b, lemmas: b.lemmas.filter((l) => l !== technique) };
  throw new Error(`no technique "${technique}"`);
}

/** Whether expert adds a technique for a genre: since it holds the mined families (clue chains,
 *  2 × 2 blocks with a line) as well as connection, parity and reach, every genre; a genre where
 *  none of them bites stops after a few attempts that come out easier (gen-set.ts). */
export function expertApplies(_genre: string): boolean {
  return true;
}

/** deduce's options for a band, for a puzzle of `genre` (without one, no genre's own techniques). */
export function optionsOf(band: Band, extra: Options = {}, genre?: string): Options {
  const b = forGenre(band, genre);
  // cellAtoms in every band: Spiral Galaxies' windows are local only with it (without, each
  // holds the whole puzzle, every band solves every puzzle, and aiming above easy never ends)
  return { stages: b.stages, lemmas: b.lemmas, defaultFamilies: b.lines, families: [...(b.reach ? [REACH_FAMILY] : []), ...(b.mined ? MINED_FAMILIES : [])], techniques: b.techniques ?? [], cellAtoms: true, maxTier: 1, ...extra };
}

export interface Quick { solved: boolean; ms: number; used: string[]; steps: number; error?: string }

/** Does the band's solver solve it, with no case split or search? (quick mode, capped) */
export async function quickSolve(spec: GridSpec, b: Band, budgetMs = 8000): Promise<Quick> {
  const t = Date.now();
  try {
    const { path, profile } = await deduce(spec, optionsOf(b, { quick: true, budgetMs }, spec.genre));
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
 *  away in turn (parity can't be seen in a step, so it's tried whenever the puzzle has a loop; a
 *  per-genre technique's constraints can help other windows, so it's tried wherever it applies). */
export async function requiredOf(spec: GridSpec, band: Band, used: string[], budgetMs = 8000): Promise<string[]> {
  const out: string[] = [], b = forGenre(band, spec.genre);
  const p = makePuzzle(spec), loop = p.rules.some((r) => r.rule === "loop");
  const tryList = techniquesOf(b).filter((t) => used.includes(t) || (t === "parity" && loop) || (t in TECHNIQUES && techniqueApplies(t, p, spec.genre)));
  for (const t of tryList) if (!(await quickSolve(spec, without(b, t), budgetMs)).solved) out.push(t);
  return out;
}
