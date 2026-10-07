// Edit a game, and change its state: inkit.games/g/<id>/edit. A page of its own (no site nav),
// like Substack's post editor: see GameEditor.
// Its author (while a member) and the collection's owners can edit; owners and admins can
// take it down; admins can feature it.
import { redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game-edit";
import { cloudflareContext } from "~/lib/context";
import { schema } from "~/db";
import { changeGame, isFeatured, rereadDrawing } from "~/lib/games.server";
import { editAccess as load } from "~/lib/edit-access.server";
import { GameEditor } from "~/components/GameEditor";
import { doubtsOf } from "~/games/doubts";
import { attempt } from "~/lib/http.server";


/** The site's nav stays off this page (root.tsx). */
export const handle = { bare: true };

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, game, may } = await load(request, context.get(cloudflareContext).env, params.id);
  const collection = await db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) });
  return {
    game: { id: game.id, title: game.title, description: game.description, sketch: game.sketch, state: game.state, hiddenNote: game.hiddenNote },
    may, featured: await isFeatured(db, game.id),
    drawing: !!game.sketchImage,
    reading: game.reading,
    doubts: doubtsOf(game.parseNotes),
    choices: game.kindChoices ?? [],
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

export default function EditGame({ loaderData: { game, may, featured, drawing, reading, doubts, choices, backTo }, actionData }: Route.ComponentProps) {
  const error = actionData && "error" in actionData ? actionData.error : undefined;
  return (
    <GameEditor key={game.id} game={game} reading={reading} drawing={drawing} doubts={doubts} choices={choices}
      may={may} featured={featured} backTo={backTo} error={error} />
  );
}
