// Playing through a list (lib/list-context.ts, lib/list-play.server.ts): a puzzle opened from a
// type's page, a profile or a search carries its list, and the bar under the board names it and
// steps through it in the page's own order; a puzzle opened on its own has no bar.
import { expect, test, type Page } from "@playwright/test";

const cardLinks = (page: Page) => page.locator("a.game-card").evaluateAll((as) => as.map((a) => a.getAttribute("href")!).filter((h) => h.includes("?")));

test("a type's page: the bar names it and steps through it in its order", async ({ page }) => {
  await page.goto("/explore/akari?level=1");
  const links = await cardLinks(page);
  expect(links.length).toBeGreaterThan(2);
  expect(links[0]).toMatch(/\?in=akari&level=1$/);
  await page.goto(links[1]);
  const bar = page.getByRole("navigation", { name: "This list" });
  await expect(bar).toContainText("Akari · Easy · Newest");
  await expect(bar.getByRole("link", { name: "Previous puzzle" })).toHaveAttribute("href", links[0]);
  await expect(bar.getByRole("link", { name: "Next puzzle" })).toHaveAttribute("href", links[2]);
  await expect(bar.getByRole("link", { name: /Akari · Easy/ })).toHaveAttribute("href", "/explore/akari?level=1");
  // the first has nothing before it
  await page.goto(links[0]);
  await expect(bar.getByRole("link", { name: "Previous puzzle" })).toHaveCount(0);
  // the address search engines keep is the puzzle's own
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/g\/[^?]+$/);
});

test("a profile and a search name themselves; a puzzle on its own has no bar", async ({ page }) => {
  await page.goto("/wyatt");
  const links = await cardLinks(page);
  await page.goto(links[1]);
  const bar = page.getByRole("navigation", { name: "This list" });
  await expect(bar).toContainText("Wyatt");
  await expect(bar.getByRole("link", { name: "Next puzzle" })).toHaveAttribute("href", links[2]);

  await page.goto("/explore?q=sudoku");
  const found = await cardLinks(page);
  expect(found[0]).toContain("in=all&q=sudoku");
  await page.goto(found[0]);
  await expect(bar).toContainText("Search: sudoku");

  await page.goto(found[0].split("?")[0]);
  await expect(page.locator(".sheet svg.board")).toBeVisible();
  await expect(bar).toHaveCount(0);
});
