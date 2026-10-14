// Explore's data: the shelves (Today, Quick ones, Start here, Browse by type, This week's hard ones,
// Creators, Made by AI creators, "… recommends"), search, and a type's page. The formulas are in
// ./rank.ts; each game's difficulty and minutes in app/games/estimate.ts.
//
// The shelves are the same for everyone, so they're worked out once a minute per Worker (`shelves`)
// and only what's the viewer's own (solved, subscribed) is added per request. Queries keep under
// D1's 100 bound parameters (ids go in groups of 90).
import { and, desc, eq, gte, inArray, isNull, like, lte, notExists, or, sql, type SQL } from "drizzle-orm";
import { schema, type Db } from "../db";
import { makePuzzle } from "~site/engine/puzzle.ts";
import { pictureSvg } from "~site/game-types/grid/picture.ts";
import { guides } from "~site/guides/guides.ts";
import { parseSketch } from "../games/sketch";
import { estimate } from "../games/estimate";
import { kindName } from "../games/kinds";
import { ORDER, exampleGameId, guideCard } from "./guides.server";
import { backfillEstimates } from "./estimates.server";
import { PERIODS, SORTS, averageLikes, firstLine, pickOfTheDay, pickVaried, rankCreators, rankToday, RECENT_DAYS, TODAY_WINDOW_DAYS, type CreatorStats } from "./rank";

const DAY = 86400e3;

/** A puzzle on a shelf or in a grid: its picture is in the page's `pictures`, by id. */
export interface Puzzle {
  id: string; title: string; kind: string;
  authorId: string; authorHandle: string; authorName: string; authorAi: boolean; authorDeleted: boolean;
  likes: number; publishedAt: number;
  level: 1 | 2 | 3; minutes: number;
  solved?: boolean;
}
type Row = Omit<Puzzle, "level" | "minutes" | "publishedAt"> & { sketch: string; sketchVersion: number; level: number | null; minutes: number | null; publishedAt: Date | null };

const likeCount = sql<number>`(select count(*) from likes where likes.game_id = ${schema.games.id})`;
const columns = {
  id: schema.games.id, title: schema.games.title, kind: schema.games.kind, sketch: schema.games.sketch, sketchVersion: schema.games.sketchVersion,
  authorId: schema.games.authorId, authorHandle: schema.creators.handle, authorName: schema.creators.name,
  authorAi: sql<boolean>`${schema.creators.isAi}`.mapWith(Boolean), authorDeleted: sql<boolean>`${schema.creators.deletedAt} is not null`.mapWith(Boolean),
  likes: likeCount.mapWith(Number).as("like_count"), publishedAt: schema.games.publishedAt, level: schema.games.level, minutes: schema.games.minutes,
};
const puzzles = (db: Db) => db.select(columns).from(schema.games)
  .innerJoin(schema.collections, eq(schema.games.collectionId, schema.collections.id))
  .innerJoin(schema.creators, eq(schema.games.authorId, schema.creators.id));
/** published, somewhere that's still up */
const live = and(eq(schema.games.state, "published"), isNull(schema.collections.deletedAt));

/** Pictures by game id (with the game's type, for its ink), each drawn once however many shelves it's on. */
export type Pictures = Record<string, { svg: string; kind: string }>;

/** Rows as cards, drawing each one's picture into `pics` unless it's null (and estimating any not yet estimated). */
function toCards(rows: Row[], pics: Pictures | null): Puzzle[] {
  return rows.map(({ sketch, sketchVersion, ...r }) => {
    let level = r.level, minutes = r.minutes;
    if ((pics && !pics[r.id]) || level == null || minutes == null) {
      const parsed = parseSketch(sketch, sketchVersion);
      if (parsed.ok) {
        if (pics && !pics[r.id]) try { pics[r.id] = { svg: pictureSvg(makePuzzle(parsed.spec), null, r.title), kind: r.kind }; } catch { /* shown without a picture */ }
        if (level == null || minutes == null) ({ level, minutes } = estimate(parsed.kind, parsed.spec));
      }
    }
    return { ...r, publishedAt: r.publishedAt?.getTime() ?? 0, level: (level ?? 2) as 1 | 2 | 3, minutes: minutes ?? 5 };
  });
}

// ---------------------------------------------------------------- creators

export interface Creator {
  id: string; handle: string; name: string; ai: boolean;
  /** the bio's first line (a verse bio's lines are split by " / ") */
  bio: string;
  /** the whole bio, for search */
  fullBio: string;
  puzzles: number; likes: number;
  /** puzzles in the last 30 days */
  month: number;
  /** their newest puzzles' ids (three) */
  newest: string[];
  /** set per viewer */
  subscribed?: boolean;
}

/** Every creator with a published puzzle somewhere that's up, with their totals (one row each:
 *  grouped by the author, so no one appears twice). */
async function creatorStats(db: Db, now: number) {
  const since = now - RECENT_DAYS * DAY;
  const rows = await db.select({
    id: schema.games.authorId,
    handle: sql<string>`max(${schema.creators.handle})`, name: sql<string>`max(${schema.creators.name})`,
    ai: sql<number>`max(${schema.creators.isAi})`.mapWith(Boolean),
    bio: sql<string>`coalesce((select k.description from collections k where k.personal_of = ${schema.games.authorId}), '')`,
    puzzles: sql<number>`count(*)`.mapWith(Number),
    likes: sql<number>`sum((select count(*) from likes l where l.game_id = ${schema.games.id}))`.mapWith(Number),
    recent: sql<string | null>`group_concat(case when ${schema.games.publishedAt} >= ${since} then ${schema.games.publishedAt} end)`,
  }).from(schema.games)
    .innerJoin(schema.collections, eq(schema.games.collectionId, schema.collections.id))
    .innerJoin(schema.creators, eq(schema.games.authorId, schema.creators.id))
    .where(and(live, isNull(schema.creators.deletedAt)))
    .groupBy(schema.games.authorId);
  return rows.map((r): CreatorStats & Omit<Creator, "newest" | "month" | "subscribed"> & { month: number } => {
    const recent = (r.recent ?? "").split(",").filter(Boolean).map(Number);
    return { id: r.id, handle: r.handle, name: r.name, ai: r.ai, bio: firstLine(r.bio), fullBio: r.bio, puzzles: r.puzzles, likes: r.likes ?? 0, recent, month: recent.length };
  });
}

/** Each of these authors' newest `n` puzzles (a window query, one per group of 90 authors). */
async function newestOf(db: Db, authorIds: string[], n = 3): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < authorIds.length; i += 90) {
    const ids = authorIds.slice(i, i + 90);
    const ranked = db.select({ id: schema.games.id, n: sql<number>`row_number() over (partition by ${schema.games.authorId} order by ${schema.games.publishedAt} desc)`.as("n") })
      .from(schema.games).innerJoin(schema.collections, eq(schema.games.collectionId, schema.collections.id))
      .where(and(live, inArray(schema.games.authorId, ids))).as("ranked");
    out.push(...await puzzles(db).innerJoin(ranked, eq(ranked.id, schema.games.id)).where(lte(ranked.n, n)).orderBy(desc(schema.games.publishedAt)) as Row[]);
  }
  return out;
}

/** Each author's newest `n` puzzles, as ids by author, with their pictures (the Recommends tab). */
export async function newestPictures(db: Db, authorIds: string[], n = 2) {
  const pictures: Pictures = {}, byAuthor: Record<string, string[]> = {};
  for (const p of toCards(await newestOf(db, authorIds, n), pictures)) (byAuthor[p.authorId] ??= []).push(p.id);
  return { byAuthor, pictures };
}

// ---------------------------------------------------------------- the shelves

export interface Recommends {
  who: { handle: string; name: string; ai: boolean };
  picks: (Creator & { note: string })[];
}

export interface Shelves {
  now: number;
  today: Puzzle[]; quick: Puzzle[]; hard: Puzzle[];
  starters: { kind: string; name: string; summary: string; id: string; minutes: number }[];
  types: { kind: string; name: string; count: number }[];
  /** every listed type's count (types with none too) */
  typeCount: number;
  people: Creator[]; ai: Creator[]; aiTotal: number;
  recommends: Recommends | null;
  pictures: Pictures;
  /** guide pictures by type, for Start here and the tiles */
  guidePictures: Pictures;
  /** everyone with a published puzzle, ranked (search reads it) */
  everyone: Creator[];
}

/** The guide pictures (the worked example, unsolved), drawn once per Worker. */
let guideThumbs: Pictures | null = null;
export const guidePictures = (): Pictures => (guideThumbs ??= Object.fromEntries(ORDER.filter((k) => k !== "coats").map((k) => [k, { svg: guideCard(k).thumb, kind: k }])));
/** Each type's pen colour (its guide's ink), for its pictures. */
export const inks = () => Object.fromEntries(ORDER.map((k) => [k, guides[k].ink]));

const QUICK_MINUTES = 5;
/** How long a worked-out set of shelves is used (per Worker); none in development, so changes show at once. */
const TTL = import.meta.env.DEV ? 0 : 60_000;
let cache: { at: number; today: Promise<TodayShelf>; data: Promise<Shelves> } | null = null;

/** Today, the first shelf, on its own: Explore shows it first and the other shelves after it. */
export interface TodayShelf { now: number; today: Puzzle[]; pictures: Pictures }

function cached(db: Db, now: number) {
  if (cache && now - cache.at < TTL) return cache;
  const built = buildShelves(db, now);
  const c = { at: now, ...built };
  cache = c;
  built.data.catch(() => { if (cache === c) cache = null; });
  built.today.catch(() => {});
  return c;
}

/** The shelves, worked out at most once a minute. */
export const shelves = (db: Db, now = Date.now()): Promise<Shelves> => cached(db, now).data;
/** Today's shelf, ready before the rest, and all the shelves (one working-out for both). */
export const shelvesSoon = (db: Db, now = Date.now()): { today: Promise<TodayShelf>; data: Promise<Shelves> } => cached(db, now);

function buildShelves(db: Db, now: number): { today: Promise<TodayShelf>; data: Promise<Shelves> } {
  const weekAgo = new Date(now - 7 * DAY);
  // the newest week's puzzles: Today, and later This week's hard ones
  // (a real promise: a query builder runs again each time it's awaited)
  const weekQ = Promise.resolve(puzzles(db).where(and(live, gte(schema.games.publishedAt, weekAgo))).orderBy(desc(schema.games.publishedAt)).limit(400));
  const today = weekQ.then((week) => {
    const pictures: Pictures = {};
    // Today: newest weighted by likes (rank.ts)
    const recent = (week as Row[]).filter((r) => r.publishedAt && now - r.publishedAt.getTime() <= TODAY_WINDOW_DAYS * DAY)
      .map((row) => ({ row, likes: row.likes, publishedAt: row.publishedAt!.getTime(), authorId: row.authorId }));
    return { now, today: toCards(rankToday(recent, now).map((x) => x.row), pictures), pictures };
  });
  return { today, data: buildRest(db, now, weekQ, today) };
}

async function buildRest(db: Db, now: number, weekQ: Promise<unknown>, todayP: Promise<TodayShelf>): Promise<Shelves> {
  const starterIds = ORDER.filter((k) => k !== "coats").map(exampleGameId);
  const [week, { today, pictures: todayPics }, quickRows, starterRows, counts, stats, recs] = await Promise.all([
    weekQ, todayP,
    puzzles(db).where(and(live, lte(schema.games.minutes, QUICK_MINUTES))).orderBy(desc(schema.games.publishedAt)).limit(120),
    db.select({ id: schema.games.id, kind: schema.games.kind, minutes: schema.games.minutes }).from(schema.games)
      .where(and(inArray(schema.games.id, starterIds), eq(schema.games.state, "published"))),
    db.select({ kind: schema.games.kind, n: sql<number>`count(*)`.mapWith(Number) }).from(schema.games)
      .innerJoin(schema.collections, eq(schema.games.collectionId, schema.collections.id)).where(live).groupBy(schema.games.kind),
    creatorStats(db, now),
    db.select({ by: schema.recommendations.recommenderId, to: schema.recommendations.recommendedId, note: schema.recommendations.note })
      .from(schema.recommendations).orderBy(schema.recommendations.recommenderId, schema.recommendations.position),
    // older games get their estimate, a batch at a time (the cron does the rest; until then a card estimates its own)
    backfillEstimates(db, 100),
  ]);
  const pics: Pictures = { ...todayPics };
  const shown = new Set(today.map((p) => p.id));
  // Quick ones: ~5 minutes or less, newest first, a different type each
  const quick = pickVaried(toCards((quickRows as Row[]).filter((r) => !shown.has(r.id)), null), 12);
  quick.forEach((p) => shown.add(p.id));
  // This week's hard ones: the hardest of the last seven days (hard first, then medium), a different type each
  const weekCards = toCards((week as Row[]).filter((r) => !shown.has(r.id) && (r.level ?? 2) >= 2), null);
  const diff = new Map((week as Row[]).map((r) => [r.id, r.level ?? 2]));
  const hard = pickVaried([...weekCards].sort((a, b) => (diff.get(b.id)! - diff.get(a.id)!) || b.minutes - a.minutes || b.publishedAt - a.publishedAt), 10);

  // the pictures of the ones chosen
  const chosen = new Set([...quick, ...hard].map((p) => p.id));
  toCards([...(quickRows as Row[]), ...(week as Row[])].filter((r) => chosen.has(r.id)), pics);

  // Start here: each type's guide example, easiest first in the guides' order
  const starterBy = new Map(starterRows.map((r) => [r.kind, r]));
  // (twelve a day, going round the types)
  const all = ORDER.filter((k) => starterBy.has(k)), from = Math.floor(now / DAY) * 12 % Math.max(1, all.length);
  const starters = [...all.slice(from), ...all.slice(0, from)].slice(0, 12).map((k) => ({ kind: k, name: guides[k].name, summary: guides[k].summary, id: starterBy.get(k)!.id, minutes: starterBy.get(k)!.minutes ?? 2 }));
  // Browse by type: the most made first
  const countOf = new Map(counts.map((c) => [c.kind, c.n]));
  const types = ORDER.filter((k) => k !== "coats").map((k) => ({ kind: k, name: kindName(k), count: countOf.get(k) ?? 0 })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Creators: ranked (rank.ts), people and AI creators on shelves of their own
  const ranked = rankCreators(stats, now, averageLikes(stats));
  const people = ranked.filter((c) => !c.ai).slice(0, 10), ai = ranked.filter((c) => c.ai);
  // "… recommends": someone with a published puzzle who recommends at least one creator with one, a different one each day
  const byId = new Map(ranked.map((c) => [c.id, c]));
  const recommenders = [...new Set(recs.map((r) => r.by))].filter((id) => byId.has(id) && recs.some((r) => r.by === id && byId.has(r.to)));
  const who = pickOfTheDay(recommenders, now);
  const picks = who ? recs.filter((r) => r.by === who && byId.has(r.to)).map((r) => ({ c: byId.get(r.to)!, note: r.note })) : [];

  const onShelves = [...new Set([...people, ...ai.slice(0, 10), ...picks.map((p) => p.c)].map((c) => c.id))];
  const newest = toCards(await newestOf(db, onShelves, 3), pics);
  const newestBy = new Map<string, string[]>();
  for (const p of newest) newestBy.set(p.authorId, [...(newestBy.get(p.authorId) ?? []), p.id]);
  const card = (c: (typeof ranked)[number]): Creator => ({ id: c.id, handle: c.handle, name: c.name, ai: c.ai, bio: c.bio, fullBio: c.fullBio, puzzles: c.puzzles, likes: c.likes, month: c.month, newest: newestBy.get(c.id) ?? [] });
  const whoC = who ? byId.get(who)! : null;

  return {
    now, today, quick, hard, starters, types, typeCount: types.length,
    people: people.map(card), ai: ai.slice(0, 10).map(card), aiTotal: ai.length,
    recommends: whoC && picks.length ? { who: { handle: whoC.handle, name: whoC.name, ai: whoC.ai }, picks: picks.map((p) => ({ ...card(p.c), note: p.note })) } : null,
    pictures: pics, guidePictures: guidePictures(),
    everyone: ranked.map((c) => ({ ...card(c), newest: [] })),
  };
}

// ---------------------------------------------------------------- search

/** Words to search for: up to five, lowercased. */
export const searchWords = (q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);

/** What a search's puzzles match: every word in the title or description, or a type the words
 *  name (its name, other names or category). Shared with playing through the results. */
export function searchMatch(q: string): SQL | undefined {
  const words = searchWords(q);
  if (!words.length) return undefined;
  const has = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const kinds = ORDER.filter((k) => has([guides[k].name, k, ...(guides[k].aka ?? []), guides[k].category].join(" "))).slice(0, 30);
  const text = and(...words.map((w) => or(like(sql`lower(${schema.games.title})`, `%${w}%`), like(sql`lower(${schema.games.description})`, `%${w}%`))));
  return kinds.length ? or(text, inArray(schema.games.kind, kinds)) : text;
}

/** Search: the types, creators and puzzles that match every word (a type's puzzles match its name). */
export async function search(db: Db, q: string, s: Shelves) {
  const words = searchWords(q);
  if (!words.length) return null;
  const has = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const types = s.types.filter((t) => has([t.name, t.kind, ...(guides[t.kind as keyof typeof guides].aka ?? []), guides[t.kind as keyof typeof guides].category].join(" ")));
  const creators = s.everyone.filter((c) => has(`${c.name} @${c.handle} ${c.fullBio}`)).slice(0, 8);
  const rows = await puzzles(db).where(and(live, searchMatch(q))).orderBy(desc(schema.games.publishedAt), desc(schema.games.id)).limit(24);
  const pics: Pictures = {};
  return { types, creators, puzzles: toCards(rows as Row[], pics), pictures: pics };
}

// ---------------------------------------------------------------- a type's page (and every type's)

export interface ListFilter {
  /** a type, or null for every type */
  kind: string | null;
  /** every type's page: one category of types (Lines, Numbers, ...) */
  category?: string | null;
  sort: (typeof SORTS)[number];
  /** Top: over the last week, month, or all time */
  period: (typeof PERIODS)[number];
  level: 1 | 2 | 3 | null;
  quick: boolean;
  /** leave out what this viewer has solved */
  hideSolvedFor?: string | null;
  /** Explore's search (titles, descriptions, types' names) */
  q?: string;
  /** one creator's puzzles (their handle) */
  by?: string | null;
  limit: number;
}

/** What a type's page (or a search) lists: the conditions, and its order (ties broken by id, so
 *  playing through it steps the same way: lib/list-play.server.ts). */
export function listWhere(db: Db, f: Omit<ListFilter, "limit">, now = Date.now()): SQL | undefined {
  const where: (SQL | undefined)[] = [live];
  if (f.kind) where.push(eq(schema.games.kind, f.kind));
  else if (f.category) {
    const kinds = ORDER.filter((k) => guides[k].category === f.category);
    where.push(inArray(schema.games.kind, kinds.length ? kinds : ["-"]));
  }
  if (f.q) where.push(searchMatch(f.q));
  if (f.by) where.push(inArray(schema.games.authorId, db.select({ id: schema.creators.id }).from(schema.creators).where(eq(schema.creators.handle, f.by))));
  if (f.level) where.push(eq(schema.games.level, f.level));
  if (f.quick) where.push(lte(schema.games.minutes, QUICK_MINUTES));
  if (f.sort === "top" && f.period !== "all") where.push(gte(schema.games.publishedAt, new Date(now - (f.period === "week" ? 7 : 30) * DAY)));
  if (f.hideSolvedFor) where.push(notExists(db.select({ x: sql`1` }).from(schema.solves).where(and(eq(schema.solves.gameId, schema.games.id), eq(schema.solves.creatorId, f.hideSolvedFor)))));
  return and(...where);
}
/** The keys a list is sorted by, most significant first, all descending. */
export const listKeys = (sort: ListFilter["sort"]) => (sort === "top" ? [likeCount, schema.games.publishedAt, schema.games.id] : [schema.games.publishedAt, schema.games.id]);
export { likeCount };

/** Puzzles for a type's page: New (newest first) or Top (most liked over a period), by difficulty;
 *  each marked with whether `viewerId` has solved it (in the same query). */
export async function listPuzzles(db: Db, f: ListFilter, now = Date.now(), viewerId: string | null = null) {
  const solved = viewerId
    ? sql<number>`exists(select 1 from solves s where s.game_id = ${schema.games.id} and s.creator_id = ${viewerId})`.mapWith(Boolean)
    : sql<number>`0`.mapWith(Boolean);
  const rows = await db.select({ ...columns, solved: solved.as("solved") }).from(schema.games)
    .innerJoin(schema.collections, eq(schema.games.collectionId, schema.collections.id))
    .innerJoin(schema.creators, eq(schema.games.authorId, schema.creators.id)).where(listWhere(db, f, now)).orderBy(...listKeys(f.sort).map((k) => desc(k))).limit(f.limit + 1);
  const pics: Pictures = {};
  return { puzzles: toCards(rows.slice(0, f.limit) as Row[], pics), more: rows.length > f.limit, pictures: pics };
}

/** A type's numbers: puzzles, creators, and new this week. */
export async function typeStats(db: Db, kind: string, now = Date.now()) {
  const [r] = await db.select({
    puzzles: sql<number>`count(*)`.mapWith(Number),
    creators: sql<number>`count(distinct ${schema.games.authorId})`.mapWith(Number),
    week: sql<number>`sum(case when ${schema.games.publishedAt} >= ${now - 7 * DAY} then 1 else 0 end)`.mapWith(Number),
  }).from(schema.games).innerJoin(schema.collections, eq(schema.games.collectionId, schema.collections.id)).where(and(live, eq(schema.games.kind, kind)));
  return { puzzles: r?.puzzles ?? 0, creators: r?.creators ?? 0, week: r?.week ?? 0 };
}
