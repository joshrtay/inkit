// Something happens the moment you click (components/NavProgress.tsx), pages switch before their
// slower parts are in (components/Later.tsx: skeletons, then the content), a link's page loads
// ahead on intent and once (components/Link.tsx, lib/prefetch.ts), and every response says how long
// it took (lib/timing.server.ts). The local site's database answers at once, so these tests slow
// it down for their own requests (the x-db-delay header, development only).
import { expect, test } from "@playwright/test";

// signed out, as most visitors are
test.use({ storageState: { cookies: [], origins: [] } });

test("a click shows the progress line at once, and marks what was clicked", async ({ page }) => {
  await page.goto("/puzzles");
  await page.setExtraHTTPHeaders({ "x-db-delay": "800" });
  const link = page.locator(".sidenav a.nav-item[href='/']");
  const clicked = Date.now();
  await link.click();
  // the line shows within a fifth of a second, long before the page
  await expect(page.locator(".nav-progress[data-state='loading']")).toBeVisible({ timeout: 400 });
  expect(Date.now() - clicked).toBeLessThan(600);
  await expect(link).toHaveAttribute("data-pending", "");
  await expect(page).toHaveURL((u) => u.pathname === "/", { timeout: 15_000 });
  // done: the line goes, and so does the mark
  await expect(page.locator(".nav-progress")).toHaveAttribute("data-state", "idle", { timeout: 3_000 });
  await expect(link).not.toHaveAttribute("data-pending");
});

test("a quick page doesn't flash the line", async ({ page }) => {
  await page.goto("/puzzles");
  // (hovered first, so its page's code and data are in before the click, as they usually are)
  const card = page.locator("a.guide-card").first();
  await card.hover();
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const bar = document.querySelector(".nav-progress")!;
    new MutationObserver(() => { if (bar.getAttribute("data-state") === "loading") (window as { seenLine?: boolean }).seenLine = true; }).observe(bar, { attributes: true });
  });
  await card.click();
  await page.waitForTimeout(500);
  const seen = await page.evaluate(() => !!(window as { seenLine?: boolean }).seenLine);
  await expect(page).toHaveURL(/\/puzzles\/[a-z-]+$/);
  expect(seen).toBe(false);
});

test("Explore switches with Today, then fills in the other shelves", async ({ page }) => {
  await page.goto("/puzzles");
  await page.setExtraHTTPHeaders({ "x-db-delay": "700" });
  await page.locator(".sidenav a.nav-item[href='/']").click();
  await expect(page).toHaveURL((u) => u.pathname === "/", { timeout: 15_000 });
  await expect(page.locator("#today")).toBeVisible();
  await expect(page.locator(".skel-shelf").first()).toBeVisible();
  await expect(page.locator("#quick")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".skel-shelf")).toHaveCount(0);
});

test("a puzzle's page switches before its likes and list bar, and has no Drawn by", async ({ page }) => {
  await page.goto("/explore/akari");
  await page.setExtraHTTPHeaders({ "x-db-delay": "700" });
  await page.locator(".x-cards a[href^='/g/']").first().click();
  await expect(page).toHaveURL(/\/g\/[^/?]+\?in=akari/, { timeout: 15_000 });
  await expect(page.locator(".sheet svg.board")).toBeVisible();
  // still on their way: the heart and the list bar keep their places
  await expect(page.locator(".skel-like")).toBeVisible();
  await expect(page.locator(".skel-list-bar")).toBeVisible();
  // then in
  await expect(page.locator(".like-btn:not(.skel-like)")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".list-bar:not(.skel-list-bar)")).toBeVisible();
  await expect(page.locator(".skel")).toHaveCount(0);
  await expect(page.getByText("Drawn by")).toHaveCount(0);
});

test("a page loaded fresh still has everything, and its timing", async ({ page, request }) => {
  const res = await request.get("/g/akari-1");
  expect(res.headers()["server-timing"]).toMatch(/db;dur=[\d.]+.*auth;dur=[\d.]+.*total;dur=[\d.]+/);
  await page.goto("/g/akari-1");
  await expect(page.locator(".like-btn:not(.skel-like)")).toBeVisible();
  await expect(page.locator(".game-actions .skel, .skel-like")).toHaveCount(0);
});

test("a link's page loads ahead on hover, and the click uses it", async ({ page }) => {
  await page.goto("/wyatt");
  const link = page.locator(".cards a[href^='/g/']").first();
  const href = await link.getAttribute("href");
  const loads: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes(`${href!.split("?")[0]}.data`)) loads.push((await r.headerValue("server-timing")) ?? "");
  });
  await link.hover();
  await expect.poll(() => loads.length).toBe(1);
  await link.click();
  await expect(page).toHaveURL(new RegExp(href!.split("?")[0]));
  await expect(page.locator(".sheet svg.board")).toBeVisible();
  // the click's data is the prefetched response itself (the same Server-Timing), not a second load
  await expect.poll(() => loads.length).toBe(2);
  expect(loads[1]).toBe(loads[0]);
});
