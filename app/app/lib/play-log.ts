// Solve logging, in the browser (docs/research-review-2026-10-24.md, idea 10): how a puzzle is
// played, move by move, for the research's second population (until now every human solve it had
// came from seven experts on one site). On unless the player turns it off (`shareAllowed`: the
// switch in Settings and on the privacy page, components/ShareSolves.tsx); once off, nothing is
// kept or sent. A player is a random id kept in this browser (`playerId`), never tied to an
// account; a play is one attempt at one puzzle, carried across reloads (in localStorage) until it's
// solved or the board is cleared. The events go to POST /api/plays in batches (routes/api.plays.ts):
// every BATCH events, every FLUSH_MS, and when the page is hidden.
//
// An event is [t, kind, data?], t in ms since the play began:
//   "o" opened (the page, or a reload carrying on)    "m" a move: [layer, cell or line, value][]
//   "u" an undo: the same, the values it went back to  "h" a hint asked for: its cells
//   "r" the board cleared (the play ends)             "s" solved (the play ends)
//   "a" away (the tab hidden)                          "b" back
export type PlayEvent = [number, string, unknown?];

/** "no" once the player turns it off (anything else: on). */
const CONSENT = "inkit:share-solves";
const PLAYER = "inkit:player";
const playKey = (gameId: string) => `inkit:play:${gameId}`;

export const BATCH = 40, FLUSH_MS = 20_000;

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* not kept */ } };

/** Whether this browser shares how its player solves: yes unless they turned it off. */
export const shareAllowed = () => read(CONSENT) !== "no";
export function setShare(yes: boolean) {
  write(CONSENT, yes ? "yes" : "no");
  // said no: forget the player and any play in progress (nothing more is sent)
  if (!yes) {
    write(PLAYER, null);
    try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith("inkit:play:")) localStorage.removeItem(k); } } catch { /* nothing kept */ }
  }
  dispatchEvent(new Event("inkit:share-solves"));
}

export const randomId = () => {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 20);
};

export function playerId() {
  let id = read(PLAYER);
  if (!id) { id = randomId(); write(PLAYER, id); }
  return id;
}

/** A play in progress, as kept between reloads. */
export interface Play { id: string; startedAt: number; seq: number }

/** The play under way on this puzzle, or a new one. */
export function currentPlay(gameId: string, now: number): { play: Play; resumed: boolean } {
  try {
    const p = JSON.parse(read(playKey(gameId)) ?? "null") as Play | null;
    if (p && typeof p.id === "string" && typeof p.startedAt === "number" && typeof p.seq === "number") return { play: p, resumed: true };
  } catch { /* a new one */ }
  return { play: { id: randomId(), startedAt: now, seq: 0 }, resumed: false };
}

/** The batch to send: the play, its next number, its events. */
export interface PlayBatch { play: { id: string; gameId: string; playerId: string; startedAt: number }; seq: number; events: PlayEvent[] }

/** A play's log: events buffered and sent in batches. `send` posts a batch (a beacon when the page
 *  is going away); `now` is the clock (tests pass their own). Pure apart from localStorage. */
export function createPlayLog(gameId: string, send: (b: PlayBatch, leaving: boolean) => void, now: () => number = Date.now) {
  let { play } = currentPlay(gameId, now());
  const player = playerId();
  let buffer: PlayEvent[] = [];
  const keep = () => write(playKey(gameId), JSON.stringify(play));
  keep();
  const flush = (leaving = false) => {
    if (!buffer.length) return;
    send({ play: { id: play.id, gameId, playerId: player, startedAt: play.startedAt }, seq: play.seq, events: buffer }, leaving);
    buffer = [];
    play = { ...play, seq: play.seq + 1 };
    keep();
  };
  const log = (kind: string, data?: unknown) => {
    buffer.push(data === undefined ? [now() - play.startedAt, kind] : [now() - play.startedAt, kind, data]);
    // a solve or a cleared board ends the play: send it, and the next move starts another
    if (kind === "s" || kind === "r") {
      flush();
      write(playKey(gameId), null);
      play = { id: randomId(), startedAt: now(), seq: 0 };
      return;
    }
    if (buffer.length >= BATCH) flush();
  };
  log("o");
  return { log, flush, get play() { return play; } };
}

/** Post a batch: fetch while the page lives, a beacon as it goes. Failures are dropped (research
 *  data, not the player's). */
export function sendBatch(b: PlayBatch, leaving: boolean) {
  const body = JSON.stringify(b);
  if (leaving && navigator.sendBeacon?.("/api/plays", new Blob([body], { type: "application/json" }))) return;
  fetch("/api/plays", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}
