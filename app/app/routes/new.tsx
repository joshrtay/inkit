// Make a new game: wyattsgames.com/new (optionally ?in=<collection slug>).
import { redirect } from "react-router";
import type { Route } from "./+types/new";
import { cloudflareContext } from "~/lib/context";
import { getDb } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { createGame, publishTargets } from "~/lib/games.server";
import { attempt, signInFirst } from "~/lib/http.server";
import { SketchEditor } from "~/components/SketchEditor";
import { EXAMPLES } from "~/games/examples";

export const meta: Route.MetaFunction = () => [{ title: "New game · Wyatt's Games" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const targets = await publishTargets(getDb(env), me.id);
  const want = new URL(request.url).searchParams.get("in");
  return { targets, collection: targets.find((t) => t.slug === want)?.id ?? targets[0]?.id };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) signInFirst(request);
  const form = await request.formData();
  return attempt(async () => redirect(`/g/${await createGame(getDb(env), me, form)}`));
}

export default function NewGame({ loaderData: { targets, collection }, actionData }: Route.ComponentProps) {
  return (
    <main className="wrap">
      <h1>New game</h1>
      <SketchEditor initial={{ title: "", description: "", sketch: EXAMPLES.river, collection }} targets={targets}
        error={actionData && "error" in actionData ? actionData.error : undefined} />
    </main>
  );
}
