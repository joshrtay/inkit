/** A number-maze instance's "maze" data (src/games/<slug>.json). Validated by puzzles/number-maze/check.py. */
export interface NumberMazeConfig {
  /** Numbers on the corners of the grid, row by row. Each counts the walls touching it. */
  clues: number[][];
  /** Square column of the entrance gap in the top border. */
  entryCol: number;
  /** Square row of the exit gap in the right border. */
  exitRow: number;
  /** Extra walls drawn for the player, as pairs of [row, col] corners. */
  hints: number[][][];
  /** Generator seed, if the maze was generated. */
  seed?: number;
}
