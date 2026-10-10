// The failure flash (src/game-types/grid/flash.ts), after The Witness: a finished but wrong board
// briefly flashes what breaks the rules in a red wash, then goes back to how it was. An unfinished
// board, and a shading puzzle at any point, never flash.
import { expect, test, type Page } from "@playwright/test";

// signed out, so nothing is kept between tests
test.use({ storageState: { cookies: [], origins: [] } });

const board = (page: Page) => page.locator(".sheet svg.board");
/** remember whether anything on the board ever flashed */
const watch = (page: Page) => page.evaluate(() => {
  const svg = document.querySelector(".sheet svg.board")!, w = window as unknown as { flashed: boolean };
  w.flashed = false;
  new MutationObserver(() => { if (svg.querySelector(".flash, .flash-wash")) w.flashed = true; }).observe(svg, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
});
const flashed = (page: Page) => page.evaluate(() => (window as unknown as { flashed: boolean }).flashed);

/** Two Tones (panel-2): from the start in the middle, (2, 2), straight up to the end at (0, 2). The
 *  line cuts nothing off, so its black and white squares share a region. */
async function drawWrongPanelLine(page: Page) {
  const frame = (await page.locator(".sheet svg.board .panel-frame").boundingBox())!, s = frame.width / 4;
  const at = (r: number, c: number) => [frame.x + c * s, frame.y + r * s] as const;
  await page.mouse.move(...at(2, 2));
  await page.mouse.down();
  await page.mouse.move(...at(1, 2), { steps: 8 });
  await page.mouse.move(...at(0, 2), { steps: 8 });
  await page.mouse.move(at(0, 2)[0], at(0, 2)[1] - s * 0.35, { steps: 4 });   // into the end
  await page.mouse.up();
}
const SQUARES = ["cell:1", "cell:13", "cell:2", "cell:12", "cell:0", "cell:8"];   // panel-2's squares, (r, c) → r * 4 + c

async function sudoku(page: Page, grid: number[][], skip?: [number, number]) {
  const frame = (await page.locator(".sheet svg.board .frame").boundingBox())!, s = frame.width / 4;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (skip && skip[0] === r && skip[1] === c) continue;
    if (r === 3 && c === 3) {   // the last square is given: picking it doesn't stop the flash
      await page.mouse.click(frame.x + (c + 0.5) * s, frame.y + (r + 0.5) * s);
      continue;
    }
    await page.mouse.click(frame.x + (c + 0.5) * s, frame.y + (r + 0.5) * s);
    await page.keyboard.press(String(grid[r][c]));
  }
}
// sudoku-1's answer with (0, 0) and (0, 2) swapped: each then clashes with a given in its column
const CLASH = [[2, 4, 1, 3], [3, 2, 1, 4], [2, 3, 4, 1], [4, 1, 3, 2]];

test("a panel line that reaches the end but breaks a square rule flashes the squares, then lets go", async ({ page }) => {
  await page.goto("/g/panel-2");
  await expect(board(page)).toBeVisible();
  await drawWrongPanelLine(page);
  const lit = page.locator(".sheet svg.board .flash");
  await expect(lit).toHaveCount(SQUARES.length);
  for (const t of SQUARES) await expect(page.locator(`.sheet svg.board [data-flash="${t}"]`)).toHaveClass(/\bflash\b/);
  await expect(page.locator(".sheet svg.board .flash-wash")).toHaveCount(SQUARES.length);
  await expect(page.locator(".paper-bar .status")).toHaveText("");   // no words
  // then it fades, and the line stays as drawn
  await expect(lit).toHaveCount(0, { timeout: 4000 });
  await expect(page.locator(".sheet svg.board .flash-wash")).toHaveCount(0);
  await expect(page.locator('.sheet svg.board .mark.pen[data-flash^="border:"]')).toHaveCount(2);
});

test("a filled Sudoku with a clash flashes the clashing digits", async ({ page }) => {
  await page.goto("/g/sudoku-1");
  await expect(board(page)).toBeVisible();
  await sudoku(page, CLASH);
  const lit = page.locator(".sheet svg.board text.flash");
  // the swapped digits and what they clash with: (0, 0) with the given (2, 0) and with (1, 1) in its
  // box, (0, 2) with the given (1, 2)
  for (const i of [0, 8, 5, 2, 6]) await expect(page.locator(`.sheet svg.board text[data-flash="cell:${i}"]`)).toHaveClass(/\bflash\b/);
  await expect(lit).toHaveCount(5);
  await expect(lit).toHaveCount(0, { timeout: 4000 });
});

test("an unfinished Sudoku doesn't flash", async ({ page }) => {
  await page.goto("/g/sudoku-1");
  await expect(board(page)).toBeVisible();
  await watch(page);
  await sudoku(page, CLASH, [0, 3]);
  await page.waitForTimeout(600);
  expect(await flashed(page)).toBe(false);
});

test("a shading puzzle never flashes", async ({ page }) => {
  await page.goto("/g/nurikabe-1");
  await expect(board(page)).toBeVisible();
  await watch(page);
  const frame = (await page.locator(".sheet svg.board .frame").boundingBox())!, n = 5, s = frame.width / n;   // nurikabe-1 is 5 × 5
  // shade every square (the clues stay), then take the shading off and dot every square
  for (const button of ["left", "right", "right"] as const) for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    await page.mouse.click(frame.x + (c + 0.5) * s, frame.y + (r + 0.5) * s, { button });
  await page.waitForTimeout(600);
  expect(await flashed(page)).toBe(false);
});

test("with reduced motion the flash is a still tint for as long", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/g/panel-2");
  await expect(board(page)).toBeVisible();
  await drawWrongPanelLine(page);
  const wash = page.locator(".sheet svg.board .flash-wash").first(), lit = page.locator(".sheet svg.board .flash").first();
  await expect(wash).toBeAttached();
  const style = await wash.evaluate((e) => { const s = getComputedStyle(e); return { animation: s.animationName, opacity: Number(s.opacity) }; });
  expect(style.animation).toBe("none");
  expect(style.opacity).toBeGreaterThan(0.3);
  expect(await lit.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  await expect(page.locator(".sheet svg.board .flash-wash")).toHaveCount(0, { timeout: 4000 });
});
