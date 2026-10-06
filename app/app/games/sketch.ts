// A game's "code" is its sketch: the stored text a game parser turns into a playable game. Creators
// never see or type it: Claude writes it from their drawing, and the visual clue editor rewrites it.
//
// Sketch format v1 (grid puzzles, src/engine; see docs/grid-engine.md):
//
//   slitherlink                          first line: the genre,
//   panes: size 4, twins, compass        or a genre plus its rules (for genres whose puzzles mix rules)
//   { "size": [5, 5], "givens": [...] }  then the puzzle: size, givens, and any rules / style / picture
//
// Lines starting with "//" are comments. The format has a version so old games keep parsing
// when it grows. Parsing checks that the engine accepts the puzzle; proving it has exactly one
// solution is a separate (slower) step, done when it's published.
import { describe, genres, makePuzzle } from "~site/engine/puzzle.ts";
import type { GridSpec, RuleSpec } from "~site/engine/types.ts";
import { kindName } from "./kinds";

export const SKETCH_VERSION = 1;

export type Parsed =
  | { ok: true; kind: string; spec: GridSpec; summary: string; rules: string[] }
  | { ok: false; errors: string[] };

export function parseSketch(sketch: string, version = SKETCH_VERSION): Parsed {
  if (version > SKETCH_VERSION) return { ok: false, errors: [`This sketch needs format v${version}; this site reads up to v${SKETCH_VERSION}.`] };
  const lines = sketch.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("//"));
  const header = lines.shift()?.trim();
  if (!header) return { ok: false, errors: ["The sketch is empty. Its first line names the game type."] };

  const [name, ruleList] = header.split(/:(.*)/s).map((s) => s?.trim());
  const genre = name.toLowerCase();
  if (!(genre in genres)) {
    return { ok: false, errors: [`"${name}" isn't a game type. Try one of: ${Object.keys(genres).join(", ")}.`] };
  }
  let body: Partial<GridSpec>;
  try { body = JSON.parse(lines.join("\n") || "{}"); }
  catch (e) { return { ok: false, errors: [`After the first line, describe the puzzle in JSON: ${(e as Error).message}`] }; }
  if (!Array.isArray(body.size) || body.size.length !== 2 || !body.size.every((n) => Number.isInteger(n) && n > 0 && n <= 30)) {
    return { ok: false, errors: ['Give the grid\'s size as "size": [rows, columns] (up to 30 each).'] };
  }
  const rules = [...(ruleList ? ruleList.split(",").map(ruleFrom) : []), ...(body.rules ?? [])];
  const spec: GridSpec = { ...body, genre, size: body.size, ...(rules.length ? { rules } : {}) } as GridSpec;
  try {
    const puzzle = makePuzzle(spec);
    return { ok: true, kind: genre, spec, summary: `${kindName(genre)} · ${spec.figure ? `${spec.figure.pieces.length} pieces` : `${spec.size[1]} × ${spec.size[0]}`}`, rules: describe(puzzle) };
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
}

/** "size 4" -> { rule: "size", is: 4 }; "twins" -> { rule: "twins" }. */
function ruleFrom(text: string): RuleSpec {
  const [rule, value] = text.trim().split(/\s+/);
  return value === undefined ? { rule } : { rule, is: Number.isNaN(Number(value)) ? value : Number(value) };
}

/** A puzzle description back to sketch text (the visual editor's output). */
export function specToSketch(spec: GridSpec): string {
  const { genre, ...body } = spec;
  return `${genre ?? "simple-loop"}\n${JSON.stringify(body, null, 1)}`;
}

/** The puzzle a sketch describes, even if it doesn't make a valid game yet (so it can be fixed in
 *  the visual editor), or null if it can't be made out at all. */
export function looseSpec(sketch: string): GridSpec | null {
  const lines = sketch.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("//"));
  const genre = lines.shift()?.split(":")[0].trim().toLowerCase();
  try {
    const body = JSON.parse(lines.join("\n") || "{}");
    return Array.isArray(body.size) && genre ? { ...body, genre } : null;
  } catch {
    return null;
  }
}
