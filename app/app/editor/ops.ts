// What's left of the old on-puzzle editor's operations (BoardEditor went when paint took over:
// docs/creation-flow.md, phase 6), still used by paint and the reader: the common shapes for the
// shape stamp's palette, and lengths as written. Pure, unit-tested (tests/unit/shaped.test.ts).

export type RC = [number, number];

/** Common shapes for the shape stamp (components/Sketchpad.tsx), each as cells from 0,0. */
export const SHAPES: { name: string; cells: RC[] }[] = [
  { name: "One square", cells: [[0, 0]] },
  { name: "Two in a row", cells: [[0, 0], [0, 1]] },
  { name: "Three in a row", cells: [[0, 0], [0, 1], [0, 2]] },
  { name: "Three, bent", cells: [[0, 0], [1, 0], [1, 1]] },
  { name: "Four in a row", cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { name: "L of four", cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { name: "T of four", cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { name: "S of four", cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { name: "Square of four", cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
];

/** Lengths as written: "1 √2 2 √5" (a whole number is that length; √n, "r5" or "sqrt 5" a root),
 *  as squares. Null if something can't be read. */
export function parseLengths(text: string): number[] | null {
  const words = text.toLowerCase().replace(/sqrt\s*/g, "√").replace(/\br(?=\d)/g, "√").replace(/√\s+/g, "√").split(/[\s,;]+/).filter(Boolean);
  const out: number[] = [];
  for (const w of words) {
    const m = /^(√)?(\d+)$/.exec(w);
    if (!m || Number(m[2]) < 1) return null;
    out.push(m[1] ? Number(m[2]) : Number(m[2]) ** 2);
  }
  return out;
}
