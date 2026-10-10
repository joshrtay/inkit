// Home. Signed in: the Subscriptions feed, the newest puzzles from everyone you subscribe to.
// Signed out: Explore (components/ExplorePage.tsx), the same page as /explore, at "/".
import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import type { Route } from "./+types/home";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { exploreCollections, subscriptionsOf } from "~/lib/queries.server";
import { feedPage } from "~/lib/feed.server";
import { explorePage } from "~/lib/explore-page.server";
import { CollectionRow, FeedItem } from "~/components/GameCard";
import { ExplorePage } from "~/components/ExplorePage";
import { exploreMeta, HOME_DESCRIPTION, HOME_TITLE, pageMeta, websiteJsonLd } from "~/lib/seo";
import "~site/game-types/grid/styles.css";

export const meta: Route.MetaFunction = ({ loaderData: d }) => d?.explore
  ? exploreMeta(d.explore, "/")
  : pageMeta({ title: HOME_TITLE, description: HOME_DESCRIPTION, path: "/", jsonLd: websiteJsonLd() });

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const me = await currentCreator(env, request);
  if (!me) return { explore: await explorePage(db, new URL(request.url), null), feed: null };
  const [page, subs] = await Promise.all([feedPage(db, me.id), subscriptionsOf(db, me.id)]);
  const suggestions = page.games.length ? [] : (await exploreCollections(db, "", 8)).filter((c) => c.slug !== me.handle && !subs.some((s) => s.id === c.id)).slice(0, 5);
  return { explore: null, feed: { ...page, subscribedTo: subs.length, suggestions } };
}

type Page = Awaited<ReturnType<typeof feedPage>>;

/** The feed, a page at a time: the next page loads as the end of the list comes into view. */
function Feed({ first }: { first: Page }) {
  const [games, setGames] = useState(first.games);
  const [next, setNext] = useState(first.next);
  const more = useFetcher<Page>();
  const end = useRef<HTMLLIElement>(null);
  // a fresh first page (the loader ran again): start over from it
  useEffect(() => { setGames(first.games); setNext(first.next); }, [first]);
  useEffect(() => {
    if (!more.data) return;
    const page = more.data;
    setGames((g) => [...g, ...page.games.filter((n) => !g.some((o) => o.id === n.id))]);
    setNext(page.next);
  }, [more.data]);
  useEffect(() => {
    const el = end.current;
    if (!el || !next || more.state !== "idle") return;
    const seen = new IntersectionObserver(([e]) => { if (e.isIntersecting) more.load(`/feed?before=${next}`); }, { rootMargin: "800px 0px" });
    seen.observe(el);
    return () => seen.disconnect();
  }, [next, more.state]);
  return (
    <ul className="feed">
      {games.map((g) => <FeedItem key={g.id} game={g} liked={g.liked} signedIn />)}
      {next && <li ref={end} className="feed-more muted" aria-hidden="true">{more.state === "idle" ? "" : "Loading…"}</li>}
    </ul>
  );
}

export default function Home({ loaderData: d }: Route.ComponentProps) {
  if (d.explore) return <ExplorePage d={d.explore} />;
  const f = d.feed!;
  return (
    <main className="wrap feed-page">
      <h1 className="visually-hidden">Subscriptions</h1>
      {f.games.length ? <Feed first={f} /> : (
        <section className="feed-empty">
          <h2>{f.subscribedTo ? "Nothing new yet" : "Your feed is empty"}</h2>
          <p className="muted">{f.subscribedTo ? "The creators you subscribe to haven't published puzzles yet." : "Subscribe to creators and their puzzles show up here."}</p>
          {f.suggestions.length > 0 && <ul className="collection-list">{f.suggestions.map((c) => <CollectionRow key={c.id} c={c} subscribed={false} signedIn />)}</ul>}
          <p><Link className="btn" to="/explore">Explore creators</Link></p>
        </section>
      )}
    </main>
  );
}
