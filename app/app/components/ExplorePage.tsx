// Explore: puzzles first, on shelves (docs/explore-mockups/): search with quick chips, Today, Quick
// ones, Start here, Browse by type, This week's hard ones, Creators, Made by AI creators, and one
// creator's recommendations. A search (?q=) shows types, creators and puzzles that match.
// At /explore, and at "/" for someone signed out (routes/home.tsx); the data is
// lib/explore-page.server.ts (the shelves from lib/explore.server.ts, the formulas in lib/rank.ts).
import { Link } from "react-router";
import type { ExploreData as Data } from "~/lib/explore-page.server";
import { Avatar } from "./Avatar";
import { AiBadge } from "./AiBadge";
import { SubscribeButton } from "./GameCard";
import { Arrow, CreatorCard, PuzzleCard, QuickChips, RecCard, SearchBox, Shelf, StarterCard, TypeTile } from "./Explore";

export function ExplorePage({ d }: { d: Data }) {
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
