// Who a creator recommends (after Substack's recommendations): up to five creators, people or AI,
// in order, each with a line why. A person manages theirs in Settings; an AI creator's come from
// app/ai/personas.ts (ai.server.ts `syncRecommendations`). Shown on the profile's Recommends tab
// and in Explore's "… recommends" row.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { schema, type Db } from "../db";
import { Invalid } from "./errors.server";
import { cantRecommend, firstLine, NOTE_MAX } from "./rank";


/** Someone's recommendations, in order, with who each creator is (deleted accounts left out). */
export async function recommendationsOf(db: Db, creatorId: string) {
  const rows = await db.select({
    id: schema.creators.id, handle: schema.creators.handle, name: schema.creators.name,
    ai: sql<boolean>`${schema.creators.isAi}`.mapWith(Boolean), note: schema.recommendations.note, position: schema.recommendations.position,
    collectionId: schema.collections.id, bio: schema.collections.description,
    puzzles: sql<number>`(select count(*) from games g where g.author_id = ${schema.creators.id} and g.state = 'published')`.mapWith(Number),
  }).from(schema.recommendations)
    .innerJoin(schema.creators, eq(schema.recommendations.recommendedId, schema.creators.id))
    .innerJoin(schema.collections, eq(schema.collections.personalOf, schema.creators.id))
    .where(and(eq(schema.recommendations.recommenderId, creatorId), isNull(schema.creators.deletedAt)))
    .orderBy(asc(schema.recommendations.position));
  return rows.map((r) => ({ ...r, bio: firstLine(r.bio) }));
}

const handleOf = (s: string) => s.trim().replace(/^@/, "").toLowerCase();
const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);

/** Settings' actions on your recommendations: add (by handle, with a note), note, up, down, remove. */
export async function changeRecommendations(db: Db, me: { id: string }, form: FormData) {
  const what = String(form.get("intent"));
  const mine = await db.select({ to: schema.recommendations.recommendedId, position: schema.recommendations.position })
    .from(schema.recommendations).where(eq(schema.recommendations.recommenderId, me.id)).orderBy(asc(schema.recommendations.position));
  const handle = handleOf(String(form.get("handle") ?? ""));
  const target = handle ? await db.query.creators.findFirst({ columns: { id: true, deletedAt: true }, where: eq(schema.creators.handle, handle) }) : null;
  const note = clean(String(form.get("note") ?? ""));
  const at = (to: string) => and(eq(schema.recommendations.recommenderId, me.id), eq(schema.recommendations.recommendedId, to));

  if (what === "rec-add") {
    const why = cantRecommend(me.id, target && { id: target.id, deleted: !!target.deletedAt }, mine.map((m) => m.to));
    if (why) throw new Invalid(why);
    await db.insert(schema.recommendations).values({ recommenderId: me.id, recommendedId: target!.id, note, position: (mine.at(-1)?.position ?? -1) + 1 });
    return;
  }
  if (!target || !mine.some((m) => m.to === target.id)) throw new Invalid("You don't recommend them.");
  if (what === "rec-note") return void await db.update(schema.recommendations).set({ note }).where(at(target.id));
  if (what === "rec-remove") return void await db.delete(schema.recommendations).where(at(target.id));
  if (what === "rec-up" || what === "rec-down") {
    const i = mine.findIndex((m) => m.to === target.id), j = what === "rec-up" ? i - 1 : i + 1;
    if (j < 0 || j >= mine.length) return;
    // swap the two places (positions renumbered 0..n so they stay distinct)
    const order = mine.map((m) => m.to);
    [order[i], order[j]] = [order[j], order[i]];
    await db.batch(order.map((to, k) => db.update(schema.recommendations).set({ position: k }).where(at(to))) as [never, ...never[]]);
    return;
  }
  throw new Invalid("Nothing to change.");
}
