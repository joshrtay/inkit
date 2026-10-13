// Writing a Penpa+ link, after Penpa+'s maketext and encrypt_data (github.com/swaroopg92/penpa-edit,
// docs/js/class_p.js; MIT, (c) 2019 Opt-Pan, (c) 2020 Swaroop Guggilam), for the tests: one of our
// puzzles drawn as Penpa+'s puzz.link import draws it, and a solved board as its stored solution.
// Used by tests/unit/import-penpa.test.ts and tests/e2e/link.spec.ts.
import { makePuzzle } from "~site/engine/puzzle.ts";
import type { Board, GridSpec } from "~site/engine/types.ts";

const COMPRESS_SUB: [string, string][] = [
  ["z", "zZ"], ['"qa"', "z9"], ['"pu_q"', "zQ"], ['"pu_a"', "zA"], ['"grid"', "zG"], ['"edit_mode"', "zM"], ['"surface"', "zS"],
  ['"line"', "zL"], ['"lineE"', "zE"], ['"wall"', "zW"], ['"cage"', "zC"], ['"number"', "zN"], ['"symbol"', "zY"], ['"special"', "zP"],
  ['"board"', "zB"], ['"command_redo"', "zR"], ['"command_undo"', "zU"], ['"command_replay"', "z8"], ['"numberS"', "z1"],
  ['"freeline"', "zF"], ['"freelineE"', "z2"], ['"thermo"', "zT"], ['"arrows"', "z3"], ['"direction"', "zD"], ['"squareframe"', "z0"],
  ['"polygon"', "z5"], ['"deletelineE"', "z4"], ['"killercages"', "z6"], ['"nobulbthermo"', "z7"], ['"__a"', "z_"], ["null", "zO"],
];
async function deflate(text: string) {
  const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
}
export interface Drawn { gridtype?: string; nx: number; ny: number; space?: number[]; q: Record<string, unknown>; tags?: string[]; solution?: unknown[] }
export async function penpaLink({ gridtype = "square", nx, ny, space = [0, 0, 0, 0], q, tags = [], solution }: Drawn) {
  const lines = [
    `${gridtype},${nx},${ny},38,0,1,1,${(nx + 1) * 38},${(ny + 1) * 38},0,0,0,0,0,0,Title: ,Author: ,,,ON,false,`,
    JSON.stringify(space), "{}", JSON.stringify(q), "{}", "[]", "[]", "{}", '"x"', '"x"', "[3,1,0]", "{}", '"x"', "0", "{}", "{}", "{}",
    JSON.stringify(tags), "",
  ];
  let text = lines.join("\n");
  for (const [from, to] of COMPRESS_SUB) text = text.split(from).join(to);
  return `https://swaroopg92.github.io/penpa-edit/#m=${solution ? "solve" : "edit"}&p=${await deflate(text)}${solution ? `&a=${await deflate(JSON.stringify(solution))}` : ""}`;
}

/** Our puzzle drawn as Penpa+ would draw it (its puzz.link import's styles). */
export function drawn(spec: GridSpec, tags: string[] = []): Drawn {
  const [rows, cols] = spec.size, out = (spec.givens ?? []).some((g) => g.at === "edge" || g.at === "row" || g.at === "col") ? 1 : 0;
  const space = [out, out, out, out], nx = cols + 2 * out, ny = rows + 2 * out, nx0 = nx + 4, N = nx0 * (ny + 4);
  const center = (r: number, c: number) => (r + 2 + out) * nx0 + (c + 2 + out);
  const corner = (r: number, c: number) => N + (r + 1 + out) * nx0 + (c + 1 + out);
  const q: Record<string, Record<string, unknown> | unknown[]> = { surface: {}, number: {}, symbol: {}, lineE: {}, thermo: [] };
  const put = (k: string, key: number | string, v: unknown) => { (q[k] as Record<string, unknown>)[key] = v; };
  for (const g of spec.givens ?? []) {
    if (g.at === "cell" && g.kind === "number") put("number", center(...g.cell), [String(g.value), 1, "1"]);
    else if (g.at === "cell" && g.kind === "block") { put("surface", center(...g.cell), 4); }
    else if (g.at === "cell" && g.kind === "pearl") put("symbol", center(...g.cell), [g.value === "white" ? 1 : 2, "circle_L", 1]);
    else if (g.at === "point") {
      // a cell's centre, a corner (below right of it), the middle of the line below it, or right of it
      const [y, x] = g.point, type = y % 2 && x % 2 ? 0 : !(y % 2) && !(x % 2) ? 1 : !(y % 2) ? 2 : 3;
      const r = Math.floor((y - 1) / 2), c = Math.floor((x - 1) / 2);
      put("symbol", type * N + center(r, c), [1, "circle_SS", 2]);
    } else if (g.at === "edge") {
      const k = g.side === "top" ? center(-1, g.cell[1]) : g.side === "bottom" ? center(rows, g.cell[1]) : g.side === "left" ? center(g.cell[0], -1) : center(g.cell[0], cols);
      put("number", k, [g.kind === "first" ? "ABCDEFG"[g.value - 1] : String(g.value), 1, "1"]);
    } else if (g.kind === "total") put("number", g.at === "col" ? center(-1, g.index) : center(g.index, -1), [String(g.value), 1, "1"]);
  }
  // blocks with numbers on them (Akari): white on black
  for (const g of spec.givens ?? []) if (g.at === "cell" && g.kind === "number" && spec.givens!.some((b) => b.kind === "block" && b.at === "cell" && b.cell[0] === g.cell[0] && b.cell[1] === g.cell[1])) put("number", center(...g.cell), [String(g.value), 7, "1"]);
  if (spec.areas) {
    const a = spec.areas;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && a[r][c] !== a[r][c + 1]) put("lineE", `${corner(r, c + 1)},${corner(r + 1, c + 1)}`, 2);
      if (r + 1 < rows && a[r][c] !== a[r + 1][c]) put("lineE", `${corner(r + 1, c)},${corner(r + 1, c + 1)}`, 2);
    }
  }
  return { nx, ny, space, q, tags, gridtype: spec.genre === "sudoku" ? "sudoku" : "square" };
}
/** A board as Penpa+'s stored solution (make_solution): shading, lines, edges, numbers, symbols. */
export function solutionOf(spec: GridSpec, b: Board, d: Drawn): unknown[] {
  const p = makePuzzle(spec), g = p.grid, [top, , left] = d.space!, nx0 = d.nx + 4, N = nx0 * (d.ny + 4);
  const center = (i: number) => { const [r, c] = g.rc(i); return (r + 2 + top) * nx0 + (c + 2 + left); };
  const corner = (v: number) => { const [r, c] = g.cornerRC(v); return N + (r + 1 + top) * nx0 + (c + 1 + left); };
  const sol: string[][] = [[], [], [], [], [], []];
  for (let i = 0; i < g.cellCount; i++) {
    if (b.shade[i] === 1) (spec.genre === "star-battle" ? sol[5].push(`${center(i)},1E`) : sol[0].push(String(center(i))));
    if (b.digit[i] && !p.cellGivens.get(i)?.length) sol[4].push(`${center(i)},${b.digit[i]}`);
  }
  for (const l of g.links) if (b.loop[l.id] === 1) sol[1].push(`${[center(l.cells[0]), center(l.cells[1])].sort((x, y) => x - y).join(",")},1`);
  for (const e of g.borders) if (b.fence[e.id] === 1 || b.cut[e.id] === 1) sol[2].push(`${e.corners.map(corner).sort((x, y) => x - y).join(",")},1`);
  return sol.map((s) => s.sort());
}
