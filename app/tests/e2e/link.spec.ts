// Starting from a link on /new (lib/import-link.ts): a puzz.link link of a type we have opens in
// paint as a draft; one of a type we don't have says so and is noted (the admins' /admin/requests);
// one we can't read says that; a Penpa+ puzzle that could be several types asks which.
// LINK_SHOTS=<folder> also saves a picture of the row in each state.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { q, RUN_FILE, sql, type Run } from "./db";
import { drawn, penpaLink } from "../unit/penpa-link";

const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
const shot = async (page: Page, name: string) => {
  if (process.env.LINK_SHOTS) await page.locator(".new-link").screenshot({ path: `${process.env.LINK_SHOTS}/${name}.png` });
};
async function paste(page: Page, link: string) {
  await page.getByRole("textbox", { name: "Puzzle link" }).fill(link);
  await page.locator(".new-link").getByRole("button", { name: "Open" }).click();
}

test("a puzz.link Sudoku opens in paint as a draft", async ({ page }) => {
  await page.goto("/new");
  await expect(page.getByText("Or paste a link")).toBeVisible();
  await shot(page, "1-empty");
  await paste(page, "https://puzz.link/p?sudoku/4/4/g1k23k3g");
  await expect(page).toHaveURL(/\/g\/[^/]+\/draw$/);
  const id = /\/g\/([^/]+)\//.exec(page.url())![1];
  await expect(page.locator(".paint-type-name")).toHaveText("Sudoku");
  const [row] = sql<{ state: string; kind: string; author_id: string; drawing: string | null }>(`select state, kind, author_id, drawing from games where id = ${q(id)}`);
  expect(row).toMatchObject({ state: "draft", kind: "sudoku", author_id: run.userId });
  expect(row.drawing).not.toBeNull();
  // its four given digits are on the paper
  await expect(page.locator(".sp-board text").filter({ hasText: /^[1-4]$/ })).toHaveCount(4);
});

test("a Penpa+ puzzle of numbers alone asks which type; chosen, it opens in paint", async ({ page }) => {
  const nurikabe = JSON.parse(readFileSync("../src/games/nurikabe/1.json", "utf8"));
  const link = await penpaLink(drawn({ genre: "nurikabe", ...nurikabe.grid }));
  await page.goto("/new");
  await paste(page, link);
  await expect(page.locator(".new-link-note")).toHaveText("Which type is it?");
  await shot(page, "4-choose");
  await page.getByRole("combobox", { name: "Puzzle type" }).selectOption({ label: "Nurikabe" });
  await page.locator(".new-link").getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/g\/[^/]+\/draw$/);
  await expect(page.locator(".paint-type-name")).toHaveText("Nurikabe");
  const id = /\/g\/([^/]+)\//.exec(page.url())![1];
  expect(sql<{ kind: string }>(`select kind from games where id = ${q(id)}`)[0].kind).toBe("nurikabe");
});

test("a type we don't have is noted; a link we can't read says so", async ({ page }) => {
  sql(`delete from link_requests where creator_id = ${q(run.userId)}`);
  await page.goto("/new");
  await paste(page, "https://puzz.link/p?heyawake/6/6/aa0a0a00g0e0");
  await expect(page.locator(".new-link-note")).toHaveText("We don't have Heyawake yet. We've noted the request.");
  await expect(page).toHaveURL(/\/new$/);
  await shot(page, "2-unsupported");
  const notes = sql<{ source: string; genre_id: string; genre_name: string; link: string }>(`select source, genre_id, genre_name, link from link_requests where creator_id = ${q(run.userId)}`);
  expect(notes).toEqual([{ source: "puzzlink", genre_id: "heyawake", genre_name: "Heyawake", link: "https://puzz.link/p?heyawake/6/6/aa0a0a00g0e0" }]);

  await paste(page, "https://example.com/not-a-puzzle");
  await expect(page.locator(".new-link-note.error")).toHaveText("That link didn't open. Check it's a puzz.link or Penpa+ link.");
  await shot(page, "3-unreadable");
  expect(sql(`select id from link_requests where creator_id = ${q(run.userId)}`)).toHaveLength(1);

  // the admins see the requests by type
  sql(`update creators set is_admin = 1 where id = ${q(run.userId)}`);
  try {
    await page.goto("/admin/requests");
    await expect(page.locator('tr[data-genre="heyawake"]')).toContainText("Heyawake");
  } finally {
    sql(`update creators set is_admin = 0 where id = ${q(run.userId)}`);
  }
  // and nobody else
  expect((await page.request.get("/admin/requests")).status()).toBe(404);
});
