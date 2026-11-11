// The tutor's reply (src/lib/tutor.ts): POST inkit.games/g/<id>/tutor with { read, turns, ask? }.
// `read`: what the solver found on the player's board, in their browser (games/tutor.client.ts);
// `turns`: the chat so far, ending with the player's; `ask`: which suggested question that is.
// Returns { text, move, mistake, by }. Signed-in players only: the limits count per account
// (lib/tutor.server.ts), and what they ask goes to Anthropic's API (the privacy page says so).
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/game-tutor";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { parseSketch } from "~/games/sketch";
import { sha256 } from "~/ai/request";
import { currentCreator } from "~/lib/auth.server";
import { canView, roleIn } from "~/lib/permissions.server";
import { isAsk, readOfBody, tutorReply, turnsOfBody } from "~/lib/tutor.server";

export async function action({ params, request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  if (request.method !== "POST") throw data(null, { status: 405 });
  const db = getDb(env);
  const me = await currentCreator(env, request);
  if (!me) return Response.json({ error: "Sign in to ask the tutor." }, { status: 401 });
  const game = await db.query.games.findFirst({ where: eq(schema.games.id, params.id) });
  const collection = game && await db.query.collections.findFirst({ where: eq(schema.collections.id, game.collectionId) });
  if (!game || !collection || game.state !== "published" || !canView(game, collection, me, await roleIn(db, collection.id, me.id))) throw data(null, { status: 404 });
  const parsed = parseSketch(game.sketch, game.sketchVersion);
  if (!parsed.ok || parsed.spec.figure) return Response.json({ error: "The tutor can't read this puzzle." }, { status: 400 });
  const body = await request.json().catch(() => null) as { read?: unknown; turns?: unknown; ask?: unknown } | null;
  const read = readOfBody(body?.read), turns = turnsOfBody(body?.turns);
  if (!read || !turns?.length || turns[turns.length - 1].role !== "player") return Response.json({ error: "That can't be read." }, { status: 400 });
  try {
    const out = await tutorReply(env, db, me, { id: game.id, sketchHash: await sha256(game.sketch) }, parsed.spec, read, turns, isAsk(body?.ask) ? body.ask : null);
    return out.ok ? Response.json(out.reply) : Response.json({ error: out.error }, { status: out.status });
  } catch (e) {
    return Response.json({ error: `The tutor didn't answer (${(e as Error).message.slice(0, 120)}).` }, { status: 502 });
  }
}
