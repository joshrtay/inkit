// How far a puzzle as Claude read it is from the puzzle the creator published: the measure of a
// read's accuracy. Both are broken into small facts (its type, its size, each clue, each area
// square, each picture square, each rule) and compared as sets. Safe to use anywhere.
import { looseSpec } from "./sketch";
import type { GridSpec } from "~site/engine/types.ts";

export interface PuzzleDiff {
  /** the two are the same puzzle */
  exact: boolean;
  /** facts in both / facts in either (1 = identical, 0 = nothing in common) */
  score: number;
  sameKind: boolean;
  sameSize: boolean;
  /** clues the creator added, removed, and kept */
  givens: { added: number; removed: number; kept: number };
  /** squares whose area (or picture color) changed */
  areaSquares: number;
  pictureSquares: number;
  rulesChanged: boolean;
  /** the facts themselves (for a closer look), capped */
  added: string[];
  removed: string[];
}

/** Every fact in a puzzle, each as a short canonical string. */
export function factsOf(spec: GridSpec): Set<string> {
  const out = new Set<string>();
  out.add(`kind ${spec.genre ?? ""}`);
  out.add(`size ${spec.size.join("x")}`);
  for (const g of spec.givens ?? []) out.add(`given ${canonical(g)}`);
  spec.areas?.forEach((row, r) => [...row].forEach((ch, c) => out.add(`area ${r},${c} ${ch}`)));
  // a picture's letters are arbitrary: compare which squares are filled, and with which color
  const pic = spec.picture;
  pic?.rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== ".") out.add(`picture ${r},${c} ${(pic.palette[ch] ?? ch).toLowerCase()}`); }));
  for (const rule of spec.rules ?? []) out.add(`rule ${canonical(rule)}`);
  if (spec.figure) out.add(`figure ${canonical(spec.figure)}`);
  return out;
}

/** JSON with sorted keys, so the same clue always reads the same. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${k}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

/** The difference between a read (`from`) and the published puzzle (`to`), both as sketches.
 *  Null if either isn't a puzzle at all. */
export function diffSketches(from: string, to: string): PuzzleDiff | null {
  const a = looseSpec(from), b = looseSpec(to);
  if (!a || !b) return null;
  const fa = factsOf(a), fb = factsOf(b);
  const added = [...fb].filter((f) => !fa.has(f)), removed = [...fa].filter((f) => !fb.has(f));
  const kept = [...fa].filter((f) => fb.has(f));
  const count = (list: string[], prefix: string) => list.filter((f) => f.startsWith(prefix)).length;
  const union = fa.size + fb.size - kept.length;
  // a square counts once however its fact changed (removed in one, added in the other)
  const squares = (prefix: string) => new Set([...added, ...removed].filter((f) => f.startsWith(prefix)).map((f) => f.split(" ")[1])).size;
  return {
    exact: added.length === 0 && removed.length === 0,
    score: union ? Math.round((kept.length / union) * 1000) / 1000 : 1,
    sameKind: a.genre === b.genre,
    sameSize: a.size[0] === b.size[0] && a.size[1] === b.size[1],
    givens: { added: count(added, "given "), removed: count(removed, "given "), kept: count(kept, "given ") },
    areaSquares: squares("area "),
    pictureSquares: squares("picture "),
    rulesChanged: count(added, "rule ") + count(removed, "rule ") > 0,
    added: added.slice(0, 50),
    removed: removed.slice(0, 50),
  };
}
