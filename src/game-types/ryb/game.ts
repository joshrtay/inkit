// RYB game type: paint each piece red, yellow or blue so every clue holds.
// (Instance files write colors as 1 = red, 2 = yellow, 3 = blue; players only see colors.)
// Faithful to FLEB's RYB: a wrong color is rejected and costs a heart; correct pieces
// lock in and reveal any hidden clue. Plain TypeScript + SVG.
import type { MountGame } from "../../lib/game";
import type { Color, RybClientConfig } from "./types";

const NS = "http://www.w3.org/2000/svg";
const NAMES: Record<Color, string> = { 1: "red", 2: "yellow", 3: "blue" };
interface Saved { painted: (Color | 0)[]; hearts: number }

/** Average of the corners: where the clue dots go. */
const centre = (pts: number[][]) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
/** Radius of the largest circle around the centre that stays inside the piece. */
function room(pts: number[][], [cx, cy]: number[]) {
  let best = Infinity;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((cx - a[0]) * dx + (cy - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(cx - (a[0] + t * dx), cy - (a[1] + t * dy)));
  });
  return best;
}

export const createRyb = (config: RybClientConfig): MountGame => (root, host) => {
  const { pieces, solution, totals } = config;
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const svg = q<SVGSVGElement>("svg");
  svg.setAttribute("viewBox", config.viewBox);
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    parent.appendChild(n);
    return n;
  };

  const saved = host.load<Saved>();
  let painted: (Color | 0)[] = saved?.painted?.length === pieces.length ? saved.painted : pieces.map(() => 0);
  let hearts = saved?.hearts ?? config.hearts;
  let brush: Color = 1;
  let reported = false;
  const save = () => host.save({ painted, hearts } satisfies Saved);

  // ---- board ----
  const span = Number(config.viewBox.split(" ")[2]);
  const gPieces = el("g", {}), gDots = el("g", {});
  const shapeEls = pieces.map((p, i) =>
    el("polygon", { class: "piece", points: p.points.map((pt) => pt.join(",")).join(" "), "data-i": i }, gPieces));
  const dotGroups = pieces.map((p) => {
    const g = el("g", { class: "dots" }, gDots);
    const [cx, cy] = centre(p.points);
    const n = p.dots.length;
    if (!n) return g;
    const r = Math.min(span * 0.028, room(p.points, [cx, cy]) / (n > 1 ? 2.4 : 1.6));
    const ring = n > 1 ? r * (n > 4 ? 1.9 : 1.45) : 0;
    p.dots.forEach((c, k) => {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / n;
      const x = cx + ring * Math.cos(a), y = cy + ring * Math.sin(a);
      el("circle", { class: `dot c${c}`, cx: x, cy: y, r }, g);
    });
    return g;
  });

  // ---- palette, hearts, totals ----
  const swatches = [...root.querySelectorAll<HTMLButtonElement>("[data-color]")];
  const heartsEl = q<HTMLElement>("[data-hearts]");
  const status = q<HTMLElement>(".status");
  const totalsEl = q<HTMLElement>("[data-totals]");
  function pick(c: Color) {
    brush = c;
    swatches.forEach((s) => s.setAttribute("aria-pressed", String(Number(s.dataset.color) === c)));
    if (hearts > 0 && painted.some((x) => !x)) render();
  }
  swatches.forEach((s) => s.addEventListener("click", () => pick(Number(s.dataset.color) as Color)));
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, textarea")) return;
    const c = ({ r: 1, y: 2, b: 3, "1": 1, "2": 2, "3": 3 } as Record<string, Color>)[e.key.toLowerCase()];
    if (c) pick(c);
  };
  document.addEventListener("keydown", onKey);

  function render() {
    pieces.forEach((p, i) => {
      const c = painted[i];
      shapeEls[i].setAttribute("class", "piece" + (c ? ` c${c}` : ""));
      dotGroups[i].classList.toggle("hidden", p.hidden && !c);
    });
    heartsEl.replaceChildren(...Array.from({ length: config.hearts }, (_, k) => {
      const s = document.createElement("span");
      s.className = "heart" + (k < hearts ? "" : " lost");
      s.textContent = "♥";
      return s;
    }));
    heartsEl.setAttribute("aria-label", `${hearts} of ${config.hearts} hearts left`);
    if (totals) {
      totalsEl.replaceChildren(...([1, 2, 3] as Color[]).filter((c) => totals[c] > 0).map((c) => {
        const left = totals[c] - painted.filter((x) => x === c).length;
        const s = document.createElement("span");
        s.className = `total c${c}`;
        s.innerHTML = `<i></i>${left}`;
        s.title = `${left} ${NAMES[c]} left to place`;
        return s;
      }));
    }
    const done = painted.filter(Boolean).length;
    if (done === pieces.length) {
      status.className = "status good";
      status.textContent = "Every piece is painted. Solved!";
      if (!reported) { reported = true; host.solved({ mistakes: config.hearts - hearts }); }
    } else if (hearts > 0) {
      status.className = "status";
      status.textContent = `${pieces.length - done} of ${pieces.length} pieces left. Painting ${NAMES[brush]}.`;
    }
  }

  svg.addEventListener("click", (evt) => {
    const t = (evt.target as Element).closest<SVGPolygonElement>(".piece");
    if (!t || hearts <= 0) return;
    const i = Number(t.dataset.i);
    if (painted[i]) return;                            // correct pieces are locked in
    if (solution[i] === brush) {
      painted[i] = brush;
    } else {
      hearts--;
      t.classList.remove("wrong"); void t.getBoundingClientRect(); t.classList.add("wrong");
      if (hearts <= 0) {
        status.className = "status warn";
        status.textContent = "Out of hearts. Press Reset to try again.";
        save(); render(); return;
      }
      status.className = "status warn";
      status.textContent = `Not ${NAMES[brush]}. ${hearts} heart${hearts === 1 ? "" : "s"} left.`;
      save(); renderHearts(); return;
    }
    save(); render();
  });
  const renderHearts = () => { const s = status.textContent; const cls = status.className; render(); status.textContent = s; status.className = cls; };

  q<HTMLButtonElement>("[data-clear]").addEventListener("click", () => {
    painted = pieces.map(() => 0); hearts = config.hearts; reported = false;
    save(); render();
  });

  pick(1);
  render();
  return () => document.removeEventListener("keydown", onKey);
};

/** Mount every RYB board on the page (each carries its config and id as data attributes). */
export function mountAll(createHost: (id: string) => Parameters<MountGame>[1]) {
  document.querySelectorAll<HTMLElement>("[data-game-type=ryb]").forEach((root) => {
    createRyb(JSON.parse(root.dataset.config!) as RybClientConfig)(root, createHost(root.dataset.gameId!));
  });
}
