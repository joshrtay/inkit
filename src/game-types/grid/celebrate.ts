// The moment a puzzle is solved: the board is squeezed and let go, and its ink bursts out of it in
// drops (from its own clues, shading and lines, in its own colors), leaving the puzzle gray; the
// drops gather into a hand-drawn check over the puzzle, which flies to the board's corner and
// stays there as a small stamp while the puzzle's color comes back. With reduced
// motion, or when a solved puzzle is opened again, just the stamp. Shared by the grid player
// (game.ts) and the painting player (figure.ts); styles in styles.css (.celebration, .solved-stamp).

const NS = "http://www.w3.org/2000/svg";
/** A check, in a 100 x 100 box, drawn like a quick pen stroke. */
const CHECK = "M14 54 C24 61 32 69 39 80 C52 57 68 36 88 16";

const svgEl = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

function checkSvg(className: string) {
  const s = svgEl("svg", { class: className, viewBox: "0 0 100 100", "aria-hidden": "true" });
  s.appendChild(svgEl("path", { d: CHECK, class: "check-ink", filter: "url(#pen)" }));
  return s;
}

/** The board's drawing (not the paper's icons), and the puzzle's own corner on it: the grid's
 *  frame, or the whole drawing (Three Coats' pieces). */
function boardOf(sheet: HTMLElement) {
  const board = [...sheet.querySelectorAll<SVGSVGElement>(":scope > svg")].find((s) => !s.classList.contains("celebration") && !s.classList.contains("solved-stamp"));
  const frame = board?.querySelector(".frame") ?? board;
  return { board, frame };
}

/** Where the stamp goes: the puzzle's top-right corner, in pixels from the paper's top left. */
function cornerOf(sheet: HTMLElement) {
  const { frame } = boardOf(sheet);
  const at = sheet.getBoundingClientRect();
  if (!frame || !at.width || !at.height) return null;
  const f = frame.getBoundingClientRect();
  return { x: f.right - at.left, y: f.top - at.top };
}

/** Put the solved check on the puzzle's top-right corner (no animation). Placed in percentages
 *  of the paper, so it stays on the corner as the board resizes. */
export function stamp(root: HTMLElement, landed = false) {
  const sheet = root.querySelector<HTMLElement>(".sheet");
  if (!sheet || sheet.querySelector(".solved-stamp")) return;
  const s = checkSvg(landed ? "solved-stamp landed" : "solved-stamp");
  const corner = cornerOf(sheet);
  if (corner) {
    const at = sheet.getBoundingClientRect();
    s.style.left = `${(corner.x / at.width) * 100}%`;
    s.style.top = `${(corner.y / at.height) * 100}%`;
  }
  s.setAttribute("role", "img");
  s.setAttribute("aria-label", "Solved");
  s.removeAttribute("aria-hidden");
  sheet.appendChild(s);
}

/** Take the check off again (the puzzle was changed after it was solved). */
export function unstamp(root: HTMLElement) {
  root.querySelectorAll(".solved-stamp, .celebration").forEach((e) => e.remove());
  root.querySelector(".sheet")?.classList.remove("solving", "drained");
}

/** Where the puzzle's ink is, in the board's pixels: its clues, shading, pearls and walls (a
 *  sample), or else anywhere on the grid. The drops burst from these. */
function inkSpots(board: SVGSVGElement, n: number) {
  const box = board.getBoundingClientRect();
  // the drawn line (panels, loops, fences) and the panel's symbols count as ink; the pale tracks
  // and an empty start circle don't
  const marks = [...board.querySelectorAll<SVGGraphicsElement>("text, .wash, circle:not(.panel-start), .panel-start.ink, .star, .wall, .given, .mark.pen, .river, [class^='panel-']:not(.panel-track):not(.panel-frame):not(.panel-start)")]
    .map((e) => e.getBoundingClientRect()).filter((r) => (r.width > 0 || r.height > 0) && r.width < box.width / 2 && r.height < box.height / 2);
  const frame = (board.querySelector(".frame") ?? board).getBoundingClientRect();
  return Array.from({ length: n }, (_, i) => {
    const r = marks.length && i % 3 !== 2 ? marks[Math.floor(Math.random() * marks.length)] : frame;
    return { x: r.left - box.left + Math.random() * r.width, y: r.top - box.top + Math.random() * r.height };
  });
}

/** The whole moment. `inks`: the puzzle's colors (its ink first). */
export function celebrate(root: HTMLElement, inks: string[]) {
  const sheet = root.querySelector<HTMLElement>(".sheet"), board = sheet && boardOf(sheet).board;
  if (!sheet || !board || matchMedia("(prefers-reduced-motion: reduce)").matches) { stamp(root); return; }
  unstamp(root);

  // 1. squeezed, then let go (CSS: .sheet.solving)
  sheet.classList.add("solving");

  // the stage: an overlay over the board, in its pixels
  const box = board.getBoundingClientRect(), at = sheet.getBoundingClientRect();
  const W = box.width, H = box.height, M = Math.min(W, H);
  const stage = svgEl("svg", { class: "celebration", viewBox: `0 0 ${W} ${H}`, width: W, height: H, "aria-hidden": "true" });
  stage.style.width = `${W}px`;
  stage.style.height = `${H}px`;
  stage.style.left = `${box.left - at.left}px`;
  stage.style.top = `${box.top - at.top}px`;
  sheet.appendChild(stage);

  // the check: centred, about half the board, in the stage's own pixels (a scaled path would
  // measure its dashes in the wrong units); it flies to the corner in a group of its own
  const size = M * 0.56, ox = (W - size) / 2, oy = (H - size) / 2;
  let k = 0;
  const d = CHECK.replace(/-?[\d.]+/g, (v) => String(+((k++ % 2 ? oy : ox) + (+v * size) / 100).toFixed(1)));
  const flier = svgEl("g", { class: "flier" });
  flier.style.transformOrigin = `${W / 2}px ${H / 2}px`;
  const big = svgEl("path", { d, class: "check-ink big", filter: "url(#pen)" });
  big.style.strokeWidth = `${(size * 0.07).toFixed(1)}px`;
  flier.appendChild(big);
  stage.appendChild(flier);
  const length = (big as SVGPathElement).getTotalLength();
  big.style.strokeDasharray = `${length}`;
  big.style.strokeDashoffset = `${length}`;

  // 2. the ink: drops of the puzzle's colors, from where its ink is, bursting outward
  const N = 52, cx = W / 2, cy = H / 2;
  const from = inkSpots(board, N);
  // the colors painted on the board join the ink
  const painted = [...board.querySelectorAll<SVGElement>(".wash, .star, circle:not(.panel-start), [class^='panel-']:not(.panel-track):not(.panel-start):not(.panel-frame), .panel-shape rect, .mark.pen")]
    .map((e) => (e.matches(".mark.pen") ? getComputedStyle(e).stroke : getComputedStyle(e).fill))
    .filter((c) => c && c !== "none" && !c.startsWith("url") && !/rgba?\(\s*(255,\s*255,\s*255|0,\s*0,\s*0)/.test(c));
  inks = [...new Set([...inks, ...painted])].slice(0, 6);
  const drops = from.map(({ x, y }, i) => {
    const r = i % 5 === 0 ? 2 + Math.random() * 1.5 : 3.5 + Math.random() * 5;
    const e = svgEl("circle", { r: r.toFixed(1), class: "ink-drop", cx: 0, cy: 0, filter: "url(#pen)" });
    // mostly the puzzle's ink, with its other colors mixed in
    e.style.setProperty("--c", inks[i % 3 === 0 ? 1 + (i % Math.max(1, inks.length - 1)) : 0] ?? inks[0]);
    e.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(0)`);
    stage.appendChild(e);
    const away = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 0.9, speed = (0.55 + Math.random() * 0.75) * M;
    const p = (big as SVGPathElement).getPointAtLength((i / (N - 1)) * length);
    return { e, r, x, y, fx: x, fy: y, vx: Math.cos(away) * speed, vy: Math.sin(away) * speed - M * 0.25, tx: p.x, ty: p.y, s: 0 };
  });

  const START = 275, BURST = 560, GATHER = 620, HOLD = 450, FLY = 650;
  const start = performance.now() + START;
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  let frame = 0, last = start;
  const timers: number[] = [];
  const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));

  // 3. as the ink leaves, the puzzle goes gray
  later(START, () => sheet.classList.add("drained"));

  const tick = (now: number) => {
    const t = now - start;
    if (t < 0) { frame = requestAnimationFrame(tick); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const q of drops) {
      if (t < BURST) {
        // flying out, slowing, falling a little
        const drag = Math.exp(-2.6 * dt);
        q.vx *= drag; q.vy = q.vy * drag + M * 1.4 * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.s = Math.min(1, t / 90);
        q.fx = q.x; q.fy = q.y;
      } else {
        // 4. pulled into the check, shrinking into its stroke as it draws
        const g = ease(Math.min(1, (t - BURST) / GATHER));
        q.x = q.fx + (q.tx - q.fx) * g; q.y = q.fy + (q.ty - q.fy) * g; q.s = 1 - 0.3 * g;
        q.e.style.opacity = String(1 - Math.max(0, (t - BURST - GATHER * 0.75) / (GATHER * 0.25)));
      }
      // stretched along the way they fly, like flung ink
      const v = t < BURST ? Math.hypot(q.vx, q.vy) / M : 0, turn = (Math.atan2(q.vy, q.vx) * 180) / Math.PI;
      q.e.setAttribute("transform", `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)}) rotate(${turn.toFixed(0)}) scale(${(q.s * (1 + Math.min(1.6, v * 0.9))).toFixed(2)} ${q.s.toFixed(2)})`);
    }
    if (t > BURST + GATHER * 0.45) big.classList.add("drawn");
    if (t < BURST + GATHER) frame = requestAnimationFrame(tick);
    else for (const q of drops) q.e.remove();
  };
  frame = requestAnimationFrame(tick);

  // 5. the check flies to the puzzle's corner and becomes the stamp; the color comes back
  later(START + BURST + GATHER + HOLD, () => {
    const corner = cornerOf(sheet), stamped = 38;   // the stamp's check: 54px less its padding
    const dx = (corner ? corner.x - (box.left - at.left) : W) - W / 2, dy = (corner ? corner.y - (box.top - at.top) : 0) - H / 2;
    flier.style.transform = `translate(${dx}px, ${dy}px) scale(${stamped / size})`;
    big.style.strokeWidth = `${(size * 0.11).toFixed(1)}px`;
    sheet.classList.remove("drained");
  });
  later(START + BURST + GATHER + HOLD + FLY, () => { stage.remove(); sheet.classList.remove("solving"); stamp(root, true); });

  // stop it all if the board goes away
  return () => { cancelAnimationFrame(frame); timers.forEach(clearTimeout); };
}
