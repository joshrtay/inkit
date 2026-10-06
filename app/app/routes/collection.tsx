// A collection: wyattsgames.com/<slug>. A creator's personal collection lives at their handle.
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/collection";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { roleIn } from "~/lib/permissions.server";
import { collectionBySlug, collectionGames, collectionMembers } from "~/lib/queries.server";
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
  // Members see their own drafts; owners see every draft and hidden game.
  const visible = games.filter((g) => g.state === "published" || owner || viewer?.isAdmin || g.authorHandle === viewer?.handle);
  return {
    collection: { slug: collection.slug, title: collection.title, description: collection.description, personal: !!collection.personalOf, deleted: !!collection.deletedAt },
    person: person && { handle: person.handle, name: person.name },
    members: collection.personalOf ? [] : members,
    games: visible,
    role,
  };
}

export const meta: Route.MetaFunction = ({ loaderData: data }) => data
  ? [{ title: `${data.collection.title} · Wyatt's Games` }, { name: "description", content: data.collection.description }]
  : [{ title: "Not found · Wyatt's Games" }];

export default function Collection({ loaderData: { collection, person, members, games, role } }: Route.ComponentProps) {
  return (
    <main className="wrap">
      <header className="collection-head">
        <h1>{collection.title}</h1>
        <span className="muted">{person ? `@${person.handle}` : "Studio"}{role && <> · you're {role === "owner" ? "an owner" : "a contributor"}</>}</span>
        {collection.description && <p>{collection.description}</p>}
        {collection.deleted && <p className="state hidden">This studio was deleted; its games are offline.</p>}
        {members.length > 0 && (
          <p className="members">{members.map((m) => <span key={m.handle}>@{m.handle}{m.role === "owner" ? " (owner)" : ""}</span>)}</p>
        )}
      </header>
      {games.length ? <ul className="cards">{games.map((g) => <GameCard key={g.id} game={g} />)}</ul>
        : <p className="muted">No games here yet.</p>}
    </main>
  );
}
