// POST /bugs: a bug report from "Report a bug" (components/BugReport.tsx; docs/bug-pipeline.md).
// Signed in only; the limits and the storing are in app/lib/bugs/bugs.server.ts.
import type { Route } from "./+types/bugs";
import { cloudflareContext } from "~/lib/context";
import { currentCreator } from "~/lib/auth.server";
import { BugError, createReport } from "~/lib/bugs/bugs.server";

/** The whole request, before it's read: the files' limits plus room for the text. */
const MAX_BODY = 12 * 1024 * 1024;

export async function action({ request, context }: Route.ActionArgs) {
  const { env, ctx } = context.get(cloudflareContext);
  if (request.method !== "POST") return Response.json({ error: "Not allowed." }, { status: 405 });
  const me = await currentCreator(env, request);
  if (!me) return Response.json({ error: "Sign in to report a bug." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return Response.json({ error: "That report is too big to send." }, { status: 413 });
  try {
    const id = await createReport(env, ctx, me.id, await request.formData());
    return Response.json({ ok: true, id });
  } catch (e) {
    if (e instanceof BugError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export function loader() {
  return new Response(null, { status: 404 });
}
