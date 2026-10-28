// The contract every interactive game follows, whatever it is built with
// (plain TypeScript + SVG, a React island, Phaser, ...). The page creates a host
// and hands it to the game's mount function; the game never touches storage or
// site navigation directly.

export interface GameHost {
  /** Stable id for this game, e.g. "line-maze". */
  readonly id: string;
  /** Saved progress for this player, or null. */
  load<T>(): T | null;
  /** Save progress for this player (this browser only). */
  save(state: unknown): void;
  /** Forget saved progress. */
  clear(): void;
  /** Report that the player finished. `result` carries anything a later step needs, e.g. a code. */
  solved(result?: Record<string, unknown>): void;
  /** Note what the player did, for solve logging (a page may leave it out; it sends nothing once
   *  the player turns it off: app/app/lib/play-log.ts). `kind`: "m" a move, "u" an undo (each with
   *  [layer, index, value] changes), "h" a hint shown (a `HintLog`), "r" the board cleared, "s" solved. */
  log?(kind: string, data?: unknown): void;
}

/** A hint as solve logging keeps it: enough to tell later whether a player learned what it taught.
 *  `ladder` names the hint scheme and its version (a change to what the rungs say is a new
 *  version); `rung` is which step of it was shown, 1 the most general, `rungs` how many it has (0
 *  and 0: none was left); `technique` is what it teaches, `rule` the rule it came from. */
export interface HintLog {
  ladder: string;
  rung: number;
  rungs: number;
  technique: string | null;
  rule: string | null;
  /** the cells it pointed at, and the ones it gave away */
  area: number[];
  cells: number[];
  /** a hint from the puzzle's ladder (src/lib/hint-ladder.ts, the How to play pane): the section
   *  ("opening" or the stuck point's number from 0), the rung's kind, whether it showed the faded
   *  (short) form, and the stuck points the player had got past without it since the last hint */
  point?: number | "opening";
  kind?: string;
  faded?: boolean;
  skipped?: number[];
}

/** A game's entry point. It renders into `root` and may return a cleanup function. */
export type MountGame = (root: HTMLElement, host: GameHost) => void | (() => void);

/** Event fired on `document` when a game reports it is solved. */
export interface GameSolvedDetail {
  id: string;
  result?: Record<string, unknown>;
}
