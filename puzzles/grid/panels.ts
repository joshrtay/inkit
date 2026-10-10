// Making a panel (src/engine/panel.ts) with exactly one solution, for puzzles/grid/new.ts:
// 1. clingo draws a random winding line from the start to the end, 2. every group of symbols true
// of that line goes in a pool (a dot, a gap, a square, a triangle; a pair of stars; a region's
// shapes; an eraser with what it cancels), 3. groups that rule out the other lines are added
// until only one is left, 4. groups that aren't needed are taken out again.
import { makePuzzle, check } from "../../src/engine/puzzle.ts";
import { program, boardOf, solve } from "../../src/engine/solve.ts";
import { regionsOf } from "../../src/engine/derive.ts";
import { mirrorCorner, type Symmetry } from "../../src/engine/panel.ts";
import type { Board, Given, GridSpec, SymbolColor } from "../../src/engine/types.ts";

type RC = [number, number];
type Group = Given[];
const debug = (m: string) => { if (process.env.DEBUG) console.error(`panel: ${m}`); };

/** `mix`: which symbols the panel is made of: dots, squares, stars, starsquare (a star paired with a
 *  square of its colour, among squares), triangles, shapes (now and then tilted, or with a hollow
 *  shape), solid (shapes never tilted or hollow), tilted (shapes that all turn), hollow (shapes,
 *  none tilted, with a hollow one wherever two overlap), erasers (with something to cancel: squares
 *  when alone, else the mix's other symbols, a dot off the line included; put erasers first, as in
 *  "erasers+triangles"), symmetry (two mirrored lines, with dots) or rotation (two lines, one the
 *  other turned halfway round, with dots), or several joined with "+" ("squares+stars"): every
 *  part's symbols go in the pool, one symbol to a cell. */
export const PANEL_MIXES = ["dots", "squares", "stars", "starsquare", "triangles", "shapes", "solid", "tilted", "hollow", "erasers", "symmetry", "rotation"] as const;
export async function makePanel(mix: string, rows: number, cols: number, rand: () => number): Promise<GridSpec | null> {
  const parts = mix.split("+");
  for (const m of parts) if (!(PANEL_MIXES as readonly string[]).includes(m)) throw new Error(`no panel mix "${m}" (${PANEL_MIXES.join(", ")})`);
  const clingo = await import("clingo-wasm");
  const shuffle = <T,>(xs: T[]) => { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; };
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const sym: Symmetry | null = parts.includes("symmetry") ? "left-right" : parts.includes("rotation") ? "turn" : null;

  // where the line starts and ends: the bottom-left corner to the top-right one, as panels often do
  // (or somewhere else on the edge, now and then)
  const base: GridSpec = { genre: "panel", size: [rows, cols], givens: [], ...(sym ? { rules: [{ rule: "panel-line", symmetry: sym }] } : {}) };
  const probe = makePuzzle({ ...base, givens: [] }, { unfinished: true }), g = probe.grid;
  const start: RC = sym ? [rows, 0] : pick([[rows, 0], [rows, 0], [Math.floor(rows / 2), Math.floor(cols / 2)]] as RC[]);
  const end: RC = sym ? [0, 0] : pick([[0, cols], [0, cols], [0, Math.floor(cols / 2)]] as RC[]);
  base.givens!.push({ at: "corner", corner: start, kind: "start", ...(sym ? { color: "blue" as const } : {}) }, { at: "corner", corner: end, kind: "end" });
  if (sym) {
    const m = (rc: RC): RC => g.cornerRC(mirrorCorner(g, g.corner(...rc), sym)) as RC;
    base.givens!.push({ at: "corner", corner: m(start), kind: "start", color: "yellow" }, { at: "corner", corner: m(end), kind: "end" });
  }

  // 1. a long random line
  const minLength = Math.round((rows + 1) * (cols + 1) * (sym ? 0.35 : 0.6));
  const p0 = makePuzzle(base);
  const res = await clingo.run(`${program(p0)}\n:- #count{B: fence(B)} < ${minLength}.`, 1, ["--rand-freq=1", `--seed=${Math.floor(rand() * 1e6)}`, "--sign-def=rnd"]) as { Call?: { Witnesses?: { Value: string[] }[] }[] };
  const w = res.Call?.[0]?.Witnesses?.[0];
  if (!w) { debug("no line that long"); return null; }
  const target = boardOf(p0, w.Value);

  // 2. the pool
  const reg = regionsOf(p0, target);
  const rc = (i: number): RC => g.rc(i) as RC;
  const cornerXY = (v: number): RC => g.cornerRC(v) as RC;
  const visited = (v: number) => g.cornerBorders[v].some((e) => target.fence[e] === 1);
  const pool: Group[] = [];
  const free = new Set(Array.from({ length: g.cellCount }, (_, i) => i));   // a cell holds one symbol
  const take = (i: number) => free.delete(i);
  const cornerCellsOf = (v: number) => { const [r, c] = g.cornerRC(v); return [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]].filter(([y, x]) => y >= 0 && x >= 0 && y < rows && x < cols).map(([y, x]) => g.cell(y, x)); };
  const dots = () => {
    for (let v = 0; v < g.cornerCount; v++) if (visited(v) && !p0.cornerGivens.has(v) && rand() < 0.6) pool.push([{ at: "corner", corner: cornerXY(v), kind: "hexagon" }]);
    for (const e of g.borders) if (target.fence[e.id] === 1 && rand() < 0.4) pool.push([{ at: "line", corners: e.corners.map(cornerXY) as [RC, RC], kind: "hexagon" }]);
  };
  let gapped = false;
  const gaps = () => { if (gapped) return; gapped = true; for (const e of g.borders) if (target.fence[e.id] !== 1) pool.push([{ at: "line", corners: e.corners.map(cornerXY) as [RC, RC], kind: "gap" }]); };
  // each region's square color: neighbouring regions differ (black and white, more colors if needed)
  const tone: SymbolColor[] = [], palette: SymbolColor[] = rand() < 0.5 ? ["black", "white", "blue", "red"] : ["white", "black", "blue", "red"];
  reg.cells.forEach((cs, k) => {
    const near = new Set(cs.flatMap((i) => g.cellLinks[i].map((l) => reg.of[g.links[l].cells.find((x) => x !== i)!])).filter((j) => j !== k && j < k).map((j) => tone[j]));
    tone[k] = palette.find((c) => !near.has(c))!;
  });
  const squares = (cells = [...free]) => { for (const i of cells) pool.push([{ at: "cell", cell: rc(i), kind: "square", color: tone[reg.of[i]] }]); };
  const triangles = () => {
    for (const i of [...free]) {
      const n = g.cellBorders[i].filter((e) => target.fence[e] === 1).length;
      if (n >= 1 && n <= 3) pool.push([{ at: "cell", cell: rc(i), kind: "triangle", value: n }]);
    }
  };

  let first: Group | null = null;   // a group the puzzle starts with (an eraser)
  for (const mix of parts) {
  if (mix === "dots") { dots(); gaps(); }
  else if (mix === "symmetry" || mix === "rotation") {
    const color = new Map<number, "blue" | "yellow">();
    // which line each corner is on
    for (const x of base.givens!) if (x.kind === "start") {
      const s = g.corner(...x.corner), stack = [s]; color.set(s, x.color!);
      while (stack.length) { const u = stack.pop()!; for (const e of g.cornerBorders[u]) if (target.fence[e] === 1) for (const v of g.borders[e].corners) if (!color.has(v)) { color.set(v, x.color!); stack.push(v); } }
    }
    for (let v = 0; v < g.cornerCount; v++) if (visited(v) && !p0.cornerGivens.has(v) && rand() < 0.5) pool.push([{ at: "corner", corner: cornerXY(v), kind: "hexagon", ...(rand() < 0.4 ? { color: color.get(v) } : {}) }]);
    gaps();
  }
  else if (mix === "squares") squares();
  else if (mix === "triangles") triangles();
  else if (mix === "stars") {
    // pairs of stars of one color in a region; a region's pairs have different colors
    // (with squares about, no red: a red square would count as one of a red pair's)
    const colors: SymbolColor[] = parts.includes("squares") || parts.includes("erasers") ? ["orange", "purple", "green"] : ["orange", "purple", "green", "red"];
    reg.cells.forEach((cs) => {
      const cells = shuffle([...cs]);
      for (let k = 0; k + 1 < cells.length && k / 2 < colors.length; k += 2) {
        const c = colors[k / 2];
        pool.push([{ at: "cell", cell: rc(cells[k]), kind: "star", color: c }, { at: "cell", cell: rc(cells[k + 1]), kind: "star", color: c }]);
      }
    });
  }
  else if (mix === "starsquare") {
    // a region holds either a star with one square of its colour, or squares (never both: a second
    // square of the star's colour would spoil the pair)
    reg.cells.forEach((cs, k) => {
      const cells = shuffle([...cs].filter((i) => free.has(i)));
      if (cells.length >= 2 && rand() < 0.6) {
        pool.push([{ at: "cell", cell: rc(cells[0]), kind: "star", color: tone[k] }, { at: "cell", cell: rc(cells[1]), kind: "square", color: tone[k] }]);
        for (const i of cs) take(i);
      } else { squares(cells); for (const i of cells) take(i); }
    });
  }
  else if (mix === "shapes" || mix === "solid" || mix === "hollow" || mix === "tilted") {
    // each region cut into random pieces of 1 to 4 squares; the group is all of them, each drawn in
    // one of the region's squares; now and then (always for "hollow", never for "solid") a piece
    // reaches into its neighbour's and a hollow square takes the overlap back
    const tilt = mix === "shapes" ? 0.3 : mix === "tilted" ? 1 : 0, overlap = mix === "shapes" ? 0.35 : mix === "hollow" ? 1 : 0;
    reg.cells.forEach((cs) => {
      if (cs.length > 9) return;
      const left = new Set(cs), pieces: number[][] = [];
      while (left.size) {
        const s = shuffle([...left])[0], piece = [s]; left.delete(s);
        const size = 1 + Math.floor(rand() * 4);
        while (piece.length < size) {
          const next = shuffle(piece.flatMap((i) => g.cellLinks[i].map((l) => g.links[l].cells.find((x) => x !== i)!)).filter((j) => left.has(j)))[0];
          if (next === undefined) break;
          piece.push(next); left.delete(next);
        }
        pieces.push(piece);
      }
      if (pieces.length > cs.length) return;
      const where = shuffle([...cs]);
      const rel = (piece: number[]): RC[] => { const pts = piece.map(rc), r0 = Math.min(...pts.map((x) => x[0])), c0 = Math.min(...pts.map((x) => x[1])); return pts.map(([r, c]) => [r - r0, c - c0]); };
      // a tilted piece is drawn a quarter turn from how it lies, so it has to be turned to fit
      const turned = (cs: RC[]): RC[] => { const t = cs.map(([r, c]) => [c, -r] as RC), r0 = Math.min(...t.map((x) => x[0])), c0 = Math.min(...t.map((x) => x[1])); return t.map(([r, c]) => [r - r0, c - c0]); };
      const group: Group = pieces.map((piece, k) => ({ at: "cell", cell: rc(where[k]), kind: "shape", value: mix === "tilted" ? turned(rel(piece)) : rel(piece), ...(rand() < tilt ? { rotate: true } : {}) }));
      // the overlap: grow the first piece by a square of the second, and cancel that square
      if (pieces.length >= 2 && where.length > pieces.length && rand() < overlap) {
        const [a, b] = pieces, extra = b.find((j) => a.some((i) => g.borderBetween(i, j) >= 0));
        if (extra !== undefined) {
          (group[0] as { value: RC[] }).value = rel([...a, extra]);
          group.push({ at: "cell", cell: rc(where[pieces.length]), kind: "shape", value: [[0, 0]], negative: true });
        }
      }
      pool.push(group);
    });
  }
  else if (mix === "erasers") {
    // an eraser with something it has to cancel, in one region: a square of the wrong color (with
    // one of the right color), a lone star, or a triangle that's wrong
    const k = reg.cells.findIndex((cs) => cs.length >= 3);
    if (k < 0) return null;
    const cells = shuffle([...reg.cells[k]]), [e, a, b] = cells;
    const n = g.cellBorders[a].filter((x) => target.fence[x] === 1).length;
    // what it cancels: one of the mix's other symbols (squares when it's alone)
    const others = parts.filter((m) => m !== "erasers");
    const can = (["square", "star", "triangle", "dot"] as const).filter((x) => others.includes(`${x}s`));
    const kind = pick(can.length ? can : others.length ? ["square", "star", "triangle"] as const : ["square"] as const);
    if (kind === "dot") {
      // a dot the line can't pass: on a corner inside the region, off the line
      const inside: Given[] = [
        ...Array.from({ length: g.cornerCount }, (_, v) => v).filter((v) => !visited(v) && !p0.cornerGivens.has(v) && cornerCellsOf(v).every((i) => reg.of[i] === k))
          .map((v): Given => ({ at: "corner", corner: cornerXY(v), kind: "hexagon" })),
        ...g.borders.filter((x) => target.fence[x.id] !== 1 && x.cells.every((i) => i < 0 || reg.of[i] === k))
          .map((x): Given => ({ at: "line", corners: x.corners.map(cornerXY) as [RC, RC], kind: "hexagon" })),
      ];
      if (!inside.length) return null;
      first = [{ at: "cell", cell: rc(e), kind: "eraser" }, pick(inside)];
    } else
    first = kind === "square"
      ? [{ at: "cell", cell: rc(e), kind: "eraser" }, { at: "cell", cell: rc(a), kind: "square", color: tone[k] }, { at: "cell", cell: rc(b), kind: "square", color: tone[k] === "black" ? "white" : "black" }]
      : kind === "star" ? [{ at: "cell", cell: rc(e), kind: "eraser" }, { at: "cell", cell: rc(a), kind: "star", color: "orange" }]
      : [{ at: "cell", cell: rc(e), kind: "eraser" }, { at: "cell", cell: rc(a), kind: "triangle", value: pick([1, 2, 3].filter((x) => x !== n)) }];
    for (const x of first) if (x.at === "cell") take(g.cell(...x.cell));
    // the rest of the panel (none in the eraser's region, which must need it): the mix's other
    // symbols, or squares on about half the cells when it's alone
    for (const i of [...free]) if (reg.of[i] === k) take(i);
    if (!others.length) {
      const cs = shuffle([...free]).slice(0, Math.ceil(free.size / 2));
      squares(cs);
      for (const i of cs) take(i);
    }
  }
  }
  // gaps for every type: symbols in cells can't tell apart lines that cut out the same regions
  // (one hugging the edge a different way)
  if (parts.some((m) => m !== "dots" && m !== "symmetry")) gaps();

  // 3. every symbol group at once (one symbol to a cell), then gaps until the target is the only
  // line, 4. then take out what isn't needed, gaps first, so the symbols do the work
  const spec: GridSpec = { ...base, givens: [...base.givens!, ...(first ?? [])] };
  const key = (b: Board) => [...b.fence].map((x) => (x === 1 ? 1 : 0)).join("");
  const tk = key(target);
  const isGap = (grp: Group) => grp[0].kind === "gap";
  const busy = new Set(spec.givens!.flatMap((x) => (x.at === "cell" ? [String(x.cell)] : [])));
  const added: Group[] = [];
  for (const grp of shuffle(pool.filter((grp) => !isGap(grp)))) {
    if (grp.some((x) => x.at === "cell" && busy.has(String(x.cell)))) continue;
    for (const x of grp) if (x.at === "cell") busy.add(String(x.cell));
    added.push(grp); spec.givens!.push(...grp);
  }
  if (check(makePuzzle(spec), target).length) { debug("the symbols don't fit the line"); return null; }
  for (let round = 0; round < 150; round++) {
    const sols = await solve(makePuzzle(spec), 2);
    const alt = sols.find((s) => key(s) !== tk);
    if (!alt) break;
    const useful = shuffle(pool.filter((grp) => isGap(grp) && !added.includes(grp))).find((grp) => check(makePuzzle({ ...spec, givens: [...spec.givens!, ...grp] }), alt).length > 0);
    if (!useful) { debug(`no gap rules out another line (after ${added.length} groups)`); return null; }
    added.push(useful); spec.givens!.push(...useful);
  }
  if ((await solve(makePuzzle(spec), 2)).length !== 1) return null;
  const order = shuffle([...added]).sort((x, y) => Number(isGap(y)) - Number(isGap(x)));
  for (const grp of order) {
    const fewer = { ...spec, givens: spec.givens!.filter((x) => !grp.includes(x)) };
    if ((await solve(makePuzzle(fewer), 2)).length === 1) spec.givens = fewer.givens;
  }
  return spec;
}
