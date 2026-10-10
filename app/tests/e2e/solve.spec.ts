// Solving a puzzle: the celebration ends in a check on the board, the solve is kept for a
// signed-in player, and it shows as a check on the puzzle's card and a count on its creator's page.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { q, RUN_FILE, sql, type Run } from "./db";

const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
const GAME = "sudoku-1";   // Wyatt's 4 × 4 warm-up, from the seed
const SOLUTION = [[1, 4, 2, 3], [3, 2, 1, 4], [2, 3, 4, 1], [4, 1, 3, 2]];

async function solve(page: Page) {
  const frame = await page.locator(".sheet svg.board .frame").boundingBox();
  if (!frame) throw new Error("no board");
  const s = frame.width / 4;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    await page.mouse.click(frame.x + (c + 0.5) * s, frame.y + (r + 0.5) * s);
    await page.keyboard.press(String(SOLUTION[r][c]));
  }
}

test("a solve is celebrated, kept and shown", async ({ page }) => {
  await page.goto(`/g/${GAME}`);
  await expect(page.locator(".sheet svg.board")).toBeVisible();
  await solve(page);
  // the ink bursts out, and the check lands at the end of the celebration: saving the solve
  // mustn't rebuild the board partway through, leaving just the stamp
  await expect(page.locator(".celebration .ink-drop").first()).toBeAttached();
  await expect(page.locator(".sheet .solved-stamp.landed")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => sql(`select 1 from solves where creator_id = ${q(run.userId)} and game_id = ${q(GAME)}`).length, { timeout: 10_000 }).toBe(1);

  await page.reload();
  await expect(page.locator(".game-head .solved-mark")).toBeVisible();
  await expect(page.locator(".game-head")).toContainText(/\d+ solves?/);

  await page.goto("/wyatt");
  await expect(page.locator(".profile-stats")).toContainText(/\d+ solves?/);
  await expect(page.locator(`a[href="/g/${GAME}"] .solved-badge`)).toBeVisible();
});

test("a creator's own solve doesn't count", async ({ page }) => {
  const draft = run.drafts.sudoku;
  sql(`update games set state = 'published', published_at = unixepoch() * 1000 where id = ${q(draft)}`);
  await page.goto(`/g/${draft}`);
  await expect(page.locator(".sheet svg.board")).toBeVisible();
  const before = sql(`select count(*) n from solves where game_id = ${q(draft)}`);
  // the example's answer isn't known here: report a solve the way the page does
  const status = await page.evaluate((id) => fetch(`/g/${id}/solve`, { method: "POST" }).then((r) => r.status), draft);
  expect(status).toBe(200);
  expect(sql(`select count(*) n from solves where game_id = ${q(draft)}`)).toEqual(before);
});
