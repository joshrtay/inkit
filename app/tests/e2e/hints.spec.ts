// A puzzle's hints (src/lib/hint-ladder.ts) in How to play: one more per click, outlined on the
// board, a stuck point the player gets past is folded and skipped, and each hint opened is logged
// with the play.
import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { q, sql } from "./db";

const GAME = "sudoku-1";   // the 4 × 4 warm-up; its answer's first row is 1 4 2 3
const LADDER = {
  version: "e2e-1",
  opening: [{ kind: "start", text: "Start with the row that has the most digits." }],
  points: [
    { marks: [["digit", 0, 1]], rungs: [
      { kind: "where", text: "Early on, look at the outlined row.", area: [0, 1, 2, 3] },
      { kind: "rule", text: "Whenever a row is missing one digit, it goes in the empty square. Which is missing?", technique: "last digit", short: "Last digit again." },
    ] },
    { marks: [["digit", 1, 4]], rungs: [{ kind: "where", text: "Now look at the second square.", area: [1] }] },
  ],
};

test.beforeAll(() => {
  const [{ sketch }] = sql<{ sketch: string }>(`select sketch from games where id = ${q(GAME)}`);
  const hash = createHash("sha256").update(sketch).digest("hex");
  sql(`insert or replace into hint_ladders (game_id, ladder, source, sketch_hash) values (${q(GAME)}, ${q(JSON.stringify(LADDER))}, 'e2e-1', ${q(hash)})`);
});
test.afterAll(() => { sql(`delete from hint_ladders where game_id = ${q(GAME)}`); });

test("hints open one at a time, outline the board, skip what the player is past, and are logged", async ({ page }) => {
  const start = Date.now() - 1000;
  await page.goto(`/g/${GAME}`);
  await expect(page.locator(".sheet svg.board")).toBeVisible();
  await page.locator(".sheet [data-rules]").click();
  // How to play has two tabs: the type's rules, and this puzzle's hints
  await page.locator(".guide-pane").getByRole("tab", { name: "Hints" }).click();
  const hints = page.locator(".guide-pane .puzzle-hints");
  await expect(hints).toBeVisible();
  await expect(hints.locator(".hint")).toHaveCount(0);

  await hints.getByRole("button", { name: "Show a hint" }).click();
  await expect(hints.locator(".hint")).toHaveText([/Start with the row/]);
  await hints.getByRole("button", { name: "Another hint" }).click();
  await expect(hints.locator(".hint").nth(1)).toContainText("look at the outlined row");
  await expect(page.locator(".sheet svg.board rect.hint-area")).toHaveCount(4);

  // the player gets past the first stuck point on their own: it folds, and the next hint is the second's
  const frame = await page.locator(".sheet svg.board .frame").boundingBox();
  if (!frame) throw new Error("no board");
  await page.mouse.click(frame.x + frame.width / 8, frame.y + frame.height / 8);
  await page.keyboard.press("1");
  await expect(hints.locator(".hint.passed")).toContainText("You got past stuck point 1");
  await hints.getByRole("button", { name: "Another hint" }).click();
  await expect(hints.locator(".hint").last()).toContainText("the second square");

  // leaving the page sends the play's log: each hint opened is there, with the ladder's version
  await page.goto("/");
  await expect.poll(() => sql<{ events: string }>(`select e.events from play_events e join plays p on p.id = e.play_id where p.game_id = ${q(GAME)} and p.created_at >= ${start}`)
    .map((r) => r.events).join(" ").match(/"e2e-1"/g)?.length ?? 0, { timeout: 15_000 }).toBe(3);
});
