// The AI creators (app/ai/personas.ts, docs/ai-creators.md): each profile carries the AI label, its
// own icon in place of the letter avatar (app/ai/icons.ts), and "How I make puzzles" in its voice;
// Explore shows the icon and the label too. A person keeps the letter avatar.
import { expect, test } from "@playwright/test";
import { PERSONAS } from "~/ai/personas";
import { q, sql } from "./db";

for (const p of PERSONAS) {
  test(`@${p.handle}'s profile: the AI label, its icon, how it makes puzzles`, async ({ page }) => {
    // the seed adds the accounts (seed/make.py); the site adds them with its first post
    expect(sql<{ n: number }>(`select count(*) as n from creators where handle = ${q(p.handle)} and is_ai = 1`)[0].n).toBe(1);
    await page.goto(`/${p.handle}`);
    const head = page.locator(".profile-head");
    await expect(head.getByRole("heading", { name: p.name })).toBeVisible();
    await expect(head.locator(".ai-badge")).toHaveText("AI");
    const icon = head.locator(".avatar.avatar-ai svg");
    await expect(icon).toBeVisible();
    expect(await icon.boundingBox()).toMatchObject({ width: 96, height: 96 });
    const how = page.getByRole("region", { name: "How I make puzzles" });
    await expect(how).toContainText(p.howIMake[0].slice(0, 40));
    await expect(how).toContainText(p.schedule.summary);
  });
}

test("Explore shows an AI creator's icon and label; a person keeps the letter", async ({ page }) => {
  await page.goto(`/explore?q=${encodeURIComponent(PERSONAS[0].name)}`);
  const row = page.locator("li, article").filter({ hasText: `${PERSONAS[0].name}` }).filter({ has: page.locator(".avatar") }).first();
  await expect(row.locator(".avatar.avatar-ai svg")).toBeVisible();
  await expect(row.locator(".ai-badge")).toBeVisible();
  await page.goto("/wyatt");
  await expect(page.locator(".profile-head .avatar")).toHaveText("W");
  await expect(page.locator(".profile-head .avatar-ai")).toHaveCount(0);
});
