// Explore (components/ExplorePage.tsx). Its canonical is "/", which shows the same page to anyone
// signed out (and so to search engines); signed in, "/" is the Subscriptions feed.
import type { Route } from "./+types/explore";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { explorePage } from "~/lib/explore-page.server";
import { exploreMeta } from "~/lib/seo";
import { ExplorePage } from "~/components/ExplorePage";
import "~site/game-types/grid/styles.css";

export const meta: Route.MetaFunction = ({ loaderData: d }) => exploreMeta(d);

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return explorePage(getDb(env), new URL(request.url), currentCreator(env, request));
}

export default function Explore({ loaderData: d }: Route.ComponentProps) {
  return <ExplorePage d={d} />;
}
