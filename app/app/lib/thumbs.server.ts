// Pictures of games for lists: each game's puzzle, unsolved, drawn from its sketch on the server
// (src/game-types/grid/picture.ts), so lists show the actual puzzle.
import { makePuzzle } from "~site/engine/puzzle.ts";
import { pictureSvg } from "~site/game-types/grid/picture.ts";
import { parseSketch } from "~/games/sketch";
import type { GameCard } from "./queries.server";

export interface Thumbed extends Omit<GameCard, "sketch" | "sketchVersion"> { picture: string | null; /** the viewer has solved it */ solved?: boolean }

/** Game cards with a picture of each puzzle (and without their sketches, which stay on the server). */
export function withPictures(games: GameCard[]): Thumbed[] {
  return games.map(({ sketch, sketchVersion, ...g }) => {
    const parsed = parseSketch(sketch, sketchVersion);
    let picture: string | null = null;
    try { if (parsed.ok) picture = pictureSvg(makePuzzle(parsed.spec), null, g.title); } catch { /* listed without a picture */ }
    return { ...g, picture };
  });
}
