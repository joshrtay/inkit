// Addresses (docs/url-design.md): one lowercase, slash-free address per page; what moved still
// works (endpoints with 308, which keeps a POST); what only the site's pages call is under /api.
import { expect, test } from "@playwright/test";

test("one address per page", async ({ request }) => {
  for (const [asked, to] of [["/explore/", "/explore"], ["/Wyatt", "/wyatt"], ["/Explore/Akari/?level=1", "/explore/akari?level=1"]]) {
    const res = await request.get(asked, { maxRedirects: 0 });
    expect(res.status(), asked).toBe(301);
    expect(new URL(res.headers().location).pathname + new URL(res.headers().location).search).toBe(to);
  }
  expect((await request.get("/wyatt", { maxRedirects: 0 })).status()).toBe(200);
});

test("moved addresses still lead on", async ({ request }) => {
  const feed = await request.get("/feed?before=1-x", { maxRedirects: 0 });
  expect(feed.status()).toBe(308);
  expect(feed.headers().location).toMatch(/\/api\/feed\?before=1-x$/);
  const bugs = await request.post("/bugs", { maxRedirects: 0, form: { what: "x" } });
  expect(bugs.status()).toBe(308);
  expect(bugs.headers().location).toMatch(/\/api\/bugs$/);
  const make = await request.get("/new?in=wyatt", { maxRedirects: 0 });
  expect(make.status()).toBe(301);
  expect(make.headers().location).toMatch(/\/new\?studio=wyatt$/);
});

test("the site's own calls are under /api", async ({ request }) => {
  expect((await request.get("/api/sets")).status()).toBe(200);   // signed in (the run's account)
  expect((await request.get("/api/feed?before=1-x")).status()).toBe(200);
});
