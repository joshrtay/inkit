// Who may open a game's editor (and its preview): its author while a member, the collection's
// owners, and those who can take it down. Everyone else gets a 404, as if it didn't exist.
import { data } from "react-router";
import { eq } from "drizzle-orm";
import { getDb, schema } from "~/db";
import { currentCreator } from "./auth.server";
import { canEdit, canHide, roleIn } from "./permissions.server";
import { signInFirst } from "./http.server";

export async function editAccess(request: Request, env: Env, id: string) {
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
