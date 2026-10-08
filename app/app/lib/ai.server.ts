// The AI creators on the site (docs/ai-creators.md): their accounts, their queue of scheduled
// drafts (filled weekly by puzzles/ai/week.ts through POST /admin/ai/schedule), and the cron that
// publishes each draft at its time (workers/app.ts, every few minutes).
import { and, asc, eq, inArray, isNotNull, lte, or } from "drizzle-orm";
import { schema, type Db } from "../db";
import { parseSketch, SKETCH_VERSION } from "../games/sketch";
import { PERSONAS, type Persona } from "../ai/personas.ts";
import { dueToPublish } from "../ai/schedule.ts";
import type { ScheduleRequest } from "../ai/request.ts";
import { newId } from "./names.server";
import { Invalid } from "./errors.server";

export const aiCreatorId = (handle: string) => `ai-${handle}`;
const aiCollectionId = (handle: string) => `c-ai-${handle}`;

/** Make (or update) a persona's account and personal collection. Refuses if a person already
 *  has the handle, so the batch can never post as anyone else. */
export async function ensurePersona(db: Db, p: Persona) {
  const id = aiCreatorId(p.handle);
  const byHandle = await db.query.creators.findFirst({ where: eq(schema.creators.handle, p.handle) });
  if (byHandle && (byHandle.id !== id || !byHandle.isAi)) throw new Invalid(`The handle @${p.handle} belongs to someone else; rename the persona.`);
  const slug = await db.query.collections.findFirst({ where: eq(schema.collections.slug, p.handle) });
  if (slug && slug.id !== aiCollectionId(p.handle)) throw new Invalid(`inkit.games/${p.handle} is already a collection; rename the persona.`);
  await db.insert(schema.creators).values({ id, name: p.name, email: `${p.handle}@ai.inkit.invalid`, handle: p.handle, isAi: true })
    .onConflictDoUpdate({ target: schema.creators.id, set: { name: p.name, isAi: true, updatedAt: new Date() } });
  await db.insert(schema.collections).values({ id: aiCollectionId(p.handle), slug: p.handle, title: p.name, description: p.bio, personalOf: id })
    .onConflictDoUpdate({ target: schema.collections.id, set: { title: p.name, description: p.bio, updatedAt: new Date() } });
  await db.insert(schema.memberships).values({ collectionId: aiCollectionId(p.handle), creatorId: id, role: "owner" }).onConflictDoNothing();
  return { creatorId: id, collectionId: aiCollectionId(p.handle) };
}

/** Queue a checked post as a scheduled draft. A post for the same creator at the same time
 *  (queued or already published) is a repeat: it's skipped, so the batch can safely run twice. */
export async function scheduleGame(db: Db, p: Persona, kind: string, publishAt: Date, req: ScheduleRequest) {
  const { creatorId, collectionId } = await ensurePersona(db, p);
  const same = await db.query.games.findFirst({
    columns: { id: true },
    where: and(eq(schema.games.authorId, creatorId), or(eq(schema.games.publishAt, publishAt), eq(schema.games.publishedAt, publishAt))),
  });
  if (same) return { id: same.id, created: false };
  const id = newId();
  await db.insert(schema.games).values({
    id, collectionId, authorId: creatorId, title: req.title, description: req.description,
    sketch: req.sketch, sketchVersion: SKETCH_VERSION, kind, state: "draft", publishAt,
  });
  return { id, created: true };
}

const aiIds = () => PERSONAS.map((p) => aiCreatorId(p.handle));

/** Every AI creator's queued drafts, soonest first, and what they published in the last `days`. */
export async function aiSchedule(db: Db, days = 8) {
  const since = new Date(Date.now() - days * 86400e3);
  const rows = await db.select({
    id: schema.games.id, handle: schema.creators.handle, title: schema.games.title, kind: schema.games.kind,
    state: schema.games.state, publishAt: schema.games.publishAt, publishedAt: schema.games.publishedAt,
  }).from(schema.games).innerJoin(schema.creators, eq(schema.games.authorId, schema.creators.id))
    .where(and(inArray(schema.games.authorId, aiIds()),
      or(isNotNull(schema.games.publishAt), and(eq(schema.games.state, "published"), isNotNull(schema.games.publishedAt)))))
    .orderBy(asc(schema.games.publishAt));
  const queued = rows.filter((r) => r.state === "draft" && r.publishAt);
  const published = rows.filter((r) => r.state === "published" && r.publishedAt && r.publishedAt >= since);
  return { queued, published };
}

/** Take scheduled drafts off the queue (they stay as drafts): one game, or all of a persona's. */
export async function unschedule(db: Db, { handle, id }: { handle?: string; id?: string }) {
  if (!handle && !id) throw new Invalid("Say which: ?persona=<handle> or ?id=<game>.");
  const where = and(eq(schema.games.state, "draft"), isNotNull(schema.games.publishAt), inArray(schema.games.authorId, aiIds()),
    ...(handle ? [eq(schema.games.authorId, aiCreatorId(handle))] : []), ...(id ? [eq(schema.games.id, id)] : []));
  const rows = await db.select({ id: schema.games.id }).from(schema.games).where(where);
  if (rows.length) await db.update(schema.games).set({ publishAt: null, updatedAt: new Date() }).where(inArray(schema.games.id, rows.map((r) => r.id)));
  return rows.length;
}

/** Publish every scheduled draft whose time has come, the way a creator's Publish does (state,
 *  and the published time: the scheduled one, so the feed shows the posting time), and clear its
 *  schedule. A sketch that no longer parses stays a draft and is logged. Run by the cron. */
export async function publishDue(db: Db, now = new Date()) {
  const candidates = await db.select({ id: schema.games.id, state: schema.games.state, publishAt: schema.games.publishAt, sketch: schema.games.sketch, sketchVersion: schema.games.sketchVersion })
    .from(schema.games).where(and(eq(schema.games.state, "draft"), isNotNull(schema.games.publishAt), lte(schema.games.publishAt, now)));
  const published: string[] = [];
  for (const g of dueToPublish(candidates, now)) {
    if (!parseSketch(g.sketch, g.sketchVersion).ok) { console.error(`ai: scheduled game ${g.id} doesn't parse; left as a draft`); continue; }
    // only if it's still a scheduled draft (an admin may have changed it since)
    await db.update(schema.games).set({ state: "published", publishedAt: g.publishAt, publishAt: null, updatedAt: now })
      .where(and(eq(schema.games.id, g.id), eq(schema.games.state, "draft"), isNotNull(schema.games.publishAt)));
    published.push(g.id);
  }
  if (published.length) console.log(`ai: published ${published.join(", ")}`);
  return published;
}
