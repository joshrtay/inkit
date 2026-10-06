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
}

/** A game's entry point. It renders into `root` and may return a cleanup function. */
export type MountGame = (root: HTMLElement, host: GameHost) => void | (() => void);

/** Event fired on `document` when a game reports it is solved. */
export interface GameSolvedDetail {
  id: string;
  result?: Record<string, unknown>;
}
