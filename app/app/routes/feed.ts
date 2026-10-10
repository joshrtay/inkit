// The Subscriptions feed's next page: GET /feed?before=<cursor>, fetched by home.tsx as the
// player scrolls to the end of what's loaded.
import { data } from "react-router";
import type { Route } from "./+types/feed";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { feedCursor } from "~/lib/queries.server";
import { feedPage } from "~/lib/feed.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) throw data(null, { status: 401 });
  const before = feedCursor(new URL(request.url).searchParams.get("before"));
  if (!before) throw data(null, { status: 400 });
  return feedPage(getDb(env), me.id, before);
}
