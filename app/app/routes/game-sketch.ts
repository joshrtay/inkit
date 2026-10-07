// The hand-drawn sketch a game was made from: inkit.games/g/<id>/sketch (an image).
// Visible to whoever can see the game.
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game-sketch";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { canEdit, canHide, canView, roleIn } from "~/lib/permissions.server";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const game = await db.query.games.findFirst({ where: eq(schema.games.id, params.id) });
  const collection = game && await db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) });
  if (!game?.sketchImage || !collection) throw data(null, { status: 404 });
  const viewer = await currentCreator(env, request);
  const role = await roleIn(db, collection.id, viewer?.id);
  if (!canView(game, collection, viewer, role) && !canEdit(game, viewer, role) && !canHide(viewer, role)) throw data(null, { status: 404 });
  const object = await env.MEDIA.get(game.sketchImage);
  if (!object) throw data(null, { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "image/jpeg",
      // the key changes with each upload, so the image can be cached; drafts stay private
      "cache-control": game.state === "published" ? "public, max-age=86400" : "private, max-age=3600",
    },
  });
}
