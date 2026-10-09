// The sketchpad's drawing as a picture for the reader: the SVG on screen, rasterized to a PNG on
// paper. A copy of an SVG drawn as an image keeps none of the page's stylesheets or CSS variables,
// and fetches no fonts, so the copy gets every element's computed look written onto it, and the
// filters it uses (the #pen wobble from root.tsx, the wash from ink.ts) copied into it. The
// writing is drawn onto the canvas afterwards, in the handwriting font the page has loaded.
import { pointOf, type Drawing } from "./model";
import { onDark, textSize } from "./draw";
import { fitBox, type Box } from "./view";

const NS = "http://www.w3.org/2000/svg";
/** The look of an element, as styles.css and sketchpad.css set it. */
const PROPS = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "opacity", "filter", "display", "visibility",
];

/** `url("http://…/g/<id>/draw#pen")` → `url(#pen)`: a reference within the copy. */
const localUrl = (v: string) => v.replace(/url\(\s*["']?[^"')]*#([^"')]+)["']?\s*\)/g, "url(#$1)");

/** A copy of the drawing's ink (`ink`, inside `svg`), its look written onto it, as SVG text
 *  `size` pixels across showing `box` (page units). Elements marked `data-export="skip"` are left out (the writing). */
export function standalone(svg: SVGSVGElement, size: number, box: Box): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const live = [svg, ...svg.querySelectorAll<SVGElement>("*")], copies = [copy, ...copy.querySelectorAll<SVGElement>("*")];
  const used = new Set<string>();
  live.forEach((el, i) => {
    const cs = getComputedStyle(el), to = copies[i];
    const style = PROPS.map((p) => {
      let v = cs.getPropertyValue(p);
      if (!v) return "";
      if (p === "filter") { v = localUrl(v); for (const m of v.matchAll(/url\(#([^)]+)\)/g)) used.add(m[1]); }
      return `${p}:${v}`;
    }).filter(Boolean).join(";");
    to.setAttribute("style", style);
    to.removeAttribute("class");
  });
  for (const el of copy.querySelectorAll('[data-export="skip"]')) el.remove();
  // the filters it uses, wherever on the page they're defined
  const defs = document.createElementNS(NS, "defs");
  for (const id of used) {
    const f = document.getElementById(id);
    if (f && !copy.querySelector(`[id="${id}"]`)) defs.appendChild(f.cloneNode(true));
  }
  copy.insertBefore(defs, copy.firstChild);
  copy.setAttribute("xmlns", NS);
  copy.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
  copy.setAttribute("width", String(size));
  copy.setAttribute("height", String(Math.round(size * box.h / box.w)));
  copy.removeAttribute("style");
  return new XMLSerializer().serializeToString(copy);
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => fail(new Error("The drawing couldn't be drawn")); img.src = src; });
}

/** The drawing as a PNG, `size` pixels across: the paper, the ink, then the writing; what's drawn
 *  with a margin (view.ts's fitBox: the first page when blank), wherever on the open paper it is.
 *  `svg` is the sketchpad's SVG; its writing is the drawing's text items. */
export async function exportPng(svg: SVGSVGElement, d: Drawing, size = 1600): Promise<Blob> {
  const box = fitBox(d), k = size / box.w;
  const img = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(standalone(svg, size, box))}`);
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = Math.round(box.h * k);
  const ctx = canvas.getContext("2d")!;
  const root = svg.closest<HTMLElement>(".grid-game") ?? svg;
  const css = getComputedStyle(root);
  ctx.fillStyle = css.getPropertyValue("--paper").trim() || "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // the writing, in the page's own handwriting font: in ink, or in the paper's colour on a dark square
  const sample = svg.querySelector<SVGTextElement>(".sp-text");
  const look = sample ? getComputedStyle(sample) : css;
  const fontAt = (px: number) => `${look.fontWeight || 700} ${px}px ${look.fontFamily || "cursive"}`;
  await document.fonts?.load(fontAt(textSize(d) * k)).catch(() => undefined);
  const ink = (sample && look.fill) || css.getPropertyValue("--paper-ink").trim() || "black";
  const paper = css.getPropertyValue("--paper").trim() || "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const it of d.items) {
    if (it.kind !== "text") continue;
    const p = pointOf(d.grid, it.at), size = textSize(d, it.small);
    ctx.font = fontAt(size * k);
    ctx.fillStyle = onDark(d, it) ? paper : ink;
    ctx.fillText(it.text, (p.x - box.x) * k, (p.y - box.y + size * 0.06) * k);
  }
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("The drawing couldn't be saved"))), "image/png"));
}
