// Explore: puzzles first, on shelves (docs/explore-mockups/): search with quick chips, Today, Quick
// ones, Start here, Browse by type, This week's hard ones, Creators, Made by AI creators, and one
// creator's recommendations. A search (?q=) shows types, creators and puzzles that match.
// The shelves come from lib/explore.server.ts (the formulas in lib/rank.ts).
import { Link } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/explore";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { inks, search, shelves, type Creator, type Puzzle } from "~/lib/explore.server";
import { solvedAmong } from "~/lib/queries.server";
import { exploreJsonLd, pageMeta } from "~/lib/seo";
import { Avatar } from "~/components/Avatar";
import { AiBadge } from "~/components/AiBadge";
import { SubscribeButton } from "~/components/GameCard";
import { Arrow, CreatorCard, PuzzleCard, QuickChips, RecCard, SearchBox, Shelf, StarterCard, TypeTile } from "~/components/Explore";
import "~site/game-types/grid/styles.css";

export const meta: Route.MetaFunction = ({ loaderData: d }) => pageMeta({
  title: "Explore logic puzzles · inkit",
  description: "Hand-drawn logic puzzles to play in your browser: today's newest, quick ones, an easy start for every type, the week's hardest, and the creators who make them.",
  path: "/explore",
  // a search is a page of its own, kept out of search results
  noindex: !!d?.q,
  jsonLd: d && !d.q ? exploreJsonLd(d.today.map((p) => ({ id: p.id, title: p.title }))) : undefined,
});

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const [me, s] = await Promise.all([currentCreator(env, request), shelves(db)]);
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

export default function Explore({ loaderData: d }: Route.ComponentProps) {
  return (
    <main className="wrap explore x-explore">
      <header className="x-head">
        <h1>Explore</h1>
        <SearchBox key={d.q} q={d.q} />
        {!d.q && <QuickChips current="/explore" />}
      </header>
      {d.found ? <Results d={d} found={d.found} /> : d.shelves && <Shelves d={d} s={d.shelves} />}
    </main>
  );
}

type Data = Route.ComponentProps["loaderData"];

function Shelves({ d, s }: { d: Data; s: NonNullable<Data["shelves"]> }) {
  const { inks, now, me } = d, pics = s.pictures, guides = d.guidePictures;
  const first = (name: string) => name.replace(/^The (Hon\. )?/, "").split(" ")[0];
  return (
    <>
      {d.today.length > 0 && (
        <Shelf id="today" title="Today" sub="The newest puzzles." more="/explore/all">
          {d.today.map((p) => <PuzzleCard key={p.id} p={p} pics={pics} inks={inks} now={now} when />)}
        </Shelf>
      )}
      {s.quick.length > 0 && (
        <Shelf id="quick" title="Quick ones" sub="Five minutes or less." more="/explore/all?quick=1">
          {s.quick.map((p) => <PuzzleCard key={p.id} p={p} pics={pics} inks={inks} now={now} time />)}
        </Shelf>
      )}
      {s.starters.length > 0 && (
        <Shelf id="start" title="Start here" sub="One easy puzzle of each type." more="/puzzles" moreLabel="All types">
          {s.starters.map((t) => <StarterCard key={t.kind} s={t} pics={guides} inks={inks} />)}
        </Shelf>
      )}
      <section className="shelf xshelf" id="types" aria-labelledby="types-h">
        <header className="shelf-head">
          <div><h2 id="types-h">Browse by type</h2><p className="shelf-sub">{s.typeCount} kinds of puzzle.</p></div>
          <Link className="see-all" to="/puzzles">All {s.typeCount} types<Arrow /></Link>
        </header>
        <ul className="tiles">{s.types.slice(0, 12).map((t) => <TypeTile key={t.kind} t={t} pics={guides} inks={inks} />)}</ul>
      </section>
      {s.hard.length > 0 && (
        <Shelf id="hard" title="This week’s hard ones" sub="The week’s toughest." more="/explore/all?level=3">
          {s.hard.map((p) => <PuzzleCard key={p.id} p={p} pics={pics} inks={inks} now={now} />)}
        </Shelf>
      )}
      {s.people.length > 0 && (
        <Shelf id="creators" title="Creators" sub="People who make puzzles here." rowClass="crow">
          {s.people.map((c) => <CreatorCard key={c.id} c={c} pics={pics} inks={inks} me={me} />)}
        </Shelf>
      )}
      {s.ai.length > 0 && (
        <Shelf id="ai" title="Made by AI creators" className="ai-shelf" rowClass="crow"
          sub="Puzzles from inkit’s generator, titled by Claude.">
          {s.ai.map((c) => <CreatorCard key={c.id} c={c} pics={pics} inks={inks} me={me} />)}
        </Shelf>
      )}
      {s.recommends && (
        <section className="shelf xshelf recs" id="recommends" aria-labelledby="recs-h">
          <header className="shelf-head">
            <div>
              <h2 id="recs-h"><Avatar name={s.recommends.who.name} seed={s.recommends.who.handle} size={26} ai={s.recommends.who.ai} /> {s.recommends.who.name} recommends</h2>
              <p className="shelf-sub">In {s.recommends.who.ai ? "its" : "their"} own words.</p>
            </div>
            <Link className="see-all" to={`/${s.recommends.who.handle}?tab=recommends`}>{first(s.recommends.who.name)}’s page<Arrow /></Link>
          </header>
          <ul className="rec-row">{s.recommends.picks.map((c) => <RecCard key={c.id} c={c} pics={pics} inks={inks} me={me} />)}</ul>
        </section>
      )}
    </>
  );
}

function Results({ d, found }: { d: Data; found: NonNullable<Data["found"]> }) {
  const nothing = !found.types.length && !found.creators.length && !found.puzzles.length;
  return (
    <div className="x-search-page">
      {nothing && <p className="muted">Nothing matches &ldquo;{d.q}&rdquo;. <Link to="/explore">Back to Explore</Link></p>}
      {found.types.length > 0 && (
        <section className="shelf" aria-labelledby="r-types"><h2 className="group-h" id="r-types">Types</h2>
          <ul className="tiles">{found.types.map((t) => <TypeTile key={t.kind} t={t} pics={d.guidePictures} inks={d.inks} />)}</ul></section>
      )}
      {found.creators.length > 0 && (
        <section className="shelf" aria-labelledby="r-creators"><h2 className="group-h" id="r-creators">Creators</h2>
          <ul className="collection-list">{found.creators.map((c) => (
            <li key={c.id} className="collection-row">
              <Link to={`/${c.handle}`} className="collection-link">
                <Avatar name={c.name} seed={c.handle} size={48} ai={c.ai} />
                <span className="collection-text">
                  <strong>{c.name}{c.ai && <> <AiBadge /></>}</strong>
                  <span className="muted">@{c.handle} · {c.puzzles} puzzle{c.puzzles === 1 ? "" : "s"}{c.month ? ` · ${c.month} new this month` : ""}{c.likes ? ` · ♥ ${c.likes}` : ""}</span>
                  {c.bio && <span className="desc">{c.bio}</span>}
                </span>
              </Link>
              {d.me !== c.handle && <SubscribeButton slug={c.handle} subscribed={!!c.subscribed} signedIn={!!d.me} />}
            </li>
          ))}</ul></section>
      )}
      {found.puzzles.length > 0 && (
        <section className="shelf" aria-labelledby="r-puzzles"><h2 className="group-h" id="r-puzzles">Puzzles</h2>
          <ul className="cards x-cards">{found.puzzles.map((p) => <PuzzleCard key={p.id} p={p} pics={found.pictures} inks={d.inks} now={d.now} when />)}</ul></section>
      )}
    </div>
  );
}
