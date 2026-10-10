// The Subscriptions feed scrolls on: a page at a time, the next one loading at the end, with no
// game twice (games published at the same moment included) and none left out.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { q, RUN_FILE, sql, type Run } from "./db";

const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
const N = 30;   // more than a page (lib/feed.server.ts: 24)

test("the feed loads more as you scroll", async ({ page }) => {
  // a collection of its own (other tests publish to the run's), subscribed to
  const coll = `feed-${run.handle}`;
  const ccols = sql<{ name: string }>(`select name from pragma_table_info('collections')`).map((c) => c.name);
  sql(`insert into collections (${ccols.join(", ")}) select ${ccols.map((c) => c === "id" || c === "slug" ? q(coll) : c === "personal_of" ? "null" : c).join(", ")} from collections where id = ${q(run.collectionId)}`);
  const cols = sql<{ name: string }>(`select name from pragma_table_info('games')`).map((c) => c.name);
  const copy = (id: string, at: number) => cols.map((c) => c === "id" ? q(id) : c === "collection_id" ? q(coll) : c === "state" ? "'published'" : c === "published_at" ? String(at) : c === "title" ? q(`Feed ${id}`) : c).join(", ");
  const ids = Array.from({ length: N }, (_, i) => `${coll}-${String(i).padStart(2, "0")}`);
  // a minute apart, pairs at the same moment so a page can end in the middle of a tie
  const base = Date.now() - 86_400_000;
  sql(ids.map((id, i) => `insert into games (${cols.join(", ")}) select ${copy(id, base - Math.floor(i / 2) * 60_000)} from games where id = ${q(run.drafts.sudoku)}`).join("; "));
  sql(`insert or ignore into subscriptions (subscriber_id, collection_id, created_at) values (${q(run.userId)}, ${q(coll)}, ${Date.now()})`);
  try {
    await page.goto("/");
    const items = page.locator(".feed .feed-item");
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBe(24);
    await page.locator(".feed-more").scrollIntoViewIfNeeded();
    await expect(items).toHaveCount(N, { timeout: 10_000 });
    const links = await items.locator("a.feed-link").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(new Set(links).size).toBe(N);
    // newest first; at the same moment, the later id first
    const order = ids.map((id, i) => ({ id, at: Math.floor(i / 2) })).sort((a, b) => a.at - b.at || (a.id < b.id ? 1 : -1));
    expect(links).toEqual(order.map((g) => `/g/${g.id}`));
    await expect(page.locator(".feed-more")).toHaveCount(0);
  } finally {
    sql(`delete from subscriptions where collection_id = ${q(coll)}; delete from games where collection_id = ${q(coll)}; delete from collections where id = ${q(coll)}`);
  }
});
