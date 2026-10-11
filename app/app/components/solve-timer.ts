// How long a puzzle took to play: from the first move to the solve, counting the time between
// moves but at most GAP_MS of any one gap (someone who walks away isn't still solving), and nothing
// while the tab is hidden. Kept in the browser per puzzle, so a reload carries on; sent with the
// solve (routes/game-solve.ts, solves.ms) for difficulty and time estimates (docs/research-sudoku-difficulty.md).

/** The most one gap between moves can count for. */
export const GAP_MS = 60_000;

export interface Timer { total: number; last: number | null }
export const startTimer = (): Timer => ({ total: 0, last: null });

/** A move at `now`. */
export function tick(t: Timer, now: number): Timer {
  return { total: t.last === null ? t.total : t.total + Math.min(Math.max(0, now - t.last), GAP_MS), last: now };
}
/** The tab hidden: the next move starts counting afresh. */
export const pause = (t: Timer): Timer => ({ ...t, last: null });

const key = (id: string) => `inkit:time:${id}`;
export function loadTimer(id: string): Timer {
  try { const raw = localStorage.getItem(key(id)); if (raw) { const v = JSON.parse(raw) as Timer; if (typeof v.total === "number") return { total: v.total, last: null }; } } catch { /* a fresh one */ }
  return startTimer();
}
export function saveTimer(id: string, t: Timer) { try { localStorage.setItem(key(id), JSON.stringify({ total: t.total, last: null })); } catch { /* this page only */ } }
export function clearTimer(id: string) { try { localStorage.removeItem(key(id)); } catch { /* nothing kept */ } }
