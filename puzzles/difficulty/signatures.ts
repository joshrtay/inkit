// Technique signatures: a solver step in terms any type shares. Each rule instance in a step's
// explanation becomes a primitive (what kind of rule) on a unit (what kind of place), and a step's
// signature is the multiset of those, so Star Battle's "two areas inside two rows" and Sudoku's
// X-Wing are compared as the shapes they are, not as their types. Counting signatures across
// types builds the periodic table of docs/learning-design.md from the solver's own explanations.
import type { Step } from "./deduce.ts";

/** Each engine rule as a primitive from a small shared vocabulary. */
export const PRIMITIVE: Record<string, string> = {
  // exactly k marks in a set of cells
  "shaded-per-line": "count", "shaded-per-area": "count", "adjacent-count": "count", "mine-count": "count",
  "corner-count": "count", "line-totals": "count", "line-shares": "count", "color-count": "count", "region-count": "count",
  "sides": "count", "water": "count",
  // each value once in a unit
  latin: "each-once", boxes: "each-once", letters: "each-once", "one-each": "each-once", "one-of-each": "each-once",
  "unique-unshaded": "each-once", "unique-lines": "each-once", "all-different": "each-once", "fill-in": "each-once",
  // a forbidden local pattern, or neighbours that must differ
  "no-touch": "pattern", "no-adjacent": "pattern", "no-pool": "pattern", "no-three-in-a-row": "pattern", "no-four-corners": "pattern",
  "no-t-junctions": "pattern", "no-rectangles": "pattern", "neighbors-differ": "pattern", "neighbors-differ-size": "pattern", "all-same": "pattern",
  // connection: one piece, a loop or path, reaching an edge
  "unshaded-connected": "connect", "perfect-maze": "connect", "shaded-to-edge": "connect", connected: "connect", regions: "connect",
  loop: "connect", path: "connect", links: "connect", "cell-borders": "connect",
  // a region's size or shape
  "size-clue": "size", "side-clue": "size", size: "size", "allowed-sizes": "size", "size-compare": "size", "size-difference": "size",
  rectangles: "size", squares: "size", "region-shape": "size", "shape-bank": "size", "symmetric-regions": "size", galaxies: "size",
  pieces: "size", tiles: "size", rects: "size", ends: "connect", cuts: "connect", twins: "size", opposites: "size", "regions-at-corner": "size",
  // sums
  "region-sum": "sum", runs: "sum",
  // what a cell sees along a line
  lit: "sight", skyscrapers: "sight", "first-seen": "sight", sight: "sight", bars: "sight",
  // order along a path
  thermo: "order", "number-path": "order", "distance-path": "order", "smallest-missing": "order", pearls: "order",
};

/** A group label ("row 3", "area b", "2 × 2 at r1c4", "r2c3 r2c4", "near r1c1–r3c2", "the whole grid") as a unit kind. */
export function unitKind(label: string): string {
  if (/^(row|column) /.test(label)) return "line";
  if (/^(rows|columns) \d/.test(label)) return "strip";
  if (/^(area|box) /.test(label)) return "region";
  if (/^2 × 2 /.test(label)) return "block";
  if (label === "the whole grid") return "grid";
  return "local";
}

/** A step's signature: its explanation's primitives on unit kinds, sorted ("count@line count@line count@region"). */
export function signature(step: Step): string {
  const parts = (step.because?.clues ?? []).flatMap((c) => {
    const m = /^(.+?) \((.*)\)$/.exec(c);
    if (!m) return [];
    return [`${PRIMITIVE[m[1]] ?? m[1]}@${unitKind(m[2])}`];
  });
  // no rule instance at all: the cell alone (a cell with one option left, a naked single)
  return parts.length ? parts.sort().join(" ") : "cell-only";
}

/** A coarser signature: the distinct primitive@unit kinds, without multiplicity. */
export const coarse = (sig: string) => [...new Set(sig.split(" "))].join(" ");

/** A shape's family (Step.shapeText): alike instances reduced to one, with "+" when there were
 *  several, and the relations each has reduced to a set, so "two blocks" and "three blocks" in
 *  the same arrangement are one family. */
export function family(shapeText: string): string {
  if (!shapeText) return "";
  const parts = shapeText.split("; ").map((p) => {
    const m = /^(.*?)\[(.*)\]$/.exec(p);
    if (!m) return p;
    const rels = [...new Set(m[2].split(", ").filter(Boolean))].sort();
    return `${m[1]}[${rels.join(", ")}]`;
  });
  const counts = new Map<string, number>();
  for (const p of parts) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts].map(([p, n]) => (n > 1 ? `${p}+` : p)).sort().join("; ");
}
