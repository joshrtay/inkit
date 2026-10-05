// Number Line Maze. Numbers sit on the corners of a grid of squares; lines between
// them are walls. Phase 1: draw the walls so each number has that many touching it.
// Phase 2: walk through the open squares from the entrance to the exit.
// Plain TypeScript + SVG. Puzzle data comes from puzzles/line-maze/generate.py.
import type { MountGame } from "../../lib/game";
import mainPuzzle from "./puzzle.json";

type Pt = [number, number];                    // [row, col] of a number or a square
type Phase = "draw" | "walk";
interface Saved { walls: string[] }

/** Puzzle data as written by puzzles/line-maze/generate.py. */
export interface LineMazePuzzle {
  w: number;                // numbers across
  h: number;                // numbers down
  entry: number[];          // square under the entrance arrow (top edge)
  exit: number[];           // square beside the exit arrow (right edge)
  clues: number[][];
  border: number[][][];     // outer walls, drawn for the player
  gaps: number[][][];       // the two openings in the border
  hints: number[][][];      // extra walls drawn for the player
  solution: number[][][];
  path: number[][];         // squares from entrance to exit
}

const P = 40;                                   // distance between numbers
const ML = 22, MT = 46, MR = 52, MB = 22;       // margins (room for the arrows)
const NS = "http://www.w3.org/2000/svg";
const STEPS: Record<string, Pt> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

/** Build a mountable game for one puzzle. */
export const createLineMaze = (puzzle: LineMazePuzzle): MountGame => (root, host) => {
  const { w: W, h: H, clues } = puzzle;
  const CW = W - 1, CH = H - 1;                 // squares across / down
  const entry = puzzle.entry as Pt, exit = puzzle.exit as Pt;
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;

  const key = (a: Pt, b: Pt) => {               // canonical key for the wall between two numbers
    const [p, r] = a[0] * W + a[1] < b[0] * W + b[1] ? [a, b] : [b, a];
    return `${p[0]},${p[1]}-${r[0]},${r[1]}`;
  };
  const keys = (list: number[][][]) => new Set(list.map(([a, b]) => key(a as Pt, b as Pt)));
  const parse = (k: string) => k.split("-").map((s) => s.split(",").map(Number)) as [Pt, Pt];
  const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];
  const onBorder = (r: number, c: number) => r === 0 || r === H - 1 || c === 0 || c === W - 1;

  const border = keys(puzzle.border), hints = keys(puzzle.hints), gaps = keys(puzzle.gaps);
  const given = new Set([...border, ...hints]);

  let walls = new Set([...(host.load<Saved>()?.walls ?? []), ...given]);
  for (const g of gaps) walls.delete(g);
  let history: [string, boolean][] = [];
  let phase: Phase = "draw";
  let trail: Pt[] = [entry];
  let drawn = false;
  const save = () => host.save({ walls: [...walls] } satisfies Saved);

  // ---- board geometry ----
  const svg = q<SVGSVGElement>("svg");
  const vbW = ML + CW * P + MR, vbH = MT + CH * P + MB;
  svg.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
  q<HTMLElement>(".sheet").style.setProperty("--ratio", (vbW / vbH).toFixed(4));
  const vx = (c: number) => ML + c * P, vy = (r: number) => MT + r * P;          // a number's centre
  const sx = (c: number) => vx(c) + P / 2, sy = (r: number) => vy(r) + P / 2;    // a square's centre
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    parent.appendChild(n);
    return n;
  };

  const gSquares = el("g", {}), gWalls = el("g", {}), gGaps = el("g", {}), gTrail = el("g", {});
  const gNums = el("g", {}), gTop = el("g", {});

  // entrance arrow points down into the top gap; exit arrow points out of the right gap
  const ax = sx(entry[1]), ay = vy(0);
  el("path", { class: "arrow", d: `M${ax} ${ay - 36} V${ay - 10} M${ax - 6} ${ay - 17} L${ax} ${ay - 10} L${ax + 6} ${ay - 17}` }, gTop);
  const bx = vx(W - 1), by = sy(exit[0]);
  el("path", { class: "arrow", d: `M${bx + 10} ${by} H${bx + 38} M${bx + 31} ${by - 6} L${bx + 38} ${by} L${bx + 31} ${by + 6}` }, gTop);

  // squares (used in phase 2)
  const squareEls: Element[][] = [];
  for (let r = 0; r < CH; r++) {
    squareEls.push([]);
    for (let c = 0; c < CW; c++) {
      squareEls[r].push(el("rect", { class: "square", x: vx(c) + 3, y: vy(r) + 3, width: P - 6, height: P - 6, rx: 3 }, gSquares));
    }
  }
  // numbers
  const numEls: Element[][] = [];
  for (let r = 0; r < H; r++) {
    numEls.push([]);
    for (let c = 0; c < W; c++) {
      const g = el("g", { class: "num" }, gNums);
      el("circle", { cx: vx(c), cy: vy(r), r: 12 }, g);
      el("text", { x: vx(c), y: vy(r) + 1 }, g).textContent = String(clues[r][c]);
      numEls[r].push(g);
    }
  }
  // tap targets on every wall spot the player may change (not the border)
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (c + 1 < W && !(onBorder(r, c) && onBorder(r, c + 1) && (r === 0 || r === H - 1)))
      el("rect", { class: "gap", x: vx(c) + 12, y: vy(r) - 8, width: P - 24, height: 16, "data-k": key([r, c], [r, c + 1]) }, gGaps);
    if (r + 1 < H && !(c === 0 || c === W - 1))
      el("rect", { class: "gap", x: vx(c) - 8, y: vy(r) + 12, width: 16, height: P - 24, "data-k": key([r, c], [r + 1, c]) }, gGaps);
  }

  // ---- phase 1: drawing walls ----
  const status = q<HTMLElement>(".status"), meter = q<HTMLElement>(".meter span");
  const goWalk = q<HTMLButtonElement>("[data-go-walk]");
  const drawTab = q<HTMLButtonElement>("[data-phase=draw]"), walkTab = q<HTMLButtonElement>("[data-phase=walk]");

  function degrees() {
    const d = Array.from({ length: H }, () => Array<number>(W).fill(0));
    for (const k of walls) { const [a, b] = parse(k); d[a[0]][a[1]]++; d[b[0]][b[1]]++; }
    return d;
  }
  function structure(): "ok" | "loop" | "floating" {
    const parent = Array.from({ length: W * H }, (_, i) => i);
    const find = (x: number): number => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
    for (const k of walls) {
      const [a, b] = parse(k);
      const x = find(a[0] * W + a[1]), y = find(b[0] * W + b[1]);
      if (x === y) return "loop";
      parent[x] = y;
    }
    const touching = new Set<number>();
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (onBorder(r, c)) touching.add(find(r * W + c));
    for (const k of walls) { const [a] = parse(k); if (!touching.has(find(a[0] * W + a[1]))) return "floating"; }
    return "ok";
  }

  function render() {
    gWalls.replaceChildren();
    for (const k of walls) {
      const [a, b] = parse(k);
      const cls = border.has(k) ? "wall border" : hints.has(k) ? "wall hint" : "wall";
      el("line", { class: cls, x1: vx(a[1]), y1: vy(a[0]), x2: vx(b[1]), y2: vy(b[0]) }, gWalls);
    }
    const d = degrees();
    let done = 0, over = 0;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const g = numEls[r][c], need = clues[r][c];
      g.classList.toggle("done", d[r][c] === need);
      g.classList.toggle("over", d[r][c] > need);
      if (d[r][c] === need) done++;
      if (d[r][c] > need) over++;
    }
    meter.style.width = (100 * done / (W * H)).toFixed(1) + "%";
    if (phase !== "draw") return;
    status.className = "status";
    if (done === W * H) {
      const s = structure();
      drawn = s === "ok";
      if (drawn) { status.className = "status good"; status.textContent = "Every number is satisfied. The maze is built."; }
      else {
        status.className = "status warn";
        status.textContent = s === "loop"
          ? "Every number is satisfied, but some walls close into a loop. That would wall off part of the maze."
          : "Every number is satisfied, but some walls float free. Every wall has to connect to the border.";
      }
    } else {
      drawn = false;
      status.textContent = `${W * H - done} of ${W * H} numbers still need walls.` + (over ? ` ${over} ha${over === 1 ? "s" : "ve"} too many.` : "");
    }
    goWalk.hidden = !drawn;
    walkTab.disabled = !drawn;
  }

  function toggle(k: string, mode?: "add" | "remove") {
    if (given.has(k) || gaps.has(k)) return false;
    const has = walls.has(k);
    if ((mode === "add" && has) || (mode === "remove" && !has)) return false;
    history.push([k, has]);
    if (has) walls.delete(k); else walls.add(k);
    return true;
  }

  const toBoard = (evt: PointerEvent | MouseEvent) => {
    const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const numberAt = (evt: PointerEvent): Pt | null => {
    const p = toBoard(evt);
    const c = Math.round((p.x - ML) / P), r = Math.round((p.y - MT) / P);
    if (r < 0 || r >= H || c < 0 || c >= W) return null;
    return Math.hypot(p.x - vx(c), p.y - vy(r)) > 16 ? null : [r, c];
  };
  const squareAt = (evt: MouseEvent): Pt | null => {
    const p = toBoard(evt);
    const c = Math.floor((p.x - ML) / P), r = Math.floor((p.y - MT) / P);
    return r < 0 || r >= CH || c < 0 || c >= CW ? null : [r, c];
  };

  let drag: { last: Pt; mode: "add" | "remove" | null } | null = null;
  svg.addEventListener("pointerdown", (evt) => {
    if (phase !== "draw") return;
    const gap = (evt.target as Element).closest<SVGElement>(".gap");
    if (gap) { if (toggle(gap.dataset.k!)) { render(); save(); } return; }
    const n = numberAt(evt);
    if (!n) return;
    drag = { last: n, mode: null };
    try { svg.setPointerCapture(evt.pointerId); } catch { /* synthetic events */ }
  });
  svg.addEventListener("pointermove", (evt) => {
    if (!drag) return;
    const n = numberAt(evt);
    if (!n || same(n, drag.last)) return;
    if (Math.abs(n[0] - drag.last[0]) + Math.abs(n[1] - drag.last[1]) === 1) {
      const k = key(drag.last, n);
      drag.mode ??= walls.has(k) ? "remove" : "add";
      if (toggle(k, drag.mode)) { render(); save(); }
    }
    drag.last = n;
  });
  const endDrag = () => { drag = null; };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  q<HTMLButtonElement>("[data-undo]").addEventListener("click", () => {
    if (phase === "walk") { if (trail.length > 1) { trail.pop(); renderWalk(); } return; }
    const last = history.pop();
    if (!last) return;
    const [k, had] = last;
    if (had) walls.add(k); else walls.delete(k);
    render(); save();
  });
  const clearBtn = q<HTMLButtonElement>("[data-clear]");
  let confirmClear = false;
  clearBtn.addEventListener("click", () => {
    if (phase === "walk") { trail = [entry]; renderWalk(); return; }
    if (!confirmClear) {
      confirmClear = true; clearBtn.textContent = "Erase all walls?";
      setTimeout(() => { confirmClear = false; clearBtn.textContent = "Start over"; }, 3000);
      return;
    }
    confirmClear = false; clearBtn.textContent = "Start over";
    walls = new Set(given); history = []; render(); save();
  });

  // ---- phase 2: walk through the open squares ----
  function wallBetween(a: Pt, b: Pt) {          // the wall that separates neighbouring squares
    const [p, r] = a[0] * CW + a[1] < b[0] * CW + b[1] ? [a, b] : [b, a];
    return p[0] === r[0]
      ? key([p[0], r[1]], [p[0] + 1, r[1]])     // side by side: vertical wall
      : key([r[0], p[1]], [r[0], p[1] + 1]);    // stacked: horizontal wall
  }
  const openNeighbors = (s: Pt) => Object.values(STEPS)
    .map(([dr, dc]): Pt => [s[0] + dr, s[1] + dc])
    .filter((n) => n[0] >= 0 && n[0] < CH && n[1] >= 0 && n[1] < CW && !walls.has(wallBetween(s, n)));
  let token: Element | null = null;

  function renderWalk() {
    gTrail.replaceChildren();
    const pts = [[sx(entry[1]), vy(0) - 8], ...trail.map(([r, c]) => [sx(c), sy(r)])];
    const here = trail[trail.length - 1];
    const out = same(here, exit);
    if (out) pts.push([vx(W - 1) + 14, sy(exit[0])]);
    el("polyline", { class: "trail", points: pts.map((p) => p.join(",")).join(" ") }, gTrail);
    for (const row of squareEls) for (const s of row) s.classList.remove("reach");
    if (!out) for (const n of openNeighbors(here)) squareEls[n[0]][n[1]].classList.add("reach");
    token?.remove();
    token = el("circle", { class: "token", cx: out ? vx(W - 1) + 14 : sx(here[1]), cy: sy(here[0]), r: 9 }, gTop);
    if (out) {
      status.className = "status good";
      status.textContent = `You're out! ${trail.length} squares from entrance to exit.`;
      host.solved({ squares: trail.length });
    } else {
      status.className = "status";
      status.textContent = `${trail.length} square${trail.length === 1 ? "" : "s"} so far. Head for the arrow on the right edge.`;
    }
  }
  function moveTo(n: Pt) {
    const here = trail[trail.length - 1];
    if (same(here, exit)) return;
    const back = trail.findIndex((p) => same(p, n));
    if (back >= 0) { trail = trail.slice(0, back + 1); renderWalk(); return; }   // step back along the trail
    if (openNeighbors(here).some((x) => same(x, n))) { trail.push(n); renderWalk(); }
  }
  svg.addEventListener("click", (evt) => {
    if (phase !== "walk") return;
    const s = squareAt(evt);
    if (s) moveTo(s);
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
    goWalk.hidden = p === "walk" || !drawn;
    if (p === "walk") return renderWalk();
    gTrail.replaceChildren();
    token?.remove(); token = null;
    for (const row of squareEls) for (const s of row) s.classList.remove("reach");
    render();
  }
  drawTab.addEventListener("click", () => setPhase("draw"));
  walkTab.addEventListener("click", () => { if (drawn) setPhase("walk"); });
  goWalk.addEventListener("click", () => setPhase("walk"));

  render();
  return () => document.removeEventListener("keydown", onKey);
};

/** The full 11 x 17 puzzle. */
export const mount = createLineMaze(mainPuzzle);
