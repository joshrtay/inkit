// Making a set (components/SetDrawer.tsx, routes/sets.ts, routes/set-edit.ts): ⋯ → Add to set on a
// puzzle makes a set and opens the drawer; while it's open every card has a + and a puzzle's page
// offers itself in the drawer; the drawer names the set, puts it in order and publishes it, after
// which it's on its page and out of the drawer. Create → Set makes one from the nav.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { q, RUN_FILE, sql, type Run } from "./db";

const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
const mine = () => sql<{ id: string; title: string; state: string }>(`select id, title, state from sets where author_id = ${q(run.userId)} order by created_at`);
const items = (id: string) => sql<{ game_id: string }>(`select game_id from set_items where set_id = ${q(id)} order by position`).map((r) => r.game_id);
const drawer = (page: Page) => page.getByRole("complementary", { name: "Set" });

test.beforeEach(() => { sql(`delete from set_items where set_id in (select id from sets where author_id = ${q(run.userId)}); delete from sets where author_id = ${q(run.userId)}`); });
test.afterAll(() => { sql(`delete from set_items where set_id in (select id from sets where author_id = ${q(run.userId)}); delete from sets where author_id = ${q(run.userId)}`); });

test("make a set while browsing, put it in order and publish it", async ({ page }) => {
  // ⋯ → Add to set → New set
  await page.goto("/g/akari-1");
  await page.getByRole("button", { name: "More for this puzzle" }).click();
  await page.getByRole("menuitem", { name: "Add to set" }).click();
  await page.getByRole("dialog", { name: "Add to set" }).getByRole("button", { name: "+ New set" }).click();
  const name = page.getByRole("dialog", { name: "New set" });
  await name.getByLabel("Name").fill("Lamps first");
  await name.getByRole("button", { name: "Make set" }).click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByLabel("Name")).toHaveValue("Lamps first");
  await expect(drawer(page)).toContainText("1 puzzle");
  await expect(drawer(page).locator("li.here")).toContainText("This puzzle");
  const [set] = mine();
  expect(set).toMatchObject({ title: "Lamps first", state: "draft" });
  expect(items(set.id)).toEqual(["akari-1"]);

  // Explore: a + on every card; one tap adds, then it's ticked
  await page.goto("/explore/sudoku");
  const card = page.locator(".x-cards > li").first();
  const add = card.locator(".card-add");
  await expect(add).toHaveText("+");
  await add.click();
  await expect(card.locator(".card-add.in")).toHaveText("✓");
  await expect(drawer(page)).toContainText("2 puzzles");

  // a puzzle's own page: the drawer offers it
  await page.goto("/g/nurikabe-1");
  await drawer(page).getByRole("button", { name: /^\+ Add / }).click();
  await expect(drawer(page)).toContainText("3 puzzles");
  expect(items(set.id)[0]).toBe("akari-1");
  expect(items(set.id)[2]).toBe("nurikabe-1");

  // order: the last one up to second
  await drawer(page).getByRole("button", { name: /Move .* up/ }).last().click();
  await expect.poll(() => items(set.id)[1]).toBe("nurikabe-1");

  // a name, then publish (asked first)
  await drawer(page).getByLabel("Name").fill("Three to start");
  await drawer(page).getByLabel("Name").press("Enter");
  await expect.poll(() => mine()[0].title).toBe("Three to start");
  await drawer(page).getByRole("button", { name: "Publish" }).click();
  await page.getByRole("alertdialog", { name: "Publish “Three to start”?" }).getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status")).toContainText("Published · Three to start");
  await expect(drawer(page)).toHaveCount(0);
  expect(mine()[0].state).toBe("published");
  await page.getByRole("status").getByRole("link", { name: "View" }).click();
  await expect(page.getByRole("heading", { name: "Three to start" })).toBeVisible();
  await expect(page.locator(".set-list li")).toHaveCount(3);
  // no + on cards once nothing's open
  await page.goto("/explore/sudoku");
  await expect(page.locator(".card-add")).toHaveCount(0);
});

test("Create → Set makes an empty one and opens it, even from a page that isn't for browsing", async ({ page }) => {
  await page.goto("/puzzles");
  await page.locator(".sidenav").getByRole("button", { name: "Create" }).click();
  await page.getByRole("menuitem", { name: /^Set/ }).click();
  const name = page.getByRole("dialog", { name: "New set" });
  // a name is one line: Enter makes it
  await expect(name.locator("input[type=text]")).toBeVisible();
  await expect(name.locator("textarea")).toHaveCount(0);
  await name.getByLabel("Name").fill("Empty for now");
  await name.getByLabel("Name").press("Enter");
  // an empty set: off to find puzzles for it, your own first
  await expect(page).toHaveURL(new RegExp(`/explore/all\\?by=`));
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page)).toContainText("0 puzzles");
  await expect(drawer(page).getByRole("button", { name: "Publish" })).toBeDisabled();
  expect(mine().map((s) => s.title)).toEqual(["Empty for now"]);

  // Explore's shelves: each card has its own +, on the card
  await page.goto("/explore");
  const cards = page.locator(".row > li:has(.card-add)");
  await expect(cards.first()).toBeVisible();   // once the tab's open set has loaded
  expect(await cards.count()).toBeGreaterThan(3);
  for (let i = 0; i < 4; i++) {
    const li = await cards.nth(i).boundingBox(), plus = await cards.nth(i).locator(".card-add").boundingBox();
    expect(plus!.x).toBeGreaterThan(li!.x);
    expect(plus!.x + plus!.width).toBeLessThanOrEqual(li!.x + li!.width + 1);
    expect(plus!.y).toBeGreaterThanOrEqual(li!.y);
  }

  // its own page is where it's edited; Add puzzles goes back to your puzzles with the drawer open
  await drawer(page).getByRole("button", { name: "Close the set" }).click();
  await expect(drawer(page)).toHaveCount(0);
  await page.goto(`/s/${mine()[0].id}`);
  await expect(drawer(page)).toHaveCount(0);
  await page.getByLabel("Name").fill("Renamed here");
  await page.getByLabel("Name").press("Enter");
  await expect.poll(() => mine()[0].title).toBe("Renamed here");
  await page.getByRole("button", { name: "Add puzzles" }).click();
  await expect(page).toHaveURL(new RegExp(`/explore/all\\?by=`));
  await expect(drawer(page)).toBeVisible();
  await expect(page.getByRole("link", { name: /Show everyone's/ })).toContainText("By you");
});

test("each card's ⋮: Add to set and Copy link (signed out: sign in first); with a set open it's a +", async ({ page, browser }) => {
  await page.goto("/explore/sudoku");
  const card = page.locator(".x-cards > li").first();
  const more = card.getByRole("button", { name: /^More for / });
  await more.click();
  await expect(page.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Add to set" }).click();
  await page.getByRole("dialog", { name: "Add to set" }).getByRole("button", { name: "+ New set" }).click();
  await page.getByRole("dialog", { name: "New set" }).getByLabel("Name").fill("From a card");
  await page.getByRole("dialog", { name: "New set" }).getByLabel("Name").press("Enter");
  await expect(drawer(page)).toContainText("1 puzzle");
  // the set's open: the corner is a ✓ on that card, a + on the others
  await expect(card.locator(".card-add.in")).toHaveText("✓");
  await expect(page.locator(".x-cards > li").nth(1).locator(".card-add")).toHaveText("+");
  await expect(more).toHaveCount(0);

  const anon = await browser.newPage({ storageState: { cookies: [], origins: [] } });
  await anon.goto("/explore/sudoku");
  await anon.locator(".x-cards > li").first().getByRole("button", { name: /^More for / }).click();
  await anon.getByRole("menuitem", { name: "Add to set" }).click();
  await expect(anon.getByRole("dialog", { name: "Sign in to make sets" })).toBeVisible();
  await anon.close();
});

test("a draft set's page is its editor: order, take out, publish", async ({ page }) => {
  const id = `draft-${process.env.E2E_RUN}`;
  sql(`insert into sets (id, collection_id, author_id, title) values (${q(id)}, ${q(run.collectionId)}, ${q(run.userId)}, 'Three, to sort');
    insert into set_items (set_id, game_id, position) values (${q(id)}, 'akari-1', 0), (${q(id)}, 'nurikabe-1', 1), (${q(id)}, 'sudoku-1', 2)`);
  await page.goto(`/s/${id}`);
  await page.getByRole("button", { name: /^Move .* down$/ }).first().click();
  await expect.poll(() => items(id)).toEqual(["nurikabe-1", "akari-1", "sudoku-1"]);
  await page.getByRole("button", { name: /^Take .* out$/ }).last().click();
  await expect.poll(() => items(id)).toEqual(["nurikabe-1", "akari-1"]);
  await expect(page.locator(".set-list li")).toHaveCount(2);
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("alertdialog", { name: "Publish “Three, to sort”?" }).getByRole("button", { name: "Publish" }).click();
  await expect(page.locator(".set-meta")).toContainText("Published");
  expect(sql<{ state: string }>(`select state from sets where id = ${q(id)}`)[0].state).toBe("published");
  // published: no more editing here
  await expect(page.getByRole("button", { name: /^Move / })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Three, to sort" })).toBeVisible();
});
