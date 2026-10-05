/** Colors use the site's numbering: 1 = red, 2 = yellow, 3 = blue. */
export type Color = 1 | 2 | 3;

/** One piece of the figure: a polygon plus its clue dots. */
export interface RybPiece {
  /** Corners in drawing coordinates (any units; the board is scaled to fit). */
  points: number[][];
  /** Clue dots as digits, e.g. "113" = two red dots and one blue dot. Empty = no clue. */
  clue?: string;
  /** If true, the clue stays hidden until the piece is painted correctly. */
  hidden?: boolean;
}

/** A ryb instance's "ryb" data (src/games/<slug>.json). */
export interface RybConfig {
  pieces: RybPiece[];
  /** Exact number of pieces of each color, shown beside the board as "left to place". */
  totals?: Partial<Record<"1" | "2" | "3", number>>;
  /** Mistakes allowed before the board resets (default 3). */
  hearts?: number;
}

/** What the browser receives (built by Game.astro after solving). */
export interface RybClientConfig {
  pieces: { points: number[][]; dots: Color[]; hidden: boolean }[];
  solution: Color[];
  totals: Record<Color, number> | null;
  hearts: number;
  viewBox: string;
}
