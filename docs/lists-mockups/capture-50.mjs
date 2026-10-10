// Takes the puzzle page's current pieces for the 50- mockups from the local site (npm --prefix app
// run dev, on :5173): Lamp Code I by Slate, with its description on the paper and the title row as
// it is now. Writes fragments-50.json beside fragments.json (which capture.mjs owns). Not product code.
// Run from the repo root: node docs/lists-mockups/capture-50.mjs
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const SITE = "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: "dark" });
const out = {};
for (const [key, id] of [["slate", "m29sd5vthj"], ["lights", "akari-1"]]) {
  await page.goto(`${SITE}/g/${id}`);
  await page.waitForSelector(".sheet .frame");
  await page.waitForTimeout(600);
  out[key] = await page.evaluate(() => ({
    head: document.querySelector(".game-head").outerHTML,
    board: document.querySelector(".game-spot").outerHTML,
    backBtn: document.querySelector(".back-btn").outerHTML,
  }));
}
await browser.close();
writeFileSync(`${dir}fragments-50.json`, JSON.stringify(out));
console.log("captured", Object.keys(out).join(", "));
