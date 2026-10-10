// The Subscriptions feed, a page at a time: home.tsx loads the first page, routes/feed.ts the
// next ones as the player scrolls.
import type { Db } from "~/db";
import { feedGames, likedAmong, solvedAmong, type FeedCursor } from "~/lib/queries.server";
import { withPictures } from "~/lib/thumbs.server";

export const FEED_PAGE = 24;

export async function feedPage(db: Db, meId: string, before: FeedCursor | null = null) {
  const games = await feedGames(db, meId, FEED_PAGE, before);
  const ids = games.map((g) => g.id);
  const [liked, solved] = await Promise.all([likedAmong(db, meId, ids), solvedAmong(db, meId, ids)]);
  const last = games.at(-1);
  return {
    games: withPictures(games).map((g) => ({ ...g, liked: liked.has(g.id), solved: solved.has(g.id) })),
    // where the next page starts, or none: a short page is the last one
    next: games.length === FEED_PAGE && last?.publishedAt ? `${last.publishedAt.getTime()}-${last.id}` : null,
  };
}
