// The puzzle guides (../src/guides) ready for the pages: text, plus every picture drawn as SVG
// here on the server, so the engine never ships to the browser for these pages.
import { makePuzzle, GENRE_NAMES, type GenreName } from "~site/engine/puzzle.ts";
import { emptyBoard, type Board, type GridSpec } from "~site/engine/types.ts";
import { guides, CATEGORIES } from "~site/guides/guides.ts";
import { miniBoard, miniPuzzle } from "~site/guides/board.ts";
import { pictureSvg } from "~site/game-types/grid/picture.ts";
import examples from "~site/guides/examples.json";
import type { Category, Guide } from "~site/guides/types.ts";
import { symbolOf } from "~site/engine/rules.ts";
import type { GuideDoc } from "./seo";

interface Example { name: string; file: string; spec: GridSpec; solution: Partial<Record<keyof Board, number[]>> }
const EXAMPLES = examples as unknown as Record<string, Example>;

/** The guides in browsing order: by category, then name. */
export const ORDER: GenreName[] = CATEGORIES.flatMap((c) =>
  GENRE_NAMES.filter((k) => guides[k].category === c).sort((a, b) => guides[a].name.localeCompare(guides[b].name)));

export const isKind = (k: string): k is GenreName => (GENRE_NAMES as string[]).includes(k);

/** The example's game on this site: instance files become "<genre>-<n>" when seeded. */
export const exampleGameId = (kind: GenreName) => `${kind}-${EXAMPLES[kind].file.match(/(\d+)\.json$/)![1]}`;

/** A guide picture: drawn with its name as aria-label, plus a <title>, which search engines read. */
function titled(svg: string, label: string) {
  const esc = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return svg.replace(/^(<svg[^>]*>)/, `$1<title>${esc}</title>`);
}

function examplePictures(kind: GenreName) {
  const ex = EXAMPLES[kind], p = makePuzzle(ex.spec), b = emptyBoard(p.grid);
  for (const [layer, values] of Object.entries(ex.solution)) (b[layer as keyof Board] as Uint8Array | Uint16Array).set(values!);
  const picture = (board: Board | null, label: string) => titled(pictureSvg(p, board, label), label);
  return { name: ex.name, puzzle: picture(null, `${guides[kind].name} example, ${ex.name}: the puzzle`), solution: picture(b, `${guides[kind].name} example, ${ex.name}: solved`) };
}

/** A picture's width over its height, from its viewBox. */
const ratioOf = (svg: string) => { const [, , w, h] = (svg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 1 1").split(" ").map(Number); return w / h; };

/** Everything the list page needs for one type. */
export function guideCard(kind: GenreName) {
  const g = guides[kind];
  return { kind, name: g.name, aka: g.aka ?? [], category: g.category as Category, summary: g.summary, ink: g.ink, thumb: examplePictures(kind).puzzle };
}

/** A guide's credit as one short line: "Invented by X (1989); popularized by Y. Note." */
export function creditLine(c: Guide["credit"]): string {
  const year = c.year ? ` (${c.year})` : "";
  const parts = [
    c.inventor && `Invented by ${c.inventor}${year}`,
    c.popularizer && (c.inventor ? `popularized by ${c.popularizer}` : `Popularized by ${c.popularizer}${year}`),
  ].filter(Boolean) as string[];
  const line = parts.join("; ");
  return [line && `${line}.`, c.note].filter(Boolean).join(" ");
}

/** The worked example's solution as text, a line per row, where its marks are on the cells
 *  (shading, digits and letters, colors); lines and cuts are only in the pictures. */
function solutionText(kind: GenreName): string[] | null {
  const ex = EXAMPLES[kind], [rows, cols] = ex.spec.size as [number, number], p = makePuzzle(ex.spec);
  const blocked = new Set(p.blocked);
  const row = (r: number, cell: (i: number) => string, sep: string) => Array.from({ length: cols }, (_, c) => (blocked.has(r * cols + c) ? "■" : cell(r * cols + c))).join(sep);
  const lines = (cell: (i: number) => string, sep = "") => Array.from({ length: rows }, (_, r) => row(r, cell, sep));
  const { shade, digit, color } = ex.solution;
  if (shade?.length === rows * cols) return lines((i) => (shade[i] === 1 ? "#" : "."));
  if (digit?.length === rows * cols) return lines((i) => (digit[i] ? symbolOf(p, digit[i]) : "."), " ");
  if (color?.length === rows * cols) return lines((i) => String(color[i] || "."), " ");
  return null;
}

/** A guide as text, for search engines and agents (lib/seo.ts): no pictures. */
export function guideDoc(kind: GenreName): GuideDoc {
  const g = guides[kind], ex = EXAMPLES[kind];
  return {
    kind, name: g.name, aka: g.aka ?? [], category: g.category, summary: g.summary, origin: g.origin,
    creditLine: creditLine(g.credit), credit: g.credit,
    rules: g.rules.map((r) => ({ text: r.text, pictures: r.pictures.map((m) => ({ ok: m.ok, note: m.note })) })),
    controls: g.controls,
    example: { name: ex.name, size: ex.spec.size as [number, number], givens: ex.spec.givens ?? [], solution: solutionText(kind) },
  };
}

/** Everything a type's page needs. */
export function guidePage(kind: GenreName) {
  const g = guides[kind], at = ORDER.indexOf(kind);
  const near = (k: GenreName | undefined) => (k ? { kind: k, name: guides[k].name } : null);
  return {
    kind, name: g.name, aka: g.aka ?? [], category: g.category as Category, summary: g.summary, origin: g.origin, credit: creditLine(g.credit), source: g.credit.source, controls: g.controls, ink: g.ink,
    rules: g.rules.map((r) => ({
      text: r.text,
      pictures: r.pictures.map((m) => {
        const p = miniPuzzle(kind, m);
        const label = `${m.ok ? "Right" : "Wrong"}: ${m.note}`, svg = titled(pictureSvg(p, miniBoard(p, m), label), label);
        return { ok: m.ok, note: m.note, svg, wide: ratioOf(svg) > 2 };
      }),
    })),
    example: examplePictures(kind),
    prev: near(ORDER[at - 1]), next: near(ORDER[at + 1]),
  };
}

export { CATEGORIES };

