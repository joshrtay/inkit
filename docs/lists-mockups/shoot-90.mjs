// Screenshots of the 90- mockups (make-90.mjs): each set cover in a row of cards, A and C on a phone,
// A in the feed, then the contact sheet (contact-90.html).
// Run from the repo root: node docs/lists-mockups/shoot-90.mjs [filter]
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const D = { width: 1280, height: 860, clip: 590 }, PH = { width: 390, height: 844, phone: true, y: 150 };
const shots = [
  ...["a", "b", "c", "d", "e", "f"].map((v) => [`f90-${v}.html`, `90-${v}-desktop.png`, D]),
  ["f90-a.html", "90-a-phone.png", PH],
  ["f90-c.html", "90-c-phone.png", PH],
  ["f90-feed-a.html", "90-a-feed-desktop.png", { width: 1280, height: 860, clip: 640 }],
];
const only = process.argv[2];
const browser = await chromium.launch();
for (const [file, out, s] of shots) {
  if (only && !out.includes(only)) continue;
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.phone ? 2 : 1, isMobile: !!s.phone, hasTouch: !!s.phone, colorScheme: "dark" });
  await page.goto(`file://${dir}${file}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  if (s.y) await page.evaluate((y) => window.scrollTo(0, y), s.y);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}${out}`, ...(s.clip ? { clip: { x: 0, y: 0, width: s.width, height: s.clip } } : {}) });
  console.log("wrote", out);
  await page.close();
}
if (!only || only === "contact") {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, colorScheme: "dark" });
  await page.goto(`file://${dir}contact-90.html`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.locator("main").screenshot({ path: `${dir}90-contact-sheet.png` });
  console.log("wrote 90-contact-sheet.png");
}
await browser.close();
