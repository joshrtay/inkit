// A collection: wyattsgames.com/<slug>. A creator's personal collection lives at their handle.
import { data, Link } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/collection";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { roleIn } from "~/lib/permissions.server";
import { collectionBySlug, collectionGames, collectionMembers } from "~/lib/queries.server";
import { publishTargets } from "~/lib/games.server";
import { GameCard } from "~/components/GameCard";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const collection = await collectionBySlug(db, params.slug.toLowerCase());
  if (!collection) throw data(null, { status: 404 });
  const viewer = await currentCreator(env, request);
  const role = await roleIn(db, collection.id, viewer?.id);
  // A deleted studio is offline, except to its owners.
  if (collection.deletedAt && role !== "owner" && !viewer?.isAdmin) throw data(null, { status: 404 });
  const owner = role === "owner";
  const [games, members, person] = await Promise.all([
    collectionGames(db, collection.id, !!role || !!viewer?.isAdmin),
    collectionMembers(db, collection.id),
    collection.personalOf ? db.query.creators.findFirst({ where: eq(schema.creators.id, collection.personalOf) }) : null,
  ]);
  // On your own page: the studios you belong to.
  const studios = person && viewer?.id === person.id ? (await publishTargets(db, viewer.id)).filter((t) => !t.personal) : null;
  // Members see their own drafts; owners see every draft and hidden game.
  const visible = games.filter((g) => g.state === "published" || owner || viewer?.isAdmin || g.authorHandle === viewer?.handle);
  return {
    collection: { slug: collection.slug, title: collection.title, description: collection.description, personal: !!collection.personalOf, deleted: !!collection.deletedAt },
    person: person && { handle: person.handle, name: person.name },
    members: collection.personalOf ? [] : members,
    games: visible,
    role,
    studios,
  };
}

export const meta: Route.MetaFunction = ({ loaderData: data }) => data
  ? [{ title: `${data.collection.title} · Wyatt's Games` }, { name: "description", content: data.collection.description }]
  : [{ title: "Not found · Wyatt's Games" }];

export default function Collection({ loaderData: { collection, person, members, games, role, studios } }: Route.ComponentProps) {
  return (
    <main className="wrap">
      <header className="collection-head">
        <h1>{collection.title}</h1>
        <span className="muted">{person ? `@${person.handle}` : "Studio"}{role && <> · you're {role === "owner" ? "an owner" : "a contributor"}</>}</span>
        {collection.description && <p>{collection.description}</p>}
        {collection.deleted && <p className="state hidden">This studio was deleted; its games are offline.</p>}
        {role && (
          <p className="head-actions">
            <Link className="btn primary" to={`/new?in=${collection.slug}`}>New game here</Link>
            <Link className="btn" to={`/${collection.slug}/settings`}>Settings</Link>
          </p>
        )}
        {members.length > 0 && (
          <p className="members">{members.map((m) => <span key={m.handle}>@{m.handle}{m.role === "owner" ? " (owner)" : ""}</span>)}</p>
        )}
      </header>
      {games.length ? <ul className="cards">{games.map((g) => <GameCard key={g.id} game={g} />)}</ul>
        : <p className="muted">No games here yet.</p>}
      {studios && (
        <section className="shelf">
          <h2>Your studios</h2>
          {studios.length > 0 && (
            <ul className="studio-list">{studios.map((s) => <li key={s.id}><Link to={`/${s.slug}`}>{s.title}</Link> <span className="muted">{s.role}</span></li>)}</ul>
          )}
          <p><Link className="btn" to="/studios/new">Start a studio</Link></p>
        </section>
      )}
    </main>
  );
}
