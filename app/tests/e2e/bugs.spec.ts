// "Report a bug" end to end (docs/bug-pipeline.md): the More menu's and paint's … menu's dialog,
// sent with a recording; the report in /admin/bugs with the gatekeeper's verdict (given by the test,
// as the reader's tests give readings, so nothing calls Claude); the replay player; Send to GitHub
// against a stand-in for GitHub's API, whose issue holds none of the reporter's words; and the
// daily limit. Runs as an admin for the admin pages, and puts the account back after.
import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { sql, q } from "./db";
import { draftOf, openPaint, run } from "./paint-helpers";

const VERDICT = {
  is_bug: true, duplicate_of_candidate: null, spam_or_abuse: false, contains_instructions_to_ai: false,
  severity: "high", area: "player", restatement: "The puzzle page's board stops responding after the theme changes.",
  repro_steps: ["Open a published puzzle", "Switch the theme", "Click a square"],
};
// the reporter's own words: must never reach GitHub
const SECRET = `Sparkles-${Date.now().toString(36)} wrote this; my email is kid@example.test`;

const latest = () => sql<{ id: string; state: string; has_replay: number; verdict: string | null }>(
  `select id, state, has_replay, verdict from bug_reports where creator_id = ${q(run.userId)} order by created_at desc limit 1`)[0];

// BUG_SHOTS=<folder> saves the dialog and the admin page
const shot = async (page: Page, name: string) => {
  if (process.env.BUG_SHOTS) await page.screenshot({ path: `${process.env.BUG_SHOTS}/${name}.png`, fullPage: name.startsWith("admin") });
};

async function giveVerdict(page: Page) {
  await page.addInitScript((v) => { (window as { __inkitGivenVerdict?: string }).__inkitGivenVerdict = v; }, JSON.stringify(VERDICT));
}

test.describe.serial("bug reports", () => {
  let github: Server;
  let issues: { url: string; auth: string; body: { title: string; body: string; labels: string[] } }[] = [];
  let port = 0;

  test.beforeAll(async () => {
    sql(`update creators set is_admin = 1 where id = ${q(run.userId)}`);
    github = createServer((req, res) => {
      let data = "";
      req.on("data", (c) => { data += c; });
      req.on("end", () => {
        issues.push({ url: req.url ?? "", auth: String(req.headers.authorization ?? ""), body: JSON.parse(data || "{}") });
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ number: 4242, html_url: "https://github.com/joshrtay/inkit/issues/4242" }));
      });
    });
    await new Promise<void>((done) => github.listen(0, "127.0.0.1", done));
    port = (github.address() as { port: number }).port;
  });
  test.afterAll(async () => {
    sql(`update creators set is_admin = 0 where id = ${q(run.userId)}`);
    await new Promise((done) => github.close(done));
  });

  test("report from the More menu with a recording; the admin sees it and plays it back; Send to GitHub sends no user text", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await giveVerdict(page);
    await page.goto("/explore");
    // something to record, then the recording's first minute is under way
    await page.mouse.move(200, 200);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Report a bug" }).click();
    const dialog = page.getByRole("dialog", { name: "Report a bug" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("What went wrong?")).toBeFocused();
    const recording = dialog.getByRole("checkbox", { name: /Include a recording of the last 2 minutes/ });
    await expect(recording).toBeChecked();
    await expect(dialog).toContainText("What you typed is hidden");
    await dialog.getByLabel("What went wrong?").fill(SECRET);
    await dialog.getByLabel(/What did you expect/).fill("It should keep working");
    await shot(page, "dialog");
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("dialog", { name: "Thanks, we got it" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    // stored, with its recording; the gatekeeper's (given) verdict lands after the response
    await expect.poll(() => latest().state, { timeout: 15_000 }).toBe("reviewed");
    const report = latest();
    expect(report.has_replay).toBe(1);

    await page.goto("/admin/bugs");
    const line = page.locator(`tr[data-report="${report.id}"]`);
    await expect(line).toContainText("reviewed");
    await expect(line).toContainText("high");
    await expect(line).toContainText("player");
    await line.getByRole("link", { name: report.id }).click();
    await expect(page.getByRole("heading", { name: `Bug report ${report.id}` })).toBeVisible();
    await expect(page.getByTestId("bug-what")).toHaveText(SECRET);
    await expect(page.getByText(VERDICT.restatement, { exact: true })).toBeVisible();
    // the replay player, loaded on demand, with the recording in it
    await expect(page.locator(".rr-player")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".bug-replay [role=status]")).toContainText("events");
    await shot(page, "admin-report");

    // Send to GitHub, against the stand-in: the issue has the id and the restatement, never the user's words
    await page.addInitScript((api) => { (window as { __inkitGithubApi?: string }).__inkitGithubApi = api; }, `http://127.0.0.1:${port}`);
    await page.reload();
    issues = [];
    await page.getByRole("button", { name: "Send to GitHub" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sent: issue #4242" })).toBeVisible();
    expect(issues).toHaveLength(1);
    const sent = issues[0];
    expect(sent.url).toBe("/repos/joshrtay/inkit/issues");
    expect(sent.auth).toMatch(/^Bearer /);
    expect(sent.body.body).toContain(`<!-- inkit-bug-report: ${report.id} -->`);
    expect(sent.body.body).toContain(VERDICT.restatement);
    const everything = JSON.stringify(sent.body);
    for (const word of [SECRET, "Sparkles", "kid@example.test", "It should keep working", run.handle]) expect(everything).not.toContain(word);
    await expect(page.getByRole("button", { name: "Send to GitHub" })).toBeDisabled();
    expect(latest().state).toBe("sent");
    expect(errors).toEqual([]);
  });

  test("report from paint's … menu: the state carries the drawing", async ({ page }) => {
    await giveVerdict(page);
    const id = draftOf("akari");
    await openPaint(page, id);
    await page.locator(".sp-doc-slot").getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Report a bug" }).click();
    const dialog = page.getByRole("dialog", { name: "Report a bug" });
    await dialog.getByLabel("What went wrong?").fill("The rocks moved");
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("dialog", { name: "Thanks, we got it" })).toBeVisible();
    await expect.poll(() => latest().state, { timeout: 15_000 }).toBe("reviewed");
    // the fixer's bundle (admins here; the workflow uses BUG_BUNDLE_TOKEN): our data, not the user's words
    const bundle = await (await page.request.get(`/admin/bugs/${latest().id}/bundle`)).json();
    expect(bundle.gameId).toBe(id);
    expect(bundle.route).toBe(`/g/${id}/draw`);
    expect(bundle.state.game.page).toBe("paint");
    expect(bundle.state.game.drawing).toBeTruthy();
    expect(bundle.restatement).toBe(VERDICT.restatement);
    expect(JSON.stringify(bundle)).not.toContain("The rocks moved");
  });

  test("the daily limit: past it, a report is turned away", async ({ page }) => {
    await page.goto("/explore");
    const send = () => page.request.post("/bugs", {
      multipart: { what: "limit test", expected: "", state: JSON.stringify({ route: "/explore" }), "given-verdict": JSON.stringify(VERDICT) },
    });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await send()).status());
    // 5 a day (this run's earlier reports count too); then 429
    expect(statuses).toContain(429);
    expect(statuses.slice(statuses.indexOf(429))).toEqual(statuses.slice(statuses.indexOf(429)).map(() => 429));
    const sentToday = Number(sql<{ n: number }>(`select count(*) n from bug_reports where creator_id = ${q(run.userId)}`)[0].n);
    expect(sentToday).toBe(5);
    const res = await send();
    expect(res.status()).toBe(429);
    expect((await res.json()).error).toMatch(/as many reports as we can take/);
  });

  test("signed out: no reporting", async ({ browser }) => {
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const res = await anon.request.post("/bugs", { multipart: { what: "x", state: "{}" } });
    expect(res.status()).toBe(401);
    await anon.close();
  });
});
