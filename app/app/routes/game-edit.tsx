// Edit a game, and change its state: inkit.games/g/<id>/edit. A page of its own (no site nav),
// like Substack's post editor: see GameEditor.
// Its author (while a member) and the collection's owners can edit; owners and admins can
// take it down; admins can feature it.
import { data, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game-edit";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { canEdit, canHide, roleIn } from "~/lib/permissions.server";
import { changeGame, isFeatured, rereadDrawing } from "~/lib/games.server";
import { GameEditor } from "~/components/GameEditor";
import { doubtsOf } from "~/games/doubts";
import { attempt, signInFirst } from "~/lib/http.server";

async function load(request: Request, env: Env, id: string) {
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const db = getDb(env);
  const game = await db.query.games.findFirst({ where: eq(schema.games.id, id) });
  if (!game) throw data(null, { status: 404 });
  const role = await roleIn(db, game.collectionId, me.id);
  // taking down is moderation: a collection owner or admin hiding someone else's published game,
  // with a note its author sees (your own game you'd just move back to draft)
  const may = { edit: canEdit(game, me, role), hide: canHide(me, role), takeDown: canHide(me, role) && game.authorId !== me.id, feature: me.isAdmin };
  if (!may.edit && !may.hide) throw data(null, { status: 404 });
  return { db, env, me, game, may };
}

/** The site's nav stays off this page (root.tsx). */
export const handle = { bare: true };

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, game, may } = await load(request, context.get(cloudflareContext).env, params.id);
  const [collection, author] = await Promise.all([
    db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) }),
    db.query.creators.findFirst({ where: eq(schema.creators.id, game.authorId) }),
  ]);
  return {
    game: { id: game.id, title: game.title, description: game.description, sketch: game.sketch, state: game.state, hiddenNote: game.hiddenNote },
    may, featured: await isFeatured(db, game.id),
    drawing: !!game.sketchImage,
    reading: game.reading,
    doubts: doubtsOf(game.parseNotes),
    choices: game.kindChoices ?? [],
    // for Preview: the game's page shows who made it, where, and when
    page: {
      collection: { slug: collection?.slug ?? "", title: collection?.title ?? "", personal: !!collection?.personalOf },
      author: { handle: author?.handle ?? "", name: author?.name ?? "", deleted: !!author?.deletedAt },
      when: (game.publishedAt ?? new Date()).getTime(), kind: game.kind,
    },
    backTo: game.state === "published" || !collection ? `/g/${game.id}` : `/${collection.slug}`,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { db, env, me, game } = await load(request, context.get(cloudflareContext).env, params.id);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  return attempt(async () => {
    if (intent === "reread") { await rereadDrawing(db, env, me, game, form); return { error: undefined, done: intent }; }
    await changeGame(db, me, game, form);
    // saving a draft (it saves itself as you go) keeps you in the editor; publishing shows the game
    const stay = intent === "save" && form.get("stay") === "1";
    return (intent === "save" || intent === "publish") && !stay ? redirect(`/g/${game.id}`) : { error: undefined, done: intent };
  });
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Edit ${loaderData?.game.title ?? "game"} · inkit` }];

export default function EditGame({ loaderData: { game, may, featured, drawing, reading, doubts, choices, page, backTo }, actionData }: Route.ComponentProps) {
  const error = actionData && "error" in actionData ? actionData.error : undefined;
  return (
    <GameEditor key={game.id} game={game} reading={reading} drawing={drawing} doubts={doubts} choices={choices}
      may={may} featured={featured} backTo={backTo} error={error} page={page} />
  );
}
