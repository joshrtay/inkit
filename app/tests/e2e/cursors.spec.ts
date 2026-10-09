// Cursors (docs/style.md, "Cursors"): on a board the cursor says what a click does (the pen for
// lines, the brush for washes, the pointer to pick a square, the text caret to type, the eraser);
// the sketchpad's tools each show their own; chrome gets the pointer, and a disabled button the arrow.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { RUN_FILE, sql, type Run } from "./db";

const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
const published = Object.fromEntries(sql<{ kind: string; id: string }>("select kind, min(id) id from games where state = 'published' group by kind").map((r) => [r.kind, r.id]));

/** The cursor an element shows, by name: a keyword, or which of global.css's drawn cursors it is. */
async function cursor(el: Locator): Promise<string> {
  const c = await el.evaluate((e) => getComputedStyle(e).cursor);
  if (!c.startsWith("url(")) return c;
  if (c.includes("3fb0e6")) return "brush";
  if (c.includes("f07ab8")) return "eraser";
  if (c.includes("c4364b")) return "stamp";
  if (c.includes("M13.8 7l3.2 3.2")) return "pen";
  return c;
}
const board = (page: Page) => page.locator(".sheet svg.board");

test("the player's board: the pen for lines, the brush for washes, the pointer to pick a square", async ({ page }) => {
  for (const [kind, want] of [["sudoku", "pointer"], ["slitherlink", "pen"], ["masyu", "pen"], ["panel", "pen"], ["nurikabe", "brush"], ["binary-puzzle", "brush"]] as const) {
    const id = published[kind];
    expect(id, `a published ${kind}`).toBeTruthy();
    await page.goto(`/g/${id}`);
    await expect(board(page)).toBeVisible();
    await expect.poll(() => cursor(board(page)), kind).toBe(want);
  }
  expect(await cursor(page.getByRole("button", { name: "Reset" }))).toBe("pointer");
});

test.describe("signed out", () => {
  // so the solve isn't kept (solve.spec.ts counts this account's solves)
  test.use({ storageState: { cookies: [], origins: [] } });
  test("a solved board has nothing left to click", async ({ page }) => {
    const SOLUTION = [[1, 4, 2, 3], [3, 2, 1, 4], [2, 3, 4, 1], [4, 1, 3, 2]];   // sudoku-1, as in solve.spec.ts
    await page.goto("/g/sudoku-1");
    await expect(board(page)).toBeVisible();
    expect(await cursor(page.locator(".pad .word").first())).toBe("pointer");
    const frame = (await page.locator(".sheet svg.board .frame").boundingBox())!, s = frame.width / 4;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      await page.mouse.click(frame.x + (c + 0.5) * s, frame.y + (r + 0.5) * s);
      await page.keyboard.press(String(SOLUTION[r][c]));
    }
    await expect(page.locator(".sheet .solved-stamp")).toBeVisible({ timeout: 10_000 });
    expect(await cursor(board(page))).toBe("default");
  });
});

test("a guide's pictures are only to look at", async ({ page }) => {
  await page.goto("/puzzles/sudoku");
  const pic = page.locator("svg.picture").first();
  await expect(pic).toBeVisible();
  expect(await cursor(pic)).toBe("default");
  expect(await cursor(pic.locator("text").first())).toBe("default");
});

test("the editor's board shows the tool's cursor", async ({ page }) => {
  const tool = (name: string) => page.locator(".studio-tools").getByRole("button", { name, exact: true }).click();
  const pic = page.locator(".be-board svg.picture");

  await page.goto(`/g/${run.drafts["thermo-sudoku"]}/edit`);
  await expect(pic).toBeVisible();
  expect(await cursor(pic)).toBe("text");   // Number: click a square and type
  await tool("Thermometer");
  await expect.poll(() => cursor(pic)).toBe("pen");
  await tool("Erase");
  await expect.poll(() => cursor(pic)).toBe("eraser");

  await page.goto(`/g/${run.drafts["star-battle"]}/edit`);
  await expect(pic).toBeVisible();
  expect(await cursor(pic)).toBe("brush");   // Areas: paint squares into an area

  await page.goto(`/g/${run.drafts.masyu}/edit`);
  await expect(pic).toBeVisible();
  expect(await cursor(pic)).toBe("pointer");   // Pearl: click to cycle
});

test("the sketchpad: each tool its own cursor; the grid grabbed and stretched", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("inkit:sketchpad"));
  await page.goto("/new/draw");
  const paper = page.locator(".sp-board");
  await expect(paper).toBeVisible();
  // nothing to undo or download yet: disabled buttons get the arrow
  for (const name of ["Undo", "Download"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
    expect(await cursor(page.getByRole("button", { name, exact: true }))).toBe("default");
  }
  // a grid (dragged out with the Grid tool, which it starts with)
  const box = (await paper.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 6 });
  await page.mouse.up();
  await expect(paper).not.toHaveAttribute("data-grid", "");
  expect(await cursor(paper)).toBe("crosshair");
  expect(await cursor(paper.locator(".grid-hit"))).toBe("grab");
  expect(await cursor(paper.locator(".sp-ui .handle"))).toBe("nwse-resize");

  for (const [name, want] of [["Pen", "pen"], ["Line", "crosshair"], ["Wash", "brush"], ["Stamp", "stamp"], ["Text", "text"], ["Eraser", "eraser"]] as const) {
    await page.locator(".sp-tools").getByRole("button", { name, exact: true }).click();
    await expect.poll(() => cursor(paper), name).toBe(want);
  }
  expect(await cursor(page.locator(".sp-tools").getByRole("button", { name: "Pen", exact: true }))).toBe("pointer");
  // the palette: its buttons the pointer, its labels and header only to look at
  const palette = page.locator(".sp-palette");
  await page.locator(".sp-tools").getByRole("button", { name: "Pen", exact: true }).click();
  expect(await cursor(palette.getByRole("button", { name: "Bold" }))).toBe("pointer");
  expect(await cursor(palette.getByRole("button", { name: "Hide the tool options" }))).toBe("pointer");
  expect(await cursor(palette.locator(".sp-pal-label").first())).toBe("default");
  expect(await cursor(palette.locator(".sp-pal-head strong"))).toBe("default");
});

test("settings: the choices get the pointer", async ({ page }) => {
  await page.goto("/settings");
  const choice = page.locator(".theme-choice").first();
  await expect(choice).toBeVisible();
  expect(await cursor(choice)).toBe("pointer");
});
