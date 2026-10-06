// Ink effects for one game board, sized to that board's own coordinates (boards use very
// different viewBox scales, so shared patterns would come out far too fine or too coarse).
// Adds hatching patterns and a watercolor-wash filter to the board's SVG and exposes them
// to its styles.css as CSS variables on the board root:
//   fill: var(--hatch)        light pen shading (one direction)
//   fill: var(--crosshatch)   dense pen shading, for solid/black cells
//   filter: var(--wash)       soft, bleeding watercolor edges
// Hatching is drawn in the board's --paper-ink (see global.css .hatch-ink).
const NS = "http://www.w3.org/2000/svg";
const SHOWN_WIDTH = 600;   // boards are shown about this many CSS pixels wide
let boards = 0;

export function addInk(svg: SVGSVGElement, root: HTMLElement) {
  const u = svg.viewBox.baseVal.width / SHOWN_WIDTH || 1;   // board units per pixel
  const id = `ink${++boards}`;
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    parent.appendChild(n);
    return n;
  };
  const defs = el("defs", {}, svg);
  svg.prepend(defs);

  const gap = 6 * u;
  const pattern = (name: string, lines: [number, number, number, number, number][]) => {
    const p = el("pattern", { id: `${id}-${name}`, width: gap, height: gap, patternUnits: "userSpaceOnUse", patternTransform: "rotate(-35)" }, defs);
    for (const [x1, y1, x2, y2, w] of lines) el("line", { class: "hatch-ink", x1, y1, x2, y2, "stroke-width": w * u }, p);
  };
  pattern("hatch", [[0, gap / 2, gap, gap / 2, 1.4]]);
  pattern("crosshatch", [[0, gap / 2, gap, gap / 2, 1.7], [gap / 2, 0, gap / 2, gap, 1.1]]);

  const wash = el("filter", { id: `${id}-wash`, x: "-8%", y: "-8%", width: "116%", height: "116%" }, defs);
  el("feTurbulence", { type: "fractalNoise", baseFrequency: `${0.02 / u} ${0.05 / u}`, numOctaves: 3, seed: 9, result: "noise" }, wash);
  el("feDisplacementMap", { in: "SourceGraphic", in2: "noise", scale: 7 * u, xChannelSelector: "R", yChannelSelector: "G", result: "bled" }, wash);
  el("feGaussianBlur", { in: "bled", stdDeviation: 0.8 * u, result: "soft" }, wash);
  const grain = el("feComponentTransfer", { in: "noise", result: "grain" }, wash);
  el("feFuncA", { type: "linear", slope: 0.6, intercept: 0.55 }, grain);
  el("feComposite", { in: "soft", in2: "grain", operator: "in" }, wash);

  root.style.setProperty("--hatch", `url(#${id}-hatch)`);
  root.style.setProperty("--crosshatch", `url(#${id}-crosshatch)`);
  root.style.setProperty("--wash", `url(#${id}-wash)`);
}
