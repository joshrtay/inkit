// A puzzle type's puzzles: inkit.games/explore/<type> (docs/explore-mockups/03-type-masyu.png). Its
// guide's picture and summary, the starter and the rules, then every puzzle of the type: New
// (newest first) or Top (most liked this week, this month or ever), filtered by difficulty, to
// quick ones, or (signed in) to those you haven't solved. /explore/all is every type's (the quick
// chips: Quick, Easy, Hard, a category).
import { data, Form, Link, useSubmit } from "react-router";
import type { Route } from "./+types/explore-type";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { exampleGameId, isKind } from "~/lib/guides.server";
import { guidePictures, inks, listPuzzles, typeStats, type ListFilter } from "~/lib/explore.server";
import { PERIODS, SORTS } from "~/lib/rank";
import { markSolved } from "~/lib/queries.server";
import { guides, CATEGORIES } from "~site/guides/guides.ts";
import { guidePath, pageMeta, typePuzzlesJsonLd } from "~/lib/seo";
import { Diff, Pic, PuzzleCard, QuickChips } from "~/components/Explore";
import "~site/game-types/grid/styles.css";

const PAGE = 60;
const oneOf = <T extends string>(list: readonly T[], v: string | null, dflt: T): T => (list.includes(v as T) ? (v as T) : dflt);

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const kind = params.kind;
  if (kind !== "all" && !isKind(kind)) throw data(null, { status: 404 });
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const url = new URL(request.url), p = url.searchParams;
  const me = await currentCreator(env, request);
  const level = Number(p.get("level"));
  const category = kind === "all" ? (CATEGORIES as string[]).find((c) => c === p.get("category")) ?? null : null;
  const filter: ListFilter = {
    kind: kind === "all" ? null : kind, category,
    sort: oneOf(SORTS, p.get("sort"), "new"), period: oneOf(PERIODS, p.get("period"), "month"),
    level: level === 1 || level === 2 || level === 3 ? level : null,
    quick: p.get("quick") === "1", hideSolvedFor: me && p.get("unsolved") === "1" ? me.id : null,
    limit: Math.min(240, Math.max(PAGE, Number(p.get("n")) || PAGE)),
  };
  const [list, stats] = await Promise.all([listPuzzles(db, filter), kind === "all" ? null : typeStats(db, kind)]);
  const g = kind === "all" ? null : guides[kind as keyof typeof guides];
  return {
    kind, filter: { ...filter, hideSolvedFor: undefined, unsolved: !!filter.hideSolvedFor }, signedIn: !!me, search: url.search,
    type: g && { name: g.name, aka: g.aka ?? [], category: g.category, summary: g.summary, starter: exampleGameId(kind as keyof typeof guides) },
    stats, now: Date.now(), inks: inks(), guidePicture: kind === "all" ? null : guidePictures()[kind] ?? null,
    puzzles: await markSolved(db, me?.id, list.puzzles), more: list.more, pictures: list.pictures,
  };
}

export const meta: Route.MetaFunction = ({ loaderData: d }) => {
  if (!d) return [{ title: "Not found · inkit" }];
  if (!d.type) return pageMeta({ title: "Every logic puzzle · inkit", description: "Every hand-drawn logic puzzle on inkit, newest or most liked first, by difficulty and time.", path: "/explore/all", noindex: true });
  const n = d.stats?.puzzles ?? 0;
  return pageMeta({
    title: `${d.type.name} puzzles to play online · inkit`,
    description: `${n} ${d.type.name} puzzle${n === 1 ? "" : "s"} to play in your browser, newest or best liked first, easy to hard. ${d.type.summary}`,
    path: `/explore/${d.kind}`,
    // the canonical is the plain list: sorted and filtered views are the same page
    jsonLd: typePuzzlesJsonLd({ kind: d.kind, name: d.type.name }, d.puzzles.map((p) => ({ id: p.id, title: p.title }))),
  });
};

export default function ExploreType({ loaderData: d }: Route.ComponentProps) {
  const f = d.filter, here = `/explore/${d.kind}`;
  // a link to this page with some settings changed (defaults left out of the address)
  const to = (change: Partial<Record<"sort" | "period" | "level" | "quick" | "unsolved" | "category", string | null>>) => {
    const p = new URLSearchParams(d.search);
    p.delete("n");
    for (const [k, v] of Object.entries(change)) v ? p.set(k, v) : p.delete(k);
    const s = p.toString();
    return s ? `${here}?${s}` : here;
  };
  const submit = useSubmit();
  const levels = [[null, "Any"], ["1", "Easy"], ["2", "Medium"], ["3", "Hard"]] as const;
  const chipFor = d.kind === "all" ? (f.quick ? "/explore/all?quick=1" : f.level === 1 ? "/explore/all?level=1" : f.level === 3 ? "/explore/all?level=3" : f.category ? `/explore/all?category=${f.category}` : "") : "";
  return (
    <main className="wrap x-type">
      <nav className="crumbs" aria-label="Breadcrumbs"><Link to="/explore">Explore</Link> <span aria-hidden="true">›</span> {d.type ? <><Link to="/puzzles">Types</Link> <span aria-hidden="true">›</span> {d.type.name}</> : "Every puzzle"}</nav>
      {d.type ? (
        <header className="type-head">
          <Pic pic={d.guidePicture ?? undefined} inks={d.inks} className="type-pic" />
          <div className="type-id">
            <h1>{d.type.name}</h1>
            <p className="aka">{[...(d.type.aka.length ? [`also ${d.type.aka.join(", ")}`] : []), d.type.category].join(" · ")}</p>
            <p className="lead">{d.type.summary}</p>
            {d.stats && <p className="type-stats">{d.stats.puzzles} puzzle{d.stats.puzzles === 1 ? "" : "s"} · {d.stats.creators} creator{d.stats.creators === 1 ? "" : "s"} · {d.stats.week} new this week</p>}
            <div className="type-actions">
              <Link className="btn primary" to={`/g/${d.type.starter}`}>Play the starter</Link>
              <Link className="btn" to={guidePath(d.kind)}>How to play</Link>
            </div>
          </div>
        </header>
      ) : (
        <header className="x-head"><h1>Every puzzle</h1><QuickChips current={chipFor} /></header>
      )}

      <div className="toolbar">
        <nav className="seg" aria-label="Sort">
          {SORTS.map((s) => <Link key={s} to={to({ sort: s === "new" ? null : s, period: null })} aria-current={f.sort === s ? "page" : undefined}>{s === "new" ? "New" : "Top"}</Link>)}
        </nav>
        {f.sort === "top" && (
          <nav className="seg small" aria-label="Over">
            {PERIODS.map((p) => <Link key={p} to={to({ period: p === "month" ? null : p })} aria-current={f.period === p ? "page" : undefined}>{p === "week" ? "This week" : p === "month" ? "This month" : "All time"}</Link>)}
          </nav>
        )}
        <nav className="filter" aria-label="Difficulty"><span className="filter-label">Difficulty</span>
          <span className="chips">{levels.map(([v, label]) => (
            <Link key={label} to={to({ level: v })} aria-current={String(f.level ?? "") === (v ?? "") ? "page" : undefined}>{v && <Diff level={Number(v)} />} {label}</Link>
          ))}</span>
        </nav>
        <Form key={d.search} method="get" className="toggles" onChange={(e) => submit(e.currentTarget, { preventScrollReset: true })}>
          {[...new URLSearchParams(d.search)].filter(([k]) => !["quick", "unsolved", "n"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <label className="toggle"><input type="checkbox" name="quick" value="1" defaultChecked={f.quick} /> Quick only <span className="muted">(~5 min)</span></label>
          {d.signedIn && <label className="toggle"><input type="checkbox" name="unsolved" value="1" defaultChecked={f.unsolved} /> Hide solved</label>}
          <noscript><button className="btn" type="submit">Apply</button></noscript>
        </Form>
      </div>

      {d.puzzles.length ? (
        <ul className="cards x-cards">{d.puzzles.map((p) => <PuzzleCard key={p.id} p={p} pics={d.pictures} inks={d.inks} now={d.now} when />)}</ul>
      ) : (
        <div className="empty-tab"><p>No puzzles here{f.level || f.quick || f.unsolved || f.sort === "top" ? " with these settings" : " yet"}.</p>{(f.level || f.quick || f.unsolved || f.sort === "top") && <Link className="btn" to={here}>Show them all</Link>}</div>
      )}
      {d.more && <p className="more-row"><Link className="btn" to={`${to({})}${to({}).includes("?") ? "&" : "?"}n=${f.limit + PAGE}`} preventScrollReset>Show more</Link></p>}
    </main>
  );
}
