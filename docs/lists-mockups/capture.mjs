// Takes the real pieces for the lists mockups from the local site (npm --prefix app run dev, on
// :5173): the pen and wash filters, the frame's nav, the puzzle page's board before and after a
// solve (Lights On, solved by clicking its bulbs in), and Explore's Akari cards with their pictures.
// Writes fragments.json, which make.mjs builds the pages from. Not product code.
// Run from the repo root: node docs/lists-mockups/capture.mjs
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const SITE = "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: "dark" });
const out = {};

await page.goto(`${SITE}/g/akari-1`);
await page.waitForSelector(".sheet .frame");
await page.waitForTimeout(600);
Object.assign(out, await page.evaluate(() => ({
  defs: [...document.querySelectorAll("body svg")].filter((s) => s.querySelector("filter#pen")).map((s) => s.outerHTML).join(""),
  sidenav: document.querySelector(".sidenav").outerHTML,
  tabbar: document.querySelector(".tabbar").outerHTML,
  backBtn: document.querySelector(".back-btn").outerHTML,
  head: document.querySelector(".game-head").outerHTML,
  board: document.querySelector(".game-spot").outerHTML,
})));
// solve it: the bulbs of its one solution
const f = await page.locator(".sheet .frame").first().boundingBox();
for (const [r, c] of [[0, 2], [0, 4], [1, 1], [1, 5], [2, 4], [3, 1], [4, 2], [5, 0], [5, 3]]) {
  await page.mouse.click(f.x + (c + 0.5) * f.width / 6, f.y + (r + 0.5) * f.height / 6);
  await page.waitForTimeout(100);
}
await page.waitForSelector(".solved-stamp.landed", { timeout: 15000 });
await page.waitForTimeout(600);
out.boardSolved = await page.evaluate(() => document.querySelector(".game-spot").outerHTML);

await page.goto(`${SITE}/explore?q=akari`);
await page.waitForSelector(".x-cards");
out.cards = await page.evaluate(() => [...document.querySelectorAll(".x-cards > li")].map((li) => li.outerHTML));
out.search = await page.evaluate(() => document.querySelector(".x-search").outerHTML);
await page.goto(`${SITE}/explore`);
out.quickChips = await page.evaluate(() => document.querySelector(".quick-chips").outerHTML);
out.mixedCards = await page.evaluate(() => [...document.querySelectorAll(".xshelf .row > li")].filter((li) => li.querySelector(".pcard:not(.beta)")).map((li) => li.outerHTML));
await browser.close();
writeFileSync(`${dir}fragments.json`, JSON.stringify(out));
console.log("captured", Object.keys(out).join(", "), `(${out.cards.length} cards)`);
