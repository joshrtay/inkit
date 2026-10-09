// Draw a draft in paint: inkit.games/g/<id>/draw (docs/creation-flow.md). The drawing is the
// puzzle: components/Paint.tsx, with its type, Check and autosave. A page of its own, like the
// editor. For drafts its author can edit; a published game is changed in the editor for now.
import { data, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game-draw";
import { cloudflareContext } from "~/lib/context";
import { schema } from "~/db";
import { changeGame, saveDrawing } from "~/lib/games.server";
import { editAccess as load } from "~/lib/edit-access.server";
import { attempt } from "~/lib/http.server";
import { Paint } from "~/components/Paint";
import { paintFromSketch, readPaintSave } from "~/games/paint-save";
import { doubtsOf } from "~/games/doubts";

export const handle = { bare: true };

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Draw ${loaderData?.game.title ?? "a puzzle"} · inkit` }, { name: "robots", content: "noindex" }];

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, game, may } = await load(request, context.get(cloudflareContext).env, params.id);
  if (!may.edit) throw data(null, { status: 404 });
  if (game.state !== "draft") throw redirect(`/g/${game.id}/edit`);
  const collection = await db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) });
  const saved = readPaintSave(game.drawing) ?? paintFromSketch(game.sketch);
  const choices = (game.kindChoices ?? []).filter(Boolean);
  return {
    game: { id: game.id, title: game.title },
    saved,
    // a photo's: the photo, what Claude wasn't sure of, and the types it thought it could be
    photo: game.sketchImage ? {
      src: `/g/${game.id}/sketch?k=${encodeURIComponent(game.sketchImage.slice(-12))}`,
      doubts: doubtsOf(game.parseNotes),
      readAs: choices[0] ?? "",
    } : null,
    choices,
    opened: new URL(request.url).searchParams.has("read"),
    admin: may.feature,
    backTo: collection ? `/${collection.slug}?tab=drafts` : `/g/${game.id}`,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { db, me, game } = await load(request, context.get(cloudflareContext).env, params.id);
  const form = await request.formData();
  return attempt(async () => {
    const intent = String(form.get("intent"));
    // a doubt ticked off (or not): as the editor does
    if (intent === "doubt") { await changeGame(db, me, game, form); return { ok: true, error: undefined }; }
    if (intent !== "save") throw new Response(null, { status: 400 });
    await saveDrawing(db, me, game, form);
    return { ok: true, error: undefined };
  });
}

export default function DrawGame({ loaderData: { game, saved, admin, backTo, photo, choices, opened } }: Route.ComponentProps) {
  return <Paint key={game.id} game={game} saved={saved} backTo={backTo} admin={admin} photo={photo} choices={choices} opened={opened} />;
}
