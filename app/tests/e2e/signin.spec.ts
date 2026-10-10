// Signed out (components/Shell.tsx, SignInDialog.tsx): "/" is Explore, and the nav keeps
// Subscriptions, Profile and Create in their places; each opens the sign-in dialog, which signs in
// and goes on to where the button was going, or sends you to make an account.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { q, RUN_FILE, sql, type Run } from "./db";

test.use({ storageState: { cookies: [], origins: [] } });   // signed out
const run = () => JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;

// SIGNIN_SHOTS=<folder> saves the nav, the dialog (desktop and phone) and "/"
const shot = async (page: Page, name: string) => {
  if (process.env.SIGNIN_SHOTS) await page.screenshot({ path: `${process.env.SIGNIN_SHOTS}/${name}.png` });
};

const nav = (page: Page) => page.locator(".sidenav");
const dialog = (page: Page) => page.getByRole("dialog");

test("signed out, / is Explore, canonical at /", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Explore" })).toBeVisible();
  await expect(page.locator("#today")).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");
  await shot(page, "home-signed-out");
  const html = await (await request.get("/")).text();
  expect(html).toContain('<link rel="canonical" href="https://inkit.games/"/>');
  expect(html).toContain('"@type":"WebSite"');
  expect(html).toContain('"@type":"CollectionPage"');
  // /explore is the same page, so it names "/" as canonical too; the sitemap lists only "/"
  expect(await (await request.get("/explore")).text()).toContain('<link rel="canonical" href="https://inkit.games/"/>');
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("<loc>https://inkit.games/</loc>");
  expect(xml).not.toContain("<loc>https://inkit.games/explore</loc>");
});

test("the nav keeps Subscriptions, Profile and Create; each opens the sign-in dialog", async ({ page }) => {
  await page.goto("/puzzles");
  for (const name of ["Subscriptions", "Explore", "Profile", "Create", "Puzzle types", "Sign in"]) await expect(nav(page).getByRole(name === "Explore" || name === "Puzzle types" ? "link" : "button", { name, exact: true })).toBeVisible();
  await expect(page.getByText("Start creating")).toHaveCount(0);
  await shot(page, "nav-signed-out");

  for (const [name, title] of [["Subscriptions", "Sign in to see your subscriptions"], ["Profile", "Sign in to see your profile"], ["Create", "Sign in to create"]]) {
    const button = nav(page).getByRole("button", { name, exact: true });
    await button.click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole("heading", { name: title })).toBeVisible();
    await expect(dialog(page).getByLabel("Email")).toBeFocused();
    if (name === "Create") await shot(page, "dialog-desktop");
    // Tab stays inside it
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(await dialog(page).evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    // Escape closes it, and focus goes back to the button
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(button).toBeFocused();
  }
  // a click outside closes it too
  await nav(page).getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/puzzles$/);
});

for (const [name, where] of [["Create", "/new"], ["Subscriptions", "/"], ["Profile", "profile"]] as const) {
  test(`signing in from ${name} goes to ${where}`, async ({ page }) => {
    const { email, password, userId } = run();
    const [{ handle }] = sql<{ handle: string }>(`select handle from creators where id = ${q(userId)}`);
    await page.goto("/puzzles");
    await nav(page).getByRole("button", { name, exact: true }).click();
    await dialog(page).getByLabel("Email").fill(email);
    await dialog(page).getByLabel("Password").fill(password);
    await dialog(page).getByRole("button", { name: "Sign in" }).click();
    const path = where === "profile" ? `/${handle}` : where;
    await expect(page).toHaveURL((u) => u.pathname === path, { timeout: 15_000 });
    // signed in now: the nav's Profile is a link to the profile
    await expect(nav(page).getByRole("link", { name: "Profile" })).toHaveAttribute("href", `/${handle}`);
    if (where === "/") await expect(page.getByRole("heading", { name: "Subscriptions" })).toBeAttached();
  });
}

test("a wrong password says so and stays in the dialog", async ({ page }) => {
  await page.goto("/");
  await nav(page).getByRole("button", { name: "Sign in", exact: true }).click();
  await dialog(page).getByLabel("Email").fill(run().email);
  await dialog(page).getByLabel("Password").fill("not the password");
  await dialog(page).getByRole("button", { name: "Sign in" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("That email and password don't match.");
  await expect(page).toHaveURL((u) => u.pathname === "/");
});

test("Create an account goes to the sign-up page, carrying on to Create", async ({ page }) => {
  await page.goto("/");
  await nav(page).getByRole("button", { name: "Create", exact: true }).click();
  await dialog(page).getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/signup\?next=%2Fnew$/);
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Start creating" })).toBeVisible();
});

test("/account: your profile, or sign in first", async ({ request }) => {
  const res = await request.get("/account", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toBe("/signin?next=/account");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the tab bar's Feed, Create and Profile open the dialog, a sheet at the foot", async ({ page }) => {
    await page.goto("/");
    const tabs = page.locator(".tabbar");
    await expect(tabs.getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");
    for (const [name, title] of [["Feed", "Sign in to see your subscriptions"], ["Profile", "Sign in to see your profile"], ["Create", "Sign in to create"]]) {
      await tabs.getByRole("button", { name, exact: true }).click();
      await expect(dialog(page).getByRole("heading", { name: title })).toBeVisible();
      const box = (await dialog(page).boundingBox())!;
      expect(box.width).toBeGreaterThan(350);
      if (name === "Create") await shot(page, "dialog-phone");
      await dialog(page).getByRole("button", { name: "Close" }).click();
      await expect(dialog(page)).toHaveCount(0);
    }
  });
});
