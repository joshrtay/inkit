// Explore's data (components/ExplorePage.tsx): the shelves, or a search's results (?q=), with the
// viewer's own marks (what they've solved, whom they subscribe to). Served at /explore, and at "/"
// for someone signed out (routes/home.tsx).
//
// The page switches as soon as Today (the first shelf) is ready; the other shelves follow it
// (`rest`, streamed: lib/stream.server.ts). A search waits for its results.
import { eq } from "drizzle-orm";
import { schema, type Db } from "~/db";
import { inks, search, searchWords, shelvesSoon, type Creator, type Pictures, type Puzzle, type Shelves } from "./explore.server";
import { searchSets } from "./sets.server";
import { solvedAmong } from "./queries.server";
import { later } from "./stream.server";

type Viewer = { id: string; handle: string } | null;

/** Only the guide pictures a page shows. */
const picturesOf = (s: Shelves, kinds: string[]): Pictures => Object.fromEntries(kinds.filter((k) => s.guidePictures[k]).map((k) => [k, s.guidePictures[k]]));

/** The viewer's own marks: which of these puzzles they've solved, and whom they subscribe to. */
async function marksOf(db: Db, me: Viewer, ids: string[]) {
  if (!me) return { solved: new Set<string>(), subs: new Set<string>() };
  const [solved, subs] = await Promise.all([
    solvedAmong(db, me.id, ids),
    db.select({ slug: schema.collections.slug }).from(schema.subscriptions).innerJoin(schema.collections, eq(schema.subscriptions.collectionId, schema.collections.id))
      .where(eq(schema.subscriptions.subscriberId, me.id)).then((rows) => new Set(rows.map((r) => r.slug))),
  ]);
  return { solved, subs };
}

const marker = (m: { solved: Set<string>; subs: Set<string> }) => ({
  mark: (ps: Puzzle[]) => ps.map((p) => (m.solved.has(p.id) ? { ...p, solved: true } : p)),
  sub: <C extends Creator>(cs: C[]) => cs.map((c) => (m.subs.has(c.handle) ? { ...c, subscribed: true } : c)),
});

/** `viewer` may still be on its way (the session lookup runs alongside the shelves). */
export async function explorePage(db: Db, url: URL, viewer: Viewer | Promise<Viewer>) {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const soon = shelvesSoon(db);
  const meP = Promise.resolve(viewer);
  if (q) {
    const [me, s] = await Promise.all([meP, soon.data]);
    const [found, sets] = await Promise.all([search(db, q, s), searchSets(db, searchWords(q))]);
    const { mark, sub } = marker(await marksOf(db, me, found?.puzzles.map((p) => p.id) ?? []));
    return {
      q, me: me?.handle ?? null, now: s.now, inks: inks(), today: [] as Puzzle[], pictures: {} as Pictures,
      found: found && { ...found, puzzles: mark(found.puzzles), creators: sub(found.creators), sets, guidePictures: picturesOf(s, found.types.map((t) => t.kind)) },
      rest: null,
    };
  }
  const [me, t] = await Promise.all([meP, soon.today]);
  const solvedToday = me ? await solvedAmong(db, me.id, t.today.map((p) => p.id)) : new Set<string>();
  // the other shelves, after the page
  const rest = later(soon.data.then(async (s) => {
    const { mark, sub } = marker(await marksOf(db, me, [...s.quick, ...s.hard].map((p) => p.id)));
    return {
      quick: mark(s.quick), hard: mark(s.hard), starters: s.starters, types: s.types, typeCount: s.typeCount,
      people: sub(s.people), ai: sub(s.ai), aiTotal: s.aiTotal,
      recommends: s.recommends && { ...s.recommends, picks: sub(s.recommends.picks) },
      pictures: s.pictures,
      guidePictures: picturesOf(s, [...s.starters.map((x) => x.kind), ...s.types.slice(0, 12).map((x) => x.kind)]),
    };
  }));
  return {
    q, me: me?.handle ?? null, now: t.now, inks: inks(),
    today: t.today.map((p) => (solvedToday.has(p.id) ? { ...p, solved: true } : p)), pictures: t.pictures,
    found: null, rest,
  };
}

export type ExploreData = Awaited<ReturnType<typeof explorePage>>;
