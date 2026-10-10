// Screenshots of the lists mockups (make.mjs). Run from the repo root: node docs/lists-mockups/shoot.mjs
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const D = { width: 1280, height: 860 }, PH = { width: 390, height: 844, phone: true };
const shots = [
  ["puzzle.html", "01-puzzle-in-list-desktop.png", D],
  ["puzzle.html", "01-puzzle-in-list-phone.png", PH],
  ["puzzle-solved.html", "02-solved-next-desktop.png", D],
  ["puzzle-solved.html", "02-solved-next-phone.png", PH],
  ["puzzle-last.html", "02b-solved-last-desktop.png", D],
  ["puzzle-last.html", "02b-solved-last-phone.png", PH],
  ["search.html", "03-search-list-desktop.png", { ...D, full: true }],
  ["search.html", "03-search-list-phone.png", PH],
  ["search-share.html", "04-share-frozen-desktop.png", D],
  ["search-share-live.html", "04b-share-live-desktop.png", D],
  ["search-share.html", "04-share-frozen-phone.png", PH],
  ["list.html", "05-list-page-desktop.png", { ...D, full: true }],
  ["list.html", "05-list-page-phone.png", PH],
  ["kept.html", "06-keep-desktop.png", D],
  ["kept.html", "06-keep-phone.png", PH],
  ["kept-tray.html", "06b-kept-tray-desktop.png", D],
  ["kept-share.html", "06c-kept-share-desktop.png", D],
  ["kept-share.html", "06c-kept-share-phone.png", PH],
];
const browser = await chromium.launch();
for (const [file, out, s] of shots) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.phone ? 2 : 1, isMobile: !!s.phone, hasTouch: !!s.phone, colorScheme: "dark" });
  await page.goto(`file://${dir}${file}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  if (s.full) await page.setViewportSize({ width: s.width, height: await page.evaluate(() => document.documentElement.scrollHeight) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}${out}` });
  console.log("wrote", out);
  await page.close();
}
await browser.close();
