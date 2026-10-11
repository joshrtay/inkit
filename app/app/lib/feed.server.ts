// The Subscriptions feed, a page at a time: home.tsx loads the first page, routes/api.feed.ts (/api/feed) the
// next ones as the player scrolls.
import type { Db } from "~/db";
import { feedGames, likedAmong, solvedAmong, type FeedCursor } from "~/lib/queries.server";
import { withPictures } from "~/lib/thumbs.server";
import { setCards } from "~/lib/sets.server";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { schema } from "~/db";

export const FEED_PAGE = 24;

export async function feedPage(db: Db, meId: string, before: FeedCursor | null = null) {
  const games = await feedGames(db, meId, FEED_PAGE, before);
  const ids = games.map((g) => g.id);
  const [liked, solved] = await Promise.all([likedAmong(db, meId, ids), solvedAmong(db, meId, ids)]);
  const last = games.at(-1);
  const next = games.length === FEED_PAGE && last?.publishedAt ? `${last.publishedAt.getTime()}-${last.id}` : null;
  // the sets published in the same stretch of time as this page's puzzles, from the same creators
  const upTo = before ? new Date(before.at) : null, from = next && last?.publishedAt ? last.publishedAt : null;
  const sets = await db.select().from(schema.sets).innerJoin(schema.collections, eq(schema.sets.collectionId, schema.collections.id))
    .where(and(eq(schema.sets.state, "published"), isNull(schema.collections.deletedAt),
      inArray(schema.sets.collectionId, db.select({ id: schema.subscriptions.collectionId }).from(schema.subscriptions).where(eq(schema.subscriptions.subscriberId, meId))),
      upTo ? lt(schema.sets.publishedAt, upTo) : undefined, from ? gte(schema.sets.publishedAt, from) : undefined));
  return {
    games: withPictures(games).map((g) => ({ ...g, liked: liked.has(g.id), solved: solved.has(g.id) })),
    sets: await setCards(db, sets.map((r) => r.sets)),
    // where the next page starts, or none: a short page is the last one
    next,
  };
}
