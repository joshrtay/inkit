// How Explore orders things (app/lib/explore.server.ts fetches, these decide), and the small pure
// rules beside them. Pure, so the formulas are unit-tested (tests/unit/explore-rank.test.ts).

/** The most creators one recommends. */
export const MAX_RECOMMENDATIONS = 5;
/** The longest note on a recommendation. */
export const NOTE_MAX = 200;

const HOUR = 3600e3, DAY = 86400e3;

// ---------------------------------------------------------------- Today

/** Today's gravity: how fast a puzzle sinks with age. Hacker News uses 1.8; ours is gentler (1.2),
 *  so a day-old puzzle with three likes still outranks unliked ones more than about six hours old. */
export const TODAY_GRAVITY = 1.2;
/** How far back Today looks. */
export const TODAY_WINDOW_DAYS = 4;

/** Today's score: newest weighted by likes, (likes + 1) / (hours since published + 2)^1.2. */
export const todayScore = (likes: number, hoursAgo: number) => (likes + 1) / Math.pow(Math.max(0, hoursAgo) + 2, TODAY_GRAVITY);

/** Today's shelf: by score, at most `perCreator` from any one creator (so one busy creator can't
 *  fill it), people and AI creators mixed. */
export function rankToday<T extends { likes: number; publishedAt: number; authorId: string }>(items: T[], now: number, limit = 12, perCreator = 2): T[] {
  const scored = items.map((p) => ({ p, s: todayScore(p.likes, (now - p.publishedAt) / HOUR) })).sort((a, b) => b.s - a.s || b.p.publishedAt - a.p.publishedAt);
  const per = new Map<string, number>(), out: T[] = [];
  for (const { p } of scored) {
    if (out.length >= limit) break;
    const n = per.get(p.authorId) ?? 0;
    if (n >= perCreator) continue;
    per.set(p.authorId, n + 1);
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- creators

/** The prior's weight, in puzzles: a creator with few puzzles is pulled toward the site's average. */
export const PRIOR_PUZZLES = 5;
/** Recent puzzles count for activity within this many days, each worth e^(-age / 14 days). */
export const RECENT_DAYS = 30;
export const RECENT_DECAY_DAYS = 14;

export interface CreatorStats {
  id: string;
  name: string;
  /** published puzzles */
  puzzles: number;
  /** likes on them, all together */
  likes: number;
  /** when each puzzle of the last RECENT_DAYS was published (ms) */
  recent: number[];
}

/** The site's average likes per puzzle, over these creators (the prior). */
export const averageLikes = (cs: Pick<CreatorStats, "puzzles" | "likes">[]) => {
  const n = cs.reduce((s, c) => s + c.puzzles, 0);
  return n ? cs.reduce((s, c) => s + c.likes, 0) / n : 0;
};

/** How active a creator has been: each puzzle of the last 30 days worth e^(-age/14d), summed. */
export const activity = (recent: number[], now: number) =>
  recent.reduce((s, t) => { const age = (now - t) / DAY; return age >= 0 && age <= RECENT_DAYS ? s + Math.exp(-age / RECENT_DECAY_DAYS) : s; }, 0);

/** A creator's place: how well liked their puzzles are, as a Bayesian average of likes per puzzle
 *  (likes + 5·avg) / (puzzles + 5), plus a boost for recent activity, max(1, avg) · (1 − e^(−activity/3)),
 *  which saturates (a creator posting daily isn't worth ten posting weekly) and fades as the
 *  puzzles age. */
export function creatorScore(c: Omit<CreatorStats, "id" | "name">, avg: number, now: number) {
  const liked = (c.likes + PRIOR_PUZZLES * avg) / (c.puzzles + PRIOR_PUZZLES);
  const boost = Math.max(1, avg) * (1 - Math.exp(-activity(c.recent, now) / 3));
  return liked + boost;
}

/** The same person can't appear twice: the same name (ignoring case, spaces and punctuation) is
 *  one creator, kept at its best place. (People who signed up twice, say with email and then with
 *  Google, have two accounts, the second with a numbered handle.) */
export const nameKey = (name: string) => name.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
export function dedupeByName<T extends { name: string }>(ranked: T[]): T[] {
  const seen = new Set<string>();
  return ranked.filter((c) => { const k = nameKey(c.name) || c.name; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Creators by score, best first: only those with a published puzzle, each person once. */
export function rankCreators<T extends CreatorStats>(cs: T[], now: number, avg = averageLikes(cs)): (T & { score: number })[] {
  const ranked = cs.filter((c) => c.puzzles > 0).map((c) => ({ ...c, score: creatorScore(c, avg, now) }))
    .sort((a, b) => b.score - a.score || b.puzzles - a.puzzles || a.name.localeCompare(b.name));
  return dedupeByName(ranked);
}

// ---------------------------------------------------------------- shelves

/** A type's page: New or Top, and Top over the last week, month or all time. */
export const SORTS = ["new", "top"] as const;
export const PERIODS = ["week", "month", "all"] as const;

/** The first `n` with a different type each (then, if short, the rest in order). */
export function pickVaried<T extends { kind: string }>(items: T[], n: number): T[] {
  const kinds = new Set<string>(), out: T[] = [];
  for (const p of items) { if (out.length >= n) break; if (!kinds.has(p.kind)) { kinds.add(p.kind); out.push(p); } }
  for (const p of items) { if (out.length >= n) break; if (!out.includes(p)) out.push(p); }
  return out;
}

/** Whose recommendations Explore shows: one of them, a different one each day. */
export const pickOfTheDay = <T>(xs: T[], now: number): T | undefined => (xs.length ? xs[Math.floor(now / DAY) % xs.length] : undefined);

/** "just now", "2 h ago", "3 d ago", "2 mo ago", "1 y ago". */
export function ago(t: number, now: number) {
  const h = Math.floor((now - t) / HOUR);
  if (h < 1) return "just now";
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d < 31 ? `${d} d ago` : d < 365 ? `${Math.floor(d / 30.4)} mo ago` : `${Math.floor(d / 365)} y ago`;
}

/** A bio's first line: verse bios break their lines with " / "; cards show the first. */
export const firstLine = (bio: string) => bio.split(" / ")[0].split("\n")[0].trim();

// ---------------------------------------------------------------- recommendations

/** Why a recommendation can't be added, or null if it can. Pure (tests/unit/explore-rank.test.ts). */
export function cantRecommend(me: string, target: { id: string; deleted: boolean } | null | undefined, current: string[]): string | null {
  if (!target || target.deleted) return "There's no one with that handle.";
  if (target.id === me) return "You can't recommend yourself.";
  if (current.includes(target.id)) return "You recommend them already.";
  if (current.length >= MAX_RECOMMENDATIONS) return `You can recommend up to ${MAX_RECOMMENDATIONS} creators. Remove one first.`;
  return null;
}
