// Making and changing games: create, save, publish, back to draft, take down, restore, feature.
// Every change re-checks permissions (permissions.server.ts) and re-parses the sketch here on
// the server. Publishing also needs the editor's one-solution check (count-solutions.client.ts) to
// have passed for this exact sketch: the form sends the sketch's hash, which the browser only
// fills in after the solver found exactly one solution. (The solver runs in the browser;
// re-proving on the server is for later.)
import { eq } from "drizzle-orm";
import { schema, type Db } from "../db";
import { looseSpec, parseSketch, SKETCH_VERSION } from "../games/sketch";
import { newId } from "./names.server";
import { canEdit, canHide, canPublishInto, Forbidden, roleIn } from "./permissions.server";
import { IMAGE_TYPES, readSketch, sketchProblems, toBase64, type Attempt, type Reading } from "./read-sketch.server";
import { notePublished, recordRead } from "./reads.server";

/** The game types a reading could be, its own first (at most 4). */
const choicesOf = (r: Reading) => [...new Set([r.genre, ...(r.candidates ?? [])])].slice(0, 4);

type Creator = typeof schema.creators.$inferSelect;
type Game = typeof schema.games.$inferSelect;

import { Invalid } from "./errors.server";
import { doubtFromNote, doubtsOf, type Doubt } from "../games/doubts";
import { GENRE_NAMES, makePuzzle, type GenreName } from "~site/engine/puzzle.ts";
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
    throw new Invalid("Check the puzzle first: it needs exactly one solution to be published.");
  }
  return parsed;
}

/** The editor's buttons: save, publish, back to draft, take down, restore, feature. */
export async function changeGame(db: Db, me: Creator, game: Game, form: FormData) {
  const intent = String(form.get("intent"));
  const role = await roleIn(db, game.collectionId, me.id);
  const set = (values: Partial<Game>) =>
    db.update(schema.games).set({ ...values, updatedAt: new Date() }).where(eq(schema.games.id, game.id));

  switch (intent) {
    case "save":
    case "publish": {
      if (!canEdit(game, me, role)) throw new Forbidden("You can't edit this game.");
      const f = fieldsFrom(form);
      // A published game stays published only if its new sketch passes the check too.
      const publishing = intent === "publish" || (game.state === "published" && f.sketch !== game.sketch);
      const parsed = await validated(f, publishing, game.state === "draft");
      const firstPublish = intent === "publish" && game.state !== "published" && !game.publishedAt;
      await set({
        title: f.title, description: f.description, sketch: f.sketch, sketchVersion: SKETCH_VERSION, kind: parsed.kind,
        ...(intent === "publish" && game.state !== "published" ? { state: "published", publishedAt: game.publishedAt ?? new Date() } : {}),
      });
      // how far the published puzzle is from what Claude read (app/lib/reads.server.ts)
      if (firstPublish && game.sketchImage) await notePublished(db, game.id, f.sketch);
      return;
    }
    case "doubt": {
      // tick off (or untick) one of Claude's doubts
      if (!canEdit(game, me, role)) throw new Forbidden("You can't edit this game.");
      const doubts = doubtsOf(game.parseNotes);
      const i = Number(form.get("index"));
      if (!doubts[i]) return;
      doubts[i] = { ...doubts[i], done: form.get("done") === "1" };
      await set({ parseNotes: doubts });
      return;
    }
    case "unpublish":
      if (!canEdit(game, me, role)) throw new Forbidden("You can't edit this game.");
      if (game.state !== "published") return;
      await set({ state: "draft" });
      return;
    case "hide": {
      if (!canHide(me, role)) throw new Forbidden("Only the collection's owners and admins can take a game down.");
      const note = String(form.get("note") ?? "").trim().slice(0, 500);
      if (!note) throw new Invalid("Say why it's being taken down; the author and owners will see this note.");
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

/** Upload a drawing: Claude reads it, and it becomes a draft to confirm. Returns the game's id. */
export async function createFromDrawing(db: Db, env: Env, me: Creator, form: FormData) {
  const collectionId = String(form.get("collection") ?? "");
  if (!canPublishInto(await roleIn(db, collectionId, me.id))) throw new Forbidden("You can only add games to collections you belong to.");
  const image = await imageFrom(form);
  // the photo is kept first, so a read that fails is still on record with it
  const id = newId();
  const key = `sketches/${id}/${crypto.randomUUID()}.${image.type.split("/")[1]}`;
  await env.MEDIA.put(key, image.bytes, { httpMetadata: { contentType: image.type } });
  const log: Attempt[] = [];
  const record = { creatorId: me.id, kind: "upload" as const, imageKey: key, attempts: log };
  let read;
  try {
    read = await readSketch(env, { data: toBase64(image.bytes), type: image.type }, { log });
  } catch (e) {
    await recordRead(db, { ...record, gameId: null, error: (e as Error).message });
    throw e;
  }
  const { reading, sketch } = read;
  await db.insert(schema.games).values({
    id, collectionId, authorId: me.id, sketch, sketchVersion: SKETCH_VERSION, kind: reading.genre, state: "draft",
    title: reading.title || "Untitled",   // a title written on the sketch; set in the editor otherwise
    sketchImage: key, reading: sketch, parseNotes: doubtsFrom(reading, sketch), kindChoices: choicesOf(reading),
  });
  await recordRead(db, { ...record, gameId: id, result: { reading, sketch, puzzleKind: reading.genre, model: log.at(-1)!.model } });
  return id;
}

/** Read the drawing again, with the creator's corrections. */
export async function rereadDrawing(db: Db, env: Env, me: Creator, game: Game, form: FormData) {
  if (!canEdit(game, me, await roleIn(db, game.collectionId, me.id))) throw new Forbidden("You can't edit this game.");
  if (game.state !== "draft") throw new Invalid("Move the game back to draft before re-reading its sketch.");
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
  try {
    read = await readSketch(env, { data: toBase64(new Uint8Array(await stored.arrayBuffer())), type },
      { previous: { sketch: game.sketch, feedback, genre }, log });
  } catch (e) {
    await recordRead(db, { ...record, error: (e as Error).message });
    throw e;
  }
  const { reading, sketch } = read;
  await recordRead(db, { ...record, result: { reading, sketch, puzzleKind: reading.genre, model: log.at(-1)!.model } });
  await db.update(schema.games).set({
    sketch, kind: reading.genre, sketchVersion: SKETCH_VERSION,
    reading: sketch, parseNotes: doubtsFrom(reading, sketch), kindChoices: choicesOf(reading), updatedAt: new Date(),
  }).where(eq(schema.games.id, game.id));
}


/** A reading's doubts: Claude's notes (tied to their cells) and anything that stops it playing. */
const doubtsFrom = (reading: Reading, sketch: string): Doubt[] => [
  ...reading.notes.map((n) => doubtFromNote(n, reading.rows, reading.cols)),
  ...sketchProblems(sketch).map((text) => ({ text, place: "whole" as const })),
];

