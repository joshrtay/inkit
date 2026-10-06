import type { Route } from "./+types/home";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { featuredGames, newestGames } from "~/lib/queries.server";
import { GameCard } from "~/components/GameCard";

export const meta: Route.MetaFunction = () => [
  { title: "Wyatt's Games" },
  { name: "description", content: "Hand-drawn puzzles you can play in the browser, made by creators and studios." },
];

export async function loader({ context }: Route.LoaderArgs) {
  const db = getDb(context.get(cloudflareContext).env);
  const [featured, newest] = await Promise.all([featuredGames(db), newestGames(db)]);
  return { featured, newest };
}

export default function Home({ loaderData: { featured, newest } }: Route.ComponentProps) {
  return (
    <main className="wrap">
      {featured.length > 0 && (
        <section className="shelf">
          <h2>Featured</h2>
          <ul className="cards">{featured.map((g) => <GameCard key={g.id} game={g} />)}</ul>
        </section>
      )}
      <section className="shelf">
        <h2>New games</h2>
        {newest.length ? <ul className="cards">{newest.map((g) => <GameCard key={g.id} game={g} />)}</ul>
          : <p className="muted">No games yet.</p>}
      </section>
    </main>
  );
}
