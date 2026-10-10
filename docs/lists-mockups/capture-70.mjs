// Takes the pieces the 70- mockups need beyond fragments.json / -50 / -60, from the local site
// (npm --prefix app run dev, on :5173): Lamp Code IV's page, and Wyatt's and Slate's profiles (head, tabs
// and first cards). Writes fragments-70.json. Not product code.
// Run from the repo root: node docs/lists-mockups/capture-70.mjs
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const SITE = "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: "dark" });
const out = {};
await page.goto(`${SITE}/g/nf3fyxf7yu`);
await page.waitForSelector(".sheet .frame");
await page.waitForTimeout(600);
out.l4 = await page.evaluate(() => ({ head: document.querySelector(".game-head").outerHTML, board: document.querySelector(".game-spot").outerHTML, backBtn: document.querySelector(".back-btn").outerHTML }));
await page.goto(`${SITE}/wyatt`);
await page.waitForSelector(".profile-head");
out.profile = await page.evaluate(() => ({
  head: document.querySelector(".profile-head").outerHTML,
  tabs: document.querySelector("nav.tabs").outerHTML,
  cards: [...document.querySelectorAll("main .cards > li")].slice(0, 8).map((li) => li.outerHTML),
}));
// Slate's profile, for the drawer on a creator's page (73b)
await page.goto(`${SITE}/slate`);
await page.waitForSelector(".profile-head");
out.slate = await page.evaluate(() => ({
  head: document.querySelector(".profile-head").outerHTML,
  tabs: document.querySelector("nav.tabs").outerHTML,
  cards: [...document.querySelectorAll("main .cards > li")].slice(0, 9).map((li) => li.outerHTML),
}));
await browser.close();
writeFileSync(`${dir}fragments-70.json`, JSON.stringify(out));
console.log("captured", Object.keys(out).join(", "));
