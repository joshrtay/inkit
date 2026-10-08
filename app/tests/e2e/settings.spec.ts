// The nav's More menu and your settings: profile, handle and appearance (email and password changes
// are Better Auth's, and send email, so they're left to it).
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { q, RUN_FILE, sql, type Run } from "./db";

const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;

test("More: settings, puzzle types, sign out, and the small print", async ({ page }) => {
  await page.goto("/explore");
  await page.locator(".sidenav").getByRole("button", { name: "More" }).click();
  const menu = page.locator(".more-menu");
  await expect(menu.getByRole("menuitem")).toHaveText(["Settings", "Puzzle types", "Sign out"]);
  await expect(menu.locator(".menu-legal a")).toHaveText(["Privacy", "Terms"]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await page.locator(".sidenav").getByRole("button", { name: "More" }).click();
  await menu.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("profile: name and bio", async ({ page }) => {
  await page.goto("/settings");
  await page.locator(".setting", { hasText: "Profile" }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("Settings tests");
  await page.getByLabel("Bio").fill("I test settings.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  expect(sql<{ name: string }>(`select name from creators where id = ${q(run.userId)}`)[0].name).toBe("Settings tests");
  expect(sql(`select title, description from collections where id = ${q(run.collectionId)}`)[0]).toEqual({ title: "Settings tests", description: "I test settings." });
});

test("handle: taken ones are refused; a free one moves the profile", async ({ page }) => {
  await page.goto("/settings");
  const row = page.locator(".setting", { hasText: "Handle" });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Handle").fill("wyatt");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(row.getByRole("alert")).toHaveText("That handle is taken.");
  const moved = `${run.handle}x`;
  await page.getByLabel("Handle").fill(moved);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText(`@${moved}`);
  await page.goto(`/${moved}`);
  await expect(page.locator(".profile-head")).toContainText(`@${moved}`);
  // and back, for the other tests
  await page.goto("/settings");
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Handle").fill(run.handle);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText(`@${run.handle}`);
});

test("appearance: light, dark, auto", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Auto" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
