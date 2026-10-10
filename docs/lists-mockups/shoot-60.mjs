// Screenshots of the 60- mockups (make-60.mjs), then the contact sheet (contact-60.html), in flow order.
// Run from the repo root: node docs/lists-mockups/shoot-60.mjs [filter]
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const D = { width: 1280, height: 860 }, W = { width: 1440, height: 900 }, N = { width: 1100, height: 820 }, PH = { width: 390, height: 844, phone: true };
const shots = [
  ["f60-popover.html", "60-popover-desktop.png", D],
  ["f60-drawer.html", "61-drawer-desktop.png", D],
  ["f60-explore.html", "62-explore-desktop.png", D],
  ["f60-explore.html", "62-explore-1440.png", W],
  ["f60-drag.html", "63-drag-desktop.png", D],
  ["f60-rules.html", "64-rules-desktop.png", D],
  ["f60-rules-drawer.html", "64b-rules-drawer-desktop.png", D],
  ["f60-publish.html", "65-publish-desktop.png", D],
  ["f60-published.html", "65b-published-desktop.png", D],
  ["f60-overlay.html", "66-overlay-1100.png", N],
  ["f60-phone-list.html", "67-list-phone.png", PH],
  ["f60-phone-toast.html", "67b-toast-phone.png", PH],
  ["f60-phone-sheet.html", "67c-sheet-phone.png", PH],
  ["f60-phone-puzzle.html", "67d-puzzle-phone.png", PH],
];
const only = process.argv[2];
const browser = await chromium.launch();
for (const [file, out, s] of shots) {
  if (only && !out.includes(only)) continue;
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.phone ? 2 : 1, isMobile: !!s.phone, hasTouch: !!s.phone, colorScheme: "dark" });
  await page.goto(`file://${dir}${file}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}${out}` });
  console.log("wrote", out);
  await page.close();
}
if (!only || only === "contact") {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, colorScheme: "dark" });
  await page.goto(`file://${dir}contact-60.html`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("main").screenshot({ path: `${dir}60-contact-sheet.png` });
  console.log("wrote 60-contact-sheet.png");
}
await browser.close();
