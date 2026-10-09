// "What type is this?" for a drawing (docs/creation-flow.md §1.7), without asking Claude: the
// drawing converted as each type paint can make (to-puzzle.ts's profiles), ranked by how much of it
// fits, then by the solver's verdict on each (Paint runs the solver: count-solutions.client.ts).
// A photo's reading names its own candidates (games.kind_choices); those keep the reader's order.
// Pure: no DOM, no solver.
import { needsOneSolution, type GenreName } from "~site/engine/puzzle.ts";
import { kitFor } from "./kit";
import * as m from "./model";
import { convert, PROFILES, type Conversion, type Settings } from "./to-puzzle";
import { isListed } from "~/games/kinds";

/** The drawing as one type: converted in that type's grid look, as choosing the type would. */
export interface Fit {
  genre: GenreName;
  conv: Conversion;
  /** how many drawn things the type can't use (off the type, off the grid) */
  wontFit: number;
  /** what else needs settling: rules already broken, something missing, a stroke read one way of two */
  problems: number;
  /** how many drawn things it uses */
  used: number;
}

/** The genres paint can make, in the engine's order. */
export const PAINT_GENRES = (Object.keys(PROFILES) as GenreName[]).filter((g) => PROFILES[g] && isListed(g));   // not types still in progress

/** The drawing in a type's grid look (a panel's tracks, a honeycomb's hexagons). */
export function inLookOf(d: m.Drawing, genre: GenreName): m.Drawing {
  const look = kitFor(genre)?.look;
  return d.grid && look && m.lookOf(d.grid) !== look ? m.setGrid(d, m.setLook(d.grid, look)) : d;
}

/** How the drawing fits one type, or null if it makes no puzzle of it (no grid; RYB). */
export function fitOf(d: m.Drawing, genre: GenreName, settings: Settings = {}): Fit | null {
  if (!PROFILES[genre]) return null;
  const conv = convert(inLookOf(d, genre), genre, settings);
  if (!conv.spec || conv.problems.some((p) => p.kind === "unsupported")) return null;
  const misfit = new Set<number>(), other = conv.problems.filter((p) => p.kind !== "grid");
  for (const p of other) if (p.kind === "off-type" || p.kind === "off-grid") p.items.forEach((id) => misfit.add(id));
  return { genre, conv, wontFit: misfit.size, problems: other.filter((p) => p.kind !== "off-type" && p.kind !== "off-grid").length, used: conv.used.size };
}

/** Best fit first: fewest things that don't fit, then fewest other problems, then the most used. */
export const byFit = (a: Fit, b: Fit) => a.wontFit - b.wontFit || a.problems - b.problems || b.used - a.used;

/** Every type the drawing could be, best fit first (`among`: only these, in their own order: a
 *  photo reading's candidates). */
export function fitsOf(d: m.Drawing, settings: Settings = {}, among?: string[]): Fit[] {
  const genres = among ? among.filter((g): g is GenreName => (PAINT_GENRES as string[]).includes(g)) : PAINT_GENRES;
  // settings belong to the type they were set for: the size of a grid, a box shape (the same rule names, kept)
  const fits = genres.flatMap((g) => fitOf(d, g, settings) ?? []);
  return among ? fits : fits.sort(byFit);
}

/** What the solver said about a suggestion. */
export type Said = "one" | "solvable" | "several" | "none" | "broken" | "incomplete" | "unchecked" | "error";

/** The verdict a fit gets without the solver: rules already broken, or something missing. */
export function saidBeforeSolving(f: Fit): Said | null {
  if (f.conv.problems.some((p) => p.kind === "rule")) return "broken";
  if (f.conv.problems.some((p) => p.kind === "incomplete")) return "incomplete";
  return null;
}

/** The solver's count as a verdict for this type (panels need only one). */
export const saidOf = (genre: GenreName, solutions: 0 | 1 | 2): Said =>
  solutions === 0 ? "none" : solutions === 1 ? "one" : needsOneSolution(genre) ? "several" : "solvable";

const RANK: Record<Said, number> = { one: 0, solvable: 0, several: 1, unchecked: 2, none: 3, incomplete: 3, broken: 4, error: 4 };

/** Suggestions in order: the types that use everything drawn first, then by verdict (exactly one
 *  solution, or a panel's solvable, before several, before the rest), then best fit. `keepOrder`:
 *  only by verdict (a reading's candidates, already ranked by the reader). */
export function rankSuggestions<T extends { fit: Fit; said: Said }>(list: T[], keepOrder = false): T[] {
  const all = (f: Fit) => (f.wontFit ? 1 : 0);
  return list.map((x, i) => ({ x, i })).sort((a, b) => (keepOrder ? 0 : all(a.x.fit) - all(b.x.fit))
    || RANK[a.x.said] - RANK[b.x.said] || (keepOrder ? 0 : byFit(a.x.fit, b.x.fit)) || a.i - b.i).map(({ x }) => x);
}

/** The verdict's words on a card. */
export const SAID_WORDS: Record<Said, string> = {
  one: "One solution", solvable: "Solvable", several: "Several solutions", none: "No solution yet",
  broken: "Breaks a rule", incomplete: "Not a puzzle yet", unchecked: "Not checked", error: "Couldn't check",
};

/** "Uses everything you drew", or how many things won't fit. */
export const fitWords = (f: Fit) => (f.wontFit ? `${f.wontFit} thing${f.wontFit === 1 ? "" : "s"} won't fit` : "Uses everything you drew");
