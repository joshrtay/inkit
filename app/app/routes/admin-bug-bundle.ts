// One report's bundle for the bug-fix workflow (.github/workflows/bug-fix.yml), as JSON: the
// gatekeeper's restatement, the page's state and console log. Not the reporter's own words, not
// the replay. Admins, or the BUG_BUNDLE_TOKEN secret, which opens only this.
import { data } from "react-router";
import type { Route } from "./+types/admin-bug-bundle";
import { cloudflareContext } from "~/lib/context";
import { requireAdminOr } from "~/lib/admin.server";
import { bundleOf } from "~/lib/bugs/bugs.server";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await requireAdminOr(env, request, env.BUG_BUNDLE_TOKEN);
  const bundle = await bundleOf(env, params.id);
  if (!bundle) throw data(null, { status: 404 });
  return Response.json(bundle, { headers: { "cache-control": "no-store" } });
}
