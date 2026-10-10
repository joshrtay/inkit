// Explore's pieces (routes/explore.tsx, explore-type.tsx, and the profile's Recommends tab): a puzzle
// card with its calm footer (three difficulty dots, "~N min", likes and age), a shelf that scrolls
// sideways, Start here's cards, type tiles, creator cards and recommendations. After the mockups in
// docs/explore-mockups/. Pictures come by id from the page's `pictures` (each drawn once).
import { useRef } from "react";
import { Form, Link } from "react-router";
import type { Creator, Puzzle } from "~/lib/explore.server";
import { kindName } from "~/games/kinds";
import { ago } from "~/lib/rank";
import { Avatar } from "./Avatar";
import { AiBadge } from "./AiBadge";
import { SubscribeButton } from "./GameCard";

const LEVELS = ["", "Easy", "Medium", "Hard"];
type Css = React.CSSProperties & Record<`--${string}`, string>;

export type Pics = Record<string, { svg: string; kind: string }>;
export type Inks = Record<string, string>;

/** A puzzle's picture (drawn on the server), in its type's pen colour. */
export function Pic({ pic, inks, className = "thumb" }: { pic?: { svg: string; kind: string }; inks: Inks; className?: string }) {
  if (!pic) return <span className={`pic ${className} none`} />;
  const style = inks[pic.kind] ? ({ "--paper-ink": inks[pic.kind] } as Css) : undefined;
  return <span className={`grid-game pic ${className}`} style={style} dangerouslySetInnerHTML={{ __html: pic.svg }} />;
}

/** Difficulty: three small ink dots, filled up to the level. */
export const Diff = ({ level }: { level: number }) => (
  <span className="diff" role="img" aria-label={`Difficulty: ${LEVELS[level] ?? "?"}`} title={LEVELS[level]}>
    {[1, 2, 3].map((i) => <i key={i} className={i <= level ? "on" : undefined} />)}
  </span>
);

const Check = () => (
  <span className="solved-badge" role="img" aria-label="Solved" title="Solved">
    <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M14 54 C24 61 32 69 39 80 C52 57 68 36 88 16" /></svg>
  </span>
);

/** A puzzle on a shelf or in a grid. `when`: say how long ago it went up; `time`: the minutes stand out (Quick ones). */
export function PuzzleCard({ p, pics, inks, now, when = false, time = false }: { p: Puzzle; pics: Pics; inks: Inks; now: number; when?: boolean; time?: boolean }) {
  return (
    <li>
      <Link className="game-card pcard" to={`/g/${p.id}`}>
        <Pic pic={pics[p.id]} inks={inks} />
        {p.solved && <Check />}
        <span className="game-card-text">
          <span className="kind">{kindName(p.kind)}</span>
          <strong>{p.title}</strong>
          <span className="by">
            {!p.authorDeleted && <Avatar name={p.authorName} seed={p.authorHandle} size={18} ai={p.authorAi} />}
            <span className="by-name">{p.authorName}</span>{p.authorAi && <AiBadge />}
          </span>
          <span className="card-foot">
            <Diff level={p.level} />
            <span className={`mins${time ? " strong" : ""}`} title="A rough estimate of the time to solve it">~{p.minutes} min</span>
            {p.likes > 0 && <span className="likes" aria-label={`${p.likes} like${p.likes === 1 ? "" : "s"}`}>♥ {p.likes}</span>}
            {when && p.publishedAt > 0 && <span className="when">{ago(p.publishedAt, now)}</span>}
          </span>
        </span>
      </Link>
    </li>
  );
}

const Arrow = () => <svg className="mini-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>;
const ChevronRight = () => <svg className="mini-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>;

/** A shelf: a heading with one idea, a line saying it, "See all", and a row that scrolls sideways. */
export function Shelf({ id, title, sub, more, moreLabel = "See all", className = "", rowClass = "", children }: {
  id: string; title: React.ReactNode; sub: string; more?: string; moreLabel?: string; className?: string; rowClass?: string; children: React.ReactNode;
}) {
  const row = useRef<HTMLUListElement>(null);
  return (
    <section className={`shelf xshelf ${className}`} id={id} aria-labelledby={`${id}-h`}>
      <header className="shelf-head">
        <div><h2 id={`${id}-h`}>{title}</h2><p className="shelf-sub">{sub}</p></div>
        {more && <Link className="see-all" to={more}>{moreLabel}<Arrow /></Link>}
      </header>
      <div className="rail">
        <ul className={`row ${rowClass}`} ref={row}>{children}</ul>
        <button className="rail-btn" type="button" aria-label="Scroll right" onClick={() => row.current?.scrollBy({ left: row.current.clientWidth * 0.8, behavior: "smooth" })}><ChevronRight /></button>
      </div>
    </section>
  );
}

export { Arrow };

/** Start here: a type's easy example, its rules a tap away. */
export function StarterCard({ s, pics, inks }: { s: { kind: string; name: string; summary: string; id: string; minutes: number }; pics: Pics; inks: Inks }) {
  return (
    <li className="starter-item">
      <div className="game-card pcard starter">
        <Link className="starter-link" to={`/g/${s.id}`}>
          <Pic pic={pics[s.kind]} inks={inks} />
          <span className="game-card-text">
            <span className="kind">Start here</span>
            <strong>{s.name}</strong>
            <span className="desc">{s.summary}</span>
          </span>
        </Link>
        <span className="card-foot"><Diff level={1} /><span className="mins">~{s.minutes} min</span><Link className="rules-link" to={`/puzzles/${s.kind}`}>Rules with pictures</Link></span>
      </div>
    </li>
  );
}

/** Browse by type: the guide's picture, the type's name and how many puzzles it has. */
export const TypeTile = ({ t, pics, inks }: { t: { kind: string; name: string; count: number }; pics: Pics; inks: Inks }) => (
  <li>
    <Link className="type-tile" to={`/explore/${t.kind}`}>
      <Pic pic={pics[t.kind]} inks={inks} className="tile-pic" />
      <span className="tile-text"><strong>{t.name}</strong><span>{t.count} puzzle{t.count === 1 ? "" : "s"}</span></span>
    </Link>
  </li>
);

const activityLine = (c: Pick<Creator, "month" | "likes" | "puzzles">) =>
  [c.month ? `${c.month} new this month` : `${c.puzzles} puzzle${c.puzzles === 1 ? "" : "s"}`, c.likes ? `♥ ${c.likes}` : ""].filter(Boolean).join(" · ");

/** A creator: who, what they've made lately and how liked, one line of bio, three puzzles, Subscribe. */
export function CreatorCard({ c, pics, inks, me }: { c: Creator; pics: Pics; inks: Inks; me?: string | null }) {
  return (
    <li>
      <article className={`ccard${c.ai ? " ai" : ""}`}>
        <Link className="ccard-who" to={`/${c.handle}`}>
          <Avatar name={c.name} seed={c.handle} size={52} ai={c.ai} />
          <span className="ccard-id"><strong>{c.name}{c.ai && <> <AiBadge /></>}</strong><span className="ccard-meta">@{c.handle} · {activityLine(c)}</span></span>
        </Link>
        <p className="ccard-bio">{c.bio}</p>
        <Link className="ccard-pics" to={`/${c.handle}`} aria-label={`${c.name}'s puzzles`}>
          {c.newest.map((id) => <Pic key={id} pic={pics[id]} inks={inks} className="mini" />)}
        </Link>
        {me !== c.handle && <div className="ccard-actions"><SubscribeButton slug={c.handle} subscribed={!!c.subscribed} signedIn={!!me} /></div>}
      </article>
    </li>
  );
}

/** One of a creator's recommendations on Explore: who, why (in the recommender's words), their puzzles. */
export function RecCard({ c, pics, inks, me }: { c: Creator & { note: string }; pics: Pics; inks: Inks; me?: string | null }) {
  return (
    <li>
      <article className="rec">
        <Link className="rec-who" to={`/${c.handle}`}>
          <Avatar name={c.name} seed={c.handle} size={40} ai={c.ai} />
          <span><strong>{c.name}{c.ai && <> <AiBadge /></>}</strong><span className="ccard-meta">@{c.handle}</span></span>
        </Link>
        {c.note ? <blockquote>&ldquo;{c.note}&rdquo;</blockquote> : <p className="ccard-bio">{c.bio}</p>}
        <Link className="ccard-pics" to={`/${c.handle}`} aria-label={`${c.name}'s puzzles`}>
          {c.newest.map((id) => <Pic key={id} pic={pics[id]} inks={inks} className="mini" />)}
        </Link>
        {me !== c.handle && <SubscribeButton slug={c.handle} subscribed={!!c.subscribed} signedIn={!!me} />}
      </article>
    </li>
  );
}

/** The search box at the top of Explore (a GET form: ?q=). */
export const SearchBox = ({ q }: { q: string }) => (
  <Form className="guide-search x-search" role="search" method="get" action="/explore">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
    <input type="search" name="q" defaultValue={q} placeholder="Search puzzles, types and creators" aria-label="Search puzzles, types and creators" autoComplete="off" />
  </Form>
);

/** The quick chips under the search box: every type's puzzles, filtered. */
export const QUICK_CHIPS: { label: string; to: string }[] = [
  { label: "All", to: "/explore" },
  { label: "Quick", to: "/explore/all?quick=1" },
  { label: "Easy", to: "/explore/all?level=1" },
  { label: "Hard", to: "/explore/all?level=3" },
  { label: "Lines", to: "/explore/all?category=Lines" },
  { label: "Numbers", to: "/explore/all?category=Numbers" },
  { label: "Shading", to: "/explore/all?category=Shading" },
  { label: "Regions", to: "/explore/all?category=Regions" },
];
export function QuickChips({ current }: { current: string }) {
  return (
    <nav className="chips quick-chips" aria-label="Jump to">
      {QUICK_CHIPS.map((c) => <Link key={c.label} to={c.to} aria-current={c.to === current ? "page" : undefined}>{c.label}</Link>)}
    </nav>
  );
}
