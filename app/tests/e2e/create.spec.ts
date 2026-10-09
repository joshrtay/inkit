// Making a puzzle from the start (/new) to its game page (docs/creation-flow.md §1): a blank page
// drawn in paint, typed, then played and published on its publish page (/g/<id>/publish); a photo
// read (with a reading the test gives, so Claude is never called: games.server.ts takes it only in
// development) and drawn in ink with its doubts; and "What type is this?" on a drawing, without AI.
// CREATE_SHOTS=<folder> also saves a screenshot of each main state there.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { q, RUN_FILE, sql, type Run } from "./db";

const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
const PAGE = 560;   // the sketchpad's page, in its own units (sketchpad/model.ts)
const shot = async (page: Page, name: string) => {
  if (process.env.CREATE_SHOTS) await page.screenshot({ path: `${process.env.CREATE_SHOTS}/${name}.png` });
};

async function at(page: Page, x: number, y: number) {
  const box = (await page.locator(".sp-board").boundingBox())!;
  return { x: box.x + (x / PAGE) * box.width, y: box.y + (y / PAGE) * box.height };
}
async function tap(page: Page, x: number, y: number) { const p = await at(page, x, y); await page.mouse.click(p.x, p.y); }
async function drag(page: Page, [x0, y0]: [number, number], [x1, y1]: [number, number]) {
  const a = await at(page, x0, y0), b = await at(page, x1, y1);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
}
const tool = (page: Page, name: string) => page.locator(".sp-tools").getByRole("button", { name, exact: true }).click();
/** The middle of square (r, c) of a grid of 48-unit squares at (60, 60). */
const sq = (r: number, c: number): [number, number] => [60 + 48 * c + 24, 60 + 48 * r + 24];
async function write(page: Page, r: number, c: number, text: string) {
  await tap(page, ...sq(r, c));
  const box = page.locator(".sp-typing");
  await expect(box).toBeFocused();
  await box.fill(text);
  await box.press("Enter");
}
/** The smallest Akari: a 3 × 3 grid with a shaded 4 in the middle (a light on each side of it). */
async function drawAkari(page: Page) {
  await drag(page, [60, 60], [204, 204]);
  await expect(page.locator(".sp-board")).toHaveAttribute("data-grid", "3x3");
  await tool(page, "Stamp");
  await page.getByRole("button", { name: "Shaded square", exact: true }).click();
  await tap(page, ...sq(1, 1));
  await tool(page, "Text");
  await write(page, 1, 1, "4");
}
/** The Check button, which shows the verdict (docs/creation-flow.md, "v3 layout"). */
const chip = (page: Page) => page.locator(".paint-verdict-btn");
/** Type ▾ opens the drawer at Types; a type from its list. */
async function chooseType(page: Page, name: RegExp) {
  await page.locator(".paint-type").click();
  await page.locator(".paint-type-list").getByRole("button", { name }).first().click();
  await expect(page.getByRole("tab", { name: "This puzzle" })).toHaveAttribute("aria-selected", "true");
}
const idOf = (page: Page) => /\/g\/([^/]+)\//.exec(page.url())![1];
const row = (id: string) => sql<{ state: string; kind: string; title: string; description: string; sketch: string; drawing: string | null; sketch_image: string | null }>(
  `select state, kind, title, description, sketch, drawing, sketch_image from games where id = ${q(id)}`)[0];

test("blank → an Akari drawn and typed → its publish page → played → published, for everyone", async ({ page, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/new");
  await expect(page.getByRole("heading", { name: "Start from a sketch" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start blank" })).toBeVisible();
  await page.getByRole("button", { name: "Open an empty page" }).click();
  await expect(page).toHaveURL(/\/g\/[^/]+\/draw$/);
  const id = idOf(page);
  expect(row(id)).toMatchObject({ state: "draft", kind: "", sketch: "", drawing: null });

  // a draft with no type yet shows as one: in /new's drafts and the profile's Drafts tab
  await page.goto("/new");
  await expect(page.locator(`a[href="/g/${id}/draw"]`)).toContainText("No type yet");
  await shot(page, "01-start");
  await page.goto(`/${run.handle}?tab=drafts`);
  await expect(page.locator(`a[href="/g/${id}/draw"]`)).toContainText("No type yet");
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();

  await chooseType(page, /^Akari/);
  await drawAkari(page);
  await expect(chip(page)).toHaveText(/One solution/, { timeout: 15_000 });

  // Publish: saved first, then the publish page, still in paint's chrome
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${id}/publish$`), { timeout: 15_000 });
  await expect(page.locator(".studio-top .paint-type-name")).toHaveText("Akari");
  await expect(page.getByRole("link", { name: "Back to paint" }).first()).toHaveAttribute("href", `/g/${id}/draw`);
  // no verdict badge (paint showed it) and no "Playing your puzzle": the server still checks on Publish
  await expect(page.locator(".paint-verdict-btn, .publish-bar, [data-verdict]")).toHaveCount(0);
  await expect(page.getByText("Playing your puzzle")).toHaveCount(0);
  await expect(page.locator(".publish-note")).toContainText("your solve isn’t counted");
  await expect(page.locator(".publish-meta")).toHaveText(`Akari · 3 × 3 · by @${run.handle} · not published yet`);
  await expect(page.locator("select")).toHaveCount(0);   // no collection picker
  const publish = page.locator(".studio-top").getByRole("button", { name: "Publish" });
  await expect(publish).toBeEnabled({ timeout: 15_000 });

  // the title and description: edited in place on the dark page above the board, not on the paper
  const title = page.getByRole("textbox", { name: "Title" });
  const description = page.getByRole("textbox", { name: "Description" });
  await expect(title).toHaveAttribute("placeholder", "Name your puzzle");
  await expect(description).toHaveAttribute("placeholder", "Add a line about it");
  await expect(page.locator(".publish-head").getByRole("textbox")).toHaveCount(2);
  await expect(page.locator(".sheet").getByRole("textbox")).toHaveCount(0);
  expect((await title.boundingBox())!.y).toBeLessThan((await page.locator(".sheet").boundingBox())!.y);
  await shot(page, "07-publish-empty");

  // an empty title: Publish asks for one
  await expect(title).toHaveValue("");
  await publish.click();
  await expect(page.getByRole("alert").filter({ hasText: "Give it a title" })).toBeVisible();
  await expect(title).toBeFocused();
  await title.fill("Night Light");
  await description.fill("Four lights round one square.");
  await expect.poll(() => row(id).description, { timeout: 10_000 }).toBe("Four lights round one square.");
  expect(row(id).title).toBe("Night Light");

  // play it as players will: a light beside each side of the 4
  const frame = (await page.locator(".sheet svg.board .frame").boundingBox())!;
  const s = frame.width / 3;
  for (const [r, c] of [[0, 1], [1, 0], [1, 2], [2, 1]]) await page.mouse.click(frame.x + (c + 0.5) * s, frame.y + (r + 0.5) * s);
  await expect(page.locator(".sheet .solved-stamp")).toBeVisible({ timeout: 10_000 });
  await shot(page, "07-publish");
  expect(sql(`select 1 from solves where game_id = ${q(id)}`)).toHaveLength(0);   // the creator's solve isn't counted

  await publish.click();
  await expect(page).toHaveURL(new RegExp(`/g/${id}$`), { timeout: 15_000 });
  expect(row(id)).toMatchObject({ state: "published", kind: "akari", title: "Night Light" });
  expect(row(id).sketch.startsWith("akari\n")).toBe(true);
  await expect(page.getByRole("heading", { name: "Night Light" })).toBeVisible();
  await expect(page.locator(".drawn-by")).toContainText(`Drawn by @${run.handle}`);
  await shot(page, "08-published");

  // public: someone signed out sees it
  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const other = await anon.newPage();
  await other.goto(`/g/${id}`);
  await expect(other.getByRole("heading", { name: "Night Light" })).toBeVisible();
  await expect(other.locator(".sheet svg.board")).toBeVisible();
  await anon.close();
  expect(errors).toEqual([]);
});

test("the server won't publish a sketch the solver didn't pass", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("button", { name: "Open an empty page" }).click();
  await expect(page).toHaveURL(/\/draw$/);
  const id = idOf(page);
  // not a puzzle yet: the publish page sends it back to paint
  await page.goto(`/g/${id}/publish`);
  await expect(page).toHaveURL(new RegExp(`/g/${id}/draw$`));
  await chooseType(page, /^Akari/);
  await drawAkari(page);
  await expect(page.locator(".paint-saved")).toHaveText("Saved", { timeout: 15_000 });
  await expect.poll(() => row(id).kind, { timeout: 10_000 }).toBe("akari");
  const status = await page.evaluate((gid) => {
    const f = new FormData();
    f.set("intent", "publish"); f.set("title", "Forged"); f.set("checked", "0".repeat(64));
    return fetch(`/g/${gid}/publish`, { method: "POST", body: f, headers: { accept: "text/x-script" } }).then((r) => r.status);
  }, id);
  expect(status).toBe(400);
  expect(row(id).state).toBe("draft");
});

test("a photo, read (a given reading: no Claude) and drawn in ink, with its doubts on the paper", async ({ page }) => {
  const reading = {
    readable: true, problem: "", genre: "akari", candidates: ["akari", "nurikabe"], title: "Night Shift",
    bounds: { left: 0, top: 0, right: 1, bottom: 1 }, rows: 3, cols: 3, rules: [],
    givens: [{ kind: "block", row: 1, col: 1, value: "" }, { kind: "number", row: 1, col: 1, value: "4" }],
    runs: [], pictureRows: [], palette: [], areas: [], figure: [], entries: [], sure: false,
    notes: [{ text: "looks like a 4 or a 1; read as 4", place: "cell", fromRow: 1, toRow: 1, fromCol: 1, toCol: 1 }],
  };
  await page.addInitScript((r) => { (window as { __inkitGivenReading?: string }).__inkitGivenReading = r; }, JSON.stringify(reading));
  await page.goto("/new");
  // any picture will do as the photo: the reading is given
  const photo = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 400, height: 300 } });
  await page.locator('input[type="file"]').setInputFiles({ name: "sketch.png", mimeType: "image/png", buffer: photo });
  await expect(page).toHaveURL(/\/g\/[^/]+\/draw\?read=1$/, { timeout: 30_000 });
  const id = idOf(page);
  const saved = row(id);
  expect(saved.sketch_image).toBeTruthy();
  expect(JSON.parse(saved.drawing!).genre).toBe("akari");

  // the type read from the photo; the drawing as read; This puzzle open with the photo and its doubt first
  await expect(page.locator(".paint-type-name")).toHaveText("Akari");
  await expect(page.locator(".paint-type-from")).toHaveText("· from the photo");
  await expect(page.locator(".sp-board text.sp-text").filter({ hasText: "4" })).toHaveCount(1);
  const panel = page.locator(".paint-drawer");
  await expect(page.getByRole("tab", { name: "This puzzle" })).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator(".paint-photo img")).toBeVisible();
  await expect(panel.locator(".paint-photo")).toContainText("Claude read it as Akari, 3 × 3");
  const doubt = panel.getByRole("button", { name: /looks like a 4 or a 1/ });
  await expect(doubt).toBeVisible();
  await expect(page.locator(".sp-mark.doubt")).toHaveCount(1);
  await doubt.click();
  await expect(page.locator(".sp-mark.doubt.selected .sp-mark-ring")).toHaveCount(1);
  await expect(page.locator(".paint-tip.doubt")).toContainText("looks like a 4 or a 1");
  await expect(chip(page)).toHaveText(/One solution/, { timeout: 15_000 });
  await shot(page, "02-paint-from-photo");

  // ticked off: its mark goes, and it's kept
  await panel.getByRole("checkbox", { name: "Checked" }).check();
  await expect(page.locator(".sp-mark.doubt")).toHaveCount(0);
  await expect.poll(() => JSON.parse(sql<{ parse_notes: string }>(`select parse_notes from games where id = ${q(id)}`)[0].parse_notes)[0].done, { timeout: 10_000 }).toBe(true);

  // What type is this? answers from the reading's candidates
  await page.locator(".paint-type").click();
  const picker = page.locator(".paint-drawer");
  await picker.getByRole("button", { name: "What type is this?" }).click();
  await expect(picker.locator(".paint-suggest-card")).toHaveCount(2);
  await expect(picker.locator(".paint-suggest-card").first()).toContainText("Akari");
  await expect(picker.locator('.paint-suggest-card[data-genre="akari"]')).toContainText("One solution", { timeout: 15_000 });
  await expect(picker.locator('.paint-suggest-card[data-genre="nurikabe"]')).toBeVisible();
});

test("What type is this? on a drawing: tried as every type, no AI, the best first", async ({ page }) => {
  await page.goto("/new");
  await page.getByRole("button", { name: "Open an empty page" }).click();
  await expect(page).toHaveURL(/\/draw$/);
  const requests: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST") requests.push(r.url()); });
  await expect(page.locator(".sp-board")).toBeVisible();
  await drawAkari(page);   // no type: every tool
  await expect(chip(page)).toHaveText(/Check/);

  // from the reminder: What type is this?
  await chip(page).click({ force: true });
  await page.getByRole("alert").filter({ hasText: "Choose a type first" }).getByRole("button", { name: "What type is this?" }).click();
  const picker = page.locator(".paint-drawer");
  await expect(picker.locator(".paint-suggest-card")).toHaveCount(3);
  await expect(picker.locator(".paint-suggest")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  const best = picker.locator(".paint-suggest-card").first();
  await expect(best).toContainText("Akari");
  await expect(best).toContainText("One solution");
  await expect(best).toContainText("Uses everything you drew");
  await expect(best).toContainText("Best fit");
  await shot(page, "06-type-picker");
  // nothing was sent anywhere to suggest it (only the drawing's own autosave)
  expect(requests.filter((u) => !/\/draw(\?|$)/.test(new URL(u).pathname + new URL(u).search))).toEqual([]);

  await picker.getByRole("button", { name: "Make it Akari" }).click();
  await expect(page.getByRole("tab", { name: "This puzzle" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".paint-type-name")).toHaveText("Akari");
  await expect(chip(page)).toHaveText(/One solution/, { timeout: 15_000 });
});
