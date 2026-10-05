// The site's catalog. Game types are listed below; each type's numbered instances
// are JSON files in src/games/<type path>/<n>.json (e.g. src/games/number-line-maze/2.json).
// Pages: / lists types, /<path>/ lists that type's instances, /<path>/<n>/ plays one.
import type { PacketConfig } from "./game-types/packet/types";
import type { NumberMazeConfig } from "./game-types/number-maze/types";
import type { RybConfig } from "./game-types/ryb/types";

export interface GameType {
  /** Code id: the folder in src/game-types/. */
  id: "packet" | "number-maze" | "ryb";
  /** URL path and content folder name. */
  path: string;
  name: string;
  /** One line under the name on the home page card. */
  blurb: string;
  /** Short "what you need" line on the home page card. */
  meta: string;
  /** Cover image path inside public/ (1200 x 750), or none for a plain card. */
  cover?: string;
  coverAlt?: string;
  /** Unlisted types still build and can be visited by URL, but get no card on the home page. */
  listed: boolean;
}

export const gameTypes: GameType[] = [
  {
    id: "packet",
    path: "escape-room",
    name: "Escape Room",
    blurb: "Printable sheets that hand a number from one to the next, ending in a code.",
    meta: "Print · scissors · pencil",
    cover: "escape-room/cover.jpg",
    coverAlt: "Three typed puzzle sheets fanned out on a manila envelope",
    listed: true,
  },
  {
    id: "number-maze",
    path: "number-line-maze",
    name: "Number Line Maze",
    blurb: "Build the walls each number asks for, then find your way out.",
    meta: "Play in the browser",
    listed: true,
  },
  {
    id: "ryb",
    path: "ryb",
    name: "RYB",
    blurb: "Paint every shape red, yellow or blue so each dot sees its color next door.",
    meta: "Play in the browser",
    listed: true,
  },
];

interface InstanceBase {
  /** The instance's number within its type (from the file name). */
  number: number;
  type: GameType;
  name: string;
  /** Short detail shown in the type's list, e.g. "5 × 5 numbers". */
  meta?: string;
  /** Paragraph under the title on the game page. */
  intro?: string;
}

export type PacketGame = InstanceBase & { packet: PacketConfig };
export type NumberMazeGame = InstanceBase & { maze: NumberMazeConfig };
export type RybGame = InstanceBase & { ryb: RybConfig };
export type Game = PacketGame | NumberMazeGame | RybGame;

const files = import.meta.glob<{ default: Record<string, unknown> }>("./games/*/*.json", { eager: true });

export const games: Game[] = Object.entries(files)
  .map(([file, mod]) => {
    const [, path, n] = file.match(/\.\/games\/([^/]+)\/(\d+)\.json$/) ?? [];
    const type = gameTypes.find((t) => t.path === path);
    if (!type || !n) throw new Error(`${file}: expected src/games/<type path>/<number>.json for a known type`);
    if (mod.default.type !== type.id) throw new Error(`${file}: "type" should be "${type.id}"`);
    return { ...mod.default, number: Number(n), type } as unknown as Game;
  })
  .sort((a, b) => a.type.path.localeCompare(b.type.path) || a.number - b.number);

export const instancesOf = (type: GameType) => games.filter((g) => g.type === type);

/** Page URL path for an instance, without the base: "number-line-maze/2/". */
export const gamePath = (g: Game) => `${g.type.path}/${g.number}/`;
