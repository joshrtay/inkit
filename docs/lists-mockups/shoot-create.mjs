// Screenshots of the Create → Set mockups (make-create.mjs), then the contact sheet (contact-40.html).
// Run from the repo root: node docs/lists-mockups/shoot-create.mjs [filter]
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const D = { width: 1280, height: 860 }, PH = { width: 390, height: 844, phone: true };
const shots = [
  ["create-menu.html", "40-create-menu-desktop.png", D],
  ["create-menu.html", "40-create-menu-phone.png", PH],
  ["create-empty.html", "41-new-set-empty-desktop.png", D],
  ["create-empty.html", "41-new-set-empty-phone.png", PH],
  ["create-five.html", "42-new-set-five-desktop.png", D],
  ["create-five.html", "42-new-set-five-phone.png", PH],
  ["create-five-everyone.html", "42b-new-set-everyone-desktop.png", D],
  ["create-five-note.html", "42b-new-set-everyone-phone.png", PH],
  ["create-sheet.html", "43-add-sheet-phone.png", PH],
  ["create-sheet-everyone.html", "43b-add-sheet-everyone-phone.png", PH],
  ["create-publish.html", "44-publish-desktop.png", D],
  ["create-publish.html", "44-publish-phone.png", PH],
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
  await page.goto(`file://${dir}contact-40.html`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("main").screenshot({ path: `${dir}40-contact-sheet.png` });
  console.log("wrote 40-contact-sheet.png");
}
await browser.close();
