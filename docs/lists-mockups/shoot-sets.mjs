// Screenshots of the sets mockups (make-sets.mjs), then the overview (index.html) as one sheet.
// Run from the repo root: node docs/lists-mockups/shoot-sets.mjs
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const D = { width: 1280, height: 860 }, PH = { width: 390, height: 844, phone: true };
const shots = [
  ["add-to-set.html", "10-add-to-set-desktop.png", D],
  ["add-to-set.html", "10-add-to-set-phone.png", PH],
  ["make-from-search.html", "11-make-set-from-search-desktop.png", D],
  ["set-editor.html", "12-set-editor-rows-desktop.png", { ...D, full: true }],
  ["set-editor-add.html", "12b-set-editor-add-desktop.png", D],
  ["set-editor-board.html", "12c-set-editor-board-desktop.png", { ...D, full: true }],
  ["set-editor-phone.html", "12d-set-editor-phone.png", { ...PH, height: 1400 }],
  ["set-page.html", "13-set-page-desktop.png", { ...D, full: true }],
  ["set-page.html", "13-set-page-phone.png", { ...PH, full: true }],
  ["set-week.html", "14-week-open-set-desktop.png", { ...D, full: true }],
  ["set-week.html", "14-week-open-set-phone.png", { ...PH, full: true }],
];
[1, 2, 3, 4].forEach((v, i) => { for (const k of ["set", "search"]) { shots.push([`v${v}-${k}.html`, `2${i}-v${v}-${k}-desktop.png`, D]); shots.push([`v${v}-${k}.html`, `2${i}-v${v}-${k}-phone.png`, PH]); } });
for (const k of ["set", "search"]) for (const sz of ["desktop", "phone"]) {
  shots.push([`v2r-${k}.html`, `30-v2-${k}-${sz}.png`, sz === "phone" ? PH : D]);
  shots.push([`v2r-${k}-stack.html`, `31-v2-${k}-stack-${sz}.png`, sz === "phone" ? PH : D]);
}
for (const n of ["a", "b"]) for (const sz of ["desktop", "phone"]) shots.push([`v2r-set-note-${n}.html`, `32-v2-note-${n}-${sz}.png`, sz === "phone" ? PH : D]);
const only = process.argv[2];
const browser = await chromium.launch();
for (const [file, out, s] of shots) {
  if (only && !out.includes(only)) continue;
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
if (!only || only === "24") {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, colorScheme: "dark" });
  await page.goto(`file://${dir}index.html`);
  await page.waitForLoadState("networkidle");
  const table = page.locator("table.contact");
  await table.screenshot({ path: `${dir}24-variants-contact-sheet.png` });
  console.log("wrote 24-variants-contact-sheet.png");
}
if (!only || only === "3") {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, colorScheme: "dark" });
  await page.goto(`file://${dir}contact-30.html`);
  await page.waitForLoadState("networkidle");
  await page.locator("main").screenshot({ path: `${dir}30-contact-sheet.png` });
  console.log("wrote 30-contact-sheet.png");
}
await browser.close();
