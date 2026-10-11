// Sets (lib/sets.server.ts, routes/set.tsx): a set's page lists its puzzles in order with their
// makers; Play opens the first one not solved, carrying the set; the bar under the board names the
// set, shows how far through it the player is, steps through it, and once the last one is solved
// offers the way back. A profile shows its sets in its grid; a draft only in its author's Drafts.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { q, RUN_FILE, sql, type Run } from "./db";

const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
const SET = `e2e-set-${process.env.E2E_RUN}`, DRAFT = `e2e-draft-${process.env.E2E_RUN}`;
const ORDER = ["akari-1", "nurikabe-1", "sudoku-1"];   // seed puzzles; the last one's answer is known
const SOLUTION = [[1, 4, 2, 3], [3, 2, 1, 4], [2, 3, 4, 1], [4, 1, 3, 2]];

async function solveSudoku(page: Page) {
  const frame = await page.locator(".sheet svg.board .frame").boundingBox();
  if (!frame) throw new Error("no board");
  const s = frame.width / 4;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    await page.mouse.click(frame.x + (c + 0.5) * s, frame.y + (r + 0.5) * s);
    await page.keyboard.press(String(SOLUTION[r][c]));
  }
}

test.beforeAll(() => {
  sql(`insert into sets (id, collection_id, author_id, title, description, state, published_at) values
      (${q(SET)}, ${q(run.collectionId)}, ${q(run.userId)}, 'Three to start', 'One of each.', 'published', ${Date.now()}),
      (${q(DRAFT)}, ${q(run.collectionId)}, ${q(run.userId)}, 'Not ready', '', 'draft', null);
    insert into set_items (set_id, game_id, position) values ${ORDER.map((g, i) => `(${q(SET)}, ${q(g)}, ${i})`).join(", ")}, (${q(DRAFT)}, 'akari-1', 0);
    delete from solves where creator_id = ${q(run.userId)} and game_id in (${ORDER.map(q).join(", ")})`);
});
test.afterAll(() => {
  sql(`delete from set_items where set_id in (${q(SET)}, ${q(DRAFT)}); delete from sets where id in (${q(SET)}, ${q(DRAFT)});
    delete from solves where creator_id = ${q(run.userId)} and game_id in (${ORDER.map(q).join(", ")})`);
});

test("a set's page, and playing through it", async ({ page }) => {
  await page.goto(`/s/${SET}`);
  await expect(page.getByRole("heading", { name: "Three to start" })).toBeVisible();
  const rows = page.locator(".set-list li");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText("Nurikabe");
  await expect(page.locator(".set-progress")).toContainText("0 of 3 solved");
  await expect(page.getByRole("link", { name: "Play", exact: true })).toHaveAttribute("href", `/g/akari-1?set=${SET}`);

  // the last one: Prev goes back, and solving it offers the way back to the set
  await page.goto(`/g/sudoku-1?set=${SET}`);
  const bar = page.getByRole("navigation", { name: "This list" });
  await expect(bar).toContainText("Three to start");
  await expect(bar).toContainText("0 of 3 solved");
  await expect(bar.getByRole("link", { name: "Previous puzzle" })).toHaveAttribute("href", `/g/nurikabe-1?set=${SET}`);
  await expect(bar.getByRole("link", { name: "Next puzzle" })).toHaveCount(0);
  await solveSudoku(page);
  await expect(bar.getByRole("link", { name: "Back to the set" })).toHaveAttribute("href", `/s/${SET}`);

  // back on its page: one solved, and Play opens the first one not solved
  await expect.poll(() => sql(`select 1 from solves where creator_id = ${q(run.userId)} and game_id = 'sudoku-1'`).length, { timeout: 10_000 }).toBe(1);
  await page.goto(`/s/${SET}`);
  await expect(page.locator(".set-progress")).toContainText("1 of 3 solved");
  await expect(rows.nth(2)).toHaveClass(/solved/);
});

test("a profile shows its sets; a draft only in its author's Drafts", async ({ page, browser }) => {
  const slug = sql<{ slug: string }>(`select slug from collections where id = ${q(run.collectionId)}`)[0].slug;
  await page.goto(`/${slug}`);
  await expect(page.locator(`a.set-card[href="/s/${SET}"]`)).toContainText("Set · 3 puzzles");
  await expect(page.locator(`a[href="/s/${DRAFT}"]`)).toHaveCount(0);
  await page.goto(`/${slug}?tab=drafts`);
  await expect(page.locator(`a.set-card[href="/s/${DRAFT}"]`)).toBeVisible();
  await page.goto(`/s/${DRAFT}`);
  await expect(page.getByRole("button", { name: "Add puzzles" })).toBeVisible();   // its page is its editor

  // someone else: the published set, not the draft
  const other = await browser.newPage({ storageState: { cookies: [], origins: [] } });
  expect((await other.goto(`/s/${SET}`))?.status()).toBe(200);
  await expect(other.getByRole("button", { name: "Add puzzles" })).toHaveCount(0);
  await expect(other.locator(".set-progress")).toHaveCount(0);
  expect((await other.goto(`/s/${DRAFT}`))?.status()).toBe(404);
  await other.close();
});

test("a published set is found: Explore's search, the feed of its subscribers, the sitemap", async ({ page }) => {
  await page.goto("/explore?q=three%20to%20start");
  await expect(page.getByRole("region", { name: "Sets" }).locator(`a[href="/s/${SET}"]`)).toBeVisible();
  sql(`insert or ignore into subscriptions (subscriber_id, collection_id, created_at) values (${q(run.userId)}, ${q(run.collectionId)}, ${Date.now()})`);
  try {
    await page.goto("/");
    await expect(page.locator(`.set-feed-item a[href="/s/${SET}"]`)).toContainText("Three to start");
  } finally {
    sql(`delete from subscriptions where subscriber_id = ${q(run.userId)} and collection_id = ${q(run.collectionId)}`);
  }
  const map = await (await page.request.get("/sitemap.xml")).text();
  expect(map).toContain(`/s/${SET}<`);
  expect(map).not.toContain(`/s/${DRAFT}<`);
});

test("its author deletes a published set: off the profile, its link gone; the puzzles stay", async ({ page }) => {
  const id = `${SET}-del`;
  sql(`insert into sets (id, collection_id, author_id, title, state, published_at) values (${q(id)}, ${q(run.collectionId)}, ${q(run.userId)}, 'Short-lived', 'published', ${Date.now()});
    insert into set_items (set_id, game_id, position) values (${q(id)}, 'akari-1', 0)`);
  try {
    await page.goto(`/s/${id}`);
    await page.getByRole("button", { name: "More for this set" }).click();
    await page.getByRole("menuitem", { name: "Delete…" }).click();
    await page.getByRole("alertdialog", { name: "Delete “Short-lived”?" }).getByRole("button", { name: "Delete" }).click();
    await expect(page).not.toHaveURL(/\/s\//, { timeout: 15_000 });
    expect(sql<{ state: string }>(`select state from sets where id = ${q(id)}`)[0].state).toBe("deleted");
    expect((await page.goto(`/s/${id}`))?.status()).toBe(410);
    expect((await page.goto("/g/akari-1"))?.status()).toBe(200);
  } finally {
    sql(`delete from set_items where set_id = ${q(id)}; delete from sets where id = ${q(id)}`);
  }
});
