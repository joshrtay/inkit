// Engine self-test: on small grids, try every possible board, keep the ones the
// TypeScript checks accept, and compare with every solution clingo finds. Any difference
// means a rule's encoding and its check disagree.
//
//   node src/engine/selftest.ts [rounds] [seed]
import { makePuzzle, check } from "./puzzle.ts";
import { program, boardOf } from "./solve.ts";
import { regionsOf } from "./derive.ts";
import { emptyBoard, type Board, type GridSpec, type Puzzle } from "./types.ts";

const rounds = Number(process.argv[2] ?? 40);
let seed = Number(process.argv[3] ?? 7);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

/** A canonical string for a board, so the same solution compares equal either way. */
function key(p: Puzzle, b: Board): string {
  if (p.marks.includes("regions")) return regionsOf(p, b).of.join(",");
  if (p.marks.includes("shade")) return [...b.shade].map((x) => (x === 1 ? 1 : 0)).join("");
  return [...b.fence].join("");
}

/** Every board for the puzzle's marks (cut sets / shadings / fences). */
function* allBoards(p: Puzzle): Generator<Board> {
  const g = p.grid;
  if (p.marks.includes("regions")) {
    const interior = g.links.map((l) => l.border);
    for (let m = 0; m < 1 << interior.length; m++) {
      const b = emptyBoard(g);
      interior.forEach((e, k) => { if (m & (1 << k)) b.cut[e] = 1; });
      yield b;
    }
  } else if (p.marks.includes("shade")) {
    const free = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => !p.cellGivens.has(i));
    for (let m = 0; m < 1 << free.length; m++) {
      const b = emptyBoard(g);
      free.forEach((i, k) => { if (m & (1 << k)) b.shade[i] = 1; });
      yield b;
    }
  } else {
    for (let m = 0; m < 1 << g.borders.length; m++) {
      const b = emptyBoard(g);
      g.borders.forEach((e, k) => { if (m & (1 << k)) b.fence[e.id] = 1; });
      yield b;
    }
  }
}

function randomSpec(): GridSpec {
  const kind = pick(["panes", "panes", "panes", "nurikabe", "slitherlink"]);
  if (kind === "slitherlink") {
    const [rows, cols] = pick([[2, 2], [2, 3]]);
    const givens = Array.from({ length: rows * cols }, (_, i) => i).filter(() => rand() < 0.5)
      .map((i) => ({ at: "cell" as const, cell: [Math.floor(i / cols), i % cols] as [number, number], kind: "number" as const, value: Math.floor(rand() * 4) }));
    return { genre: "slitherlink", size: [rows, cols], givens };
  }
  if (kind === "nurikabe") {
    const [rows, cols] = pick([[3, 3], [3, 4], [2, 4]]);
    const cells = Array.from({ length: rows * cols }, (_, i) => i).filter(() => rand() < 0.25);
    return { genre: "nurikabe", size: [rows, cols], givens: cells.map((i) => ({ at: "cell" as const, cell: [Math.floor(i / cols), i % cols] as [number, number], kind: "number" as const, value: 1 + Math.floor(rand() * 4) })) };
  }
  const [rows, cols] = pick([[2, 3], [3, 3], [2, 4], [3, 4]]);
  const rules: GridSpec["rules"] = [];
  if (rand() < 0.6) rules.push(pick([{ rule: "size", is: pick([2, 3, 4]) }, { rule: "size", min: 2 }, { rule: "size", min: 2, max: 3 }]));
  const givens: NonNullable<GridSpec["givens"]> = [];
  const cellAt = (i: number): [number, number] => [Math.floor(i / cols), i % cols];
  const randomBorder = (): [[number, number], [number, number]] => {
    const r = Math.floor(rand() * rows), c = Math.floor(rand() * cols);
    return rand() < 0.5 && c + 1 < cols ? [[r, c], [r, c + 1]] : r + 1 < rows ? [[r, c], [r + 1, c]] : [[r, c - 1 < 0 ? 0 : c - 1], [r, c - 1 < 0 ? 1 : c]];
  };
  if (rand() < 0.5) { rules.push({ rule: "twins" }); givens.push({ at: "border", cells: randomBorder(), kind: "twins" }); }
  if (rand() < 0.4) { rules.push({ rule: "opposites" }); givens.push({ at: "border", cells: randomBorder(), kind: "opposites" }); }
  if (rand() < 0.3) rules.push({ rule: "all-different" });
  if (rand() < 0.4) {
    rules.push({ rule: "size-clue" });
    givens.push({ at: "cell", cell: cellAt(Math.floor(rand() * rows * cols)), kind: "number", value: 1 + Math.floor(rand() * 4) });
  }
  if (rand() < 0.4) {
    rules.push({ rule: "compass" });
    const v: Record<string, number> = {};
    for (const d of ["n", "e", "s", "w"]) if (rand() < 0.5) v[d] = Math.floor(rand() * 3);
    givens.push({ at: "cell", cell: cellAt(Math.floor(rand() * rows * cols)), kind: "compass", value: v });
  }
  if (rand() < 0.3) {
    rules.push({ rule: "one-each", of: "symbol" });
    for (let k = 0; k < 2; k++) givens.push({ at: "cell", cell: cellAt(Math.floor(rand() * rows * cols)), kind: "symbol", value: "star" });
  }
  if (!rules.length) rules.push({ rule: "size", is: 2 });
  return { genre: "panes", size: [rows, cols], rules, givens };
}

const clingo = await import("clingo-wasm");
let failures = 0;
for (let n = 0; n < rounds; n++) {
  const spec = randomSpec();
  let p: Puzzle;
  try { p = makePuzzle(spec); } catch { continue; }   // e.g. two givens on one border
  const brute = new Set<string>();
  for (const b of allBoards(p)) if (!check(p, b).length) brute.add(key(p, b));
  const res = await clingo.run(program(p), 0) as { Result: string; Error?: string; Call?: { Witnesses?: { Value: string[] }[] }[] };
  if (res.Result === "ERROR") { console.log("clingo error", res.Error, JSON.stringify(spec)); failures++; continue; }
  const asp = new Set((res.Call?.[0]?.Witnesses ?? []).map((w) => key(p, boardOf(p, w.Value))));
  const same = brute.size === asp.size && [...brute].every((k) => asp.has(k));
  if (!same) { failures++; console.log(`MISMATCH checks=${brute.size} solver=${asp.size}`, JSON.stringify(spec)); }
  else console.log(`ok ${spec.genre} ${spec.size.join("x")} ${(p.rules.map((r) => r.rule)).join(",")}: ${brute.size} solution(s)`);
}
console.log(failures ? `${failures} failure(s)` : "all agree");
process.exit(failures ? 1 : 0);
