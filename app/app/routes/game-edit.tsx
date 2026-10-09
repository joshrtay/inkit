// Edit an RYB game (Three Coats, drawn as pieces): inkit.games/g/<id>/edit. A page of its own (no
// site nav), like Substack's post editor: see GameEditor. Every other type is edited in paint
// (/g/<id>/draw), so this sends them there; RYB waits for paint to draw pieces (docs/creation-flow.md,
// decision 7).
// Only a draft: its author (while a member) and the collection's owners can edit it. A published
// RYB puzzle can't be changed, only deleted, as every type: it goes to its page (where the
// moderation menu is too).
import { data, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game-edit";
import { cloudflareContext } from "~/lib/context";
import { schema } from "~/db";
import { changeGame, rereadDrawing } from "~/lib/games.server";
import { editAccess as load } from "~/lib/edit-access.server";
import { GameEditor } from "~/components/GameEditor";
import { doubtsOf } from "~/games/doubts";
import { attempt } from "~/lib/http.server";


/** The site's nav stays off this page (root.tsx). */
export const handle = { bare: true };

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, game, may } = await load(request, context.get(cloudflareContext).env, params.id);
  if (game.state !== "draft") throw redirect(`/g/${game.id}`);
  if (game.kind !== "coats") throw may.edit ? redirect(`/g/${game.id}/draw`) : data(null, { status: 404 });
  const collection = await db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) });
  return {
    game: { id: game.id, title: game.title, description: game.description, sketch: game.sketch },
    may: { edit: may.edit },
    drawing: !!game.sketchImage,
    reading: game.reading,
    doubts: doubtsOf(game.parseNotes),
    choices: game.kindChoices ?? [],
    backTo: collection ? `/${collection.slug}?tab=drafts` : "/new",
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { db, env, me, game } = await load(request, context.get(cloudflareContext).env, params.id);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  return attempt(async () => {
    if (intent === "reread") { await rereadDrawing(db, env, me, game, form); return { error: undefined, done: intent }; }
    // the editor's own: moderation and Delete are on the game's page
    if (intent !== "save" && intent !== "publish" && intent !== "doubt") throw new Response(null, { status: 400 });
    await changeGame(db, me, game, form);
    // saving a draft (it saves itself as you go) keeps you in the editor; publishing shows the game
    const stay = intent === "save" && form.get("stay") === "1";
    return (intent === "save" || intent === "publish") && !stay ? redirect(`/g/${game.id}`) : { error: undefined, done: intent };
  });
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Edit ${loaderData?.game.title ?? "game"} · inkit` }, { name: "robots", content: "noindex" }];

export default function EditGame({ loaderData: { game, may, drawing, reading, doubts, choices, backTo }, actionData }: Route.ComponentProps) {
  const error = actionData && "error" in actionData ? actionData.error : undefined;
  return (
    <GameEditor key={game.id} game={game} reading={reading} drawing={drawing} doubts={doubts} choices={choices}
      may={may} backTo={backTo} error={error} />
  );
}
