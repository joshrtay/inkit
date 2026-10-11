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

test("Create → Set makes an empty one and opens it", async ({ page }) => {
  await page.goto("/explore");
  await page.locator(".sidenav").getByRole("button", { name: "Create" }).click();
  await page.getByRole("menuitem", { name: /^Set/ }).click();
  const name = page.getByRole("dialog", { name: "New set" });
  await name.getByLabel("Name").fill("Empty for now");
  await name.getByRole("button", { name: "Make set" }).click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page)).toContainText("0 puzzles");
  await expect(drawer(page).getByRole("button", { name: "Publish" })).toBeDisabled();
  expect(mine().map((s) => s.title)).toEqual(["Empty for now"]);
  // its page offers Edit, which opens it again after closing
  await drawer(page).getByRole("button", { name: "Close the set" }).click();
  await expect(drawer(page)).toHaveCount(0);
  await page.goto(`/s/${mine()[0].id}`);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.goto("/explore");
  await expect(drawer(page)).toBeVisible();
});
