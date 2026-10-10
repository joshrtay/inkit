// Screenshots of the 80- mockups (make-80.mjs), then the contact sheet (contact-80.html), in flow order.
// Run from the repo root: node docs/lists-mockups/shoot-80.mjs [filter]
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const D = { width: 1280, height: 860 }, W = { width: 1440, height: 900 }, N = { width: 1100, height: 820 }, PH = { width: 390, height: 844, phone: true };
const shots = [
  ["f80-header.html", "80-header-desktop.png", D],
  ["f80-header-drawer.html", "80-header-drawer-desktop.png", D],
  ["f80-header-first.html", "80-header-first-desktop.png", D],
  ["f80-header.html", "80-header-phone.png", PH],
  ["f80-header-first.html", "80-header-first-phone.png", PH],
  ["f80-profile.html", "81-profile-desktop.png", D],
  ["f80-profile.html", "81-profile-phone.png", { ...PH, y: 560 }],
  ["f80-drafts.html", "81b-drafts-desktop.png", D],
  ["f80-drafts.html", "81b-drafts-phone.png", { ...PH, y: 330 }],
  ["f80-explore-set.html", "82-explore-set-desktop.png", D],
  ["f80-feed-set.html", "82b-feed-set-desktop.png", D],
  ["f80-set-page.html", "83-set-page-desktop.png", D],
  ["f80-phone-menu.html", "84-menu-phone.png", PH],
  ["f80-phone-sheet.html", "84b-sheet-phone.png", PH],
];
const only = process.argv[2];
const browser = await chromium.launch();
for (const [file, out, s] of shots) {
  if (only && !out.includes(only)) continue;
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.phone ? 2 : 1, isMobile: !!s.phone, hasTouch: !!s.phone, colorScheme: "dark" });
  await page.goto(`file://${dir}${file}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  if (s.y) await page.evaluate((y) => window.scrollTo(0, y), s.y);   // phones: down to the cards
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}${out}` });
  console.log("wrote", out);
  await page.close();
}
if (!only || only === "contact") {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, colorScheme: "dark" });
  await page.goto(`file://${dir}contact-80.html`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("main").screenshot({ path: `${dir}80-contact-sheet.png` });
  console.log("wrote 80-contact-sheet.png");
}
await browser.close();
