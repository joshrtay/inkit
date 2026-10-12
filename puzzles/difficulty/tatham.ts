// Simon Tatham's Portable Puzzle Collection (MIT; generated locally into references/tatham) as our
// puzzles. His generators grade difficulty by the techniques his solvers need, which makes them
// labelled data for our difficulty: does our estimate rise with his grade?
//
//   Light Up → Akari, Solo (3 × 3 boxes) → Sudoku, Singles → Hitori, Loopy (squares) → Slitherlink
import type { GridSpec } from "../../src/engine/types.ts";

type Givens = NonNullable<GridSpec["givens"]>;
export const TATHAM: Record<string, { genre: string; grades: string[] }> = {
  lightup: { genre: "akari", grades: ["d0", "d1", "d2"] },                    // easy, tricky, hard
  solo: { genre: "sudoku", grades: ["db", "di", "da", "de", "du"] },          // basic … unreasonable
  singles: { genre: "hitori", grades: ["de", "dk"] },                         // easy, tricky
  loopy: { genre: "slitherlink", grades: ["de", "dn", "dt", "dh"] },          // easy … hard
};

/** Expand a run-length description: lowercase letters skip that many cells (a = 1); anything else
 *  is one cell's token, read by `token` (which returns how many characters it used). */
function cells(desc: string, n: number, token: (s: string) => [string, number]): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i < desc.length && out.length < n;) {
    const ch = desc[i];
    if (ch >= "a" && ch <= "z") { for (let k = 0; k <= ch.charCodeAt(0) - 97; k++) out.push(null); i++; continue; }
    if (ch === "_") { i++; continue; }
    const [t, used] = token(desc.slice(i)); out.push(t); i += used;
  }
  while (out.length < n) out.push(null);
  return out.slice(0, n);
}

/** A Tatham game ID ("params:desc") as our puzzle, and its grade (the difficulty in its params). */
export function fromTatham(game: string, id: string): { spec: GridSpec; grade: string } | null {
  const [params, desc] = id.split(":");
  if (game === "lightup") {
    const [, w, h] = /^(\d+)x(\d+)/.exec(params)!.map(Number);
    const g: Givens = [];
    cells(desc, w * h, (s) => [s[0], 1]).forEach((t, i) => {
      if (t === null) return;
      const cell: [number, number] = [Math.floor(i / w), i % w];
      g.push({ at: "cell", cell, kind: "block" });
      if (t >= "0" && t <= "4") g.push({ at: "cell", cell, kind: "number", value: Number(t) });
    });
    return { spec: { genre: "akari", size: [h, w], givens: g }, grade: /d\d$/.exec(params)![0] };
  }
  if (game === "solo") {
    const m = /^(\d+)x(\d+)/.exec(params);
    if (!m || m[1] !== "3" || m[2] !== "3" || /[xjk]/.test(params.replace(/d\w$/, "").slice(3))) return null;
    const g: Givens = [];
    cells(desc, 81, (s) => { const d = /^\d+/.exec(s)![0]; return [d, d.length]; }).forEach((t, i) => {
      if (t !== null) g.push({ at: "cell", cell: [Math.floor(i / 9), i % 9], kind: "number", value: Number(t) });
    });
    return { spec: { genre: "sudoku", size: [9, 9], givens: g }, grade: /d\w$/.exec(params)?.[0] ?? "" };
  }
  if (game === "singles") {
    const [, w, h] = /^(\d+)x(\d+)/.exec(params)!.map(Number);
    if (w > 9) return null;
    const g: Givens = [...desc].map((d, i) => ({ at: "cell" as const, cell: [Math.floor(i / w), i % w] as [number, number], kind: "number" as const, value: Number(d) }));
    return { spec: { genre: "hitori", size: [h, w], givens: g }, grade: /d\w$/.exec(params)![0] };
  }
  if (game === "loopy") {
    const m = /^(\d+)x(\d+)t0/.exec(params);
    if (!m) return null;
    const [w, h] = [Number(m[1]), Number(m[2])];
    const g: Givens = [];
    cells(desc, w * h, (s) => [s[0], 1]).forEach((t, i) => {
      if (t !== null) g.push({ at: "cell", cell: [Math.floor(i / w), i % w], kind: "number", value: Number(t) });
    });
    return { spec: { genre: "slitherlink", size: [h, w], givens: g }, grade: /d\w$/.exec(params)![0] };
  }
  return null;
}
