// Screenshots of the 50- mockups (make-50.mjs), then the contact sheet (contact-50.html), in flow order.
// Run from the repo root: node docs/lists-mockups/shoot-50.mjs [filter]
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const D = { width: 1280, height: 860 }, PH = { width: 390, height: 844, phone: true };
const shots = [
  ["f50-new-set.html", "50-new-set-desktop.png", D],
  ["f50-new-set.html", "50-new-set-phone.png", PH],
  ["f50-adding-empty.html", "51-adding-empty-desktop.png", D],
  ["f50-adding.html", "52-adding-desktop.png", D],
  ["f50-adding.html", "52-adding-phone.png", PH],
  ["f50-tray.html", "53-tray-desktop.png", D],
  ["f50-tray.html", "53-tray-phone.png", PH],
  ["f50-puzzle.html", "54-puzzle-desktop.png", D],
  ["f50-puzzle.html", "54-puzzle-phone.png", PH],
  ["f50-puzzle-added.html", "54b-puzzle-added-desktop.png", D],
  ["f50-puzzle-added.html", "54b-puzzle-added-phone.png", PH],
  ["f50-save.html", "55-save-desktop.png", D],
  ["f50-save-menu.html", "55-save-phone.png", PH],
  ["f50-save-sheet.html", "55b-save-sheet-phone.png", PH],
  ["f50-add-all.html", "56-add-all-desktop.png", D],
  ["f50-edit.html", "57-edit-desktop.png", D],
  ["f50-edit.html", "57-edit-phone.png", PH],
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
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, colorScheme: "dark" });
  await page.goto(`file://${dir}contact-50.html`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("main").screenshot({ path: `${dir}50-contact-sheet.png` });
  console.log("wrote 50-contact-sheet.png");
}
await browser.close();
