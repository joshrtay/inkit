// One read in full, as JSON (admins and the admin API token): inkit.games/admin/reads/<id>.
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin-read";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { requireAdmin } from "~/lib/admin.server";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  const read = await getDb(env).query.reads.findFirst({ where: eq(schema.reads.id, params.id) });
  if (!read) throw data(null, { status: 404 });
  return Response.json({ ...read, photo: read.imageKey ? `${new URL(request.url).origin}/admin/reads/${read.id}/photo` : null });
}
