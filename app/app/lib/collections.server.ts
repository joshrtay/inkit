// Starting studios and managing collections. The rules live in permissions.server.ts; this
// reads the forms and applies them.
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Db } from "../db";
import type { Role } from "../db/schema";
import { Invalid } from "./games.server";
import { HANDLE_HINT, isReserved, isValidHandle, newId, slugTaken } from "./names.server";
import { addMember, canManage, deleteCollection, Forbidden, removeMember, roleIn, setRole } from "./permissions.server";

type Creator = typeof schema.creators.$inferSelect;
type Collection = typeof schema.collections.$inferSelect;
const text = (form: FormData, k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);

/** Anyone can start a studio; they become its first owner. Returns its web address. */
export async function createStudio(db: Db, me: Creator, form: FormData) {
  const title = text(form, "title", 80), description = text(form, "description", 1000);
  const slug = text(form, "slug", 30).toLowerCase();
  if (!title) throw new Invalid("Give the studio a name.");
  if (isReserved(slug)) throw new Invalid("That web address is reserved for the site. Try another.");
  if (!isValidHandle(slug)) throw new Invalid(HANDLE_HINT.replace("Handles", "Web addresses"));
  if (await slugTaken(db, slug)) throw new Invalid("That web address is taken.");
  const id = newId();
  await db.batch([
    db.insert(schema.collections).values({ id, slug, title, description }),
    db.insert(schema.memberships).values({ collectionId: id, creatorId: me.id, role: "owner" }),
  ]);
  return slug;
}

/** The settings page's forms. Returns a short note for the page, or a redirect target. */
export async function changeCollection(db: Db, me: Creator, collection: Collection, form: FormData): Promise<{ note?: string; goTo?: string }> {
  const intent = String(form.get("intent"));
  const role = await roleIn(db, collection.id, me.id);
  const owner = canManage(role);
  const ownerOnly = () => { if (!owner) throw new Forbidden("Only the collection's owners can do that."); };

  switch (intent) {
    case "details": {
      ownerOnly();
      const title = text(form, "title", 80);
      if (!title) throw new Invalid("A collection needs a name.");
      await db.update(schema.collections).set({ title, description: text(form, "description", 1000), updatedAt: new Date() })
        .where(eq(schema.collections.id, collection.id));
      return { note: "Saved." };
    }
    case "add": {
      ownerOnly();
      const handle = text(form, "handle", 31).replace(/^@/, "").toLowerCase();
      const newRole = form.get("role") === "owner" ? "owner" : "contributor";
      const who = await db.query.creators.findFirst({ where: and(eq(schema.creators.handle, handle), isNull(schema.creators.deletedAt)) });
      if (!who) throw new Invalid(`There's no creator called @${handle}.`);
      if (await roleIn(db, collection.id, who.id)) throw new Invalid(`@${handle} is already a member.`);
      await addMember(db, collection, who.id, newRole);
      return { note: `Added @${handle} as ${newRole === "owner" ? "an owner" : "a contributor"}.` };
    }
    case "role": {
      ownerOnly();
      await setRole(db, collection, String(form.get("creator")), String(form.get("role")) as Role);
      return { note: "Role changed." };
    }
    case "remove": {
      ownerOnly();
      await removeMember(db, collection, String(form.get("creator")));
      return { note: "Removed. Their games stay here, with their name on them." };
    }
    case "leave": {
      if (!role) throw new Invalid("You aren't a member.");
      await removeMember(db, collection, me.id);
      return { goTo: `/${collection.slug}` };
    }
    case "delete": {
      ownerOnly();
      if (text(form, "confirm", 30).toLowerCase() !== collection.slug) throw new Invalid(`Type ${collection.slug} to confirm.`);
      await deleteCollection(db, collection);
      return { goTo: `/${me.handle}` };
    }
    default:
      throw new Invalid("Unknown action.");
  }
}

/** Members with the ids the settings forms need. */
export const membersOf = (db: Db, collectionId: string) => db.select({
  id: schema.creators.id, handle: schema.creators.handle, name: schema.creators.name, role: schema.memberships.role,
}).from(schema.memberships)
  .innerJoin(schema.creators, eq(schema.memberships.creatorId, schema.creators.id))
  .where(eq(schema.memberships.collectionId, collectionId));
