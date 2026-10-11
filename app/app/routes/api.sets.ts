// Your draft sets: GET /api/sets, for "Add to set" (the one you last added to first); POST /api/sets to
// make one (a title, and a first puzzle if given), on your own profile.
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.sets";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { newId } from "~/lib/names.server";
import { createSet, draftSetsOf } from "~/lib/sets.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const me = await currentCreator(env, request);
  if (!me) throw data({ error: "Sign in first." }, { status: 401 });
  return Response.json({ sets: await draftSetsOf(getDb(env), me.id) });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const me = await currentCreator(env, request);
  if (!me) throw data({ error: "Sign in first." }, { status: 401 });
  const own = await db.query.collections.findFirst({ where: eq(schema.collections.personalOf, me.id) });
  if (!own) throw data({ error: "No profile." }, { status: 400 });
  const form = await request.formData();
  const game = String(form.get("game") ?? "") || undefined;
  const id = await createSet(db, me, own.id, String(form.get("title") ?? ""), newId, game);
  return Response.json({ id });
}
