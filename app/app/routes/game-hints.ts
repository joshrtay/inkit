// A draft's hints, rewritten by its author (or a collection owner) on its publish page: POST
// inkit.games/g/<id>/hints with { ladder } (src/lib/hint-ladder.ts), or { ladder: null } to clear
// them. Once published they're locked with the puzzle. Returns the ladder as kept.
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game-hints";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { canEditHints, roleIn } from "~/lib/permissions.server";
import { saveAuthorLadder } from "~/lib/hints.server";
import { readLadder } from "~site/lib/hint-ladder";
import { readPaintSave, sketchOf } from "~/games/paint-save";

export async function action({ params, request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  if (request.method !== "POST") throw data(null, { status: 405 });
  const db = getDb(env);
  const me = await currentCreator(env, request);
  if (!me) throw data({ error: "Sign in to edit the hints." }, { status: 401 });
  const game = await db.query.games.findFirst({ where: eq(schema.games.id, params.id) });
  if (!game || game.state === "deleted") throw data(null, { status: 404 });
  if (game.state !== "draft") return Response.json({ error: "A published puzzle's hints are locked with it." }, { status: 403 });
  if (!canEditHints(game, me, await roleIn(db, game.collectionId, me.id))) throw data(null, { status: 404 });
  const body = await request.json().catch(() => null) as { ladder?: unknown } | null;
  if (!body || !("ladder" in body)) return Response.json({ error: "Send { ladder }." }, { status: 400 });
  const ladder = body.ladder === null ? null : readLadder(body.ladder);
  if (body.ladder !== null && !ladder) return Response.json({ error: "Those hints can't be read." }, { status: 400 });
  // a draft's hints are for the sketch paint makes now (what its publish page shows and publishes)
  const save = game.state === "draft" ? readPaintSave(game.drawing) : null;
  const sketch = (save && sketchOf(save).sketch) || game.sketch;
  await saveAuthorLadder(db, { id: game.id, sketch }, ladder);
  return Response.json({ ladder: ladder && { ...ladder, edited: true } });
}
