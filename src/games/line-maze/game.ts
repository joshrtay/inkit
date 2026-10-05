// Number Line Maze: phase 1, draw lines so each number has that many; phase 2, walk them.
// Plain TypeScript + SVG. Puzzle data comes from puzzles/line-maze/generate.py.
import type { MountGame } from "../../lib/game";
import mainPuzzle from "./puzzle.json";

/** Puzzle data as written by puzzles/line-maze/generate.py. */
export interface LineMazePuzzle {
  w: number;
  h: number;
  start: number[];
  exit: number[];
  clues: number[][];
  hints: number[][][];
  solution: number[][][];
  path: number[][];
}

type Cell = [number, number];
type Phase = "draw" | "walk";
interface Saved { lines: string[] }

const P = 40, M = 34;                          // pitch between numbers, margin for arrows
const NS = "http://www.w3.org/2000/svg";
const STEPS: Record<string, Cell> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

/** Build a mountable game for one puzzle. */
export const createLineMaze = (puzzle: LineMazePuzzle): MountGame => (root, host) => {
  const { w: W, h: H, clues } = puzzle;
  const start = puzzle.start as Cell, exit = puzzle.exit as Cell;
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;

  const key = (a: Cell, b: Cell) => {          // canonical key for the line between two cells
    const [p, r] = a[0] * W + a[1] < b[0] * W + b[1] ? [a, b] : [b, a];
    return `${p[0]},${p[1]}-${r[0]},${r[1]}`;
  };
  const parse = (k: string) => k.split("-").map((s) => s.split(",").map(Number)) as [Cell, Cell];
  const same = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];
  const hints = new Set((puzzle.hints as [Cell, Cell][]).map(([a, b]) => key(a, b)));

  let lines = new Set([...(host.load<Saved>()?.lines ?? []), ...hints]);
  let history: [string, boolean][] = [];
  let phase: Phase = "draw";
  let trail: Cell[] = [start];
  let solved = false;
  const save = () => host.save({ lines: [...lines] } satisfies Saved);

  // ---- board ----
  const svg = q<SVGSVGElement>("svg");
  const vbW = (W - 1) * P + 2 * M + 30, vbH = (H - 1) * P + 2 * M + 10;
  svg.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
  q<HTMLElement>(".sheet").style.setProperty("--ratio", (vbW / vbH).toFixed(4));
  const cx = (c: number) => M + c * P, cy = (r: number) => M + 8 + r * P;
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    parent.appendChild(n);
    return n;
  };

  const gSegs = el("g", {}), gGaps = el("g", {}), gTrail = el("g", {}), gCells = el("g", {}), gTop = el("g", {});
  const sx = cx(start[1]), sy = cy(start[0]);
  el("path", { class: "arrow", d: `M${sx} ${sy - 33} V${sy - 19} M${sx - 5} ${sy - 25} L${sx} ${sy - 19} L${sx + 5} ${sy - 25}` }, gTop);
  const ex = cx(exit[1]), ey = cy(exit[0]);
  el("path", { class: "arrow", d: `M${ex + 18} ${ey} H${ex + 36} M${ex + 30} ${ey - 5} L${ex + 36} ${ey} L${ex + 30} ${ey + 5}` }, gTop);

  const cellEls: Element[][] = [];
  for (let r = 0; r < H; r++) {
    cellEls.push([]);
    for (let c = 0; c < W; c++) {
      const g = el("g", { class: "cell" }, gCells);
      el("circle", { cx: cx(c), cy: cy(r), r: 14 }, g);
      el("text", { x: cx(c), y: cy(r) + 1 }, g).textContent = String(clues[r][c]);
      cellEls[r].push(g);
    }
  }
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {   // tap targets between neighbors
    if (c + 1 < W) el("rect", { class: "gap", x: cx(c) + 13, y: cy(r) - 9, width: P - 26, height: 18, "data-k": key([r, c], [r, c + 1]) }, gGaps);
    if (r + 1 < H) el("rect", { class: "gap", x: cx(c) - 9, y: cy(r) + 13, width: 18, height: P - 26, "data-k": key([r, c], [r + 1, c]) }, gGaps);
  }

  // ---- phase 1: drawing ----
  const status = q<HTMLElement>(".status"), meter = q<HTMLElement>(".meter span");
  const goWalk = q<HTMLButtonElement>("[data-go-walk]");
  const drawTab = q<HTMLButtonElement>("[data-phase=draw]"), walkTab = q<HTMLButtonElement>("[data-phase=walk]");

  function degrees() {
    const d = Array.from({ length: H }, () => Array<number>(W).fill(0));
    for (const k of lines) { const [a, b] = parse(k); d[a[0]][a[1]]++; d[b[0]][b[1]]++; }
    return d;
  }
  function network(): "ok" | "loop" | "split" {   // must be one network with no loops
    const parent = Array.from({ length: W * H }, (_, i) => i);
    const find = (x: number): number => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
    for (const k of lines) {
      const [a, b] = parse(k);
      const x = find(a[0] * W + a[1]), y = find(b[0] * W + b[1]);
      if (x === y) return "loop";
      parent[x] = y;
    }
    const rootId = find(0);
    for (let i = 0; i < W * H; i++) if (find(i) !== rootId) return "split";
    return "ok";
  }

  function render() {
    gSegs.replaceChildren();
    for (const k of lines) {
      const [a, b] = parse(k);
      el("line", { class: "seg" + (hints.has(k) ? " hint" : ""), x1: cx(a[1]), y1: cy(a[0]), x2: cx(b[1]), y2: cy(b[0]) }, gSegs);
    }
    const d = degrees();
    let done = 0, over = 0;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const g = cellEls[r][c], need = clues[r][c];
      g.classList.toggle("done", d[r][c] === need);
      g.classList.toggle("over", d[r][c] > need);
      if (d[r][c] === need) done++;
      if (d[r][c] > need) over++;
    }
    meter.style.width = (100 * done / (W * H)).toFixed(1) + "%";
    if (phase !== "draw") return;
    const wasSolved = solved;
    status.className = "status";
    if (done === W * H) {
      const net = network();
      solved = net === "ok";
      if (solved) { status.className = "status good"; status.textContent = "Every number is satisfied. The maze is drawn."; }
      else {
        status.className = "status warn";
        status.textContent = net === "loop"
          ? "Every number is satisfied, but the lines make a loop. Loops aren't allowed."
          : "Every number is satisfied, but the lines split into separate pieces. They must join into one network.";
      }
    } else {
      solved = false;
      status.textContent = `${W * H - done} of ${W * H} numbers still need lines.` + (over ? ` ${over} ha${over === 1 ? "s" : "ve"} too many.` : "");
    }
    goWalk.hidden = !solved;
    walkTab.disabled = !solved;
    if (solved && !wasSolved) root.dispatchEvent(new CustomEvent("line-maze:drawn"));
  }

  function toggle(k: string, mode?: "add" | "remove") {
    if (hints.has(k)) return false;
    const has = lines.has(k);
    if ((mode === "add" && has) || (mode === "remove" && !has)) return false;
    history.push([k, has]);
    if (has) lines.delete(k); else lines.add(k);
    return true;
  }

  let drag: { last: Cell; mode: "add" | "remove" | null } | null = null;
  const cellAt = (evt: PointerEvent | MouseEvent): Cell | null => {
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const c = Math.round((p.x - M) / P), r = Math.round((p.y - M - 8) / P);
    if (r < 0 || r >= H || c < 0 || c >= W) return null;
    return Math.hypot(p.x - cx(c), p.y - cy(r)) > 17 ? null : [r, c];
  };
  svg.addEventListener("pointerdown", (evt) => {
    if (phase !== "draw") return;
    const gap = (evt.target as Element).closest<SVGElement>(".gap");
    if (gap) { if (toggle(gap.dataset.k!)) { render(); save(); } return; }
    const cell = cellAt(evt);
    if (!cell) return;
    drag = { last: cell, mode: null };
    try { svg.setPointerCapture(evt.pointerId); } catch { /* synthetic events */ }
  });
  svg.addEventListener("pointermove", (evt) => {
    if (!drag) return;
    const cell = cellAt(evt);
    if (!cell || same(cell, drag.last)) return;
    if (Math.abs(cell[0] - drag.last[0]) + Math.abs(cell[1] - drag.last[1]) === 1) {
      const k = key(drag.last, cell);
      drag.mode ??= lines.has(k) ? "remove" : "add";
      if (toggle(k, drag.mode)) { render(); save(); }
    }
    drag.last = cell;
  });
  const endDrag = () => { drag = null; };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  q<HTMLButtonElement>("[data-undo]").addEventListener("click", () => {
    if (phase === "walk") { if (trail.length > 1) { trail.pop(); renderWalk(); } return; }
    const last = history.pop();
    if (!last) return;
    const [k, had] = last;
    if (had) lines.add(k); else lines.delete(k);
    render(); save();
  });
  const clearBtn = q<HTMLButtonElement>("[data-clear]");
  let confirmClear = false;
  clearBtn.addEventListener("click", () => {
    if (phase === "walk") { trail = [start]; renderWalk(); return; }
    if (!confirmClear) {
      confirmClear = true; clearBtn.textContent = "Erase all lines?";
      setTimeout(() => { confirmClear = false; clearBtn.textContent = "Start over"; }, 3000);
      return;
    }
    confirmClear = false; clearBtn.textContent = "Start over";
    lines = new Set(hints); history = []; render(); save();
  });

  // ---- phase 2: walk the maze along the drawn lines ----
  const neighbors = (p: Cell) => Object.values(STEPS)
    .map(([dr, dc]): Cell => [p[0] + dr, p[1] + dc])
    .filter((n) => n[0] >= 0 && n[0] < H && n[1] >= 0 && n[1] < W && lines.has(key(p, n)));
  let token: Element | null = null;

  function renderWalk() {
    gTrail.replaceChildren();
    el("polyline", { class: "trail", points: trail.map(([r, c]) => `${cx(c)},${cy(r)}`).join(" ") }, gTrail);
    const here = trail[trail.length - 1];
    for (const row of cellEls) for (const g of row) g.classList.remove("reach");
    for (const n of neighbors(here)) cellEls[n[0]][n[1]].classList.add("reach");
    token?.remove();
    token = el("circle", { class: "token", cx: cx(here[1]), cy: cy(here[0]), r: 8 }, gTop);
    if (same(here, exit)) {
      status.className = "status good";
      status.textContent = `You're out! ${trail.length - 1} steps from start to exit.`;
      host.solved({ steps: trail.length - 1 });
    } else {
      status.className = "status";
      status.textContent = `${trail.length - 1} steps so far. Head for the arrow on the right edge.`;
    }
  }
  function moveTo(n: Cell) {
    const here = trail[trail.length - 1];
    if (same(here, exit)) return;
    const back = trail.findIndex((p) => same(p, n));
    if (back >= 0) { trail = trail.slice(0, back + 1); renderWalk(); return; }   // step back along the trail
    if (neighbors(here).some((x) => same(x, n))) { trail.push(n); renderWalk(); }
  }
  svg.addEventListener("click", (evt) => {
    if (phase !== "walk") return;
    const cell = cellAt(evt);
    if (cell) moveTo(cell);
  });
  const onKey = (evt: KeyboardEvent) => {
    if (phase !== "walk" || !(evt.key in STEPS)) return;
    evt.preventDefault();
    const here = trail[trail.length - 1], [dr, dc] = STEPS[evt.key];
    moveTo([here[0] + dr, here[1] + dc]);
  };
  document.addEventListener("keydown", onKey);

  function setPhase(p: Phase) {
    phase = p;
    drawTab.setAttribute("aria-pressed", String(p === "draw"));
    walkTab.setAttribute("aria-pressed", String(p === "walk"));
    root.dispatchEvent(new CustomEvent("line-maze:phase", { detail: p, bubbles: true }));
    svg.classList.toggle("walking", p === "walk");
    goWalk.hidden = p === "walk" || !solved;
    if (p === "walk") return renderWalk();
    gTrail.replaceChildren();
    token?.remove(); token = null;
    for (const row of cellEls) for (const g of row) g.classList.remove("reach");
    render();
  }
  drawTab.addEventListener("click", () => setPhase("draw"));
  walkTab.addEventListener("click", () => { if (solved) setPhase("walk"); });
  goWalk.addEventListener("click", () => setPhase("walk"));

  render();
  return () => document.removeEventListener("keydown", onKey);
};

/** The full 11 x 17 puzzle. */
export const mount = createLineMaze(mainPuzzle);
