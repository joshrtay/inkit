// Record a solve: POST inkit.games/g/<id>/solve, sent by the game page when a signed-in player
// solves a published puzzle. Once per player; a puzzle's author solving their own doesn't count.
// Returns the puzzle's solves.
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game-solve";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { canView, roleIn } from "~/lib/permissions.server";
import { solvesOf } from "~/lib/queries.server";

export async function action({ params, request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const me = await currentCreator(env, request);
  if (!me) throw data({ error: "Sign in to keep your solves." }, { status: 401 });
  const game = await db.query.games.findFirst({ where: eq(schema.games.id, params.id) });
  const collection = game && await db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) });
  if (!game || !collection || game.state !== "published" || !canView(game, collection, me, await roleIn(db, collection.id, me.id))) throw data(null, { status: 404 });
  if (game.authorId !== me.id) await db.insert(schema.solves).values({ creatorId: me.id, gameId: game.id }).onConflictDoNothing();
  return solvesOf(db, game.id, me.id);
}
