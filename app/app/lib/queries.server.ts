// Reading games and collections for pages (permission checks are in permissions.server.ts).
import { and, desc, eq, isNull } from "drizzle-orm";
import { schema, type Db } from "../db";

/** A game card: the game plus its collection and author, for lists. */
const cardColumns = {
  id: schema.games.id, title: schema.games.title, description: schema.games.description,
  kind: schema.games.kind, thumbnail: schema.games.thumbnail, state: schema.games.state,
  collectionSlug: schema.collections.slug, collectionTitle: schema.collections.title,
  authorHandle: schema.creators.handle, authorName: schema.creators.name, authorDeleted: schema.creators.deletedAt,
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
