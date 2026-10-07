// Every read as JSON lines (admins and the admin API token): inkit.games/admin/reads.jsonl. One line per read: the
// photo (its address and storage key), Claude's reading and the sketch made from it, and, for
// published puzzles, the puzzle the creator settled on and the difference. Published lines are
// training and evaluation examples: photo in, published puzzle out.
import type { Route } from "./+types/admin-reads-export";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { requireAdmin } from "~/lib/admin.server";
import { allReads } from "~/lib/reads.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  const origin = new URL(request.url).origin;
  const rows = await allReads(getDb(env));
  const lines = rows.map(({ read: r }) => JSON.stringify({
    id: r.id, createdAt: r.createdAt.toISOString(), kind: r.kind, gameId: r.gameId,
    photo: r.imageKey ? `${origin}/admin/reads/${r.id}/photo` : null, imageKey: r.imageKey,
    feedback: r.feedback, chosenKind: r.chosenKind, model: r.model, attempts: r.attempts, error: r.error,
    puzzleKind: r.puzzleKind, sketch: r.sketch, reading: r.reading,
    publishedSketch: r.publishedSketch, publishedAt: r.publishedAt?.toISOString() ?? null, diff: r.diff,
  }));
  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "content-disposition": `attachment; filename="inkit-reads-${new Date().toISOString().slice(0, 10)}.jsonl"` },
  });
}
