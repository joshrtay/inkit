// A draft set, for the drawer (components/SetDrawer.tsx): GET /api/sets/<id>, its title, words and
// puzzles in order; POST to change it: describe (title, description), add, remove, move (to a
// position), publish, delete. Its author only, and only while it's a draft (deleting a published
// set too).
import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/api.set";
import { cloudflareContext } from "~/lib/context";
import { getDb, schema } from "~/db";
import { currentCreator } from "~/lib/auth.server";
import { addToSet, deleteSet, describeSet, moveInSet, publishSet, removeFromSet, setPuzzles, setSummary } from "~/lib/sets.server";

async function mine(request: Request, context: Route.LoaderArgs["context"], id: string) {
  const { env } = context.get(cloudflareContext);
  const db = getDb(env);
  const me = await currentCreator(env, request);
  if (!me) throw data({ error: "Sign in first." }, { status: 401 });
  const set = await db.query.sets.findFirst({ where: eq(schema.sets.id, id) });
  if (!set || set.authorId !== me.id || set.state === "deleted") throw data({ error: "Not found." }, { status: 404 });
  return { db, me, set };
}

/** What the drawer shows. */
async function drawerData(db: Parameters<typeof setPuzzles>[0], set: typeof schema.sets.$inferSelect) {
  const puzzles = await setPuzzles(db, set.id);
  return {
    set: { id: set.id, title: set.title, description: set.description, state: set.state },
    puzzles: puzzles.map((p) => ({ id: p.id, title: p.title, picture: p.picture, by: p.authorName, ai: p.authorAi, level: p.level, minutes: p.minutes })),
    summary: setSummary(puzzles),
  };
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { db, set } = await mine(request, context, params.id);
  return Response.json(await drawerData(db, set));
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { db, set } = await mine(request, context, params.id);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const s = (k: string) => String(form.get(k) ?? "");
  if (intent === "delete") { await deleteSet(db, set); return Response.json({ deleted: true }); }
  if (set.state !== "draft") throw data({ error: "A published set can't be changed." }, { status: 403 });
  let error: string | null = null;
  if (intent === "describe") await describeSet(db, set.id, { title: form.has("title") ? s("title") : undefined, description: form.has("description") ? s("description") : undefined });
  else if (intent === "add") error = await addToSet(db, set.id, s("game"));
  else if (intent === "remove") await removeFromSet(db, set.id, s("game"));
  else if (intent === "move") await moveInSet(db, set.id, s("game"), Number(s("to")));
  else if (intent === "publish") error = await publishSet(db, set.id);
  else throw data({ error: "Not understood." }, { status: 400 });
  const fresh = (await db.query.sets.findFirst({ where: eq(schema.sets.id, set.id) }))!;
  return Response.json({ error, ...(await drawerData(db, fresh)) });
}
