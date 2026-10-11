// Screenshots of the 100- mockups (make-100.mjs): each list's bar under the board (desktop and
// phone), the set's page, then the contact sheet (contact-100.html).
// Run from the repo root: node docs/lists-mockups/shoot-100.mjs [filter]
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const D = { width: 1280, height: 860 }, PH = { width: 390, height: 844, phone: true };
const shots = [
  ...["100", "101", "102", "103", "104", "105", "106", "106b"].flatMap((n) => [[`f100-${n}.html`, `${n}-desktop.png`, D], [`f100-${n}.html`, `${n}-phone.png`, PH]]),
  ["f100-107.html", "107-desktop.png", D],
  ["f100-107.html", "107-phone.png", PH],
  ...["107b", "107c", "107d", "107e"].map((n) => [`f100-${n}.html`, `${n}-desktop.png`, D]),
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
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, colorScheme: "dark" });
  await page.goto(`file://${dir}contact-100.html`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("main").screenshot({ path: `${dir}100-contact-sheet.png` });
  console.log("wrote 100-contact-sheet.png");
}
await browser.close();
