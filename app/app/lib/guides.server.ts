// The puzzle guides (../src/guides) ready for the pages: text, plus every picture drawn as SVG
// here on the server, so the engine never ships to the browser for these pages.
import { makePuzzle, GENRE_NAMES, type GenreName } from "~site/engine/puzzle.ts";
import { emptyBoard, type Board, type GridSpec } from "~site/engine/types.ts";
import { guides, CATEGORIES } from "~site/guides/guides.ts";
import { miniBoard, miniPuzzle } from "~site/guides/board.ts";
import { pictureSvg } from "~site/game-types/grid/picture.ts";
import examples from "~site/guides/examples.json";
import type { Category } from "~site/guides/types.ts";

interface Example { name: string; file: string; spec: GridSpec; solution: Partial<Record<keyof Board, number[]>> }
const EXAMPLES = examples as unknown as Record<string, Example>;

/** The guides in browsing order: by category, then name. */
export const ORDER: GenreName[] = CATEGORIES.flatMap((c) =>
  GENRE_NAMES.filter((k) => guides[k].category === c).sort((a, b) => guides[a].name.localeCompare(guides[b].name)));

export const isKind = (k: string): k is GenreName => (GENRE_NAMES as string[]).includes(k);

/** The example's game on this site: instance files become "<genre>-<n>" when seeded. */
export const exampleGameId = (kind: GenreName) => `${kind}-${EXAMPLES[kind].file.match(/(\d+)\.json$/)![1]}`;

function examplePictures(kind: GenreName) {
  const ex = EXAMPLES[kind], p = makePuzzle(ex.spec), b = emptyBoard(p.grid);
  for (const [layer, values] of Object.entries(ex.solution)) (b[layer as keyof Board] as Uint8Array | Uint16Array).set(values!);
  return { name: ex.name, puzzle: pictureSvg(p, null, `${guides[kind].name}: the puzzle`), solution: pictureSvg(p, b, `${guides[kind].name}: solved`) };
}

/** A picture's width over its height, from its viewBox. */
const ratioOf = (svg: string) => { const [, , w, h] = (svg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 1 1").split(" ").map(Number); return w / h; };

/** Everything the list page needs for one type. */
export function guideCard(kind: GenreName) {
  const g = guides[kind];
  return { kind, name: g.name, aka: g.aka ?? [], category: g.category as Category, summary: g.summary, ink: g.ink, thumb: examplePictures(kind).puzzle };
}

/** Everything a type's page needs. */
export function guidePage(kind: GenreName) {
  const g = guides[kind], at = ORDER.indexOf(kind);
  const near = (k: GenreName | undefined) => (k ? { kind: k, name: guides[k].name } : null);
  return {
    kind, name: g.name, aka: g.aka ?? [], category: g.category as Category, summary: g.summary, origin: g.origin, controls: g.controls, ink: g.ink,
    rules: g.rules.map((r) => ({
      text: r.text,
      pictures: r.pictures.map((m) => {
        const p = miniPuzzle(kind, m);
        const svg = pictureSvg(p, miniBoard(p, m), `${m.ok ? "Right" : "Wrong"}: ${m.note}`);
        return { ok: m.ok, note: m.note, svg, wide: ratioOf(svg) > 2 };
      }),
    })),
    example: examplePictures(kind),
    prev: near(ORDER[at - 1]), next: near(ORDER[at + 1]),
  };
}

export { CATEGORIES };
