// The site's catalog. Game types are listed below; each type's numbered instances
// are JSON files in src/games/<type path>/<n>.json (e.g. src/games/number-line-maze/2.json).
// Pages: / lists types, /<path>/ lists that type's instances, /<path>/<n>/ plays one.
import type { PacketConfig } from "./game-types/packet/types";
import type { NumberMazeConfig } from "./game-types/number-maze/types";
import type { RybConfig } from "./game-types/ryb/types";
import type { GridSpec } from "./engine/types";

export interface GameType {
  /** Code id: the folder in src/game-types/. */
  id: "packet" | "number-maze" | "ryb" | "grid";
  /** For "grid" types: the genre its puzzles default to (src/engine/puzzle.ts). */
  genre?: string;
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
  /** The pen its boards are drawn with (like the chapters of Inked, each type has its own ink). */
  ink: string;
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
    ink: "#26398f",
    listed: true,
  },
  {
    id: "number-maze",
    path: "number-line-maze",
    name: "Number Line Maze",
    blurb: "Build the walls each number asks for, then find your way out.",
    meta: "Play in the browser",
    cover: "number-line-maze/cover.jpg",
    coverAlt: "Two sheets of numbered circles with arrows marking the way in and out",
    ink: "#26398f",
    listed: true,
  },
  {
    id: "ryb",
    path: "three-coats",
    name: "Three Coats",
    blurb: "Paint every shape red, yellow or blue so each dot sees its color next door.",
    meta: "Play in the browser",
    cover: "three-coats/cover.jpg",
    coverAlt: "Unpainted puzzle figures with red, yellow and blue clue dots",
    ink: "#2b2b30",
    listed: true,
  },
  {
    id: "grid",
    genre: "simple-loop",
    path: "round-the-bend",
    name: "Simple Loop",
    blurb: "Draw one river that winds through every white cell, around the rocks and walls.",
    meta: "Play in the browser",
    cover: "round-the-bend/cover.jpg",
    coverAlt: "Two river grids with dark rocks and thick walls",
    ink: "#2d6a45",
    listed: true,
  },
  {
    id: "grid",
    genre: "nonogram",
    path: "picture-squares",
    name: "Nonogram",
    blurb: "Shade the cells the numbers ask for to uncover a hidden picture.",
    meta: "Play in the browser",
    cover: "picture-squares/cover.jpg",
    coverAlt: "Three blank grids with number clues along their edges",
    ink: "#a3343f",
    listed: true,
  },
  // ---- grid engine (src/engine, docs/grid-engine.md) ----
  {
    id: "grid",
    genre: "simple-path",
    path: "simple-path",
    name: "Simple Path",
    blurb: "Draw one path from the arrow in to the arrow out that passes through every white cell.",
    meta: "Play in the browser",
    ink: "#2d6a45",
    listed: true,
  },
  {
    id: "grid",
    genre: "slitherlink",
    path: "slitherlink",
    name: "Slitherlink",
    blurb: "Draw one loop along the dotted lines. Each number counts the sides of its cell the loop uses.",
    meta: "Play in the browser",
    ink: "#26398f",
    listed: true,
  },
  {
    id: "grid",
    genre: "nurikabe",
    path: "nurikabe",
    name: "Nurikabe",
    blurb: "Shade a winding wall so every number sits in an island of exactly that many cells.",
    meta: "Play in the browser",
    ink: "#2d6a45",
    listed: true,
  },
  {
    id: "grid",
    genre: "panes",
    path: "panes",
    name: "Panes",
    blurb: "Cut the window into panes of stained glass that follow every rule on the page.",
    meta: "Play in the browser",
    ink: "#2b2b30",
    listed: true,
  },
  {
    id: "grid",
    genre: "sudoku",
    path: "sudoku",
    name: "Sudoku",
    blurb: "Fill the grid so every row, column and box holds each digit once.",
    meta: "Play in the browser",
    ink: "#26398f",
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
export type GridGame = InstanceBase & { grid: GridSpec };
export type Game = PacketGame | NumberMazeGame | RybGame | GridGame;

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
