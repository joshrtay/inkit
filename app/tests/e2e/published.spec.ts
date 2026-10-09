// A published puzzle can't be changed, only deleted (docs/creation-flow.md, decision 8): its page has
// no Edit and a red Delete, asked in the site's confirm dialog; paint, the publish page and RYB's
// editor send it to its page; the server refuses a forged edit; Delete hides it everywhere while
// its solves and likes break nothing. Then the … menu's take-down note (the dialog's text field),
// the old editor's address, and drafts opening in paint.
import { expect, test, type Page } from "@playwright/test";
import { q, sql } from "./db";
import { draftOf, row, run } from "./paint-helpers";

// CONFIRM_SHOTS=<folder> saves the Delete dialog, light and dark
const shot = async (page: Page, name: string) => {
  if (process.env.CONFIRM_SHOTS) await page.screenshot({ path: `${process.env.CONFIRM_SHOTS}/${name}.png` });
};
const slug = () => sql<{ slug: string }>(`select slug from collections where id = ${q(run.collectionId)}`)[0].slug;

test("a published puzzle: no Edit, a red Delete that asks first, then gone everywhere", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = draftOf("sudoku", "published");
  sql(`update games set title = 'Doomed Sudoku' where id = ${q(id)};
    insert into solves (creator_id, game_id, created_at) values (${q(run.userId)}, ${q(id)}, ${Date.now()});
    insert into likes (creator_id, game_id, created_at) values (${q(run.userId)}, ${q(id)}, ${Date.now()})`);

  await page.goto(`/g/${id}`);
  await expect(page.getByRole("heading", { name: "Doomed Sudoku" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.locator(`a[href="/g/${id}/draw"]`)).toHaveCount(0);
  // its author's … menu has no Back to draft (they aren't a moderator of their own game)
  await expect(page.getByRole("button", { name: "More for this puzzle" })).toHaveCount(0);
  const del = page.getByRole("button", { name: "Delete", exact: true });
  await expect(del).toHaveClass(/\bdanger\b/);

  // Delete opens the dialog; Cancel keeps it, and focus goes back to Delete
  await del.click();
  const dialog = page.getByRole("alertdialog", { name: "Delete “Doomed Sudoku”?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("can’t be undone");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();   // destructive: Cancel first
  await expect(dialog.getByRole("button", { name: "Delete" })).toHaveClass(/\bdanger\b/);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(del).toBeFocused();
  expect(row(id).state).toBe("published");

  // the keyboard: Tab stays in the dialog, Escape cancels, focus comes back
  await del.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog.confirm"))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(del).toBeFocused();
  expect(row(id).state).toBe("published");

  // the dialog, light and dark (for the record)
  if (process.env.CONFIRM_SHOTS) {
    for (const theme of ["dark", "light"]) {
      await page.evaluate((t) => { localStorage.setItem("inkit:theme", t); }, theme);
      await page.reload();
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(300);
      await shot(page, `delete-${theme}`);
      await page.keyboard.press("Escape");
    }
    await page.evaluate(() => localStorage.removeItem("inkit:theme"));
  }

  // confirmed: deleted, back on the profile, and gone from it
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug()}$`), { timeout: 15_000 });
  expect(row(id).state).toBe("deleted");
  await expect(page.locator(`a[href^="/g/${id}"]`)).toHaveCount(0);
  await page.goto(`/${slug()}?tab=drafts`);
  await expect(page.locator(".tabs, main").first()).toBeVisible();
  await expect(page.locator(`a[href^="/g/${id}"]`)).toHaveCount(0);
  // the direct link says it was deleted; its editors and photo don't exist
  const gone = await page.goto(`/g/${id}`);
  expect(gone?.status()).toBe(410);
  await expect(page.getByRole("heading", { name: "Deleted" })).toBeVisible();
  expect((await page.request.get(`/g/${id}/draw`, { maxRedirects: 0 })).status()).toBe(404);
  expect((await page.request.get(`/g/${id}/publish`, { maxRedirects: 0 })).status()).toBe(404);
  // its solves and likes are still there, and break nothing: the profile, home, the sitemap
  expect(sql(`select count(*) n from solves where game_id = ${q(id)}`)[0].n).toBe(1);
  expect(sql(`select count(*) n from likes where game_id = ${q(id)}`)[0].n).toBe(1);
  for (const path of [`/${slug()}`, "/", "/explore"]) expect((await page.request.get(path)).status(), path).toBe(200);
  expect(await (await page.request.get("/sitemap.xml")).text()).not.toContain(`/g/${id}`);
  // and nobody can act on it any more: liking, solving, deleting again
  expect((await page.request.post(`/g/${id}/like`, { form: { intent: "like" } })).status()).toBe(404);
  expect((await page.request.post(`/g/${id}/solve`, { form: {} })).status()).toBe(404);
  expect((await page.request.post(`/g/${id}`, { form: { intent: "delete" }, maxRedirects: 0 })).status()).toBe(404);
  expect(errors).toEqual([]);
});

test("a published puzzle's editors go to its page, and the server refuses a forged edit", async ({ page }) => {
  const id = draftOf("akari", "published");
  const before = row(id);
  for (const path of [`/g/${id}/draw`, `/g/${id}/publish`, `/g/${id}/edit`]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(new RegExp(`/g/${id}$`));
  }
  // RYB's editor too
  const coats = `${run.drafts.coats}-pub`;
  sql(`insert into games (id, collection_id, author_id, title, description, sketch, sketch_version, kind, parse_notes, kind_choices, state, published_at)
    select ${q(coats)}, collection_id, author_id, 'RYB, published', '', sketch, sketch_version, kind, '[]', '[]', 'published', ${Date.now()} from games where id = ${q(run.drafts.coats)}`);
  await page.goto(`/g/${coats}/edit`);
  await expect(page).toHaveURL(new RegExp(`/g/${coats}$`));
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);

  // forged posts, as if from the old pages: refused, and nothing changes
  const drawing = JSON.stringify({ v: 1, drawing: { items: [], grid: null }, genre: "akari", settings: {} });
  const forged = [
    { path: `/g/${id}/draw`, form: { intent: "save", drawing, title: "Forged" } },
    { path: `/g/${id}/publish`, form: { intent: "details", title: "Forged", description: "x" } },
    { path: `/g/${id}/publish`, form: { intent: "publish", title: "Forged", description: "x", checked: "0" } },
    { path: `/g/${id}/publish`, form: { intent: "update", title: "Forged", description: "x", checked: "0" } },
    { path: `/g/${id}/draw`, form: { intent: "reread", feedback: "it's 6 rows" } },
    { path: `/g/${coats}/edit`, form: { intent: "save", title: "Forged", sketch: "akari\n{}", stay: "1" } },
    { path: `/g/${id}`, form: { intent: "unpublish" } },
  ];
  for (const f of forged) {
    const res = await page.request.post(`${f.path}.data`, { form: f.form, maxRedirects: 0 });
    // refused as locked (403), or (an intent that's gone: update, back to draft) not understood (400)
    expect(res.status(), `${f.path} ${f.form.intent}`).toBe(["update", "unpublish"].includes(f.form.intent) ? 400 : 403);
    if (res.status() === 403) expect(await res.text()).toContain("A published puzzle can't be changed, only deleted.");
  }
  expect(row(id)).toEqual(before);
  expect(row(coats).title).toBe("RYB, published");
  sql(`delete from games where id = ${q(coats)}`);
});

test("the … menu: taking down asks for its note in the dialog", async ({ page }) => {
  // someone else's puzzle in the test account's collection, which it owns: it can take it down
  const id = `e2e-takedown-${Date.now().toString(36)}`;
  sql(`insert into games (id, collection_id, author_id, title, description, sketch, sketch_version, kind, parse_notes, kind_choices, state, published_at)
    select ${q(id)}, ${q(run.collectionId)}, 'wyatt', 'Not yours', '', sketch, sketch_version, kind, '[]', '[]', 'published', ${Date.now()} from games where id = ${q(run.drafts.akari)}`);
  try {
    await page.goto(`/g/${id}`);
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);   // not its author
    await page.getByRole("button", { name: "More for this puzzle" }).click();
    const item = page.getByRole("menuitem", { name: "Take down…" });
    await expect(page.getByRole("menuitem", { name: "Back to draft" })).toHaveCount(0);
    await item.click();
    const dialog = page.getByRole("dialog", { name: "Take this puzzle down?" });
    const note = dialog.getByRole("textbox", { name: /Why\?/ });
    await expect(note).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Take down" })).toBeDisabled();   // the note is needed
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(item).toBeFocused();
    expect(row(id).state).toBe("published");

    await item.click();
    await note.fill("Copied from a book");
    await dialog.getByRole("button", { name: "Take down" }).click();
    await expect.poll(() => row(id).state).toBe("hidden");
    expect(sql<{ hidden_note: string }>(`select hidden_note from games where id = ${q(id)}`)[0].hidden_note).toBe("Copied from a book");
    await expect(page.locator(".game-head .state.hidden")).toContainText("Copied from a book");
  } finally {
    sql(`delete from games where id = ${q(id)}`);
  }
});

test("the old editor's address: paint for every type but RYB, which keeps its figure editor", async ({ page }) => {
  const id = draftOf("akari");
  await page.goto(`/g/${id}/edit`);
  await expect(page).toHaveURL(new RegExp(`/g/${id}/draw$`));
  await page.goto(`/g/${run.drafts.coats}/edit`);
  await expect(page).toHaveURL(new RegExp(`/g/${run.drafts.coats}/edit$`));
  await expect(page.locator(".studio-board svg").first()).toBeVisible();
  // and RYB's paint address goes back to its editor
  await page.goto(`/g/${run.drafts.coats}/draw`);
  await expect(page).toHaveURL(new RegExp(`/g/${run.drafts.coats}/edit$`));
  // /new/draw is gone: /new starts in paint
  await page.goto("/new/draw");
  await expect(page).toHaveURL(/\/new$/);
});

test("drafts open in paint from the profile's Drafts and from /new, and a draft's page has Edit", async ({ page }) => {
  const id = draftOf("masyu");
  // the profile by its slug now (settings.spec.ts moves the handle and back)
  await page.goto(`/${slug()}?tab=drafts`);
  await expect(page.locator(`a[href="/g/${id}/draw"]`)).toBeVisible();
  await page.goto("/new");
  await expect(page.locator(`a[href="/g/${id}/draw"]`)).toBeVisible();
  await expect(page.locator(`a[href="/g/${run.drafts.coats}/draw"]`)).toHaveCount(0);
  await page.goto(`/g/${id}`);
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveAttribute("href", `/g/${id}/draw`);
});
