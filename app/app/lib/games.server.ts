// Making and changing games: create, save, publish, take down, restore, feature, delete. Only a
// draft is changed: a published puzzle is locked, and its author's one action is Delete.
// Every change re-checks permissions (permissions.server.ts) and re-parses the sketch here on
// the server. Publishing also needs the editor's one-solution check (count-solutions.client.ts) to
// have passed for this exact sketch: the form sends the sketch's hash, which the browser only
// fills in after the solver found exactly one solution. (The solver runs in the browser;
// re-proving on the server is for later.)
import { eq } from "drizzle-orm";
import { schema, type Db } from "../db";
import { looseSpec, parseSketch, SKETCH_VERSION } from "../games/sketch";
import { newId } from "./names.server";
import { canChange, canDelete, canHide, canPublishInto, Forbidden, roleIn } from "./permissions.server";
import { cropTo, prepare } from "./photos.server";
import { givenReading, IMAGE_TYPES, readSketch, sketchProblems, toBase64, type Attempt, type Reading } from "./read-sketch.server";
import { notePublished, recordRead } from "./reads.server";

/** The game types a reading could be, its own first (at most 4). */
const choicesOf = (r: Reading) => [...new Set([r.genre, ...(r.candidates ?? [])])].slice(0, 4);

type Creator = typeof schema.creators.$inferSelect;
type Game = typeof schema.games.$inferSelect;

import { Invalid } from "./errors.server";
import { doubtFromNote, doubtsOf, type Doubt } from "../games/doubts";
import { GENRE_NAMES, makePuzzle, type GenreName } from "~site/engine/puzzle.ts";
import { paintFromSketch, readPaintSave, sketchOf } from "../games/paint-save";
export { Invalid };

export async function sketchHash(sketch: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sketch)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The collections someone can publish into (not deleted), personal first. */
export async function publishTargets(db: Db, creatorId: string) {
  const rows = await db.select({ id: schema.collections.id, slug: schema.collections.slug, title: schema.collections.title,
    personal: schema.collections.personalOf, role: schema.memberships.role, deleted: schema.collections.deletedAt })
    .from(schema.memberships)
    .innerJoin(schema.collections, eq(schema.memberships.collectionId, schema.collections.id))
    .where(eq(schema.memberships.creatorId, creatorId));
  return rows.filter((r) => !r.deleted)
    .map((r) => ({ id: r.id, slug: r.slug, title: r.title, personal: !!r.personal, role: r.role }))
    .sort((a, b) => Number(b.personal) - Number(a.personal) || a.title.localeCompare(b.title));
}

interface Fields { title: string; description: string; sketch: string; checked: string }

function fieldsFrom(form: FormData): Fields {
  const s = (k: string) => String(form.get(k) ?? "");
  return { title: s("title").trim().slice(0, 120), description: s("description").trim().slice(0, 2000), sketch: s("sketch").replace(/\r\n/g, "\n"), checked: s("checked") };
}

/** Parse a sketch or explain what's wrong; for publishing, also require its one-solution check.
 *  A draft may be saved unfinished (a maze missing a door, an area in two pieces) as long as the
 *  editor can still draw it. */
async function validated(f: Fields, publishing: boolean, draft = false): Promise<{ kind: string }> {
  if (!f.title) throw new Invalid("Give the game a title.");
  const parsed = parseSketch(f.sketch);
  if (!parsed.ok && draft && !publishing) {
    const loose = looseSpec(f.sketch);
    try { if (loose) { makePuzzle(loose, { unfinished: true }); return { kind: loose.genre! }; } } catch { /* not even drawable */ }
  }
  if (!parsed.ok) throw new Invalid(parsed.errors.join(" "));
  if (publishing && f.checked !== (await sketchHash(f.sketch))) {
    throw new Invalid("Check the puzzle in paint first.");
  }
  return parsed;
}

/** A draft's new sketch, title and description: saved (even unfinished) or published. Both editors
 *  come here (RYB's figure editor, and paint's publish page through publishDrawing), so the rules
 *  live in one place: only a draft changes (a published puzzle is locked), and publishing needs the
 *  browser's one-solution check for this very sketch (the `checked` hash). */
async function putSketch(db: Db, game: Game, f: Fields, publish: boolean) {
  if (game.state !== "draft") throw new Forbidden(LOCKED);
  const parsed = await validated(f, publish, true);
  const firstPublish = publish && !game.publishedAt;
  await db.update(schema.games).set({
    title: f.title, description: f.description, sketch: f.sketch, sketchVersion: SKETCH_VERSION, kind: parsed.kind, updatedAt: new Date(),
    // (publishing by hand takes a scheduled draft off the AI creators' queue: app/lib/ai.server.ts)
    ...(publish ? { state: "published" as const, publishedAt: game.publishedAt ?? new Date(), publishAt: null } : {}),
  }).where(eq(schema.games.id, game.id));
  // how far the published puzzle is from what Claude read (app/lib/reads.server.ts)
  if (firstPublish && game.sketchImage) await notePublished(db, game.id, f.sketch);
}

/** Why a change to a published puzzle is refused. */
export const LOCKED = "A published puzzle can't be changed, only deleted.";

/** The editors' and the game page's buttons: save, publish, take down, restore, feature, delete. */
export async function changeGame(db: Db, me: Creator, game: Game, form: FormData) {
  const intent = String(form.get("intent"));
  const role = await roleIn(db, game.collectionId, me.id);
  if (game.state === "deleted") throw new Forbidden("This puzzle was deleted.");
  // editing: only a draft, by its author or the collection's owners
  const mayChange = () => { if (!canChange(game, me, role)) throw new Forbidden(game.state === "draft" ? "You can't edit this game." : LOCKED); };
  const set = (values: Partial<Game>) =>
    db.update(schema.games).set({ ...values, updatedAt: new Date() }).where(eq(schema.games.id, game.id));

  switch (intent) {
    case "save":
    case "publish": {
      mayChange();
      await putSketch(db, game, fieldsFrom(form), intent === "publish");
      return;
    }
    case "doubt": {
      // tick off (or untick) one of Claude's doubts
      mayChange();
      const doubts = doubtsOf(game.parseNotes);
      const i = Number(form.get("index"));
      if (!doubts[i]) return;
      doubts[i] = { ...doubts[i], done: form.get("done") === "1" };
      await set({ parseNotes: doubts });
      return;
    }
    case "delete":
      await deleteGame(db, me, game, role);
      return;
    case "hide": {
      if (!canHide(me, role)) throw new Forbidden("Only the collection's owners and admins can take a game down.");
      const note = String(form.get("note") ?? "").trim().slice(0, 500);
      if (!note) throw new Invalid("Say why. The author and owners will see this note.");
      await set({ state: "hidden", hiddenNote: note, hiddenBy: me.id });
      return;
    }
    case "unhide": {
      if (game.state !== "hidden") return;
      // A game an admin took down can only be restored by an admin.
      const hider = game.hiddenBy ? await db.query.creators.findFirst({ where: eq(schema.creators.id, game.hiddenBy) }) : null;
      if (!canHide(me, role) || (hider?.isAdmin && !me.isAdmin)) throw new Forbidden("Only an admin can restore a game an admin took down.");
      await set({ state: game.publishedAt ? "published" : "draft", hiddenNote: null, hiddenBy: null });
      return;
    }
    case "feature":
    case "unfeature": {
      if (!me.isAdmin) throw new Forbidden("Only admins curate the Featured shelf.");
      if (intent === "unfeature") { await db.delete(schema.featured).where(eq(schema.featured.gameId, game.id)); return; }
      if (game.state !== "published") throw new Invalid("Only published games can be featured.");
      const shelf = await db.query.featured.findMany();
      await db.insert(schema.featured).values({ gameId: game.id, position: shelf.length, featuredBy: me.id }).onConflictDoNothing();
      return;
    }
    default:
      throw new Invalid("Unknown action.");
  }
}

/** Delete a game (its author while a member, or an admin): for good, as far as anyone can tell. A
 *  soft delete: the row stays (state "deleted"), so the solves and likes that point at it break
 *  nothing, but every page treats it as gone (lists show only published games; its page says it
 *  was deleted). Nobody can undo it from the site. It comes off the Featured shelf. */
export async function deleteGame(db: Db, me: Creator, game: Game, role: Awaited<ReturnType<typeof roleIn>>) {
  if (!canDelete(game, me, role)) throw new Forbidden("Only its author can delete this puzzle.");
  await db.update(schema.games).set({ state: "deleted", publishAt: null, updatedAt: new Date() }).where(eq(schema.games.id, game.id));
  await db.delete(schema.featured).where(eq(schema.featured.gameId, game.id));
}

export const isFeatured = async (db: Db, gameId: string) =>
  !!(await db.query.featured.findFirst({ where: eq(schema.featured.gameId, gameId) }));

// ---- games made from a hand-drawn sketch ----

const MAX_UPLOAD = 8 * 1024 * 1024;

/** The uploaded drawing from a form, checked. */
async function imageFrom(form: FormData) {
  const file = form.get("image");
  if (!(file instanceof File) || !file.size) throw new Invalid("Choose a photo of your sketch.");
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) throw new Invalid("Use a JPEG, PNG, WebP or GIF photo.");
  if (file.size > MAX_UPLOAD) throw new Invalid("That photo is too big (8 MB at most).");
  return { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type as (typeof IMAGE_TYPES)[number] };
}

/** A blank draft for paint (/new's Start blank): no type, no sketch, no drawing yet. Returns its id. */
export async function createBlank(db: Db, me: Creator, form: FormData) {
  const collectionId = String(form.get("collection") ?? "");
  if (!canPublishInto(await roleIn(db, collectionId, me.id))) throw new Forbidden("You can only add games to collections you belong to.");
  const id = newId();
  await db.insert(schema.games).values({
    id, collectionId, authorId: me.id, sketch: "", sketchVersion: SKETCH_VERSION, kind: "", state: "draft", title: "Untitled", parseNotes: [], kindChoices: [],
  });
  return id;
}

/** Upload a drawing: Claude reads it, and it becomes a draft to confirm. Returns the game's id. */
export async function createFromDrawing(db: Db, env: Env, me: Creator, form: FormData) {
  const collectionId = String(form.get("collection") ?? "");
  if (!canPublishInto(await roleIn(db, collectionId, me.id))) throw new Forbidden("You can only add games to collections you belong to.");
  const image = await imageFrom(form);
  // upright and without its metadata; it's only kept once read, and only the puzzle's part of it
  // (photos.server.ts), so a read that fails keeps no photo
  let photo;
  try { photo = await prepare(env, image.bytes); } catch { throw new Invalid("That photo couldn't be opened. Try a JPEG or PNG."); }
  const id = newId();
  const log: Attempt[] = [];
  const record = { creatorId: me.id, kind: "upload" as const, attempts: log };
  let read;
  // the browser tests give the reading themselves (tests/e2e/create.spec.ts), so they never call
  // Claude; only while the site runs in development
  const given = import.meta.env.DEV ? form.get("given-reading") : null;
  try {
    read = typeof given === "string" && given
      ? (log.push({ reader: "quick", model: "given (tests)", effort: "", ms: 0 }), givenReading(given))
      : await readSketch(env, { data: toBase64(photo.bytes), type: photo.type }, { log });
  } catch (e) {
    await recordRead(db, { ...record, imageKey: null, gameId: null, error: (e as Error).message });
    throw e;
  }
  const { reading, sketch } = read;
  const kept = await cropTo(env, photo, reading.bounds);
  const key = `sketches/${id}/${crypto.randomUUID()}.jpeg`;
  await env.MEDIA.put(key, kept.bytes, { httpMetadata: { contentType: kept.type } });
  await db.insert(schema.games).values({
    id, collectionId, authorId: me.id, sketch, sketchVersion: SKETCH_VERSION, kind: reading.genre, state: "draft",
    title: reading.title || "Untitled",   // a title written on the sketch; set in the editor otherwise
    sketchImage: key, reading: sketch, parseNotes: doubtsFrom(reading, sketch), kindChoices: choicesOf(reading),
    // drawn in paint's ink, with the type it was read as (docs/creation-flow.md §1.4); the sketch
    // stays the reading's until paint saves its own
    drawing: paintFromSketch(sketch),
  });
  await recordRead(db, { ...record, imageKey: key, gameId: id, result: { reading, sketch, puzzleKind: reading.genre, model: log.at(-1)!.model } });
  return id;
}

/** Read the drawing again, with the creator's corrections. */
export async function rereadDrawing(db: Db, env: Env, me: Creator, game: Game, form: FormData) {
  await mayChange(db, me, game);
  const feedback = String(form.get("feedback") ?? "").trim().slice(0, 2000);
  // the creator can also say which game type it is (then it's read again as that type)
  const kind = String(form.get("kind") ?? "");
  const genre = (GENRE_NAMES as string[]).includes(kind) ? kind as GenreName : undefined;
  if (!feedback && !genre) throw new Invalid("Say what's wrong, e.g. \"row 3 has a rock in column 2, not 3\".");
  const stored = game.sketchImage ? await env.MEDIA.get(game.sketchImage) : null;
  if (!stored) throw new Invalid("This game has no uploaded sketch to re-read.");
  const type = (stored.httpMetadata?.contentType ?? "image/jpeg") as (typeof IMAGE_TYPES)[number];
  const log: Attempt[] = [];
  const record = { gameId: game.id, creatorId: me.id, kind: "reread" as const, imageKey: game.sketchImage, feedback, chosenKind: genre, attempts: log };
  let read;
  // the browser tests give the reading themselves, as for a new photo (createFromDrawing)
  const given = import.meta.env.DEV ? form.get("given-reading") : null;
  try {
    read = typeof given === "string" && given
      ? (log.push({ reader: "careful", model: "given (tests)", effort: "", ms: 0 }), givenReading(given))
      : await readSketch(env, { data: toBase64(new Uint8Array(await stored.arrayBuffer())), type },
        // a draft drawn in the old sketchpad (/new/draw, gone) kept its drawing's data beside the picture
        { previous: { sketch: game.sketch, feedback, genre }, log, drawing: await (await env.MEDIA.get(`${game.sketchImage}.drawing.json`))?.text() });
  } catch (e) {
    await recordRead(db, { ...record, error: (e as Error).message });
    throw e;
  }
  const { reading, sketch } = read;
  await recordRead(db, { ...record, result: { reading, sketch, puzzleKind: reading.genre, model: log.at(-1)!.model } });
  await db.update(schema.games).set({
    sketch, kind: reading.genre, sketchVersion: SKETCH_VERSION,
    reading: sketch, parseNotes: doubtsFrom(reading, sketch), kindChoices: choicesOf(reading), updatedAt: new Date(),
    // paint draws the new reading in ink, in place of the old drawing (as for a new photo)
    drawing: paintFromSketch(sketch),
  }).where(eq(schema.games.id, game.id));
}


/** A reading's doubts: Claude's notes (tied to their cells) and anything that stops it playing. */
const doubtsFrom = (reading: Reading, sketch: string): Doubt[] => [
  ...reading.notes.map((n) => doubtFromNote(n, reading.rows, reading.cols)),
  ...sketchProblems(sketch).map((text) => ({ text, place: "whole" as const })),
];


// ---- paint: a draft drawn in the browser (/g/<id>/draw) ----

/** Only a draft changes, by those who can edit it (permissions.server.ts's canChange). */
async function mayChange(db: Db, me: Creator, game: Game) {
  if (!canChange(game, me, await roleIn(db, game.collectionId, me.id))) throw new Forbidden(game.state === "draft" ? "You can't edit this game." : LOCKED);
}

/** Save paint's drawing (docs/creation-flow.md §1.10): the drawing, its type and settings as they
 *  are, and the sketch converted from them here (never sent: the drawing is the source of truth).
 *  A draft saves unfinished: no type, no grid, or a puzzle that doesn't solve yet. Only a draft:
 *  a published puzzle can't be changed. */
export async function saveDrawing(db: Db, me: Creator, game: Game, form: FormData) {
  await mayChange(db, me, game);
  const save = readPaintSave(String(form.get("drawing") ?? ""));
  if (!save) throw new Invalid("That drawing couldn't be read.");
  const { sketch, kind } = sketchOf(save);
  const title = String(form.get("title") ?? "").trim().slice(0, 120) || "Untitled";
  await db.update(schema.games).set({
    drawing: save, sketch, kind, sketchVersion: SKETCH_VERSION, title, updatedAt: new Date(),
  }).where(eq(schema.games.id, game.id));
}

/** The publish page's title and description (/g/<id>/publish), saved as they change (a draft's). */
export async function saveDetails(db: Db, me: Creator, game: Game, form: FormData) {
  await mayChange(db, me, game);
  const f = fieldsFrom(form);
  await db.update(schema.games).set({ title: f.title || "Untitled", description: f.description, updatedAt: new Date() }).where(eq(schema.games.id, game.id));
}

/** Publish a draft drawn in paint (docs/creation-flow.md §1.9). The sketch is converted again here
 *  from the saved drawing, never taken from the page, and goes through putSketch, as RYB's editor's
 *  publish does: it must be the very sketch the browser's solver passed (the `checked` hash:
 *  exactly one solution; a panel, at least one). Once published, it's locked. */
export async function publishDrawing(db: Db, me: Creator, game: Game, form: FormData) {
  await mayChange(db, me, game);
  const save = readPaintSave(game.drawing);
  if (!save?.genre) throw new Invalid("Choose its puzzle type in paint first.");
  const { sketch, conversion } = sketchOf(save);
  if (!sketch || !conversion?.spec) throw new Invalid("Draw its grid in paint first.");
  await putSketch(db, game, { ...fieldsFrom(form), sketch }, true);
}
