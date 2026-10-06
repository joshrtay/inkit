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

type Creator = typeof schema.creators.$inferSelect;
type Game = typeof schema.games.$inferSelect;

export class Invalid extends Error {}

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

export async function createGame(db: Db, me: Creator, form: FormData) {
  const collectionId = String(form.get("collection") ?? "");
  const role = await roleIn(db, collectionId, me.id);
  if (!canPublishInto(role)) throw new Forbidden("You can only add games to collections you belong to.");
  const publish = form.get("intent") === "publish";
  const f = fieldsFrom(form);
  const parsed = await validated(f, publish);
  const id = newId();
  await db.insert(schema.games).values({
    id, collectionId, authorId: me.id, title: f.title, description: f.description, sketch: f.sketch,
    sketchVersion: SKETCH_VERSION, kind: parsed.kind, state: publish ? "published" : "draft",
    publishedAt: publish ? new Date() : null,
  });
  return id;
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
