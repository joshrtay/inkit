// What crawlers get (lib/seo.ts): the server-rendered HTML of a guide, with no JavaScript run, and
// the text routes for search engines and agents.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { q, RUN_FILE, sql, type Run } from "./db";

test.describe("as a crawler", () => {
  test.use({ storageState: { cookies: [], origins: [] } });   // signed out

  test("a guide's HTML has its canonical, JSON-LD, Markdown link and the whole guide", async ({ request }) => {
    const res = await request.get("/puzzles/akari");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("<title>Akari rules: how to play Akari puzzles · inkit</title>");
    expect(html).toContain('<link rel="canonical" href="https://inkit.games/puzzles/akari"/>');
    expect(html).toContain('<link rel="alternate" type="text/markdown" href="https://inkit.games/puzzles/akari.md"/>');
    expect(html).toContain('<meta property="og:title"');
    expect(html).not.toContain('name="robots"');
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
    expect(ld["@graph"].map((o: { "@type": string }) => o["@type"])).toEqual(["Article", "BreadcrumbList"]);
    // the rules, the pictures' captions and names, the example and the credit, all without JavaScript
    expect(html).toContain("A bulb lights its row and column, up to a black cell. Every white cell must be lit.");
    expect(html).toContain("<figcaption>All lit</figcaption>");
    expect(html).toContain("<title>Right: All lit</title>");
    expect(html).toContain("<title>Akari example, Lights On: solved</title>");
    expect(html).toMatch(/<h2 id="example">Example: (<!-- -->)?Lights On<\/h2>/);
    expect(html).toContain("Popularized by Nikoli (2001).");
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
  });

  test("robots.txt, sitemap.xml, llms.txt and a guide's Markdown", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("User-agent: ClaudeBot");
    expect(robots).toContain("Sitemap: https://inkit.games/sitemap.xml");
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.headers()["content-type"]).toContain("application/xml");
    const xml = await sitemap.text();
    expect(xml).toContain("<loc>https://inkit.games/puzzles/akari</loc>");
    expect(xml).toContain("<loc>https://inkit.games/g/akari-1</loc>");
    expect(await (await request.get("/llms.txt")).text()).toContain("(https://inkit.games/puzzles/akari.md)");
    const md = await request.get("/puzzles/akari.md");
    expect(md.headers()["content-type"]).toContain("text/markdown");
    expect(await md.text()).toMatch(/^# Akari\n/);
    expect((await request.get("/puzzles/nothing.md")).status()).toBe(404);
  });
});

test("a draft, seen by its author, and paint are kept out of search results", async ({ request }) => {
  const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
  const [draft] = sql<{ id: string }>(`select id from games where collection_id = ${q(run.collectionId)} and state = 'draft' limit 1`);
  const page = await (await request.get(`/g/${draft.id}`)).text();
  expect(page).toContain('<meta name="robots" content="noindex"/>');
  expect(page).not.toContain('rel="canonical"');
  expect(page).not.toContain("application/ld+json");
  expect(await (await request.get(`/g/${draft.id}/draw`)).text()).toContain('<meta name="robots" content="noindex"/>');
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain(`/g/${draft.id}<`);
});
