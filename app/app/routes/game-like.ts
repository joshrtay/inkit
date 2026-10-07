// Like or unlike a game: POST inkit.games/g/<id>/like with intent "like" or "unlike". Any
// signed-in creator, on a published game they can see (their own included). Returns the new count.
import { data } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/game-like";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { canView, roleIn } from "~/lib/permissions.server";
import { likesOf } from "~/lib/queries.server";

export async function action({ params, request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const me = await currentCreator(env, request);
  if (!me) throw data({ error: "Sign in to like puzzles." }, { status: 401 });
  const game = await db.query.games.findFirst({ where: eq(schema.games.id, params.id) });
  const collection = game && await db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) });
  if (!game || !collection || game.state !== "published" || !canView(game, collection, me, await roleIn(db, collection.id, me.id))) throw data(null, { status: 404 });
  const intent = (await request.formData()).get("intent");
  if (intent === "like") await db.insert(schema.likes).values({ creatorId: me.id, gameId: game.id }).onConflictDoNothing();
  else if (intent === "unlike") await db.delete(schema.likes).where(and(eq(schema.likes.creatorId, me.id), eq(schema.likes.gameId, game.id)));
  return likesOf(db, game.id, me.id);
}
