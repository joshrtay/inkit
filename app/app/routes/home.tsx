// Home. Signed in: the Subscriptions feed, the newest puzzles from everyone you subscribe to.
// Signed out: Explore (components/ExplorePage.tsx), the same page as /explore, at "/".
import { Link } from "react-router";
import type { Route } from "./+types/home";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { exploreCollections, feedGames, likedAmong, solvedAmong, subscriptionsOf } from "~/lib/queries.server";
import { explorePage } from "~/lib/explore-page.server";
import { withPictures } from "~/lib/thumbs.server";
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
  const [feed, subs] = await Promise.all([feedGames(db, me.id), subscriptionsOf(db, me.id)]);
  const suggestions = feed.length ? [] : (await exploreCollections(db, "", 8)).filter((c) => c.slug !== me.handle && !subs.some((s) => s.id === c.id)).slice(0, 5);
  const [liked, solved] = await Promise.all([likedAmong(db, me.id, feed.map((g) => g.id)), solvedAmong(db, me.id, feed.map((g) => g.id))]);
  return {
    explore: null,
    feed: { games: withPictures(feed).map((g) => ({ ...g, liked: liked.has(g.id), solved: solved.has(g.id) })), subscribedTo: subs.length, suggestions },
  };
}

export default function Home({ loaderData: d }: Route.ComponentProps) {
  if (d.explore) return <ExplorePage d={d.explore} />;
  const f = d.feed!;
  return (
    <main className="wrap feed-page">
      <h1 className="visually-hidden">Subscriptions</h1>
      {f.games.length ? <ul className="feed">{f.games.map((g) => <FeedItem key={g.id} game={g} liked={g.liked} signedIn />)}</ul> : (
        <section className="feed-empty">
          <h2>{f.subscribedTo ? "Nothing new yet" : "Your feed is empty"}</h2>
          <p className="muted">{f.subscribedTo ? "The creators you subscribe to haven't published puzzles yet." : "Subscribe to creators and their new puzzles show up here."}</p>
          {f.suggestions.length > 0 && <ul className="collection-list">{f.suggestions.map((c) => <CollectionRow key={c.id} c={c} subscribed={false} signedIn />)}</ul>}
          <p><Link className="btn" to="/explore">Explore creators</Link></p>
        </section>
      )}
    </main>
  );
}
