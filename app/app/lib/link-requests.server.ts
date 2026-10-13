// Puzzle types creators asked for by pasting a link on /new (games.server.ts's createFromLink): each
// request noted, and the counts by type for the admins (/admin/requests).
import { count, desc, max } from "drizzle-orm";
import { schema, type Db } from "../db";
import type { LinkResult } from "./import-link";

export async function noteLinkRequest(db: Db, creatorId: string, link: string, r: Extract<LinkResult, { kind: "unsupported" }>) {
  await db.insert(schema.linkRequests).values({
    id: crypto.randomUUID(), creatorId, source: r.source, genreId: r.genreId, genreName: r.genreName, variant: r.variant ?? null, link,
  });
}

/** Requests by type (and variant), most asked for first. */
export async function linkRequestCounts(db: Db) {
  const t = schema.linkRequests;
  return db.select({ source: t.source, genreId: t.genreId, genreName: t.genreName, variant: t.variant, requests: count(), latest: max(t.createdAt) })
    .from(t).groupBy(t.source, t.genreId, t.genreName, t.variant).orderBy(desc(count()), t.genreName);
}
