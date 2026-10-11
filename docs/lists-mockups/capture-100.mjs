// Takes the puzzle pages the 100- mockups (playing through a list, the set's page) need, from the
// local site (npm --prefix app run dev, on :5173), as they are now: the head, the board (description
// on the paper; colors or digits under the board) and the back button of each, and two boards just
// solved: Lights On (by Wyatt) and Lamp Code II (by Slate, its bulbs from the engine's solver, given
// here). Writes fragments-100.json. Not product code.
// Run from the repo root: node docs/lists-mockups/capture-100.mjs
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const SITE = "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: "dark" });
const out = {};
const grab = () => page.evaluate(() => ({
  head: document.querySelector(".game-head").outerHTML,
  board: document.querySelector(".game-spot").outerHTML,
  backBtn: document.querySelector(".back-btn").outerHTML,
}));
const open = async (id) => {
  await page.goto(`${SITE}/g/${id}`);
  await page.waitForSelector(".sheet .frame");
  await page.waitForTimeout(700);
};
for (const id of ["akari-1", "xjvr8a6vpd", "nf3fyxf7yu", "binary-puzzle-3", "sudoku-3", "vq6b286hmx", "9tw4b3x373"]) {
  await open(id);
  out[id] = await grab();
}
// solved: click in the bulbs of the one solution, then wait for the stamp
async function solved(id, n, bulbs) {
  await open(id);
  const f = await page.locator(".sheet .frame").first().boundingBox();
  for (const [r, c] of bulbs) {
    await page.mouse.click(f.x + (c + 0.5) * f.width / n, f.y + (r + 0.5) * f.height / n);
    await page.waitForTimeout(100);
  }
  await page.waitForSelector(".solved-stamp.landed", { timeout: 15000 });
  await page.waitForTimeout(600);
  return page.evaluate(() => document.querySelector(".game-spot").outerHTML);
}
out.solved = {
  "akari-1": await solved("akari-1", 6, [[0, 2], [0, 4], [1, 1], [1, 5], [2, 4], [3, 1], [4, 2], [5, 0], [5, 3]]),
  "9tw4b3x373": await solved("9tw4b3x373", 4, [[0, 1], [2, 2], [3, 3]]),
};
await browser.close();
writeFileSync(`${dir}fragments-100.json`, JSON.stringify(out));
console.log("captured", Object.keys(out).join(", "));
