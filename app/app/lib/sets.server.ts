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

// ---- changing a draft (the drawer: routes/api.set.ts, /api/sets/<id>) ----

export const SET_MAX_PUZZLES = 100;
const touch = (db: Db, id: string) => db.update(schema.sets).set({ updatedAt: new Date() }).where(eq(schema.sets.id, id));

/** A new draft set on its author's own profile, with a first puzzle if given. */
export async function createSet(db: Db, author: Creator, collectionId: string, title: string, newId: () => string, firstGame?: string) {
  const id = newId();
  await db.insert(schema.sets).values({ id, collectionId, authorId: author.id, title: title.trim().slice(0, SET_TITLE_MAX) || "Untitled set" });
  if (firstGame) await addToSet(db, id, firstGame);
  return id;
}

/** The ids in a set, in order, every one (playable or not). */
const allIn = async (db: Db, setId: string) =>
  (await db.select({ id: schema.setItems.gameId }).from(schema.setItems).where(eq(schema.setItems.setId, setId)).orderBy(asc(schema.setItems.position))).map((r) => r.id);

/** Put the set's puzzles in this order (positions 0, 1, 2, …). */
async function renumber(db: Db, setId: string, ids: string[]) {
  for (let i = 0; i < ids.length; i++) {
    await db.update(schema.setItems).set({ position: i }).where(and(eq(schema.setItems.setId, setId), eq(schema.setItems.gameId, ids[i])));
  }
}

/** Add a published puzzle at the end. Refused (with why) if it can't be in a set. */
export async function addToSet(db: Db, setId: string, gameId: string): Promise<string | null> {
  const game = await db.query.games.findFirst({ where: eq(schema.games.id, gameId) });
  if (!game || game.state !== "published") return "Only published puzzles go in a set.";
  const ids = await allIn(db, setId);
  if (ids.includes(gameId)) return null;
  if (ids.length >= SET_MAX_PUZZLES) return `A set holds up to ${SET_MAX_PUZZLES} puzzles.`;
  await db.insert(schema.setItems).values({ setId, gameId, position: ids.length });
  await touch(db, setId);
  return null;
}

export async function removeFromSet(db: Db, setId: string, gameId: string) {
  await db.delete(schema.setItems).where(and(eq(schema.setItems.setId, setId), eq(schema.setItems.gameId, gameId)));
  await renumber(db, setId, await allIn(db, setId));
  await touch(db, setId);
}

/** Move a puzzle to position `to` (0 is first). */
export async function moveInSet(db: Db, setId: string, gameId: string, to: number) {
  const ids = (await allIn(db, setId)).filter((g) => g !== gameId);
  if (ids.length === (await allIn(db, setId)).length) return;   // not in it
  ids.splice(Math.max(0, Math.min(ids.length, to)), 0, gameId);
  await renumber(db, setId, ids);
  await touch(db, setId);
}

export async function describeSet(db: Db, setId: string, f: { title?: string; description?: string }) {
  const change: Partial<SetRow> = { updatedAt: new Date() };
  if (f.title !== undefined) change.title = f.title.trim().slice(0, SET_TITLE_MAX) || "Untitled set";
  if (f.description !== undefined) change.description = f.description.trim().slice(0, SET_DESCRIPTION_MAX);
  await db.update(schema.sets).set(change).where(eq(schema.sets.id, setId));
}

/** Publish: it needs a puzzle; from then on its puzzles and their order stay put. */
export async function publishSet(db: Db, setId: string): Promise<string | null> {
  if (!(await setOrder(db, setId)).length) return "Add a puzzle first.";
  await db.update(schema.sets).set({ state: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(schema.sets.id, setId));
  return null;
}

/** Delete: a draft is gone for good; a published set goes offline (its link stops working). */
export async function deleteSet(db: Db, set: SetRow) {
  if (set.state === "draft") {
    await db.delete(schema.setItems).where(eq(schema.setItems.setId, set.id));
    await db.delete(schema.sets).where(eq(schema.sets.id, set.id));
  } else await db.update(schema.sets).set({ state: "deleted", updatedAt: new Date() }).where(eq(schema.sets.id, set.id));
}

/** Someone's draft sets, the one they last added to first: the "Add to set" list. */
export async function draftSetsOf(db: Db, authorId: string) {
  const rows = await db.select().from(schema.sets).where(and(eq(schema.sets.authorId, authorId), eq(schema.sets.state, "draft"))).orderBy(sql`${schema.sets.updatedAt} desc`).limit(30);
  return setCards(db, rows);
}

/** Published sets whose title or description has every word (Explore's search). */
export async function searchSets(db: Db, words: string[], limit = 6) {
  if (!words.length) return [];
  const rows = await db.select().from(schema.sets).innerJoin(schema.collections, eq(schema.sets.collectionId, schema.collections.id))
    .where(and(eq(schema.sets.state, "published"), isNull(schema.collections.deletedAt),
      ...words.map((w) => sql`(lower(${schema.sets.title}) like ${`%${w}%`} or lower(${schema.sets.description}) like ${`%${w}%`})`)))
    .orderBy(sql`${schema.sets.publishedAt} desc`).limit(limit);
  return setCards(db, rows.map((r) => r.sets));
}
