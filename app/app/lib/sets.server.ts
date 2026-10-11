// Sets: a curated sequence of published puzzles (docs/research-curation.md). Reading them for
// their page (routes/set.tsx), for playing through one (lib/list-play.server.ts) and for cards
// (a profile's grid, the feed, search); changing a draft (the drawer). Once published, a set's
// puzzles and their order stay put; its words can still be fixed.
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Db } from "~/db";
import { cards, type GameCard } from "./queries.server";
import { withPictures, type Thumbed } from "./thumbs.server";

type Creator = typeof schema.creators.$inferSelect;
export type SetRow = typeof schema.sets.$inferSelect;

export const SET_TITLE_MAX = 80;
export const SET_DESCRIPTION_MAX = 280;

/** Who may see a set: anyone once it's published (and its profile is up); a draft or a taken-down
 *  one, its author and admins. */
export function canViewSet(set: SetRow, collection: { deletedAt: Date | null } | undefined, viewer: Creator | null) {
  if (set.state === "deleted" || !collection) return false;
  if (set.state === "published" && !collection.deletedAt) return true;
  return !!viewer && (viewer.isAdmin || set.authorId === viewer.id);
}
/** Who may change a draft set (and publish or delete it): its author. */
export const canEditSet = (set: SetRow, viewer: Creator | null) => !!viewer && set.authorId === viewer.id && set.state === "draft";

export async function setById(db: Db, id: string) {
  const set = await db.query.sets.findFirst({ where: eq(schema.sets.id, id) });
  if (!set) return null;
  const [collection, author] = await Promise.all([
    db.query.collections.findFirst({ where: eq(schema.collections.id, set.collectionId) }),
    db.query.creators.findFirst({ where: eq(schema.creators.id, set.authorId) }),
  ]);
  return collection && author ? { set, collection, author } : null;
}

export type SetPuzzle = Thumbed & { level: number | null; minutes: number | null };

/** A set's puzzles that can be played, in order (one taken down or deleted since is skipped). */
export async function setPuzzles(db: Db, setId: string): Promise<SetPuzzle[]> {
  const rows = await cards(db)
    .innerJoin(schema.setItems, eq(schema.setItems.gameId, schema.games.id))
    .where(and(eq(schema.setItems.setId, setId), eq(schema.games.state, "published"), isNull(schema.collections.deletedAt)))
    .orderBy(asc(schema.setItems.position));
  const ids = rows.map((r) => r.id);
  const extra = new Map<string, { level: number | null; minutes: number | null }>();
  for (let i = 0; i < ids.length; i += 90) {
    for (const r of await db.select({ id: schema.games.id, level: schema.games.level, minutes: schema.games.minutes }).from(schema.games).where(inArray(schema.games.id, ids.slice(i, i + 90)))) extra.set(r.id, r);
  }
  return withPictures(rows as GameCard[]).map((g) => ({ ...g, level: extra.get(g.id)?.level ?? null, minutes: extra.get(g.id)?.minutes ?? null }));
}

/** The ids of a set's playable puzzles, in order (cheap: for stepping through it). */
export async function setOrder(db: Db, setId: string): Promise<string[]> {
  const rows = await db.select({ id: schema.games.id }).from(schema.setItems)
    .innerJoin(schema.games, eq(schema.setItems.gameId, schema.games.id))
    .innerJoin(schema.collections, eq(schema.games.collectionId, schema.collections.id))
    .where(and(eq(schema.setItems.setId, setId), eq(schema.games.state, "published"), isNull(schema.collections.deletedAt)))
    .orderBy(asc(schema.setItems.position));
  return rows.map((r) => r.id);
}

/** What a set's card and page say about it: how many, roughly how long, how hard on average. */
export function setSummary(puzzles: { level: number | null; minutes: number | null }[]) {
  const levels = puzzles.map((p) => p.level ?? 1);
  return {
    count: puzzles.length,
    minutes: puzzles.reduce((n, p) => n + (p.minutes ?? 0), 0),
    level: (levels.length ? Math.min(3, Math.max(1, Math.round(levels.reduce((a, b) => a + b, 0) / levels.length))) : 1) as 1 | 2 | 3,
  };
}

/** A set as a card: its cover (the first four pictures), and its numbers. */
export interface SetCard {
  id: string; title: string; state: SetRow["state"];
  authorHandle: string; authorName: string; authorAi: boolean;
  publishedAt: number | null; updatedAt: number;
  cover: (string | null)[];
  count: number; minutes: number; level: 1 | 2 | 3;
}

/** Cards for sets (in the order given). */
export async function setCards(db: Db, rows: SetRow[]): Promise<SetCard[]> {
  const out: SetCard[] = [];
  for (const s of rows) {
    const [puzzles, author] = await Promise.all([setPuzzles(db, s.id), db.query.creators.findFirst({ where: eq(schema.creators.id, s.authorId) })]);
    out.push({
      id: s.id, title: s.title, state: s.state,
      authorHandle: author?.handle ?? "", authorName: author?.name ?? "", authorAi: !!author?.isAi,
      publishedAt: s.publishedAt?.getTime() ?? null, updatedAt: s.updatedAt.getTime(),
      cover: puzzles.slice(0, 4).map((p) => p.picture),
      ...setSummary(puzzles),
    });
  }
  return out;
}

/** A profile's sets: published (newest first), and its drafts if `drafts`. */
export async function setsOn(db: Db, collectionId: string, drafts = false) {
  return db.select().from(schema.sets)
    .where(and(eq(schema.sets.collectionId, collectionId), inArray(schema.sets.state, drafts ? ["draft"] : ["published"])))
    .orderBy(sql`coalesce(${schema.sets.publishedAt}, ${schema.sets.updatedAt}) desc`, sql`${schema.sets.id} desc`);
}
