// Screenshots of the Explore mockups (make.ts). Run from the repo root: node docs/explore-mockups/shoot.mjs
import { chromium } from "playwright";
const dir = new URL(".", import.meta.url).pathname;
const shots = [
  { file: "explore.html", out: "01-explore-desktop.png", width: 1440, height: 900, full: true },
  { file: "explore.html", out: "02-explore-phone.png", width: 390, height: 844, phone: true },
  { file: "explore.html", out: "02b-explore-phone-creators.png", width: 390, height: 844, phone: true, scrollTo: "#creators" },
  { file: "type-masyu.html", out: "03-type-masyu.png", width: 1440, height: 900, full: true },
  { file: "creator-cards.html", out: "04-creator-cards.png", width: 1200, height: 900, full: true, scale: 2 },
  { file: "search.html", out: "05-search.png", width: 1440, height: 900, full: true },
];
const browser = await chromium.launch();
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.scale ?? (s.phone ? 3 : 1), isMobile: !!s.phone, hasTouch: !!s.phone, colorScheme: "dark" });
  await page.goto(`file://${dir}${s.file}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  if (s.scrollTo) await page.evaluate((sel) => { const el = document.querySelector(sel); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12); }, s.scrollTo);
  // a full-page shot: grow the window to the page, so the fixed paper and the sticky nav reach the bottom
  if (s.full) await page.setViewportSize({ width: s.width, height: await page.evaluate(() => document.documentElement.scrollHeight) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}${s.out}`, fullPage: false });
  console.log("wrote", s.out);
  await page.close();
}
await browser.close();
