// The Sudoku player's helpers, after Good Sudoku (src/game-types/grid/sudoku-assist.ts): a number
// picked first goes in the squares tapped and shades where it can't go, a repeat turns red at
// once, the pad fades what a square can't take, and auto-notes fill in and keep every square's notes.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { makePuzzle } from "~site/engine/puzzle.ts";
import { emptyBoard } from "~site/engine/types.ts";
import { assistFor, candidates } from "~site/game-types/grid/sudoku-assist.ts";
import { specOf } from "~/sketchpad/from-puzzle";

const GAME = "sudoku-3";   // the 9 × 9 Classic, from the seed
const p = makePuzzle(specOf("sudoku", JSON.parse(readFileSync(new URL("../../../src/games/sudoku/3.json", import.meta.url), "utf8"))));
const a = assistFor(p)!, g = p.grid, board = emptyBoard(g);
for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number") board.digit[i] = x.value;
// an empty square, a digit it can take, and another empty square in its row
const first = [...Array(g.cellCount).keys()].find((i) => !board.digit[i])!;
const digit = [...Array(9).keys()].map((k) => k + 1).find((d) => candidates(a, p, board, first) & (1 << d))!;
const [row] = g.rc(first);
const second = [...Array(g.cols).keys()].map((c) => g.cell(row, c)).find((i) => i !== first && !board.digit[i])!;

async function at(page: Page, i: number) {
  const frame = (await page.locator(".sheet svg.board .frame").boundingBox())!, s = frame.width / g.cols, [r, c] = g.rc(i);
  await page.mouse.click(frame.x + (c + 0.5) * s, frame.y + (r + 0.5) * s);
}
const key = (page: Page, d: number) => page.locator(`.pad [data-digit="${d}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto(`/g/${GAME}`);
  await page.evaluate(() => localStorage.removeItem("inkit:auto-notes"));
  await expect(page.locator(".sheet svg.board")).toBeVisible();
  const reset = page.locator("[data-reset]");
  await reset.click(); await reset.click();
});

test("a number picked first goes where it's tapped, and shows where it can't go", async ({ page }) => {
  await key(page, digit).click();
  await expect(key(page, digit)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".sheet svg.board rect.ruled").first()).toBeAttached();
  await at(page, first);
  await expect(page.locator(".sheet svg.board text.digit:not(.given)")).toHaveText([String(digit)]);
  // tapped again, it comes out
  await at(page, first);
  await expect(page.locator(".sheet svg.board text.digit:not(.given)")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(key(page, digit)).toHaveAttribute("aria-pressed", "false");
});

test("a repeat turns red at once, and the pad fades what a square can't take", async ({ page }) => {
  await at(page, first);
  await page.keyboard.press(String(digit));
  await at(page, second);
  await expect(key(page, digit)).toHaveClass(/faded/);
  await page.keyboard.press(String(digit));
  // both of them (and a printed one too, if it sees the second)
  await expect.poll(() => page.locator(".sheet svg.board text.digit.clash").count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".sheet svg.board text.digit.clash:not(.given)")).toHaveCount(2);
  await page.keyboard.press("Backspace");
  await expect(page.locator(".sheet svg.board text.digit.clash")).toHaveCount(0);
});

test("auto-notes fill every square and follow the digits", async ({ page }) => {
  await page.locator("[data-auto]").click();
  await expect(page.locator("[data-auto]")).toHaveAttribute("aria-pressed", "true");
  const before = await page.locator(".sheet svg.board text.pencil").count();
  expect(before).toBeGreaterThan(50);
  await at(page, first);
  await page.keyboard.press(String(digit));
  // the digit leaves the notes that see it; one undo takes both back
  await expect.poll(() => page.locator(".sheet svg.board text.pencil").count()).toBeLessThan(before);
  await page.locator("[data-undo]").click();
  await expect.poll(() => page.locator(".sheet svg.board text.pencil").count()).toBe(before);
  await page.locator("[data-auto]").click();
});
