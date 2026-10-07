// The photo a read looked at (admins and the admin API token): inkit.games/admin/reads/<id>/photo. Also for reads
// whose upload failed, which have no game to show it.
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin-read-photo";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { requireAdmin } from "~/lib/admin.server";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  const read = await getDb(env).query.reads.findFirst({ where: eq(schema.reads.id, params.id) });
  const object = read?.imageKey ? await env.MEDIA.get(read.imageKey) : null;
  if (!object) throw data(null, { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "private, max-age=3600" } });
}
