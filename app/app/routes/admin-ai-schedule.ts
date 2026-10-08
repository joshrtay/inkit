// The AI creators' queue, as JSON (admins and the admin API token): inkit.games/admin/ai/schedule.
// See docs/ai-creators.md.
//   GET                          queued drafts (soonest first) and the last week's published posts
//   POST   { persona, sketch, title, description, publishAt, proof, meta? }
//                                queue a post as a scheduled draft (puzzles/ai/week.ts sends these)
//   DELETE ?persona=<handle>     take a persona's queued posts off the queue (or ?id=<game>)
import { data } from "react-router";
import type { Route } from "./+types/admin-ai-schedule";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { requireAdmin } from "~/lib/admin.server";
import { aiSchedule, scheduleGame, unschedule } from "~/lib/ai.server";
import { checkScheduleRequest } from "~/ai/request";
import { Invalid } from "~/lib/errors.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  return Response.json(await aiSchedule(getDb(env)));
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  const db = getDb(env);
  try {
    if (request.method === "DELETE") {
      const url = new URL(request.url), handle = url.searchParams.get("persona") ?? undefined, id = url.searchParams.get("id") ?? undefined;
      if (!handle && !id) return Response.json({ error: "Say which: ?persona=<handle> or ?id=<game>." }, { status: 400 });
      const n = await unschedule(db, { handle, id });
      return Response.json({ unscheduled: n });
    }
    if (request.method !== "POST") throw data(null, { status: 405 });
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
    const checked = await checkScheduleRequest(body, new Date());
    if (!checked.ok) return Response.json({ error: checked.error }, { status: checked.status });
    const { id, created } = await scheduleGame(db, checked.persona, checked.kind, checked.publishAt, checked.req);
    if (created) console.log(`ai: queued ${id} for @${checked.persona.handle} at ${checked.publishAt.toISOString()}`, JSON.stringify(checked.req.meta ?? {}));
    return Response.json({ id, created, publishAt: checked.publishAt.toISOString() }, { status: created ? 201 : 200 });
  } catch (e) {
    if (e instanceof Invalid) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
