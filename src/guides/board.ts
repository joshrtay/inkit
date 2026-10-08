// Turning a guide's mini picture (src/guides/types.ts) into a real puzzle and board, for checking
// it against the rules and for drawing it.
import { makePuzzle } from "../engine/puzzle.ts";
import { emptyBoard, type Board, type GridSpec, type Puzzle } from "../engine/types.ts";
import { linkBetween } from "../engine/geometry.ts";
import type { Mini } from "./types.ts";

export const miniSpec = (genre: string, m: Mini): GridSpec => ({
  genre, size: m.size, ...(m.givens ? { givens: m.givens } : {}), ...(m.areas ? { areas: m.areas } : {}),
  ...(m.figure ? { figure: m.figure } : {}), ...(m.rules ? { rules: m.rules } : {}),
});

export const miniPuzzle = (genre: string, m: Mini): Puzzle => makePuzzle(miniSpec(genre, m));

export function miniBoard(p: Puzzle, m: Mini): Board {
  const g = p.grid, b = emptyBoard(g);
  m.shade?.forEach((row, r) => [...row].forEach((ch, c) => { b.shade[g.cell(r, c)] = ch === "#" ? 1 : ch === "x" ? 2 : 0; }));
  for (const path of m.lines ?? []) for (let k = 1; k < path.length; k++) {
    const l = linkBetween(g, g.cell(...path[k - 1]), g.cell(...path[k]));
    if (l < 0) throw new Error(`line step ${path[k - 1]} → ${path[k]} isn't between neighbours`);
    b.loop[l] = 1;
  }
  for (const path of m.fence ?? []) for (let k = 1; k < path.length; k++) {
    let [r, c] = path[k - 1];
    const [r2, c2] = path[k];
    if (r !== r2 && c !== c2) throw new Error(`fence step ${path[k - 1]} → ${path[k]} isn't straight`);
    while (r !== r2 || c !== c2) {
      const nr = r + Math.sign(r2 - r), nc = c + Math.sign(c2 - c);
      const a = g.corner(r, c), z = g.corner(nr, nc), e = g.cornerBorders[a].find((x) => g.cornerBorders[z].includes(x))!;
      b.fence[e] = 1; r = nr; c = nc;
    }
  }
  if (m.regions) for (const e of g.borders) if (e.link >= 0) {
    const [[r1, c1], [r2, c2]] = e.cells.map((i) => g.rc(i));
    if (m.regions[r1][c1] !== m.regions[r2][c2]) b.cut[e.id] = 1;
  }
  // one character a cell, or numbers apart ("12 13 14") for numbers past 9
  m.digits?.forEach((row, r) => (row.includes(" ") ? row.trim().split(/\s+/) : [...row]).forEach((ch, c) => {
    const sym = p.style.symbols?.indexOf(ch) ?? -1;
    b.digit[g.cell(r, c)] = ch === "." ? 0 : sym >= 0 ? sym + 1 : Number(ch);
  }));
  m.paint?.forEach((v, i) => { b.color[i] = v; });
  return b;
}
