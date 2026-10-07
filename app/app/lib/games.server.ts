// Making and changing games: create, save, publish, back to draft, take down, restore, feature.
// Every change re-checks permissions (permissions.server.ts) and re-parses the sketch here on
// the server. Publishing also needs the editor's one-solution check (count-solutions.client.ts) to
// have passed for this exact sketch: the form sends the sketch's hash, which the browser only
// fills in after the solver found exactly one solution. (The solver runs in the browser;
// re-proving on the server is for later.)
import { eq } from "drizzle-orm";
import { schema, type Db } from "../db";
import { parseSketch, SKETCH_VERSION } from "../games/sketch";
import { newId } from "./names.server";
import { canEdit, canHide, canPublishInto, Forbidden, roleIn } from "./permissions.server";
import { IMAGE_TYPES, readSketch, sketchProblems, toBase64, type Reading } from "./read-sketch.server";

/** The game types a reading could be, its own first (at most 4). */
const choicesOf = (r: Reading) => [...new Set([r.genre, ...(r.candidates ?? [])])].slice(0, 4);

type Creator = typeof schema.creators.$inferSelect;
type Game = typeof schema.games.$inferSelect;

import { Invalid } from "./errors.server";
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

/** Parse a sketch or explain what's wrong; for publishing, also require its one-solution check. */
async function validated(f: Fields, publishing: boolean) {
  if (!f.title) throw new Invalid("Give the game a title.");
  const parsed = parseSketch(f.sketch);
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
      const parsed = await validated(f, publishing);
      await set({
        title: f.title, description: f.description, sketch: f.sketch, sketchVersion: SKETCH_VERSION, kind: parsed.kind,
        ...(intent === "publish" && game.state !== "published" ? { state: "published", publishedAt: game.publishedAt ?? new Date() } : {}),
      });
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
  const { reading, sketch } = await readSketch(env, { data: toBase64(image.bytes), type: image.type });

  const id = newId();
  const key = `sketches/${id}/${crypto.randomUUID()}.${image.type.split("/")[1]}`;
  await env.MEDIA.put(key, image.bytes, { httpMetadata: { contentType: image.type } });
  await db.insert(schema.games).values({
    id, collectionId, authorId: me.id, sketch, sketchVersion: SKETCH_VERSION, kind: reading.genre, state: "draft",
    title: String(form.get("title") ?? "").trim().slice(0, 120) || reading.title || "Untitled",
    sketchImage: key, parseNotes: [...reading.notes, ...sketchProblems(sketch)], kindChoices: choicesOf(reading),
  });
  return id;
}

/** Read the drawing again, with the creator's corrections. */
export async function rereadDrawing(db: Db, env: Env, me: Creator, game: Game, form: FormData) {
  if (!canEdit(game, me, await roleIn(db, game.collectionId, me.id))) throw new Forbidden("You can't edit this game.");
  if (game.state !== "draft") throw new Invalid("Move the game back to draft before re-reading its sketch.");
  const feedback = String(form.get("feedback") ?? "").trim().slice(0, 2000);
  if (!feedback) throw new Invalid("Say what's wrong, e.g. \"row 3 has a rock in column 2, not 3\".");
  const stored = game.sketchImage ? await env.MEDIA.get(game.sketchImage) : null;
  if (!stored) throw new Invalid("This game has no uploaded sketch to re-read.");
  const type = (stored.httpMetadata?.contentType ?? "image/jpeg") as (typeof IMAGE_TYPES)[number];
  const { reading, sketch } = await readSketch(env, { data: toBase64(new Uint8Array(await stored.arrayBuffer())), type },
    { previous: { sketch: game.sketch, feedback } });
  await db.update(schema.games).set({
    sketch, kind: reading.genre, sketchVersion: SKETCH_VERSION,
    parseNotes: [...reading.notes, ...sketchProblems(sketch)], kindChoices: choicesOf(reading), updatedAt: new Date(),
  }).where(eq(schema.games.id, game.id));
}

