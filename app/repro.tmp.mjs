import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
const sql = (c) => execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", c], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const stamp = Date.now().toString(36), handle = "repro" + stamp, email = handle + "@example.test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, baseURL: "http://localhost:5173" });
await ctx.request.post("/api/auth/sign-up/email", { data: { email, password: "pw-" + stamp + "-local", name: "Repro", handle }, headers: { origin: "http://localhost:5173" } });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
page.on("pageerror", (e) => console.log("pageerror:", e.message));
try {
  for (const start of ["/explore", "/", `/${handle}`, "/settings"]) {
    await page.goto(start); await page.waitForTimeout(700);
    await page.locator(".sidenav").getByRole("button", { name: "More" }).click();
    await page.locator(".more-menu").getByRole("menuitem", { name: "Puzzle types" }).click();
    await page.waitForTimeout(1200);
    console.log(start, "->", new URL(page.url()).pathname, await page.locator("h1").first().textContent());
  }
} finally {
  const id = JSON.parse(sql("select id from creators where email = '" + email + "'")).at(-1).results[0].id;
  sql("delete from memberships where creator_id = '" + id + "'; delete from collections where personal_of = '" + id + "'; delete from sessions where user_id = '" + id + "'; delete from accounts where user_id = '" + id + "'; delete from creators where id = '" + id + "'");
  await b.close();
}
