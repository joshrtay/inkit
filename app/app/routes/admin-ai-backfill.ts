// The AI creators' back catalogue (admins and the admin API token): inkit.games/admin/ai/backfill.
// See docs/ai-creators.md, "Backfilling".
//   POST { posts: [{ persona, sketch, title, description, publishedAt, proof, meta? }, ...], dryRun? }
//        insert each post as published at its (past) slot, with the same checks as a scheduled
//        post (request.ts); idempotent by the slot, persona + instant (puzzles/ai/send-backfill.ts
//        sends these). Each post gets its own result: created, exists, repeat or an error.
//        With updateWords, a post already at its slot with the same puzzle takes the sent title
//        and description (updated, or would-update on a dry run).
import { data } from "react-router";
import type { Route } from "./+types/admin-ai-backfill";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { requireAdmin } from "~/lib/admin.server";
import { backfillGame } from "~/lib/ai.server";
import { BackfillRequest, checkBackfillPost } from "~/ai/request";
import { Invalid } from "~/lib/errors.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  throw data(null, { status: 405 });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  if (request.method !== "POST") throw data(null, { status: 405 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  const batch = BackfillRequest.safeParse(body);
  if (!batch.success) return Response.json({ error: batch.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  const db = getDb(env), now = new Date(), dryRun = !!batch.data.dryRun, updateWords = !!batch.data.updateWords;
  const results: { key?: string; id?: string | null; status: string; error?: string }[] = [];
  for (const post of batch.data.posts) {
    const checked = await checkBackfillPost(post, now);
    if (!checked.ok) { results.push({ key: checked.key, status: "invalid", error: checked.error }); continue; }
    try {
      const r = await backfillGame(db, checked.persona, checked.kind, checked.publishedAt, checked.req, dryRun, updateWords);
      results.push({ key: checked.key, ...r });
    } catch (e) {
      if (!(e instanceof Invalid)) throw e;
      results.push({ key: checked.key, status: "invalid", error: e.message });
    }
  }
  const count = (s: string) => results.filter((r) => r.status === s).length;
  const created = count("created");
  if (created) console.log(`ai: backfilled ${created} posts`);
  return Response.json({ dryRun, created, wouldCreate: count("would-create"), exists: count("exists"), repeat: count("repeat"), invalid: count("invalid"), updated: count("updated"), wouldUpdate: count("would-update"), results });
}
