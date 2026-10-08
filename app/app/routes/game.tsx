// A game's permanent page: inkit.games/g/<id>.
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { canEdit, canHide, canView, roleIn } from "~/lib/permissions.server";
import { parseSketch } from "~/games/sketch";
import { kindName } from "~/games/kinds";
import { layoutOf } from "~/games/layout-of";
import { likesOf, solvesOf } from "~/lib/queries.server";
import { GamePageView } from "~/components/GamePageView";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const game = await db.query.games.findFirst({ where: eq(schema.games.id, params.id) });
  if (!game) throw data(null, { status: 404 });
  const [collection, author, viewer] = await Promise.all([
    db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) }),
    db.query.creators.findFirst({ where: eq(schema.creators.id, game.authorId) }),
    currentCreator(env, request),
  ]);
  if (!collection || !author) throw data(null, { status: 404 });
  const role = await roleIn(db, collection.id, viewer?.id);
  // Drafts and taken-down games look like they don't exist to anyone not allowed to see them.
  if (!canView(game, collection, viewer, role)) throw data(null, { status: 404 });

  const parsed = parseSketch(game.sketch, game.sketchVersion);
  return {
    game: { id: game.id, title: game.title, description: game.description, kind: game.kind, state: game.state, hiddenNote: game.hiddenNote,
      when: (game.publishedAt ?? game.createdAt).getTime() },
    collection: { slug: collection.slug, title: collection.title, personal: !!collection.personalOf },
    author: { handle: author.handle, name: author.name, deleted: !!author.deletedAt, ai: author.isAi },
    play: parsed.ok ? { spec: parsed.spec, layout: layoutOf(parsed.spec) } : null,
    summary: parsed.ok ? parsed.summary : kindName(game.kind),
    // a puzzle that lists its own rules (Panes; a 2-star Star Battle) shows them above its type's guide
    extra: parsed.ok && parsed.spec.rules?.length ? parsed.rules : [],
    errors: parsed.ok ? [] : parsed.errors,
    editable: canEdit(game, viewer, role) || canHide(viewer, role),
    likes: await likesOf(db, game.id, viewer?.id),
    solves: await solvesOf(db, game.id, viewer?.id),
    signedIn: !!viewer,
  };
}

export const meta: Route.MetaFunction = ({ loaderData: data }) => data
  ? [{ title: `${data.game.title} · inkit` }, { name: "description", content: data.game.description || `A ${kindName(data.game.kind)} puzzle.` }]
  : [{ title: "Not found · inkit" }];

export default function Game({ loaderData }: Route.ComponentProps) {
  return <GamePageView {...loaderData} />;
}
