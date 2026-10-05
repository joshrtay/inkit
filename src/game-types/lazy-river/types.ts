/** A lazy-river instance's "river" data (src/games/lazy-river/<n>.json). */
export interface LazyRiverConfig {
  /** Rows of the grid: "." = white cell (the river visits it), "#" = black cell (skipped). */
  grid: string[];
  /** Thick walls the river can't cross, as pairs of neighbouring [row, col] cells. */
  walls: number[][][];
  /** The sketch this level was traced from, if any. */
  source?: string;
}

/** Edge bits per cell, as in Inkwell's format: up 1, right 2, down 4, left 8. */
export const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;

/** What the browser receives (built by Game.astro after solving). */
export interface LazyRiverClientConfig {
  grid: string[];
  /** Walls as edge bits per cell (both sides of each wall are set). */
  walls: number[][];
  /** The one loop, as edge bits per cell. */
  solution: number[][];
}
