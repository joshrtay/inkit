// How well drawings are being read, as JSON (admins and the admin API token): inkit.games/admin/reads/stats.
// Accuracy against what creators published (overall and by puzzle type), re-reads, the careful
// reader taking over, and time and tokens per model. See app/lib/reads.server.ts.
import type { Route } from "./+types/admin-reads-stats";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { requireAdmin } from "~/lib/admin.server";
import { allReads, readStats } from "~/lib/reads.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  const rows = await allReads(getDb(env));
  return Response.json(readStats(rows.map((r) => r.read)));
}
