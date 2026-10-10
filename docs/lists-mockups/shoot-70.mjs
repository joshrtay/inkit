// Screenshots of the 70- mockups (make-70.mjs), then the contact sheet (contact-70.html), in flow order.
// Run from the repo root: node docs/lists-mockups/shoot-70.mjs [filter]
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const D = { width: 1280, height: 860 }, W = { width: 1440, height: 900 }, N = { width: 1100, height: 820 }, PH = { width: 390, height: 844, phone: true };
const shots = [
  ["f70-header.html", "70-header-desktop.png", D],
  ["f70-header.html", "70-header-phone.png", PH],
  ["f70-first.html", "70b-first-desktop.png", D],
  ["f70-first.html", "70b-first-phone.png", PH],
  ["f70-menu.html", "71-menu-desktop.png", D],
  ["f70-menu-owner.html", "71-menu-owner-desktop.png", D],
  ["f70-list.html", "71b-list-desktop.png", D],
  ["f70-drawer-in.html", "72-drawer-in-desktop.png", D],
  ["f70-drawer-add.html", "72-drawer-add-desktop.png", D],
  ["f70-drawer-added.html", "72b-drawer-added-desktop.png", D],
  ["f70-explore.html", "73-explore-desktop.png", D],
  ["f70-explore-closed.html", "73-explore-closed-desktop.png", D],
  ["f70-profile-slate.html", "73b-profile-slate-desktop.png", D],
  ["f70-feed.html", "73c-feed-desktop.png", D],
  ["f70-rules.html", "74-rules-desktop.png", D],
  ["f70-set-page.html", "75-set-page-desktop.png", D],
  ["f70-set-page-edit.html", "75-set-page-edit-desktop.png", D],
  ["f70-profile.html", "75b-profile-desktop.png", D],
  ["f70-phone-menu.html", "76-menu-phone.png", PH],
  ["f70-phone-list.html", "76b-list-phone.png", PH],
  ["f70-phone-toast.html", "76c-toast-phone.png", PH],
  ["f70-phone-sheet.html", "76d-sheet-phone.png", PH],
  ["f70-phone-sheet-add.html", "76e-sheet-add-phone.png", PH],
  ["f70-phone-explore.html", "76f-explore-phone.png", PH],
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
  await page.goto(`file://${dir}contact-70.html`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("main").screenshot({ path: `${dir}70-contact-sheet.png` });
  console.log("wrote 70-contact-sheet.png");
}
await browser.close();
