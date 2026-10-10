// Explore's data (components/ExplorePage.tsx): the shelves, or a search's results (?q=), with the
// viewer's own marks (what they've solved, whom they subscribe to). Served at /explore, and at "/"
// for someone signed out (routes/home.tsx).
import { eq } from "drizzle-orm";
import { schema, type Db } from "~/db";
import { inks, search, shelves, type Creator, type Puzzle } from "./explore.server";
import { solvedAmong } from "./queries.server";

type Viewer = { id: string; handle: string } | null;

/** `viewer` may still be on its way (the session lookup runs alongside the shelves). */
export async function explorePage(db: Db, url: URL, viewer: Viewer | Promise<Viewer>) {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const [me, s] = await Promise.all([viewer, shelves(db)]);
  const found = q ? await search(db, q, s) : null;
  // the viewer's own: what they've solved, whom they subscribe to
  const all = found ? found.puzzles : [...s.today, ...s.quick, ...s.hard];
  const [solved, subs] = me ? await Promise.all([
    solvedAmong(db, me.id, all.map((p) => p.id)),
    db.select({ slug: schema.collections.slug }).from(schema.subscriptions).innerJoin(schema.collections, eq(schema.subscriptions.collectionId, schema.collections.id))
      .where(eq(schema.subscriptions.subscriberId, me.id)).then((rows) => new Set(rows.map((r) => r.slug))),
  ]) : [new Set<string>(), new Set<string>()];
  const mark = (ps: Puzzle[]) => ps.map((p) => (solved.has(p.id) ? { ...p, solved: true } : p));
  const sub = <C extends Creator>(cs: C[]) => cs.map((c) => (subs.has(c.handle) ? { ...c, subscribed: true } : c));
  const base = { q, me: me?.handle ?? null, now: s.now, inks: inks() };
  // only the guide pictures this page shows
  const shownTypes = found ? found.types.map((t) => t.kind) : [...s.starters.map((t) => t.kind), ...s.types.slice(0, 12).map((t) => t.kind)];
  const guidePictures = Object.fromEntries(shownTypes.filter((k) => s.guidePictures[k]).map((k) => [k, s.guidePictures[k]]));
  if (found) {
    return { ...base, today: [], found: { ...found, puzzles: mark(found.puzzles), creators: sub(found.creators) }, guidePictures, shelves: null };
  }
  return {
    ...base, today: mark(s.today), found: null, guidePictures,
    shelves: {
      quick: mark(s.quick), hard: mark(s.hard), starters: s.starters, types: s.types, typeCount: s.typeCount,
      people: sub(s.people), ai: sub(s.ai), aiTotal: s.aiTotal,
      recommends: s.recommends && { ...s.recommends, picks: sub(s.recommends.picks) },
      pictures: s.pictures,
    },
  };
}

export type ExploreData = Awaited<ReturnType<typeof explorePage>>;
