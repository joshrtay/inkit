// Playing through a list (lib/list-context.ts): a puzzle's neighbours in the list it was opened
// from, found the way the list itself is sorted. A list sorted by keys (newest first, or most liked)
// steps by keyset, so it neither skips nor repeats as puzzles come and go, and works for a puzzle
// that has left the list (solved, with "Not solved yet" on). Explore's shelves are ranked lists,
// stepped through as they are.
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, type SQL, type SQLWrapper } from "drizzle-orm";
import { schema, type Db } from "~/db";
import { kindName } from "~/games/kinds";
import { likeCount, listKeys, listWhere, shelves } from "./explore.server";
import { contextLabel, contextQuery, inList, type ListContext } from "./list-context";

const live = and(eq(schema.games.state, "published"), isNull(schema.collections.deletedAt));

/** Rows after `cur` in a list sorted by `keys` descending ("after": further down the list), or
 *  before it (`back`), nearest first. */
function beyond(keys: SQLWrapper[], cur: unknown[], back: boolean): SQL {
  const cmp = back ? gt : lt;
  const ors = keys.map((k, i) => and(...keys.slice(0, i).map((e, j) => eq(e as never, cur[j] as never)), cmp(k as never, cur[i] as never))!);
  return or(...ors)!;
}

async function step(db: Db, where: SQL | undefined, keys: SQLWrapper[], cur: unknown[]) {
  const base = () => db.select({ id: schema.games.id }).from(schema.games).innerJoin(schema.collections, eq(schema.games.collectionId, schema.collections.id));
  const [next] = await base().where(and(where, beyond(keys, cur, false))).orderBy(...keys.map((k) => desc(k as never))).limit(1);
  const [prev] = await base().where(and(where, beyond(keys, cur, true))).orderBy(...keys.map((k) => asc(k as never))).limit(1);
  return { prev: prev?.id ?? null, next: next?.id ?? null };
}

/** Where the list's own page is (the bar's words link back to it). */
export function listPage(c: ListContext): string {
  if (c.in === "set") return `/s/${c.set}`;
  if (c.in === "feed") return "/";
  if (c.in === "shelf") return `/explore#${c.shelf}`;
  if (c.in === "profile") return `/${c.handle}`;
  if (c.q) return `/explore?q=${encodeURIComponent(c.q)}`;
  const q = contextQuery(c).replace(/^\?in=[^&]*&?/, "");
  return `/explore/${c.kind}${q ? `?${q}` : ""}`;
}

/** The bar under the board for a puzzle opened from list `c`: what the list is, where it lives,
 *  and the puzzles before and after this one (as links that carry the list on). Null when the list
 *  can't be followed (a set, step 2; a profile that's gone). */
export async function listBar(db: Db, c: ListContext, game: { id: string }, viewerId: string | null) {
  let around: { prev: string | null; next: string | null };
  let who: string | undefined;
  if (c.in === "shelf") {
    const s = await shelves(db);
    const list = s[c.shelf].map((p) => p.id);
    const at = list.indexOf(game.id);
    around = at < 0 ? { prev: null, next: null } : { prev: list[at - 1] ?? null, next: list[at + 1] ?? null };
  } else if (c.in === "set") {
    return null;
  } else {
    const [cur] = await db.select({ publishedAt: schema.games.publishedAt, likes: likeCount }).from(schema.games).where(eq(schema.games.id, game.id));
    if (!cur?.publishedAt) return null;
    if (c.in === "browse") {
      const where = listWhere(db, {
        kind: c.kind === "all" ? null : c.kind, category: c.category, q: c.q, sort: c.sort, period: c.period, level: c.level, quick: c.quick,
        hideSolvedFor: c.unsolved ? viewerId : null,
      });
      around = await step(db, where, listKeys(c.sort), c.sort === "top" ? [cur.likes, cur.publishedAt, game.id] : [cur.publishedAt, game.id]);
    } else {
      let where: SQL | undefined;
      if (c.in === "profile") {
        const coll = await db.query.collections.findFirst({ where: eq(schema.collections.slug, c.handle) });
        if (!coll) return null;
        // a person's own profile goes by their name; a studio by its title
        const person = coll.personalOf ? await db.query.creators.findFirst({ where: eq(schema.creators.id, coll.personalOf) }) : null;
        who = person?.name ?? coll.title;
        where = and(live, eq(schema.games.collectionId, coll.id));
      } else {
        if (!viewerId) return null;
        where = and(live, inArray(schema.games.collectionId,
          db.select({ id: schema.subscriptions.collectionId }).from(schema.subscriptions).where(eq(schema.subscriptions.subscriberId, viewerId))));
      }
      around = await step(db, where, listKeys("new"), [cur.publishedAt, game.id]);
    }
  }
  return {
    ...contextLabel(c, { kindName, who }),
    page: listPage(c),
    prev: around.prev && inList(around.prev, c),
    next: around.next && inList(around.next, c),
  };
}

export type ListBar = NonNullable<Awaited<ReturnType<typeof listBar>>>;
