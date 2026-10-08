// Explore: find puzzle creators and studios to follow (search by name or handle), and featured puzzles.
import { Form, Link } from "react-router";
import type { Route } from "./+types/explore";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { eq } from "drizzle-orm";
import { currentCreator } from "~/lib/auth.server";
import { exploreCollections, featuredGames, markSolved } from "~/lib/queries.server";
import { withPictures } from "~/lib/thumbs.server";
import { CollectionRow, GameCard } from "~/components/GameCard";
import "~site/game-types/grid/styles.css";
import { pageMeta } from "~/lib/seo";

export const meta: Route.MetaFunction = () => pageMeta({
  title: "Explore logic puzzle creators and studios · inkit",
  description: "Find creators and studios making hand-drawn logic puzzles to follow, and featured puzzles to play in your browser.",
  path: "/explore",
});

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 80);
  const [me, collections, featured] = await Promise.all([currentCreator(env, request), exploreCollections(db, q), q ? [] : featuredGames(db)]);
  const mine = me ? new Set((await db.select({ id: schema.subscriptions.collectionId }).from(schema.subscriptions).where(eq(schema.subscriptions.subscriberId, me.id))).map((s) => s.id)) : new Set<string>();
  return { q, me: me?.handle, collections: collections.map((c) => ({ ...c, subscribed: mine.has(c.id) })), featured: await markSolved(db, me?.id, withPictures(featured)) };
}

export default function Explore({ loaderData: { q, me, collections, featured } }: Route.ComponentProps) {
  return (
    <main className="wrap explore">
      <header className="guides-head">
        <h1>Explore</h1>
        <Form className="guide-search" role="search" method="get">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
          <input type="search" name="q" defaultValue={q} placeholder="Search creators and studios" aria-label="Search creators and studios" autoComplete="off" />
        </Form>
      </header>
      {featured.length > 0 && (
        <section className="shelf"><h2>Featured puzzles</h2><ul className="cards">{featured.map((g) => <GameCard key={g.id} game={g} />)}</ul></section>
      )}
      <section className="shelf">
        <h2>{q ? `Creators matching “${q}”` : "Creators and studios"}</h2>
        {collections.length ? <ul className="collection-list">{collections.map((c) => <CollectionRow key={c.id} c={c} subscribed={c.subscribed} signedIn={!!me} me={me} />)}</ul>
          : <p className="muted">No one matches &ldquo;{q}&rdquo;. <Link to="/explore">See everyone</Link></p>}
      </section>
    </main>
  );
}
