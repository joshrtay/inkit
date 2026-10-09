// Pictures of games for lists: each game's puzzle, unsolved, drawn from its sketch on the server
// (src/game-types/grid/picture.ts), so lists show the actual puzzle. A draft made in paint that has
// no puzzle yet (no type, or no grid) shows its drawing instead (sketchpad/picture.ts).
import { inArray } from "drizzle-orm";
import { makePuzzle } from "~site/engine/puzzle.ts";
import { pictureSvg } from "~site/game-types/grid/picture.ts";
import { schema, type Db } from "~/db";
import { parseSketch } from "~/games/sketch";
import { readPaintSave } from "~/games/paint-save";
import { drawingSvg } from "~/sketchpad/picture";
import type { GameCard } from "./queries.server";

export interface Thumbed extends Omit<GameCard, "sketch" | "sketchVersion"> {
  picture: string | null;
  /** its rows and columns, if it has a grid (a draft's name before it has a title: games/kinds.ts's draftName) */
  size: [number, number] | null;
  /** the viewer has solved it */
  solved?: boolean;
}

/** Game cards with a picture of each puzzle (and without their sketches, which stay on the server). */
export function withPictures(games: GameCard[]): Thumbed[] {
  return games.map(({ sketch, sketchVersion, ...g }) => {
    const parsed = parseSketch(sketch, sketchVersion);
    let picture: string | null = null;
    try { if (parsed.ok) picture = pictureSvg(makePuzzle(parsed.spec), null, g.title); } catch { /* listed without a picture */ }
    return { ...g, picture, size: parsed.ok && !parsed.spec.figure ? parsed.spec.size : null };
  });
}

/** Drafts for a list: as withPictures, with the drawing as the picture of one that isn't a puzzle yet. */
export async function draftPictures(db: Db, games: GameCard[]): Promise<Thumbed[]> {
  const cards = withPictures(games);
  const ids = cards.filter((g) => g.state !== "published").map((g) => g.id);
  // D1 binds at most 100 values a query: the ids go in batches
  const rows = [];
  for (let i = 0; i < ids.length; i += 90) {
    rows.push(...await db.select({ id: schema.games.id, drawing: schema.games.drawing }).from(schema.games).where(inArray(schema.games.id, ids.slice(i, i + 90))));
  }
  const drawings = new Map(rows.map((r) => [r.id, r.drawing]));
  return cards.map((g) => {
    if (g.state === "published") return g;
    const save = drawings.get(g.id) ? readPaintSave(drawings.get(g.id)) : null;
    const grid = save?.drawing.grid;
    return { ...g, picture: g.picture ?? (save ? drawingSvg(save.drawing, g.title) || null : null), size: g.size ?? (grid ? [grid.rows, grid.cols] : null) };
  });
}
