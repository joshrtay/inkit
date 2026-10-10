// The AI creators' backfill endpoint (POST /admin/ai/backfill, docs/ai-creators.md "Backfilling")
// against the local site: a backdated post goes in published at its slot (created, updated and
// published all then), sits in the past on the profile and in the sitemap, and sending it again
// does nothing; a person's handle, a time that isn't a slot, a future time or a repeated puzzle are
// refused, and without the token the endpoint isn't there.
import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { personaByHandle } from "~/ai/personas";
import { backfillSlots } from "~/ai/schedule";
import { sha256 } from "~/ai/request";
import { q, sql } from "./db";

const token = process.env.ADMIN_API_TOKEN ?? readFileSync(".dev.vars", "utf8").match(/^ADMIN_API_TOKEN=["']?([^"'\n]+)/m)?.[1];
const persona = personaByHandle("percival-hum")!;   // makes Skyscrapers, Tuesdays and Thursdays
const author = "ai-percival-hum";
// two of its slots from about ten months ago, well before anything else it has
const [first, second] = backfillSlots(persona, new Date(), 300);
const title = `Backfill test ${Date.now().toString(36)}`;

let sketch = "", creatorSince = 0, collectionSince = 0;
const post = async (over: Record<string, unknown> = {}) => ({
  persona: persona.handle, sketch, title, description: "Tested, and then forgotten.", publishedAt: first.at.toISOString(),
  proof: { solutions: 1, sketchHash: await sha256(sketch), solver: "the seeded example" }, ...over,
});
const send = (request: APIRequestContext, posts: unknown[], dryRun = false, auth = true) =>
  request.post("/admin/ai/backfill", { data: { posts, dryRun }, headers: auth ? { authorization: `Bearer ${token}` } : {} });
const mine = () => sql<{ id: string; state: string; published_at: number; created_at: number; updated_at: number; publish_at: number | null }>(
  `select id, state, published_at, created_at, updated_at, publish_at from games where author_id = ${q(author)} and published_at in (${first.at.getTime()}, ${second.at.getTime()})`);

test.describe("backfilling an AI creator's posts", () => {
  test.skip(!token, "needs ADMIN_API_TOKEN in app/.dev.vars");
  test.use({ storageState: { cookies: [], origins: [] } });   // signed out: only the token counts

  test.beforeAll(() => {
    // a puzzle the persona makes, proved unique: the seeded Skyscrapers example
    sketch = sql<{ sketch: string }>("select sketch from games where kind = 'skyscrapers' and state = 'published' and author_id not like 'ai-%' order by id limit 1")[0].sketch;
    sql(`delete from games where author_id = ${q(author)} and published_at in (${first.at.getTime()}, ${second.at.getTime()})`);
    creatorSince = sql<{ t: number }>(`select created_at t from creators where id = ${q(author)}`)[0]?.t ?? 0;
    collectionSince = sql<{ t: number }>(`select created_at t from collections where id = 'c-ai-percival-hum'`)[0]?.t ?? 0;
  });
  test.afterAll(() => {
    sql(`delete from games where author_id = ${q(author)} and published_at in (${first.at.getTime()}, ${second.at.getTime()})`);
    if (creatorSince) sql(`update creators set created_at = ${creatorSince} where id = ${q(author)}`);
    if (collectionSince) sql(`update collections set created_at = ${collectionSince} where id = 'c-ai-percival-hum'`);
  });

  test("isn't there without the token", async ({ request }) => {
    expect((await send(request, [await post()], false, false)).status()).toBe(404);
  });

  test("inserts a post published at its slot, once", async ({ request, page }) => {
    // a dry run says what it would do and writes nothing
    const dry = await send(request, [await post()], true);
    expect(await dry.json()).toMatchObject({ dryRun: true, wouldCreate: 1, created: 0 });
    expect(mine()).toHaveLength(0);

    const res = await send(request, [await post()]);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ created: 1, results: [{ key: `percival-hum@${first.at.toISOString()}`, status: "created" }] });
    const [game] = mine();
    expect(game).toMatchObject({ state: "published", published_at: first.at.getTime(), created_at: first.at.getTime(), updated_at: first.at.getTime(), publish_at: null });
    // the account dates from its first post at the latest
    expect(sql<{ t: number }>(`select created_at t from creators where id = ${q(author)}`)[0].t).toBeLessThanOrEqual(first.at.getTime());

    // sent again (a rerun): skipped, still one
    const again = await (await send(request, [await post({ title: "Another title" })])).json();
    expect(again).toMatchObject({ created: 0, exists: 1, results: [{ status: "exists", id: game.id }] });
    expect(mine()).toHaveLength(1);

    // the same puzzle at another slot is a repeat
    const repeat = await (await send(request, [await post({ publishedAt: second.at.toISOString() })])).json();
    expect(repeat).toMatchObject({ created: 0, repeat: 1, results: [{ status: "repeat", id: game.id }] });

    // in the past: the profile's oldest puzzle, and in the sitemap
    await page.goto(`/${persona.handle}`);
    await expect(page.locator("ul.cards > li").last()).toContainText(title);
    const map = await (await request.get("/sitemap.xml")).text();
    expect(map).toContain(`/g/${game.id}</loc>`);
    expect(map).toContain(`<lastmod>${first.at.toISOString().slice(0, 10)}`);
  });

  test("refuses a person's handle, a time that isn't a slot, and a time to come", async ({ request }) => {
    const bad = await (await send(request, [
      await post({ persona: "wyatt" }),
      await post({ publishedAt: new Date(first.at.getTime() + 60e3).toISOString() }),
      await post({ publishedAt: new Date(Date.now() + 86400e3).toISOString() }),
    ])).json();
    expect(bad).toMatchObject({ created: 0, invalid: 3 });
    expect(bad.results[0].error).toMatch(/isn't an AI creator/);
    expect(bad.results[1].error).toMatch(/posting times/);
    expect(bad.results[2].error).toMatch(/isn't in the past/);
    // a person's games are untouched: nothing of Wyatt's dated then
    expect(sql<{ n: number }>(`select count(*) n from games g join creators c on c.id = g.author_id where c.handle = 'wyatt' and g.published_at = ${first.at.getTime()}`)[0].n).toBe(0);
  });
});
