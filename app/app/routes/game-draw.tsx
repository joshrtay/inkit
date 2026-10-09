// Draw a draft in paint: inkit.games/g/<id>/draw (docs/creation-flow.md). The drawing is the
// puzzle: components/Paint.tsx, with its type, Check and autosave. A page of its own, like the
// editor. For drafts its author can edit; a published game is changed in the editor for now.
import { data, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game-draw";
import { cloudflareContext } from "~/lib/context";
import { schema } from "~/db";
import { saveDrawing } from "~/lib/games.server";
import { editAccess as load } from "~/lib/edit-access.server";
import { attempt } from "~/lib/http.server";
import { Paint } from "~/components/Paint";
import { readPaintSave, type PaintSave } from "~/games/paint-save";
import { looseSpec } from "~/games/sketch";
import { toDrawing } from "~/sketchpad/from-puzzle";
import { makePuzzle, type GenreName } from "~site/engine/puzzle.ts";
import { PROFILES } from "~/sketchpad/to-puzzle";

export const handle = { bare: true };

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Draw ${loaderData?.game.title ?? "a puzzle"} · inkit` }, { name: "robots", content: "noindex" }];

/** A draft made before paint (by the reader, or the editor) drawn from its sketch, once. */
function fromSketch(sketch: string): PaintSave | null {
  const spec = looseSpec(sketch), genre = spec?.genre as GenreName | undefined;
  if (!spec || !genre || !PROFILES[genre]) return null;
  try {
    return { drawing: toDrawing(makePuzzle(spec, { unfinished: true }), genre).drawing, genre, settings: { ...(spec.rules ? { rules: spec.rules } : {}), ...(spec.style ? { style: spec.style } : {}) } };
  } catch { return null; }
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, game, may } = await load(request, context.get(cloudflareContext).env, params.id);
  if (!may.edit) throw data(null, { status: 404 });
  if (game.state !== "draft") throw redirect(`/g/${game.id}/edit`);
  const collection = await db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) });
  return {
    game: { id: game.id, title: game.title },
    saved: readPaintSave(game.drawing) ?? fromSketch(game.sketch),
    admin: may.feature,
    backTo: collection ? `/${collection.slug}?tab=drafts` : `/g/${game.id}`,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { db, me, game } = await load(request, context.get(cloudflareContext).env, params.id);
  const form = await request.formData();
  return attempt(async () => {
    if (String(form.get("intent")) !== "save") throw new Response(null, { status: 400 });
    await saveDrawing(db, me, game, form);
    return { ok: true, error: undefined };
  });
}

export default function DrawGame({ loaderData: { game, saved, admin, backTo } }: Route.ComponentProps) {
  return <Paint key={game.id} game={game} saved={saved} backTo={backTo} admin={admin} />;
}
