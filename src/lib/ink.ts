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

type Step = [tag: string, attrs: Record<string, string | number>, children?: Step[]];

/** The watercolour filter's steps, for a board drawn at `u` board units per pixel. */
function washSteps(u: number): Step[] {
  const darker = (k: number, a = 1) => `${k} 0 0 0 0  0 ${k} 0 0 0  0 0 ${k} 0 0  0 0 0 ${a} 0`;
  return [
    // noise: soft blotches, and long horizontal brush streaks
    ["feTurbulence", { type: "fractalNoise", baseFrequency: 0.025 / u, numOctaves: 3, seed: 3, result: "blot" }],
    ["feTurbulence", { type: "fractalNoise", baseFrequency: `${0.006 / u} ${0.09 / u}`, numOctaves: 2, seed: 8, result: "streak" }],
    // the paint bleeds a little past the shape
    ["feDisplacementMap", { in: "SourceGraphic", in2: "blot", scale: 5 * u, xChannelSelector: "R", yChannelSelector: "G", result: "shape" }],
    // pigment pools along the edge: the shape minus a blurred, shrunken copy of itself
    ["feMorphology", { in: "shape", operator: "erode", radius: 4 * u, result: "core0" }],
    ["feGaussianBlur", { in: "core0", stdDeviation: 3.5 * u, result: "core" }],
    ["feComposite", { in: "shape", in2: "core", operator: "out", result: "rim0" }],
    ["feColorMatrix", { in: "rim0", type: "matrix", values: darker(0.62), result: "rim" }],
    // lighter blotches where the water pushed the pigment away
    ["feColorMatrix", { in: "blot", type: "matrix", values: "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.75 0 0 0 -0.33", result: "light0" }],
    ["feComposite", { in: "light0", in2: "shape", operator: "in", result: "light" }],
    // brush streaks a shade darker than the paint
    ["feColorMatrix", { in: "shape", type: "matrix", values: darker(0.8), result: "deep" }],
    ["feColorMatrix", { in: "streak", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 -0.85", result: "streakA" }],
    ["feComposite", { in: "deep", in2: "streakA", operator: "in", result: "streaks" }],
    ["feMerge", { result: "paint" }, ["shape", "light", "streaks", "rim"].map((n): Step => ["feMergeNode", { in: n }])],
    ["feGaussianBlur", { in: "paint", stdDeviation: 0.5 * u }],
  ];
}
const filterAttrs = (id: string) => ({ id, x: "-15%", y: "-15%", width: "130%", height: "130%", "color-interpolation-filters": "sRGB" });

export function addInk(svg: SVGSVGElement, root: HTMLElement) {
  const vb = svg.viewBox.baseVal;
  const u = vb.width / SHOWN_WIDTH || 1;   // board units per pixel
  root.style.setProperty("--ratio", (vb.width / vb.height).toFixed(4));   // sizes the paper (global.css .sheet)
  const id = `ink${++boards}-wash`;
  const build = ([tag, attrs, children]: Step, parent: Element) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, String(attrs[k]));
    parent.appendChild(n);
    children?.forEach((c) => build(c, n));
    return n;
  };
  const defs = build(["defs", {}], svg);
  svg.insertBefore(defs, svg.firstChild);
  build(["filter", filterAttrs(id), washSteps(u)], defs);
  root.style.setProperty("--wash", `url(#${id})`);
}

/** The same filter as markup, for still pictures (picture.ts): a board `width` units wide. Pictures
 *  of the same width share an id, which is harmless since their filters are identical. */
export function washDefs(width: number): { id: string; svg: string } {
  const u = width / SHOWN_WIDTH || 1, id = `wash-${Math.round(u * 1000)}`;
  const esc = (v: string | number) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const out = ([tag, attrs, children]: Step): string =>
    `<${tag}${Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("")}>${(children ?? []).map(out).join("")}</${tag}>`;
  return { id, svg: `<defs>${out(["filter", filterAttrs(id), washSteps(u)])}</defs>` };
}
