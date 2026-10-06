/** A number-maze instance's "maze" data (src/games/number-line-maze/<n>.json). Validated by puzzles/number-maze/check.py. */
export interface NumberMazeConfig {
  /** Numbers on the corners of the grid, row by row. Each counts the walls touching it. */
  clues: number[][];
  /** The entrance gap in the border. */
  entry?: Opening;
  /** The exit gap in the border. */
  exit?: Opening;
  /** Older form: square column of an entrance in the top border (used when `entry` is absent). */
  entryCol?: number;
  /** Older form: square row of an exit in the right border (used when `exit` is absent). */
  exitRow?: number;
  /** Extra walls drawn for the player, as pairs of [row, col] corners. */
  hints: number[][][];
  /** Generator or fit seed. */
  seed?: number;
  /** Transcribed sketch the maze was fitted to (puzzles/number-maze/fit.py), if any. */
  source?: string;
}

export type Side = "top" | "right" | "bottom" | "left";

/** A gap in the border: its side, and the square beside it counted along that side
 *  (a column for top/bottom, a row for left/right). */
export interface Opening { side: Side; at: number }

/** The entrance and exit of a maze, including the older entryCol/exitRow form. */
export const openings = (maze: NumberMazeConfig): { entry: Opening; exit: Opening } => ({
  entry: maze.entry ?? { side: "top", at: maze.entryCol ?? 0 },
  exit: maze.exit ?? { side: "right", at: maze.exitRow ?? 0 },
});
