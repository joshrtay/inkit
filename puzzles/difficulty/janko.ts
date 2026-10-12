// Janko's puzzles (janko.at; fetched into references/janko, local and non-commercial only) as our
// puzzles, with the test-solver's recorded moves: the order a person settled each cell.
//
// A file is a [begin] … [end] block: "size", "depth" (stars per unit), [areas] (a number per
// cell), [solution] and [moves]. A move is "<column letter><row letter>,<value>": 1 a star, 0 no
// star; "-,,E" entries are provisional marks, later replaced. The first move giving a cell its
// final value is when the person settled it.
import { readFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";

export interface Janko { spec: GridSpec; author: string; solver: string; settled: Map<number, number> }

const section = (text: string, name: string) => {
  const m = new RegExp(`\\[${name}\\]\\n([\\s\\S]*?)\\n\\[`).exec(text);
  return m ? m[1].trim().split("\n").map((l) => l.trim()) : [];
};
const field = (text: string, name: string) => new RegExp(`^${name} (.*)$`, "m").exec(text)?.[1]?.trim() ?? "";

export function readStarBattle(file: string): Janko | null {
  const text = readFileSync(file, "utf8");
  if (field(text, "puzzle") !== "starbattle") return null;
  const n = Number(field(text, "size")), stars = Number(field(text, "depth")) || 1;
  const areaRows = section(text, "areas").map((l) => l.split(/\s+/));
  // irregular boards (cells outside the board "@", blocked cells "#") aren't ours
  if (areaRows.length !== n || areaRows.flat().some((x) => x === "@" || x === "#")) return null;
  const ids = [...new Set(areaRows.flat())];
  if (ids.length > 26) return null;
  const areas = areaRows.map((row) => row.map((x) => String.fromCharCode(97 + ids.indexOf(x))).join(""));
  const solution = section(text, "solution").map((l) => l.split(/\s+/));
  const final = (i: number) => (solution[Math.floor(i / n)]?.[i % n] === "x" ? 1 : 0);
  // the moves, in order: the first one giving each cell its final value
  const settled = new Map<number, number>();
  let k = 0;
  for (const move of section(text, "moves").join("").split(";")) {
    const m = /^([a-z])([a-z]),([01])$/.exec(move.trim());
    if (!m) continue;
    const c = m[1].charCodeAt(0) - 97, r = m[2].charCodeAt(0) - 97, i = r * n + c;
    if (r >= n || c >= n) continue;
    k++;
    if (!settled.has(i) && Number(m[3]) === final(i)) settled.set(i, k);
  }
  const spec: GridSpec = { genre: "star-battle", size: [n, n], areas, rules: [{ rule: "shaded-per-line", n: stars }, { rule: "shaded-per-area", n: stars }, { rule: "no-touch" }] };
  return { spec, author: field(text, "author"), solver: field(text, "solver"), settled };
}
