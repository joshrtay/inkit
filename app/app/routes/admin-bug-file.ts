// A bug report's recording or screenshot, from R2 (admins only): /admin/bugs/<id>/files/replay or
// /screenshot. The replay comes gzipped, as the browser sent it; the admin page unzips it.
import { data } from "react-router";
import type { Route } from "./+types/admin-bug-file";
import { cloudflareContext } from "~/lib/context";
import { requireAdmin } from "~/lib/admin.server";
import { bugKey } from "~/lib/bugs/bugs.server";

const FILES = { replay: "replay.json.gz", screenshot: "screenshot.jpeg", state: "state.json" } as const;

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdmin(env, request);
  const file = FILES[params.file as keyof typeof FILES];
  const object = file && /^\w+$/.test(params.id) ? await env.MEDIA.get(bugKey(params.id, file)) : null;
  if (!object) throw data(null, { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "application/octet-stream", "cache-control": "private, no-store" } });
}
