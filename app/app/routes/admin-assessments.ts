// The deduction solver's assessments of published puzzles, as JSON (admins and the admin API
// token): inkit.games/admin/assessments. The solver can't run on the Worker, so a batch
// (puzzles/difficulty/assess-site.ts, hourly in GitHub Actions) asks for the games that need one,
// runs it, and sends the results back. See app/lib/assessments.server.ts.
//   GET  ?version=<n>&limit=<k>   games with no assessment at that version yet, oldest first
//   POST { results: [{ id, sketchHash, assessment }] }   store them
import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/admin-assessments";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { requireAdmin } from "~/lib/admin.server";
import { pendingAssessments, storeAssessments } from "~/lib/assessments.server";
import { Assessment } from "~/games/assessment";

const Results = z.object({ results: z.array(z.object({ id: z.string(), sketchHash: z.string(), assessment: Assessment })).min(1).max(50) });

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  const url = new URL(request.url);
  const version = Number(url.searchParams.get("version")), limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  if (!Number.isInteger(version) || version < 1) return Response.json({ error: "Say which assessment version: ?version=<n>." }, { status: 400 });
  return Response.json({ games: await pendingAssessments(getDb(env), version, limit) });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  if (request.method !== "POST") throw data(null, { status: 405 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  const parsed = Results.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  return Response.json(await storeAssessments(getDb(env), parsed.data.results));
}
