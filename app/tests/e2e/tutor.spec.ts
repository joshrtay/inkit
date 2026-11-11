// The tutor on a puzzle's Hints tab: the solver reads the board in the browser, and the tutor
// replies (plainly here: the local site has no API key). A wrong mark is pointed at first, and each
// reply is recorded for the limits.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { q, RUN_FILE, sql, type Run } from "./db";

const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
const GAME = "sudoku-1";   // Wyatt's 4 × 4 warm-up, from the seed: its top-left square is a 1

test("the tutor reads the board and replies", async ({ page }) => {
  await page.goto(`/g/${GAME}`);
  await expect(page.locator(".sheet svg.board")).toBeVisible();
  await page.locator(".type-link").click();
  await page.getByRole("tab", { name: "Hints" }).click();
  const tutor = page.locator(".tutor");
  await tutor.getByRole("button", { name: "Where should I look?" }).click();
  await expect(tutor.locator(".tutor-turn.tutor span")).toHaveText(/move in the squares I've outlined/, { timeout: 30_000 });
  await expect(page.locator(".sheet svg.board .hint-area").first()).toBeAttached();

  // a wrong mark comes first
  const frame = await page.locator(".sheet svg.board .frame").boundingBox();
  if (!frame) throw new Error("no board");
  await page.mouse.click(frame.x + frame.width / 8, frame.y + frame.height / 8);
  await page.keyboard.press("2");
  await tutor.getByRole("button", { name: "Is anything wrong so far?" }).click();
  await expect(tutor.locator(".tutor-turn.tutor span").nth(1)).toHaveText(/One mark on your board is wrong/, { timeout: 30_000 });

  const rows = sql<{ ask: string | null; by: string; mistake: number; wrong: number }>(`select ask, by, mistake, wrong from tutor_turns where creator_id = ${q(run.userId)} and game_id = ${q(GAME)} order by created_at`);
  expect(rows).toEqual([{ ask: "look", by: "plain", mistake: 0, wrong: 0 }, { ask: null, by: "plain", mistake: 1, wrong: 1 }]);
});

test("signed out, the tutor asks you to sign in", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto(`/g/${GAME}`);
  await expect(page.locator(".sheet svg.board")).toBeVisible();
  await page.locator(".type-link").click();
  await page.getByRole("tab", { name: "Hints" }).click();
  await expect(page.locator(".tutor")).toContainText("Sign in to ask the tutor");
  const res = await context.request.post(`/g/${GAME}/tutor`, { data: { read: { mistakes: [], moves: [], done: false }, turns: [{ role: "player", text: "hi" }] }, headers: { origin: new URL(page.url()).origin } });
  expect(res.status()).toBe(401);
  await context.close();
});
