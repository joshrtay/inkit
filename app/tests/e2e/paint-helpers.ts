// Paint in the browser tests: example puzzles as drafts (or published games) made before paint (a
// sketch, no drawing), where their squares are on paint's paper, and the pointer and keys on it.
import { expect, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import type { Given, GridSpec } from "~site/engine/types.ts";
import { FOLDER_GENRE, specOf } from "~/sketchpad/from-puzzle";
import { specKey } from "~/sketchpad/to-puzzle";
import { paintFromSketch } from "~/games/paint-save";
import { looseSpec, specToSketch } from "~/games/sketch";
import * as m from "~/sketchpad/model";
import { q, RUN_FILE, sql, type Run } from "./db";

export const run = JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
const GAMES = new URL("../../../src/games/", import.meta.url).pathname;

/** The example folders (src/games/<folder>), RYB's aside: it keeps its figure editor. */
export const FOLDERS = readdirSync(GAMES).sort().filter((f) => (FOLDER_GENRE[f] ?? f) !== "coats");
export const genreOf = (folder: string) => FOLDER_GENRE[folder] ?? folder;
/** An example's puzzle: src/games/<folder>/<n>.json. */
export const exampleSpec = (folder: string, n = 1): GridSpec => specOf(genreOf(folder), JSON.parse(readFileSync(`${GAMES}${folder}/${n}.json`, "utf8")));

/** Insert games as made before paint: their sketches, no drawing (one statement: wrangler is slow). */
export function insertGames(games: { id: string; spec: GridSpec; state?: "draft" | "published"; title?: string }[]) {
  sql(games.map((x) => `insert into games (id, collection_id, author_id, title, description, sketch, sketch_version, kind, parse_notes, kind_choices, state, published_at)
    values (${q(x.id)}, ${q(run.collectionId)}, ${q(run.userId)}, ${q(x.title ?? `${x.spec.genre} test`)}, '', ${q(specToSketch(x.spec))}, 1, ${q(x.spec.genre!)}, '[]', '[]',
      ${q(x.state ?? "draft")}, ${x.state === "published" ? Date.now() : "null"})`).join(";\n"));
}
let n = 0;
/** A draft of an example, made before paint; its id. */
export function draftOf(folder: string, state: "draft" | "published" = "draft") {
  const id = `e2e-paint-${folder}-${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  insertGames([{ id, spec: exampleSpec(folder), state }]);
  return id;
}

/** A blank draft (as /new's Start blank makes it): no type, no sketch, no drawing; its id. */
export function blankDraft(name: string) {
  const id = `e2e-paint-${name}-${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  sql(`insert into games (id, collection_id, author_id, title, description, sketch, sketch_version, kind, parse_notes, kind_choices, state)
    values (${q(id)}, ${q(run.collectionId)}, ${q(run.userId)}, 'Untitled', '', '', 1, '', '[]', '[]', 'draft')`);
  return id;
}

/** A game's row: its sketch (the puzzle: the JSON after the type line), drawing and state. */
export const row = (id: string) => sql<{ sketch: string; drawing: string | null; state: string; title: string; kind: string }>(
  `select sketch, drawing, state, title, kind from games where id = ${q(id)}`)[0];
export const savedSpec = (id: string) => looseSpec(row(id).sketch) ?? ({ size: [0, 0] } as GridSpec);
/** Whether a list of clues has one with all these fields. */
export const has = (gs: Given[] | GridSpec["rules"] | undefined, want: Record<string, unknown>) =>
  ((gs ?? []) as Record<string, unknown>[]).some((g) => Object.entries(want).every(([k, v]) => JSON.stringify(g[k]) === JSON.stringify(v)));
/** Wait until the game's saved puzzle passes `check` (paint saves a moment after a change). */
export const eventually = (id: string, check: (s: GridSpec) => boolean) =>
  expect.poll(() => check(savedSpec(id)), { timeout: 15_000, intervals: [500, 1000] }).toBe(true);

/** The grid paint draws a sketch on (from-puzzle.ts's toDrawing, as the server does). */
export const gridOf = (spec: GridSpec) => paintFromSketch(specToSketch(spec))!.drawing.grid!;
/** A place on the paper, in page units. */
export const P = (g: m.Grid, a: m.Anchor) => m.pointOf(g, a);
export const cell = (g: m.Grid, r: number, c: number) => P(g, { at: "cell", r, c });

async function screen(page: Page, p: m.XY) {
  const box = (await page.locator(".sp-board").boundingBox())!;
  return { x: box.x + (p.x / m.PAGE) * box.width, y: box.y + (p.y / m.PAGE) * box.height };
}
export async function tap(page: Page, p: m.XY) { const s = await screen(page, p); await page.mouse.click(s.x, s.y); }
export async function drag(page: Page, points: m.XY[]) {
  const first = await screen(page, points[0]);
  await page.mouse.move(first.x, first.y); await page.mouse.down();
  for (const p of points.slice(1)) { const s = await screen(page, p); await page.mouse.move(s.x, s.y, { steps: 6 }); }
  await page.mouse.up();
}
export const tool = (page: Page, name: string) => page.locator(".sp-tools").getByRole("button", { name, exact: true }).click();
export const palette = (page: Page) => page.locator(".sp-palette");
/** Pick a stamp in the Stamp tool's palette. */
export async function stamp(page: Page, name: string) {
  await tool(page, "Stamp");
  await palette(page).getByRole("group", { name: "Stamps" }).getByRole("button", { name, exact: true }).click();
}
/** Tap a place with the Text tool and type; Enter finishes. */
export async function write(page: Page, p: m.XY, text: string) {
  await tap(page, p);
  const box = page.locator(".sp-typing");
  await expect(box).toBeFocused();
  await box.fill(text);
  await box.press("Enter");
}
export const verdict = (page: Page) => page.locator(".paint-verdict-btn");
/** The puzzle paint makes of the drawing now (specKey: the same for two that mean the same). */
export const puzzleKey = async (page: Page) => { const k = await page.locator(".paint").getAttribute("data-puzzle"); return k ? specKey(JSON.parse(k)) : ""; };
export async function openPaint(page: Page, id: string) {
  await page.goto(`/g/${id}/draw`);
  await expect(page.locator(".sp-board")).toBeVisible();
  await expect(page.locator(".paint")).not.toHaveAttribute("data-puzzle", "");
}
