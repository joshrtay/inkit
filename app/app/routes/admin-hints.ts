// Puzzles' hint ladders, as JSON (admins and the admin API token): inkit.games/admin/hints. The
// solver can't run on the Worker, so a batch (puzzles/hints/write-site.ts) asks for the games with
// no ladder yet, writes one for each, and sends them back. See app/lib/hints.server.ts.
//   GET  ?limit=<k>                          games with no ladder yet, oldest first
//   POST { results: [{ id, sketchHash, ladder }] }   store them (never over an author's own)
import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/admin-hints";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { requireAdmin } from "~/lib/admin.server";
import { pendingLadders, storeLadders } from "~/lib/hints.server";

const Results = z.object({ results: z.array(z.object({ id: z.string(), sketchHash: z.string(), ladder: z.unknown() })).min(1).max(50) });

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  const limit = Math.min(50, Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? 20) || 20));
  return Response.json({ games: await pendingLadders(getDb(env), limit) });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  if (request.method !== "POST") throw data(null, { status: 405 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  const parsed = Results.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  return Response.json(await storeLadders(getDb(env), parsed.data.results));
}
