// A published puzzle edited in paint (docs/creation-flow.md §1.11): Edit opens paint with the puzzle
// drawn in ink; the drawing saves as its next version while players keep the live one; Update (the
// publish page in update mode) puts it live, keeping its solves and likes. Then its … menu, and the
// old editor's address.
import { expect, test } from "@playwright/test";
import { q, sql } from "./db";
import { cell, draftOf, exampleSpec, gridOf, has, openPaint, row, run, savedSpec, tap, tool, verdict } from "./paint-helpers";

test("a published Sudoku: edited in paint, live only once updated, its solves and likes kept", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = draftOf("sudoku", "published"), g = gridOf(exampleSpec("sudoku"));
  const live = row(id).sketch;
  sql(`insert into solves (creator_id, game_id, created_at) values (${q(run.userId)}, ${q(id)}, ${Date.now()});
    insert into likes (creator_id, game_id, created_at) values (${q(run.userId)}, ${q(id)}, ${Date.now()})`);

  // Edit on the game page opens paint
  await page.goto(`/g/${id}`);
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveAttribute("href", `/g/${id}/draw`);
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${id}/draw$`));
  await openPaint(page, id);
  const update = page.getByRole("button", { name: "Update", exact: true });
  await expect(update).toBeVisible();
  await expect(verdict(page)).toHaveAttribute("data-verdict", "one", { timeout: 30_000 });
  await expect(page.locator(".paint-live")).toHaveCount(0);

  // a digit in the top-left square: the one that keeps a single solution
  await tool(page, "Text");
  let digit = 0;
  for (const d of [1, 2, 3, 4]) {
    await tap(page, cell(g, 0, 0));
    await page.locator(".sp-typing").fill(String(d));
    await page.locator(".sp-typing").press("Enter");
    // the puzzle has the digit, and the solver has checked it
    await expect.poll(async () => has(JSON.parse((await page.locator(".paint").getAttribute("data-puzzle")) || "{}").givens, { cell: [0, 0], value: d })).toBe(true);
    await expect(verdict(page)).not.toHaveAttribute("data-verdict", "checking", { timeout: 30_000 });
    if ((await verdict(page).getAttribute("data-verdict")) === "one") { digit = d; break; }
  }
  expect(digit).toBeGreaterThan(0);
  await expect(page.locator(".paint-live")).toHaveText("Not live until you update");
  await expect(page.locator(".paint-saved")).toHaveText("Saved", { timeout: 15_000 });
  // saved as the drawing; the live puzzle is as it was
  expect(JSON.parse(row(id).drawing!).drawing.items.length).toBeGreaterThan(0);
  expect(row(id).sketch).toBe(live);

  // Update: the publish page, in update mode
  await update.click();
  await expect(page).toHaveURL(new RegExp(`/g/${id}/publish$`), { timeout: 15_000 });
  await expect(page.locator(".publish-meta")).toContainText("its 1 solve and its likes stay");
  const title = page.getByRole("textbox", { name: "Title" });
  await title.fill("Sudoku, updated");
  await page.waitForTimeout(1200);
  expect(row(id).title).not.toBe("Sudoku, updated");   // goes live with the update, not before
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${id}$`), { timeout: 15_000 });
  expect(row(id).state).toBe("published");
  expect(row(id).title).toBe("Sudoku, updated");
  expect(has(savedSpec(id).givens, { cell: [0, 0], value: digit })).toBe(true);
  expect(sql(`select count(*) n from solves where game_id = ${q(id)}`)[0].n).toBe(1);
  expect(sql(`select count(*) n from likes where game_id = ${q(id)}`)[0].n).toBe(1);
  await expect(page.locator(".game-head")).toContainText("1 solve");
  await expect(page.getByRole("heading", { name: "Sudoku, updated" })).toBeVisible();

  // the … menu: back to draft
  await page.getByRole("button", { name: "More for this puzzle" }).click();
  await page.getByRole("menuitem", { name: "Back to draft" }).click();
  await expect.poll(() => row(id).state).toBe("draft");
  expect(errors).toEqual([]);
});

test("the old editor's address: paint for every type but RYB, which keeps its figure editor", async ({ page }) => {
  const id = draftOf("akari");
  await page.goto(`/g/${id}/edit`);
  await expect(page).toHaveURL(new RegExp(`/g/${id}/draw$`));
  await page.goto(`/g/${run.drafts.coats}/edit`);
  await expect(page).toHaveURL(new RegExp(`/g/${run.drafts.coats}/edit$`));
  await expect(page.locator(".studio-board svg").first()).toBeVisible();
  // and RYB's paint address goes back to its editor
  await page.goto(`/g/${run.drafts.coats}/draw`);
  await expect(page).toHaveURL(new RegExp(`/g/${run.drafts.coats}/edit$`));
  // /new/draw is gone: /new starts in paint
  await page.goto("/new/draw");
  await expect(page).toHaveURL(/\/new$/);
});

test("drafts open in paint from the profile's Drafts and from /new", async ({ page }) => {
  const id = draftOf("masyu");
  // the profile by its slug now (settings.spec.ts moves the handle and back)
  const [{ slug }] = sql<{ slug: string }>(`select slug from collections where id = ${q(run.collectionId)}`);
  await page.goto(`/${slug}?tab=drafts`);
  await expect(page.locator(`a[href="/g/${id}/draw"]`)).toBeVisible();
  await page.goto("/new");
  await expect(page.locator(`a[href="/g/${id}/draw"]`)).toBeVisible();
  await expect(page.locator(`a[href="/g/${run.drafts.coats}/draw"]`)).toHaveCount(0);
});
