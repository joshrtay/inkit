// Reading games and collections for pages (permission checks are in permissions.server.ts).
import { and, count, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { schema, type Db } from "../db";

/** A game card: the game plus its collection and author, for lists. */
const cardColumns = {
  id: schema.games.id, title: schema.games.title, description: schema.games.description,
  kind: schema.games.kind, thumbnail: schema.games.thumbnail, state: schema.games.state,
  sketch: schema.games.sketch, sketchVersion: schema.games.sketchVersion, publishedAt: schema.games.publishedAt,
  updatedAt: schema.games.updatedAt, parseNotes: schema.games.parseNotes,
  likes: sql<number>`(select count(*) from likes where likes.game_id = ${schema.games.id})`.as("like_count"),
  solves: sql<number>`(select count(*) from solves where solves.game_id = ${schema.games.id})`.as("solve_count"),
  collectionSlug: schema.collections.slug, collectionTitle: schema.collections.title,
  authorHandle: schema.creators.handle, authorName: schema.creators.name, authorDeleted: schema.creators.deletedAt,
  authorAi: schema.creators.isAi, publishAt: schema.games.publishAt,
};

const cards = (db: Db) => db.select(cardColumns).from(schema.games)
  .innerJoin(schema.collections, eq(schema.games.collectionId, schema.collections.id))
  .innerJoin(schema.creators, eq(schema.games.authorId, schema.creators.id));

const live = and(eq(schema.games.state, "published"), isNull(schema.collections.deletedAt));

export const featuredGames = (db: Db) => db.select(cardColumns).from(schema.featured)
  .innerJoin(schema.games, eq(schema.featured.gameId, schema.games.id))
  .innerJoin(schema.collections, eq(schema.games.collectionId, schema.collections.id))
  .innerJoin(schema.creators, eq(schema.games.authorId, schema.creators.id))
  .where(live).orderBy(schema.featured.position);

export const newestGames = (db: Db, limit = 24) => cards(db).where(live).orderBy(desc(schema.games.publishedAt)).limit(limit);

/** A collection's games, newest first (drafts and hidden games only if `all`). */
export const collectionGames = (db: Db, collectionId: string, all: boolean) => cards(db)
  .where(all ? eq(schema.games.collectionId, collectionId) : and(eq(schema.games.collectionId, collectionId), eq(schema.games.state, "published")))
  .orderBy(desc(schema.games.updatedAt));

export const collectionBySlug = (db: Db, slug: string) =>
  db.query.collections.findFirst({ where: eq(schema.collections.slug, slug) });

export const collectionMembers = (db: Db, collectionId: string) => db.select({
  handle: schema.creators.handle, name: schema.creators.name, role: schema.memberships.role,
}).from(schema.memberships)
  .innerJoin(schema.creators, eq(schema.memberships.creatorId, schema.creators.id))
  .where(and(eq(schema.memberships.collectionId, collectionId), isNull(schema.creators.deletedAt)));

export type GameCard = Awaited<ReturnType<typeof newestGames>>[number];

// ---- subscriptions ----

/** The newest games from the collections someone subscribes to. */
export const feedGames = (db: Db, subscriberId: string, limit = 40) => cards(db)
  .where(and(live, inArray(schema.games.collectionId,
    db.select({ id: schema.subscriptions.collectionId }).from(schema.subscriptions).where(eq(schema.subscriptions.subscriberId, subscriberId)))))
  .orderBy(desc(schema.games.publishedAt)).limit(limit);

export const isSubscribed = async (db: Db, subscriberId: string | undefined, collectionId: string) => !!subscriberId && !!(await db.query.subscriptions.findFirst({
  where: and(eq(schema.subscriptions.subscriberId, subscriberId), eq(schema.subscriptions.collectionId, collectionId)),
}));

/** Collections for lists (Explore, someone's subscriptions): who they are, how many games and subscribers. */
const collectionCards = (db: Db) => db.select({
  id: schema.collections.id, slug: schema.collections.slug, title: schema.collections.title, description: schema.collections.description,
  personal: sql<boolean>`${schema.collections.personalOf} is not null`,
  /** an AI creator's personal collection */
  ai: sql<boolean>`coalesce((select c.is_ai from creators c where c.id = collections.personal_of), 0)`.as("is_ai_collection"),
  // (table names written out: inside a subquery drizzle's bare "id" would mean the subquery's table)
  games: sql<number>`(select count(*) from games g where g.collection_id = collections.id and g.state = 'published')`.as("game_count"),
  subscribers: sql<number>`(select count(*) from subscriptions s where s.collection_id = collections.id)`.as("subscriber_count"),
}).from(schema.collections);

/** Creators and studios to find: the most followed and busiest first; `q` searches names and handles. */
export const exploreCollections = (db: Db, q: string, limit = 60) => {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  const match = words.map((w) => or(like(sql`lower(${schema.collections.title})`, `%${w}%`), like(schema.collections.slug, `%${w}%`), like(sql`lower(${schema.collections.description})`, `%${w}%`)));
  return collectionCards(db).where(and(isNull(schema.collections.deletedAt), ...match))
    .orderBy(sql`subscriber_count desc`, sql`game_count desc`, schema.collections.title).limit(limit);
};

/** The collections someone subscribes to. */
export const subscriptionsOf = (db: Db, subscriberId: string) => collectionCards(db)
  .where(and(isNull(schema.collections.deletedAt), inArray(schema.collections.id,
    db.select({ id: schema.subscriptions.collectionId }).from(schema.subscriptions).where(eq(schema.subscriptions.subscriberId, subscriberId)))))
  .orderBy(schema.collections.title);

export const subscriberCount = async (db: Db, collectionId: string) =>
  (await db.select({ n: count() }).from(schema.subscriptions).where(eq(schema.subscriptions.collectionId, collectionId)))[0]?.n ?? 0;

export type CollectionCard = Awaited<ReturnType<typeof subscriptionsOf>>[number];

/** A game's likes, and whether this viewer likes it. */
export async function likesOf(db: Db, gameId: string, viewerId: string | undefined) {
  const [{ n }] = await db.select({ n: count() }).from(schema.likes).where(eq(schema.likes.gameId, gameId));
  const liked = !!viewerId && !!(await db.query.likes.findFirst({ where: and(eq(schema.likes.gameId, gameId), eq(schema.likes.creatorId, viewerId)) }));
  return { count: n, liked };
}

/** Ids in groups small enough for one query (D1 takes at most 100 bound parameters). */
const chunks = (ids: string[], size = 90) => Array.from({ length: Math.ceil(ids.length / size) }, (_, k) => ids.slice(k * size, (k + 1) * size));

/** Which of these games this viewer likes. */
export async function likedAmong(db: Db, viewerId: string | undefined, gameIds: string[]) {
  if (!viewerId || !gameIds.length) return new Set<string>();
  const rows = (await Promise.all(chunks(gameIds).map((ids) => db.select({ id: schema.likes.gameId }).from(schema.likes)
    .where(and(eq(schema.likes.creatorId, viewerId), inArray(schema.likes.gameId, ids)))))).flat();
  return new Set(rows.map((r) => r.id));
}

/** A game's solves, and whether this viewer has solved it. */
export async function solvesOf(db: Db, gameId: string, viewerId: string | undefined) {
  const [{ n }] = await db.select({ n: count() }).from(schema.solves).where(eq(schema.solves.gameId, gameId));
  const solved = !!viewerId && !!(await db.query.solves.findFirst({ where: and(eq(schema.solves.gameId, gameId), eq(schema.solves.creatorId, viewerId)) }));
  return { count: n, solved };
}

/** Which of these games this viewer has solved. */
export async function solvedAmong(db: Db, viewerId: string | undefined, gameIds: string[]) {
  if (!viewerId || !gameIds.length) return new Set<string>();
  const rows = (await Promise.all(chunks(gameIds).map((ids) => db.select({ id: schema.solves.gameId }).from(schema.solves)
    .where(and(eq(schema.solves.creatorId, viewerId), inArray(schema.solves.gameId, ids)))))).flat();
  return new Set(rows.map((r) => r.id));
}

/** These games, each marked with whether this viewer has solved it. */
export async function markSolved<G extends { id: string }>(db: Db, viewerId: string | undefined, games: G[]) {
  const solved = await solvedAmong(db, viewerId, games.map((g) => g.id));
  return games.map((g) => ({ ...g, solved: solved.has(g.id) }));
}

/** How many times a collection's published puzzles have been solved, all together. */
export const collectionSolves = async (db: Db, collectionId: string) =>
  (await db.select({ n: count() }).from(schema.solves)
    .innerJoin(schema.games, eq(schema.solves.gameId, schema.games.id))
    .where(and(eq(schema.games.collectionId, collectionId), eq(schema.games.state, "published"))))[0]?.n ?? 0;
