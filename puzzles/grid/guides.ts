// Check the puzzle guides (src/guides/guides.ts) and solve their worked examples.
//
//   node puzzles/grid/guides.ts
//
// Every ✓ picture must pass the engine rules it shows and every ✗ picture must break one, so a
// picture can't quietly teach the wrong thing. Each worked example (an instance in src/games) is
// solved and must have exactly one solution; examples.json gets the puzzle and its solution.
import { readFileSync, writeFileSync } from "node:fs";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { blockFor } from "../../src/engine/rules.ts";
import { regionsOf } from "../../src/engine/derive.ts";
import { solve } from "../../src/engine/solve.ts";
import type { Board, GridSpec } from "../../src/engine/types.ts";
import { guides } from "../../src/guides/guides.ts";
import { miniBoard, miniPuzzle } from "../../src/guides/board.ts";

const root = new URL("../../", import.meta.url).pathname;
let failures = 0;
const fail = (msg: string) => { failures++; console.log(`  ✗ ${msg}`); };

/** An instance file as a grid-engine puzzle (old Number Line Maze and Three Coats files too). */
function specOf(genre: string, file: string): { name: string; spec: GridSpec } {
  const d = JSON.parse(readFileSync(`${root}src/games/${file}`, "utf8"));
  if (d.grid) return { name: d.name, spec: { genre, ...d.grid } };
  if (d.maze) {
    const m = d.maze, rows = m.clues.length - 1, cols = m.clues[0].length - 1;
    const entry = m.entry ?? { side: "top", at: m.entryCol }, exit = m.exit ?? { side: "right", at: m.exitRow };
    const door = (o: { side: string; at: number }, role: string) => ({ at: "edge", kind: "door", role, side: o.side,
      cell: o.side === "top" ? [0, o.at] : o.side === "bottom" ? [rows - 1, o.at] : o.side === "left" ? [o.at, 0] : [o.at, cols - 1] });
    const wall = (pair: number[][]) => { const [[r1, c1], [r2]] = [...pair].sort((a, b) => a[0] - b[0] || a[1] - b[1]); return { at: "border", kind: "wall", cells: r1 === r2 ? [[r1 - 1, c1], [r1, c1]] : [[r1, c1 - 1], [r1, c1]] }; };
    const givens = [door(entry, "in"), door(exit, "out"), ...(m.hints ?? []).map(wall),
      ...m.clues.flatMap((row: number[], r: number) => row.map((value, c) => ({ at: "corner", kind: "count", corner: [r, c], value })))];
    return { name: d.name, spec: { genre, size: [rows, cols], givens } as GridSpec };
  }
  const pieces = d.ryb.pieces as { points: number[][]; clue?: string; hidden?: boolean }[];
  return { name: d.name, spec: { genre, size: [1, pieces.length], figure: { pieces: pieces.map((p) => p.points) },
    givens: pieces.flatMap((p, i) => (p.clue ? [{ at: "cell", cell: [0, i], kind: "dots", value: [...p.clue].map(Number), ...(p.hidden ? { hidden: true } : {}) }] : [])) } as GridSpec };
}

/** A board's marks, keeping only the layers in use. */
const marksOf = (b: Board) => Object.fromEntries(Object.entries(b).filter(([, v]) => (v as Uint8Array).some((x: number) => x)).map(([k, v]) => [k, [...(v as Uint8Array)]]));

const examples: Record<string, unknown> = {};
for (const [genre, guide] of Object.entries(guides)) {
  console.log(guide.name);
  for (const rule of guide.rules) for (const m of rule.pictures) {
    const where = `${guide.name}: "${m.note}"`;
    try {
      const p = miniPuzzle(genre, m), b = miniBoard(p, m);
      let reg: ReturnType<typeof regionsOf> | undefined;
      const problems = rule.checks.flatMap((name) => blockFor({ rule: name }).check(p.rules.find((s) => s.rule === name) ?? { rule: name }, p, b, () => (reg ??= regionsOf(p, b))));
      if (m.ok && problems.length) fail(`${where} should pass ${rule.checks.join(", ")} but: ${problems[0].message}`);
      if (!m.ok && !problems.length) fail(`${where} should break ${rule.checks.join(", ")} but doesn't`);
    } catch (e) { fail(`${where}: ${(e as Error).message}`); }
  }
  const { name, spec } = specOf(genre, guide.example);
  const p = makePuzzle(spec), sols = await solve(p, 2);
  if (sols.length !== 1) fail(`${guide.name}: example ${guide.example} has ${sols.length} solutions`);
  else examples[genre] = { name, file: guide.example, spec, solution: marksOf(sols[0]) };
}
writeFileSync(`${root}src/guides/examples.json`, JSON.stringify(examples) + "\n");
console.log(failures ? `${failures} problem(s)` : `all ${Object.keys(guides).length} guides check out; wrote src/guides/examples.json`);
process.exit(failures ? 1 : 0);
