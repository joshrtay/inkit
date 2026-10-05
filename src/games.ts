// Every game on the site is an instance of a game type, defined by one JSON file in
// src/games/<slug>.json. The slug (file name) is the page URL. The home page builds
// its cards from this list, and src/pages/[slug]/index.astro builds one page per game.
import type { PacketConfig } from "./game-types/packet/types";
import type { NumberMazeConfig } from "./game-types/number-maze/types";

interface GameBase {
  slug: string;
  name: string;
  /** One line under the name on the home page card. */
  blurb: string;
  /** Short "what you need" line, e.g. "8 sheets · scissors · pencil". */
  meta: string;
  /** Unlisted games still build and can be visited by URL, but get no card on the home page. */
  listed: boolean;
  /** Cover image path inside public/ (1200 x 750), or none for a plain card. */
  cover?: string;
  coverAlt?: string;
  /** Small label above the title on the game page. */
  eyebrow?: string;
  /** Paragraph under the title on the game page. */
  intro?: string;
}

export type PacketGame = GameBase & { type: "packet"; packet: PacketConfig };
export type NumberMazeGame = GameBase & { type: "number-maze"; maze: NumberMazeConfig };
export type Game = PacketGame | NumberMazeGame;
export const GAME_TYPES = ["packet", "number-maze"] as const;

const files = import.meta.glob<{ default: Omit<Game, "slug"> }>("./games/*.json", { eager: true });

export const games: Game[] = Object.entries(files)
  .map(([path, mod]) => {
    const slug = path.match(/([^/]+)\.json$/)![1];
    const game = { slug, ...mod.default } as Game;
    if (!GAME_TYPES.includes(game.type)) throw new Error(`${slug}.json: unknown game type "${game.type}"`);
    return game;
  })
  .sort((a, b) => a.name.localeCompare(b.name));
