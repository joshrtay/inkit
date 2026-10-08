// The data behind sitemap.xml, and the text responses for robots.txt, llms.txt and the guides'
// Markdown (built by lib/seo.ts).
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { schema, type Db } from "../db";
import { exampleGameId, guideDoc, ORDER } from "./guides.server";
import { guideMarkdown, guidePath, SITEMAP_MAX, type SitemapEntry } from "./seo";
import type { GenreName } from "~site/engine/puzzle.ts";

/** Plain text, cached at the edge for an hour. */
export const textResponse = (body: string, type: string) =>
  new Response(body, { headers: { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "all" } });

/** When the guides last changed: the build (they're in the code), so the deploy's day will do. */
const GUIDES_CHANGED = Date.parse("2026-10-08");

/** Every public address: the site's pages, each guide, published games (in collections still
 *  online) and the profiles that have any. Drafts and hidden games never appear. */
export async function sitemapEntries(db: Db): Promise<SitemapEntry[]> {
  const live = and(eq(schema.games.state, "published"), isNull(schema.collections.deletedAt));
  const [games, profiles] = await Promise.all([
    db.select({ id: schema.games.id, updated: schema.games.updatedAt, published: schema.games.publishedAt })
      .from(schema.games).innerJoin(schema.collections, eq(schema.games.collectionId, schema.collections.id))
      .where(live).orderBy(desc(schema.games.publishedAt)).limit(SITEMAP_MAX - 1000),
    db.select({ slug: schema.collections.slug, last: sql<number>`max(coalesce(${schema.games.updatedAt}, ${schema.games.publishedAt}))` })
      .from(schema.collections).innerJoin(schema.games, eq(schema.games.collectionId, schema.collections.id))
      .leftJoin(schema.creators, eq(schema.collections.personalOf, schema.creators.id))
      .where(and(live, isNull(schema.creators.deletedAt)))
      .groupBy(schema.collections.slug).limit(900),
  ]);
  const newest = games[0]?.updated?.getTime() ?? null;
  return [
    { path: "/", lastmod: newest },
    { path: "/explore", lastmod: newest },
    { path: "/puzzles", lastmod: GUIDES_CHANGED },
    ...ORDER.map((k) => ({ path: guidePath(k), lastmod: GUIDES_CHANGED })),
    ...profiles.map((p) => ({ path: `/${p.slug}`, lastmod: Number(p.last) || null })),
    ...games.map((g) => ({ path: `/g/${g.id}`, lastmod: (g.updated ?? g.published)?.getTime() ?? null })),
  ];
}

/** Which guides' worked examples are published games here, to link them. */
export async function playableExamples(db: Db): Promise<Map<GenreName, string>> {
  const ids = ORDER.map(exampleGameId);
  const rows = await db.select({ id: schema.games.id }).from(schema.games)
    .where(and(eq(schema.games.state, "published"), sql`${schema.games.id} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`));
  const found = new Set(rows.map((r) => r.id));
  return new Map(ORDER.filter((k) => found.has(exampleGameId(k))).map((k) => [k, `/g/${exampleGameId(k)}`]));
}

export const guideMarkdownOf = (kind: GenreName, playUrl: string | null) => guideMarkdown(guideDoc(kind), playUrl);
