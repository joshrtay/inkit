// The Subscriptions feed, a page at a time: home.tsx loads the first page, routes/api.feed.ts (/api/feed) the
// next ones as the player scrolls.
import type { Db } from "~/db";
import { feedGames, type FeedCursor } from "~/lib/queries.server";
import { withPictures } from "~/lib/thumbs.server";
import { setCards } from "~/lib/sets.server";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { schema } from "~/db";

export const FEED_PAGE = 24;

export async function feedPage(db: Db, meId: string, before: FeedCursor | null = null) {
  const upTo = before ? new Date(before.at) : null;
  // the page's puzzles (with the subscriber's likes and solves), and the sets published before
  // the page's end, side by side
  const [games, setRows] = await Promise.all([
    feedGames(db, meId, FEED_PAGE, before),
    db.select().from(schema.sets).innerJoin(schema.collections, eq(schema.sets.collectionId, schema.collections.id))
      .where(and(eq(schema.sets.state, "published"), isNull(schema.collections.deletedAt),
        inArray(schema.sets.collectionId, db.select({ id: schema.subscriptions.collectionId }).from(schema.subscriptions).where(eq(schema.subscriptions.subscriberId, meId))),
        upTo ? lt(schema.sets.publishedAt, upTo) : undefined)),
  ]);
  const last = games.at(-1);
  const next = games.length === FEED_PAGE && last?.publishedAt ? `${last.publishedAt.getTime()}-${last.id}` : null;
  // the sets published in the same stretch of time as this page's puzzles, from the same creators
  const from = next && last?.publishedAt ? last.publishedAt.getTime() : null;
  const sets = setRows.map((r) => r.sets).filter((x) => from === null || (x.publishedAt?.getTime() ?? 0) >= from);
  return {
    games: withPictures(games).map((g, i) => ({ ...g, liked: !!games[i].liked, solved: !!games[i].solved })),
    sets: await setCards(db, sets),
    // where the next page starts, or none: a short page is the last one
    next,
  };
}
