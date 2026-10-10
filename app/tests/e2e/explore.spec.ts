// Explore (docs/explore-mockups/): the shelves, empty accounts left out, search, a type's page and
// its difficulty filter, a profile's Recommends tab, and managing your recommendations in Settings.
// AI creators have no puzzles in a fresh seed, so a few are lent some of the seeded examples here.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { q, RUN_FILE, sql, type Run } from "./db";

const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
const stamp = Date.now().toString(36);
const lent = ["isola", "pebble", "lumen"].map((h, i) => ({ handle: h, id: `e2e-explore-${stamp}-${i}` }));

test.beforeAll(() => {
  // a published puzzle for each, an hour ago (copied from a seeded example of a small type)
  for (const [i, l] of lent.entries()) {
    sql(`insert into games (id, collection_id, author_id, title, description, sketch, sketch_version, kind, state, published_at, difficulty, level, minutes)
      select ${q(l.id)}, ${q(`c-ai-${l.handle}`)}, ${q(`ai-${l.handle}`)}, ${q(`Explore test ${i}`)}, '', sketch, sketch_version, kind, 'published', ${Date.now() - (i + 1) * 3600e3}, 0.2, 1, 2
      from games where id = 'sudoku-1'`);
  }
});
test.afterAll(() => {
  sql(`delete from games where id in (${lent.map((l) => q(l.id)).join(", ")}); delete from recommendations where recommender_id = ${q(run.userId)}`);
});

test("the shelves, in order, with calm cards and no stray text", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.locator("main h2")).toContainText(["Today", "Quick ones", "Start here", "Browse by type", "This week’s hard ones", "Creators", "Made by AI creators", /recommends$/]);
  // a card: three difficulty dots, a rough time
  const card = page.locator("#today .pcard").first();
  await expect(card.locator(".diff i")).toHaveCount(3);
  await expect(card.locator(".mins")).toHaveText(/^~\d+ min$/);
  // the lent puzzles are new, so they're on Today
  await expect(page.locator("#today")).toContainText("Explore test 0");
  // Browse by type opens a type's page
  await page.locator("#types .type-tile").first().click();
  await expect(page).toHaveURL(/\/explore\/[a-z-]+$/, { timeout: 20_000 });
  await page.goBack();
  // creator cards: no "0" after a name, no " / " from a verse bio
  for (const name of await page.locator(".ccard-id strong").allTextContents()) expect(name).not.toMatch(/0$/);
  for (const bio of await page.locator(".ccard-bio").allTextContents()) expect(bio).not.toContain(" / ");
  // the AI creators have a shelf of their own, and people aren't on it
  await expect(page.locator("#ai .ccard").first().locator(".ai-badge")).toBeVisible();
  await expect(page.locator("#creators .ai-badge")).toHaveCount(0);
  // someone's recommendations
  await expect(page.locator("#recommends .rec").first()).toBeVisible();
});

test("empty accounts aren't on Explore, and no one appears twice", async ({ page }) => {
  // an account with nothing published, and one person with two accounts (both with a puzzle)
  const who = [{ id: `e2e-empty-${stamp}`, name: `Empty ${stamp}`, games: 0 }, { id: `e2e-twin1-${stamp}`, name: `Twin ${stamp}`, games: 1 }, { id: `e2e-twin2-${stamp}`, name: `twin ${stamp}`, games: 1 }];
  for (const w of who) {
    sql(`insert into creators (id, name, email, handle) values (${q(w.id)}, ${q(w.name)}, ${q(`${w.id}@example.test`)}, ${q(w.id)});
      insert into collections (id, slug, title, personal_of) values (${q(`c-${w.id}`)}, ${q(w.id)}, ${q(w.name)}, ${q(w.id)})`);
    if (w.games) sql(`insert into games (id, collection_id, author_id, title, sketch, sketch_version, kind, state, published_at)
      select ${q(`g-${w.id}`)}, ${q(`c-${w.id}`)}, ${q(w.id)}, 'Twin test', sketch, sketch_version, kind, 'published', ${Date.now() - 86400e3} from games where id = 'sudoku-1'`);
  }
  try {
    await page.goto(`/explore?q=${stamp}`);
    await expect(page.locator(".collection-row")).toHaveCount(1);
    await expect(page.locator(".collection-row")).toContainText(/twin/i);
    await page.goto("/explore");
    const handles = await page.locator(".ccard-meta").allTextContents();
    expect(handles.some((h) => h.startsWith(`@e2e-empty-${stamp} `))).toBe(false);
    expect(handles.filter((h) => h.includes(`e2e-twin`) && h.includes(stamp)).length).toBeLessThanOrEqual(1);
    const names = await page.locator(".ccard-id strong").allTextContents();
    expect(new Set(names).size).toBe(names.length);
  } finally {
    for (const w of who) sql(`delete from games where author_id = ${q(w.id)}; delete from collections where id = ${q(`c-${w.id}`)}; delete from creators where id = ${q(w.id)}`);
  }
});

test("search: types, creators and puzzles, grouped", async ({ page }) => {
  await page.goto("/explore");
  await page.getByRole("searchbox", { name: "Search puzzles, types and creators" }).fill("sudoku");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/explore\?q=sudoku$/);
  await expect(page.getByRole("heading", { name: "Types" })).toBeVisible();
  await expect(page.locator(".type-tile", { hasText: /^Sudoku/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Puzzles" })).toBeVisible();
  await expect(page.locator(".pcard .kind").first()).toHaveText(/sudoku/i);
  // a search is kept out of search engines
  expect(await (await page.request.get("/explore?q=sudoku")).text()).toContain('<meta name="robots" content="noindex"/>');
  await page.goto("/explore?q=isola");
  const row = page.locator(".collection-row", { hasText: "Isola" });
  await expect(row.locator(".avatar-ai svg")).toBeVisible();
  await expect(row.locator(".ai-badge")).toBeVisible();
  await page.goto("/explore?q=zzqqxx");
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
});

test("a type's page: New and Top, and the difficulty filter", async ({ page }) => {
  await page.goto("/explore/sudoku");
  await expect(page.getByRole("heading", { level: 1, name: "Sudoku" })).toBeVisible();
  await expect(page.getByRole("link", { name: "How to play" })).toHaveAttribute("href", "/puzzles/sudoku");
  const all = await page.locator(".x-cards .pcard").count();
  expect(all).toBeGreaterThan(0);
  await page.getByRole("navigation", { name: "Difficulty" }).getByRole("link", { name: "Easy" }).click();
  await expect(page).toHaveURL(/level=1/);
  const easy = page.locator(".x-cards .pcard");
  await expect(easy.first()).toBeVisible();
  for (const dots of await easy.locator(".diff").all()) await expect(dots.locator("i.on")).toHaveCount(1);
  await page.getByRole("navigation", { name: "Difficulty" }).getByRole("link", { name: "Hard" }).click();
  await expect(page).toHaveURL(/level=3/);
  for (const dots of await page.locator(".x-cards .pcard .diff").all()) await expect(dots.locator("i.on")).toHaveCount(3);
  await page.getByRole("navigation", { name: "Sort" }).getByRole("link", { name: "Top" }).click();
  await expect(page).toHaveURL(/sort=top/);
  await expect(page.getByRole("navigation", { name: "Over" })).toBeVisible();
  // the quick chips' page: every type's
  await page.goto("/explore/all?quick=1");
  for (const m of await page.locator(".x-cards .mins").allTextContents()) expect(Number(m.match(/\d+/)![0])).toBeLessThanOrEqual(5);
  expect((await page.request.get("/explore/nothing")).status()).toBe(404);
});

test("a profile's Recommends tab", async ({ page }) => {
  await page.goto("/isola?tab=recommends");
  await expect(page.locator(".tabs a[aria-current=page]")).toHaveText(/^Recommends/);
  const first = page.locator(".rec-list li").first();
  await expect(first).toContainText("@");
  await expect(first.locator("p")).not.toBeEmpty();
  await expect(page.locator(".rec-list li .ai-badge").first()).toBeVisible();
  // a person who recommends no one has no such tab
  await page.goto("/wyatt");
  await expect(page.locator(".tabs")).not.toContainText("Recommends");
});

test("managing your recommendations in Settings", async ({ page }) => {
  await page.goto("/settings#recommendations");
  const box = page.locator(".recs-settings");
  const add = async (handle: string, note = "") => {
    await box.getByLabel("Recommend a creator").fill(handle);
    await box.getByLabel("Why", { exact: true }).fill(note);
    await box.getByRole("button", { name: "Add" }).click();
  };
  await add(run.handle);
  await expect(box.getByRole("alert")).toHaveText("You can't recommend yourself.");
  await add("nobody-has-this-handle");
  await expect(box.getByRole("alert")).toHaveText("There's no one with that handle.");
  await add("@isola", "Doors and lines.");
  await expect(box.locator(".rec-edit")).toHaveCount(1);
  await add("pebble");
  await expect(box.locator(".rec-edit")).toHaveCount(2);
  await add("pebble");
  await expect(box.getByRole("alert")).toHaveText("You recommend them already.");
  // the order, and a note changed
  await box.getByRole("button", { name: "Move Pebble up" }).click();
  await expect(box.locator(".rec-edit-who strong")).toHaveText(["Pebble", "Isola"]);
  await box.getByLabel("Why you recommend Pebble").fill("Small and kind.");
  await box.locator(".rec-edit", { hasText: "Pebble" }).getByRole("button", { name: "Save" }).click();
  await expect(box.getByLabel("Why you recommend Pebble")).toHaveValue("Small and kind.");
  expect(sql<{ h: string; note: string }>(`select c.handle h, r.note from recommendations r join creators c on c.id = r.recommended_id where r.recommender_id = ${q(run.userId)} order by r.position`))
    .toEqual([{ h: "pebble", note: "Small and kind." }, { h: "isola", note: "Doors and lines." }]);
  // on the profile
  await page.goto(`/${run.handle}?tab=recommends`);
  await expect(page.locator(".rec-list li")).toHaveCount(2);
  await expect(page.locator(".rec-list li").first()).toContainText("Small and kind.");
  // removed
  await page.goto("/settings#recommendations");
  for (const name of ["Pebble", "Isola"]) await box.locator(".rec-edit", { hasText: name }).getByRole("button", { name: "Remove" }).click();
  await expect(box.locator(".rec-edit")).toHaveCount(0);
});
