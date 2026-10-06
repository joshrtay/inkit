// What a grid puzzle's paper needs besides the board: paint pots, a digit pad, a Hint button,
// a picture reveal, nonogram helpers. Worked out on the server (from the engine) and sent
// with the puzzle, so the page can draw the controls before the game starts.
import type { GridSpec } from "~site/engine/types.ts";

export interface Layout {
  palette: string[];      // region (glass) or paint colors; empty unless the puzzle has regions or paint
  digits: number;         // digit pad size; 0 unless the puzzle has digits
  hints: boolean;
  title?: string;         // a nonogram picture's title, revealed when solved
  nonogram: boolean;
  hearts: number;         // mistakes allowed in a paint puzzle; 0 = free play
  ink?: string;
}

export interface Playable { spec: GridSpec; layout: Layout }
