// Home. Signed in: the Subscriptions feed, the newest puzzles from everyone you subscribe to.
// Signed out: what inkit is, featured puzzles, and creators to follow.
import { Link } from "react-router";
import type { Route } from "./+types/home";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { exploreCollections, featuredGames, feedGames, subscriptionsOf } from "~/lib/queries.server";
import { withPictures } from "~/lib/thumbs.server";
import { CollectionRow, FeedItem, GameCard } from "~/components/GameCard";
import "~site/game-types/grid/styles.css";

export const meta: Route.MetaFunction = () => [
  { title: "inkit" },
  { name: "description", content: "Hand-drawn puzzles you can play in the browser, made by creators and studios." },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const me = await currentCreator(env, request);
  if (me) {
    const [feed, subs] = await Promise.all([feedGames(db, me.id), subscriptionsOf(db, me.id)]);
    const suggestions = feed.length ? [] : (await exploreCollections(db, "", 8)).filter((c) => c.slug !== me.handle && !subs.some((s) => s.id === c.id)).slice(0, 5);
    return { signedIn: true as const, feed: withPictures(feed), subscribedTo: subs.length, suggestions, featured: [], creators: [] };
  }
  const [featured, creators] = await Promise.all([featuredGames(db), exploreCollections(db, "", 6)]);
  return { signedIn: false as const, feed: [], subscribedTo: 0, suggestions: [], featured: withPictures(featured), creators };
}

export default function Home({ loaderData: d }: Route.ComponentProps) {
  if (!d.signedIn) return (
    <main className="wrap">
      <header className="landing">
        <h1>Hand-drawn puzzles, made by people</h1>
        <p className="lead">Draw a puzzle on paper, snap a photo, and inkit turns it into a game anyone can play. Follow the creators you like.</p>
        <p className="landing-actions"><Link className="btn primary" to="/signup">Start creating</Link> <Link className="btn" to="/explore">Explore puzzles</Link></p>
      </header>
      {d.featured.length > 0 && (
        <section className="shelf"><h2>Featured</h2><ul className="cards">{d.featured.map((g) => <GameCard key={g.id} game={g} />)}</ul></section>
      )}
      {d.creators.length > 0 && (
        <section className="shelf">
          <h2>Creators</h2>
          <ul className="collection-list">{d.creators.map((c) => <CollectionRow key={c.id} c={c} subscribed={false} signedIn={false} />)}</ul>
          <p><Link to="/explore">Find more creators →</Link></p>
        </section>
      )}
    </main>
  );

  return (
    <main className="wrap feed-page">
      <h1 className="visually-hidden">Subscriptions</h1>
      {d.feed.length ? <ul className="feed">{d.feed.map((g) => <FeedItem key={g.id} game={g} />)}</ul> : (
        <section className="feed-empty">
          <h2>{d.subscribedTo ? "Nothing new yet" : "Your feed is empty"}</h2>
          <p className="muted">{d.subscribedTo ? "The creators you subscribe to haven't published puzzles yet." : "Subscribe to creators and their new puzzles show up here."}</p>
          {d.suggestions.length > 0 && <ul className="collection-list">{d.suggestions.map((c) => <CollectionRow key={c.id} c={c} subscribed={false} signedIn />)}</ul>}
          <p><Link className="btn" to="/explore">Explore creators</Link></p>
        </section>
      )}
    </main>
  );
}
