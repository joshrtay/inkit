// POST /api/plays: a batch of a play's events (app/lib/play-log.ts), from a player who hasn't turned
// solve logging off. Only for published puzzles, and not their author's own play. Stored as
// sent (plays, play_events); a batch sent twice is kept once. Research only, never shown.
import { eq, sql } from "drizzle-orm";
import type { Route } from "./+types/api.plays";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { checkBatch, solvedIn } from "~/games/plays";

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  if (request.method !== "POST") return Response.json({ error: "Not allowed." }, { status: 405 });
  const text = await request.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  const checked = checkBatch(body, new TextEncoder().encode(text).length);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });
  const { play, seq, events } = checked.batch;
  const db = getDb(env);
  const game = await db.query.games.findFirst({ columns: { id: true, state: true, authorId: true }, where: eq(schema.games.id, play.gameId) });
  if (!game || game.state !== "published") return Response.json({ error: "No such puzzle." }, { status: 404 });
  // an author playing their own puzzle knows the answer: not a solve to learn from
  if ((await currentCreator(env, request))?.id === game.authorId) return Response.json({ ok: true, kept: false });
  const existing = await db.query.plays.findFirst({ columns: { gameId: true, playerId: true }, where: eq(schema.plays.id, play.id) });
  if (existing && (existing.gameId !== play.gameId || existing.playerId !== play.playerId)) return Response.json({ error: "Not this play." }, { status: 409 });
  const solved = solvedIn(checked.batch);
  await db.insert(schema.plays).values({ id: play.id, gameId: play.gameId, playerId: play.playerId, startedAt: new Date(play.startedAt), events: 0 }).onConflictDoNothing();
  const added = await db.insert(schema.playEvents).values({ playId: play.id, seq, events }).onConflictDoNothing().returning({ seq: schema.playEvents.seq });
  // a batch sent twice (a retry, a beacon after a fetch) counts once
  if (added.length) await db.update(schema.plays).set({
    events: sql`${schema.plays.events} + ${events.length}`, updatedAt: new Date(),
    ...(solved ? { solvedAt: new Date(play.startedAt + Math.max(...events.filter((e) => e[1] === "s").map((e) => e[0]))) } : {}),
  }).where(eq(schema.plays.id, play.id));
  return Response.json({ ok: true, kept: true });
}

export function loader() {
  return new Response(null, { status: 404 });
}
