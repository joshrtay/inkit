// Watercolor for one game board, sized to that board's own coordinates (boards use very
// different viewBox scales, so one shared filter would come out far too fine or coarse).
// Adds an SVG filter to the board and exposes it to the type's styles.css as a CSS
// variable on the board root:  filter: var(--wash)
//
// The look follows the washes in Inked (water, the memory vignettes): pigment pools
// darker at the edges, the middle is mottled with lighter blotches, faint brush streaks
// run through it, and the edge bleeds a little past the shape. Give the element a plain
// fill color; the filter does the rest.
const NS = "http://www.w3.org/2000/svg";
const SHOWN_WIDTH = 600;   // boards are shown about this many CSS pixels wide
let boards = 0;

export function addInk(svg: SVGSVGElement, root: HTMLElement) {
  const u = svg.viewBox.baseVal.width / SHOWN_WIDTH || 1;   // board units per pixel
  const id = `ink${++boards}-wash`;
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    parent.appendChild(n);
    return n;
  };
  const defs = el("defs", {}, svg);
  svg.prepend(defs);
  const f = el("filter", { id, x: "-15%", y: "-15%", width: "130%", height: "130%", "color-interpolation-filters": "sRGB" }, defs);
  const step = (tag: string, attrs: Record<string, string | number>) => el(tag, attrs, f);
  const darker = (k: number, a = 1) => `${k} 0 0 0 0  0 ${k} 0 0 0  0 0 ${k} 0 0  0 0 0 ${a} 0`;

  // noise: soft blotches, and long horizontal brush streaks
  step("feTurbulence", { type: "fractalNoise", baseFrequency: 0.025 / u, numOctaves: 3, seed: 3, result: "blot" });
  step("feTurbulence", { type: "fractalNoise", baseFrequency: `${0.006 / u} ${0.09 / u}`, numOctaves: 2, seed: 8, result: "streak" });
  // the paint bleeds a little past the shape
  step("feDisplacementMap", { in: "SourceGraphic", in2: "blot", scale: 5 * u, xChannelSelector: "R", yChannelSelector: "G", result: "shape" });
  // pigment pools along the edge: the shape minus a blurred, shrunken copy of itself
  step("feMorphology", { in: "shape", operator: "erode", radius: 4 * u, result: "core0" });
  step("feGaussianBlur", { in: "core0", stdDeviation: 3.5 * u, result: "core" });
  step("feComposite", { in: "shape", in2: "core", operator: "out", result: "rim0" });
  step("feColorMatrix", { in: "rim0", type: "matrix", values: darker(0.62), result: "rim" });
  // lighter blotches where the water pushed the pigment away
  step("feColorMatrix", { in: "blot", type: "matrix", values: "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.75 0 0 0 -0.33", result: "light0" });
  step("feComposite", { in: "light0", in2: "shape", operator: "in", result: "light" });
  // brush streaks a shade darker than the paint
  step("feColorMatrix", { in: "shape", type: "matrix", values: darker(0.8), result: "deep" });
  step("feColorMatrix", { in: "streak", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 -0.85", result: "streakA" });
  step("feComposite", { in: "deep", in2: "streakA", operator: "in", result: "streaks" });
  const merge = step("feMerge", { result: "paint" });
  for (const n of ["shape", "light", "streaks", "rim"]) el("feMergeNode", { in: n }, merge);
  step("feGaussianBlur", { in: "paint", stdDeviation: 0.5 * u });

  root.style.setProperty("--wash", `url(#${id})`);
}
