// The AI creators' recommendations (app/ai/personas.ts `recommends`), as JSON (admins and the admin
// API token): inkit.games/admin/ai/recommendations. They're also synced with each post.
//   POST   write every persona's picks into the recommendations table now
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin-ai-recommendations";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { requireAdmin } from "~/lib/admin.server";
import { aiCreatorId, syncRecommendations } from "~/lib/ai.server";
import { PERSONAS } from "~/ai/personas";

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  if (request.method !== "POST") throw data(null, { status: 405 });
  const db = getDb(env);
  const changed: string[] = [];
  for (const p of PERSONAS) {
    // only personas with an account (made with their first post, or by the seed)
    if (!(await db.query.creators.findFirst({ columns: { id: true }, where: eq(schema.creators.id, aiCreatorId(p.handle)) }))) continue;
    if (await syncRecommendations(db, p)) changed.push(p.handle);
  }
  return Response.json({ changed });
}
