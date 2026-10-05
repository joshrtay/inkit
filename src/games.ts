// Every game on the site. The home page builds its cards from this list.
// To add a game: add an entry here, a page at src/pages/<slug>/index.astro,
// and its cover at public/<slug>/cover.jpg (1200 x 750).

export interface Game {
  slug: string;
  name: string;
  /** One line under the name on the home page card. */
  blurb: string;
  /** Short "what you need" line, e.g. "8 sheets · scissors · pencil". */
  meta: string;
  /** Printable sheets you play on paper, or a game you play in the browser. */
  kind: "printable" | "interactive";
  /** Cover image path inside public/, or null to show a plain card. */
  cover: string | null;
  coverAlt?: string;
  /** Unlisted games still build and can be visited by URL, but get no card on the home page. */
  listed: boolean;
}

export const games: Game[] = [
  {
    slug: "escape-room-packet",
    name: "Escape Room Packet",
    blurb: "Cut, fold and add your way from a page of letters to a five-digit code.",
    meta: "8 sheets · scissors · pencil",
    kind: "printable",
    cover: "escape-room-packet/cover.jpg",
    coverAlt: "Three typed puzzle sheets fanned out on a manila envelope",
    listed: true,
  },
  {
    slug: "line-maze",
    name: "Number Line Maze",
    blurb: "Draw the lines each number asks for, then find your way out.",
    meta: "Play in the browser",
    kind: "interactive",
    cover: null,
    listed: false,   // part of game 2, still in progress
  },
];
