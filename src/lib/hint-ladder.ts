// A puzzle's hint ladder (docs/plan-generator-and-hints.md, "The hybrid ladder"): written once
// when the puzzle is made (puzzles/hints/), editable by its author, shown to players one hint at a
// time in How to play. Pure: the page (app/components/HintsPanel.tsx) and the writer share it.
//
// The ladder is global (the same text for every player); which hint comes next is picked for the
// player: stuck points they've already passed are skipped (their key marks are on the board), and
// a rule they've been shown often enough shrinks to its name (fading).
//
//   opening   once per puzzle, no cells: how to start (the type's break-in), one bookkeeping habit
//   points    the stuck points in solve order, each up to three rungs:
//               where  a place to look, saying where in the solve it comes
//               rule   a reusable "whenever X, Y", with one question; tagged with its technique
//               step   the step itself: which squares, and what they are
//   then the board's own hint button (show me) gives the answer on the board.

/** The board's layers a ladder can check (game.ts's Board, without pencil notes). */
export const LAYERS = ["shade", "fence", "loop", "cut", "color", "digit"] as const;
export type Layer = (typeof LAYERS)[number];
/** A mark on the board: the layer, its index there, and the value the answer has. */
export type KeyMark = [Layer, number, number];
export type RungKind = "start" | "habit" | "where" | "rule" | "step";

export interface Rung {
  kind: RungKind;
  text: string;
  /** the cells it outlines on the board (none for the opening) */
  area?: number[];
  /** what it teaches (a rule rung's technique): logged, and counted for fading */
  technique?: string;
  /** a rule rung once the player has met its technique often: "This is a … spot." */
  short?: string;
}

export interface StuckPoint {
  /** the marks a player who got past this point has made (the key step's, and what follows easily) */
  marks: KeyMark[];
  rungs: Rung[];
}

export interface Ladder {
  /** the writer and its version ("solver-1", "opus-1"): logged with every hint shown */
  version: string;
  /** an author's own edit: the batch never writes over it */
  edited?: boolean;
  opening: Rung[];
  points: StuckPoint[];
}

export const LIMITS = { words: 40, opening: 2, points: 12, rungs: 3, marks: 16, text: 400 } as const;
/** a technique shown this many times before shrinks to its short form */
export const FADE_AFTER = 3;
/** a stuck point counts as passed once this share of its marks is on the board */
export const PASSED_SHARE = 2 / 3;

export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const isInt = (x: unknown, hi = 1e6): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= hi;
const str = (x: unknown, max: number) => (typeof x === "string" && x.trim() && x.length <= max ? x.trim() : null);

function readRung(x: unknown, cells: number): Rung | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const kind = r.kind as RungKind, text = str(r.text, LIMITS.text);
  if (!["start", "habit", "where", "rule", "step"].includes(kind) || !text) return null;
  const out: Rung = { kind, text };
  if (Array.isArray(r.area)) out.area = r.area.filter((c) => isInt(c, cells - 1)).slice(0, 200);
  const t = str(r.technique, 60), s = str(r.short, LIMITS.text);
  if (t) out.technique = t;
  if (s) out.short = s;
  return out;
}

/** A ladder from stored or sent JSON, checked and trimmed to the limits (`cells`: the grid's cell
 *  count, to drop outlines off the board). Null when there's nothing usable. */
export function readLadder(x: unknown, cells = 1e6): Ladder | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const version = str(o.version, 40);
  if (!version || !Array.isArray(o.opening) || !Array.isArray(o.points)) return null;
  const opening = o.opening.map((r) => readRung(r, cells)).filter((r): r is Rung => !!r && (r.kind === "start" || r.kind === "habit")).slice(0, LIMITS.opening);
  const points: StuckPoint[] = [];
  for (const p of o.points.slice(0, LIMITS.points)) {
    if (!p || typeof p !== "object") continue;
    const q = p as Record<string, unknown>;
    const rungs = (Array.isArray(q.rungs) ? q.rungs : []).map((r) => readRung(r, cells)).filter((r): r is Rung => !!r && ["where", "rule", "step"].includes(r.kind)).slice(0, LIMITS.rungs);
    const marks = (Array.isArray(q.marks) ? q.marks : []).filter((m): m is KeyMark =>
      Array.isArray(m) && m.length === 3 && (LAYERS as readonly unknown[]).includes(m[0]) && isInt(m[1]) && isInt(m[2], 255)).slice(0, LIMITS.marks);
    if (rungs.length) points.push({ marks, rungs });
  }
  if (!opening.length && !points.length) return null;
  return { version, ...(o.edited === true ? { edited: true } : {}), opening, points };
}

/** What a ladder breaks of the house style (each hint short and plain): one line per problem. The
 *  writer rewrites or drops what fails; an author's edit is only warned. */
export function styleProblems(l: Ladder): string[] {
  const out: string[] = [];
  const each = (r: Rung, where: string) => {
    if (words(r.text) > LIMITS.words) out.push(`${where}: ${words(r.text)} words (at most ${LIMITS.words})`);
    if (/[*_`#<>]/.test(r.text)) out.push(`${where}: formatting characters (plain text only)`);
    if (r.kind === "rule" && !r.technique) out.push(`${where}: a rule rung names no technique`);
  };
  l.opening.forEach((r, i) => each(r, `opening ${i + 1}`));
  l.points.forEach((p, k) => p.rungs.forEach((r, i) => each(r, `point ${k + 1} rung ${i + 1}`)));
  return out;
}

// ---------- the player's board ----------
/** A board as the player's saved progress holds it: any of its layers. */
export type BoardLike = Partial<Record<Layer, ArrayLike<number>>>;

/** How many of a point's marks are on the board, at the answer's value. */
export function marksMade(p: StuckPoint, board: BoardLike | null): number {
  if (!board) return 0;
  return p.marks.filter(([layer, i, v]) => (board[layer]?.[i] ?? 0) === v).length;
}
/** Has the player got past this point? (Most of its marks are made. A point with none can't tell.) */
export const passed = (p: StuckPoint, board: BoardLike | null) => p.marks.length > 0 && marksMade(p, board) >= Math.ceil(PASSED_SHARE * p.marks.length);

/** The first stuck point the player hasn't passed: past the last one they have (passing a later
 *  point means they got through the earlier ones, whatever order they went in). */
export function firstOpen(l: Ladder, board: BoardLike | null): number {
  for (let k = l.points.length - 1; k >= 0; k--) if (passed(l.points[k], board)) return k + 1;
  return 0;
}

/** What the player has opened: how many opening hints, and how many rungs of each stuck point. */
export interface Shown { opening: number; points: number[] }
export const nothingShown = (): Shown => ({ opening: 0, points: [] });

/** Where the next hint is: an opening hint, a point's rung, or null when the ladder has no more
 *  here (the board's show me is next). */
export type Next = { section: "opening"; rung: number } | { section: "point"; point: number; rung: number };

/** The hint the next click opens. The opening comes first, unless the player is already past a
 *  stuck point or has opened a point's hint; then the first open point's next rung. */
export function nextHint(l: Ladder, shown: Shown, board: BoardLike | null): Next | null {
  const at = firstOpen(l, board);
  const started = at > 0 || shown.points.some((n) => n > 0);
  if (!started && shown.opening < l.opening.length) return { section: "opening", rung: shown.opening };
  if (at >= l.points.length) return null;
  // every rung of this point open and it isn't passed yet: show me is next, not the point after
  const n = shown.points[at] ?? 0;
  return n < l.points[at].rungs.length ? { section: "point", point: at, rung: n } : null;
}

/** Open the next hint. */
export function reveal(shown: Shown, next: Next): Shown {
  if (next.section === "opening") return { ...shown, opening: Math.max(shown.opening, next.rung + 1) };
  const points = [...shown.points];
  while (points.length <= next.point) points.push(0);
  points[next.point] = Math.max(points[next.point], next.rung + 1);
  return { ...shown, points };
}

/** The points the player has passed without opening all their hints: shown folded. */
export function skipped(l: Ladder, shown: Shown, board: BoardLike | null): number[] {
  const at = firstOpen(l, board), out: number[] = [];
  for (let k = 0; k < at; k++) if ((shown.points[k] ?? 0) < l.points[k].rungs.length) out.push(k);
  return out;
}

// ---------- fading ----------
/** How often this player has been shown each technique (kept in their browser: lib in the page). */
export type Exposures = Record<string, number>;

/** A rung's text for this player: a rule they've met FADE_AFTER times shrinks to its short form. */
export function textFor(r: Rung, seen: Exposures): { text: string; faded: boolean } {
  if (r.kind === "rule" && r.short && r.technique && (seen[r.technique] ?? 0) >= FADE_AFTER) return { text: r.short, faded: true };
  return { text: r.text, faded: false };
}

/** Count one showing of a rung's technique. */
export function expose(seen: Exposures, r: Rung): Exposures {
  return r.technique ? { ...seen, [r.technique]: (seen[r.technique] ?? 0) + 1 } : seen;
}
