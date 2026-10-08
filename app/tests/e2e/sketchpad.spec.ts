// The sketchpad (/new/draw): draw a grid, stamp a stone, write a number, and the drawing comes out
// as a PNG (through Download, which makes the same picture "Read my drawing" sends; the reader
// itself isn't called: it costs money).
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const PAGE = 560;   // the sketchpad's page, in its own units (sketchpad/model.ts)

/** Where a point of the page (in its units) is on screen. */
async function at(page: Page, x: number, y: number) {
  const box = (await page.locator(".sp-board").boundingBox())!;
  return { x: box.x + (x / PAGE) * box.width, y: box.y + (y / PAGE) * box.height };
}
async function tap(page: Page, x: number, y: number) {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
}
async function drag(page: Page, [x0, y0]: [number, number], [x1, y1]: [number, number]) {
  const a = await at(page, x0, y0), b = await at(page, x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}
const tool = (page: Page, name: string) => page.locator(".sp-tools").getByRole("button", { name, exact: true }).click();

test.beforeEach(async ({ page }) => {
  // a clean page (the sketchpad keeps the last drawing in this browser), unless a test says keep it
  await page.addInitScript(() => { if (!sessionStorage.getItem("keep")) localStorage.removeItem("inkit:sketchpad"); });
});

test("/new offers drawing it here", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("link", { name: "Draw it here" }).click();
  await expect(page).toHaveURL(/\/new\/draw$/);
  await expect(page.locator(".sp-board")).toBeVisible();
});

test("draw a grid, a stone and a number, and download the drawing as a PNG", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/new/draw");
  const board = page.locator(".sp-board");
  await expect(board).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toBeDisabled();

  // a grid: 336 units across is 7 squares of a board's 48; then one row fewer
  await drag(page, [60, 60], [396, 396]);
  await expect(board).toHaveAttribute("data-grid", "7x7");
  await page.getByRole("button", { name: "Fewer rows" }).click();
  await expect(board).toHaveAttribute("data-grid", "6x7");

  // a black stone, snapped to the middle of the top-left square
  await tool(page, "Stamp");
  await page.getByRole("button", { name: "Stone", exact: true }).click();
  await tap(page, 60 + 48 * 0.3, 60 + 48 * 0.7);
  await expect(board.locator(".sp-ink .stone")).toHaveCount(1);
  const stone = board.locator(".sp-ink .stone circle").first();
  expect(Number(await stone.getAttribute("cx"))).toBeCloseTo(84, 0);
  expect(Number(await stone.getAttribute("cy"))).toBeCloseTo(84, 0);

  // a number in the square below and to the right of it
  await tool(page, "Text");
  await tap(page, 60 + 48 * 1.5, 60 + 48 * 1.5);
  const box = page.locator(".sp-typing");
  await expect(box).toBeFocused();
  await box.fill("5");
  await box.press("Enter");
  await expect(board.locator("text.sp-text")).toHaveText("5");

  // undo takes the number away, redo brings it back
  await page.keyboard.press("ControlOrMeta+z");
  await expect(board.locator("text.sp-text")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(board.locator("text.sp-text")).toHaveText("5");

  // the picture: a 1600px PNG on paper, with the stone's ink where the stone is
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("puzzle-drawing.png");
  const png = readFileSync((await file.path())!);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1600, 1600]);
  const shades = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const k = img.width / 560, light = (x: number, y: number) => { const [r, g, b] = ctx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return (r + g + b) / 3; };
    return { stone: light(84, 84), paper: light(500, 500) };
  }, png.toString("base64"));
  expect(shades.stone).toBeLessThan(110);
  expect(shades.paper).toBeGreaterThan(230);
  expect(errors).toEqual([]);
});

test("the eraser rubs out what it touches; the drawing is kept when the page reloads", async ({ page }) => {
  await page.goto("/new/draw");
  const board = page.locator(".sp-board");
  await page.getByRole("button", { name: "Add a grid" }).click();
  await tool(page, "Stamp");
  await page.getByRole("button", { name: "Star", exact: true }).click();
  await tap(page, 64 + 36, 64 + 36);
  await tap(page, 64 + 108, 64 + 36);
  await expect(board.locator(".sp-ink .star")).toHaveCount(2);
  await tool(page, "Eraser");
  await tap(page, 64 + 36, 64 + 36);
  await expect(board.locator(".sp-ink .star")).toHaveCount(1);
  // reloaded without clearing it this time
  await page.evaluate(() => sessionStorage.setItem("keep", "1"));
  await page.reload();
  await expect(board.locator(".sp-ink .star")).toHaveCount(1);
  await expect(board).toHaveAttribute("data-grid", "6x6");
});

test("the paint-app chrome: a tool palette with arrow keys and letters, panels, and zoom", async ({ page }) => {
  await page.goto("/new/draw");
  const palette = page.getByRole("toolbar", { name: "Tools" });
  const pen = palette.getByRole("button", { name: "Pen", exact: true });
  await palette.getByRole("button", { name: "Grid", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(pen).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(pen).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  // a letter picks a tool; a stamp from the panel picks the stamp tool
  await page.keyboard.press("w");
  await expect(palette.getByRole("button", { name: "Wash", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Green", exact: true }).click();
  await expect(page.getByRole("button", { name: "Green", exact: true })).toHaveAttribute("aria-pressed", "true");
  // each choice has one place: colour and stamps only in the side panel, undo in the header
  await expect(page.locator(".sp-opts .sp-chip")).toHaveCount(0);
  await expect(page.locator(".studio-top").getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(page.getByText("Goes in")).toHaveCount(0);
  await page.getByRole("button", { name: "Crest", exact: true }).click();
  await expect(palette.getByRole("button", { name: "Stamp", exact: true })).toHaveAttribute("aria-pressed", "true");
  // zoom: Cmd/Ctrl + and 0, and the paper grows and comes back
  const board = page.locator(".sp-board");
  const w0 = (await board.boundingBox())!.width;
  await page.keyboard.press("ControlOrMeta+=");
  await expect(page.getByRole("button", { name: "Zoom to fit" })).toHaveText("125%");
  expect((await board.boundingBox())!.width).toBeGreaterThan(w0 * 1.2);
  await page.keyboard.press("ControlOrMeta+0");
  await expect(page.getByRole("button", { name: "Zoom to fit" })).toHaveText("100%");
});

test("on a phone: the tools along the bottom, Colour and Stamps in a sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/new/draw");
  const stone = page.getByRole("button", { name: "Stone", exact: true });
  await expect(stone).toBeHidden();
  await page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("button", { name: "Colour and stamps" }).click();
  await stone.click();
  await expect(stone).toBeHidden();
  await expect(page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Stamp", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
