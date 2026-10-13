// Local encodings of the rectangle puzzles for the deduction solver (deduce.ts), the way people
// solve them: each region is one of a few shapes, listed up front. The engine encodes regions in
// general ("which cells reach which", src/engine/rules.ts), which grounds to every pair of cells
// and ties every step to the whole grid; here every rule touches only the cells near it, so the
// solver's small windows can see the steps, and the ground program is a few kB.
//
//   Shikaku     a number's region is a rectangle of that area holding it and no other number
//   Square Jam  every region is a square; a number gives its square's side; four regions never
//               meet at a point
//
// The marks are the engine's own (cut(L): a border drawn on link L), so the solver's facts are the
// same, and it checks each one against the engine's answer: an encoding that disagreed would stop
// it ("deduced a wrong fact"). Puzzles with anything else (holes, walls, other clues or rules) are
// left to the engine's encoding.
import type { Puzzle } from "../../src/engine/types.ts";

/** A local encoding: `text`, with every rule tagged rbk(k) by the engine rule block it stands for
 *  (the solver groups and costs steps by those, as it does the engine's, switching the tags on as
 *  externals); `plain`, the same with the tags simply true, to solve as it is. */
export interface Local {
  text: string; plain: string;
  /** with `picks`: the candidate shapes, each shown as pick(id): the number it's for (Square Jam:
   *  the number inside, or -1), its cells, the links inside it (uncut) and round it (cut) */
  shapes?: { clue: number; cells: number[]; inside: number[]; border: number[] }[];
}

const numberClues = (p: Puzzle) => [...p.cellGivens].flatMap(([i, gs]) => gs.flatMap((g) => (g.kind === "number" && g.letter === undefined ? [[i, g.value] as [number, number]] : [])));

/** `picks`: also show each candidate shape's pick atom and list the shapes (for the generator's
 *  rectangle technique, deduce.ts). */
export function localProgram(p: Puzzle, genre: string | undefined, picks = false): Local | null {
  const names = p.rules.map((r) => r.rule).join(",");
  const shikaku = genre === "shikaku" && names === "rectangles,one-each,size-clue";
  const jam = genre === "square-jam" && names === "squares,no-four-corners,side-clue";
  if (!shikaku && !jam) return null;
  const g = p.grid;
  if (g.kind !== "square" || p.figure || p.blocked.size || p.walls.size) return null;
  const clues = numberClues(p);
  // only number clues, one per cell
  const givens = [...p.cellGivens.values()].flat();
  if (givens.length !== clues.length || givens.some((x) => x.kind !== "number")) return null;
  const clueAt = new Map(clues);

  const linkOf = new Map<string, number>();
  g.links.forEach((l, k) => linkOf.set(`${Math.min(l.cells[0], l.cells[1])},${Math.max(l.cells[0], l.cells[1])}`, k));
  const link = (a: number, b: number) => linkOf.get(`${Math.min(a, b)},${Math.max(a, b)}`);

  // the candidate shapes: [top, left, height, width]
  const shapes: [number, number, number, number][] = [], shapeClue: number[] = [];
  const cellsIn = ([t, l, h, w]: [number, number, number, number]) => {
    const out: number[] = [];
    for (let y = t; y < t + h; y++) for (let x = l; x < l + w; x++) out.push(g.cell(y, x));
    return out;
  };
  if (shikaku) {
    for (const [i, v] of clues) {
      const [r, c] = g.rc(i);
      for (let h = 1; h <= v; h++) {
        if (v % h) continue;
        const w = v / h;
        for (let t = r - h + 1; t <= r; t++) for (let l = c - w + 1; l <= c; l++) {
          if (t < 0 || l < 0 || t + h > g.rows || l + w > g.cols) continue;
          const s: [number, number, number, number] = [t, l, h, w];
          if (cellsIn(s).every((k) => k === i || !clueAt.has(k))) { shapes.push(s); shapeClue.push(i); }
        }
      }
    }
  } else {
    for (let s = 1; s <= Math.min(g.rows, g.cols); s++) for (let t = 0; t + s <= g.rows; t++) for (let l = 0; l + s <= g.cols; l++) {
      const sq: [number, number, number, number] = [t, l, s, s];
      if (cellsIn(sq).every((k) => !clueAt.has(k) || clueAt.get(k) === s)) { shapes.push(sq); shapeClue.push(cellsIn(sq).find((k) => clueAt.has(k)) ?? -1); }
    }
  }

  const k0 = 0;                       // the shape rule (rectangles / squares)
  const tag = (k: number) => `rbk(${k})`;
  const out: string[] = [`{cut(L)} :- link(L).`, ...g.links.map((_, k) => `link(${k}).`)];
  const covers: number[][] = Array.from({ length: g.cellCount }, () => []);
  const within: number[][] = g.links.map(() => []);
  const listed: NonNullable<Local["shapes"]> = [];
  shapes.forEach((s, id) => {
    const cs = cellsIn(s), inside = new Set(cs), body: string[] = [], ins: number[] = [], border: number[] = [];
    for (const a of cs) {
      covers[a].push(id);
      for (const lk of g.cellLinks[a]) {
        const [x, y] = g.links[lk].cells, b = x === a ? y : x;
        if (inside.has(b)) { if (a < b) { body.push(`not cut(${lk})`); within[lk].push(id); ins.push(lk); } }
        else { body.push(`cut(${lk})`); border.push(lk); }
      }
    }
    listed.push({ clue: shapeClue[id], cells: cs, inside: ins, border });
    // the shape is a region when its inside is uncut and its border cut
    out.push(`pick(${id}) :- ${[...body, tag(k0)].join(", ")}.`);
  });
  // every cell is in a region, and an uncut link joins two cells of one region
  for (let a = 0; a < g.cellCount; a++) out.push(covers[a].length ? `:- ${covers[a].map((id) => `not pick(${id})`).join(", ")}, ${tag(k0)}.` : `:- ${tag(k0)}.`);
  g.links.forEach((_, lk) => out.push(within[lk].length ? `:- not cut(${lk}), ${within[lk].map((id) => `not pick(${id})`).join(", ")}, ${tag(k0)}.` : `:- not cut(${lk}), ${tag(k0)}.`));
  if (jam) {
    // four regions never meet at a point: the four links around it aren't all cut
    for (let y = 0; y + 1 < g.rows; y++) for (let x = 0; x + 1 < g.cols; x++) {
      const [A, B, C, D] = [g.cell(y, x), g.cell(y, x + 1), g.cell(y + 1, x), g.cell(y + 1, x + 1)];
      out.push(`:- cut(${link(A, B)}), cut(${link(C, D)}), cut(${link(A, C)}), cut(${link(B, D)}), ${tag(1)}.`);
    }
  }
  out.push("#show cut/1.");
  if (picks) out.push("#show pick/1.");
  const text = out.join("\n");
  return { text, plain: `${text}\nrbk(0..${Math.max(0, p.rules.length - 1)}).`, ...(picks ? { shapes: listed } : {}) };
}
