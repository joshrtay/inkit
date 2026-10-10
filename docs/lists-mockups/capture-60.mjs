// Takes the How to play pane for the 60- mockups from the local site (npm --prefix app run dev, on
// :5173): Lamp Code I by Slate with the pane open, as it is now, and
// Lamp Code II's page. Writes fragments-60.json beside
// fragments.json and fragments-50.json (which capture.mjs and capture-50.mjs own). Not product code.
// Run from the repo root: node docs/lists-mockups/capture-60.mjs
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const SITE = "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: "dark" });
await page.goto(`${SITE}/g/m29sd5vthj`);
await page.waitForSelector(".sheet .frame");
await page.click(".rules-toggle");
await page.waitForSelector(".guide-pane.open .pane-guide");
await page.waitForTimeout(800);
const out = await page.evaluate(() => ({ guide: document.querySelector(".guide-pane").outerHTML }));
// Lamp Code II, the puzzle 64 adds (pane closed)
await page.click(".guide-pane .pane-close");
await page.goto(`${SITE}/g/9tw4b3x373`);
await page.waitForSelector(".sheet .frame");
await page.waitForTimeout(600);
out.l2 = await page.evaluate(() => ({ head: document.querySelector(".game-head").outerHTML, board: document.querySelector(".game-spot").outerHTML, backBtn: document.querySelector(".back-btn").outerHTML }));
await browser.close();
writeFileSync(`${dir}fragments-60.json`, JSON.stringify(out));
console.log("captured guide", out.guide.length);
