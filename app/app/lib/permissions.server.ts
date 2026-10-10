// Who may see and change what. These rules come straight from the site's model:
//
//  - Owners manage members, change the collection's details, and edit or take down any game in it.
//  - Contributors publish their own games into the collection and edit those games.
//  - Drafts are visible only to their author and the collection's owners.
//  - A collection always keeps at least one owner; the last owner can't leave without handing it on.
//  - A personal collection can't be deleted and has no other members.
//  - When someone leaves, they lose edit access, but their games stay with the collection and keep their credit.
//  - Admins can hide any game.
//  - A published puzzle can't be changed, only deleted (docs/creation-flow.md, decision 8): only a
//    draft is edited. Its author (or an admin) can delete it; deleting is for good, and a deleted
//    game is gone for everyone (a soft delete: the row stays, so its solves and likes break nothing).
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "../db";
import type { Role } from "../db/schema";

type Creator = typeof schema.creators.$inferSelect;
type Game = typeof schema.games.$inferSelect;
type Collection = typeof schema.collections.$inferSelect;

export class Forbidden extends Error {}

/** A creator's role in a collection, or null if they aren't a member. */
export async function roleIn(db: Db, collectionId: string, creatorId: string | undefined): Promise<Role | null> {
  if (!creatorId) return null;
  const m = await db.query.memberships.findFirst({
    columns: { role: true },
    where: and(eq(schema.memberships.collectionId, collectionId), eq(schema.memberships.creatorId, creatorId)),
  });
  return m?.role ?? null;
}

/** Can this person see the game? (null = signed out) */
export function canView(game: Game, collection: Collection, viewer: Creator | null, role: Role | null) {
  if (game.state === "deleted") return false;
  if (game.state === "published" && !collection.deletedAt) return true;
  if (!viewer) return false;
  if (viewer.isAdmin) return true;
  if (game.state === "draft") return game.authorId === viewer.id || role === "owner";
  return role === "owner";   // hidden: the collection's owners can still see it, with the note
}

/** Can this person edit the game? Its author, while still a member, or the collection's owners. */
export function canEdit(game: Pick<Game, "authorId" | "state">, viewer: Pick<Creator, "id"> | null, role: Role | null) {
  if (!viewer || !role || game.state === "deleted") return false;
  return role === "owner" || game.authorId === viewer.id;
}

/** Can this person change the puzzle itself (paint, RYB's editor, the publish page)? Only a draft,
 *  by those who can edit it: a published puzzle (or one taken down) is locked. */
export const canChange = (game: Pick<Game, "authorId" | "state">, viewer: Pick<Creator, "id"> | null, role: Role | null) =>
  game.state === "draft" && canEdit(game, viewer, role);

/** Can this person delete the game? Its author (while a member), or an admin. Not undone. */
export function canDelete(game: Pick<Game, "authorId" | "state">, viewer: Pick<Creator, "id" | "isAdmin"> | null, role: Role | null) {
  if (!viewer || game.state === "deleted") return false;
  return viewer.isAdmin || (game.authorId === viewer.id && !!role);
}

/** Can this person take the game down (hide it)? The collection's owners, and admins. */
export const canHide = (viewer: Pick<Creator, "isAdmin"> | null, role: Role | null) => !!viewer && (viewer.isAdmin || role === "owner");

/** Can this person publish into the collection? Any member. */
export const canPublishInto = (role: Role | null) => role === "owner" || role === "contributor";

/** Can this person change the collection's details and members? Its owners. */
export const canManage = (role: Role | null) => role === "owner";

/** Remove a member, keeping at least one owner. Personal collections have no other members. */
export async function removeMember(db: Db, collection: Collection, creatorId: string) {
  if (collection.personalOf) throw new Forbidden("A personal collection can't lose its owner.");
  const members = await db.query.memberships.findMany({ where: eq(schema.memberships.collectionId, collection.id) });
  const leaving = members.find((m) => m.creatorId === creatorId);
  if (!leaving) return;
  if (leaving.role === "owner" && members.filter((m) => m.role === "owner").length === 1) {
    throw new Forbidden("The last owner can't leave. Make someone else an owner first.");
  }
  await db.delete(schema.memberships)
    .where(and(eq(schema.memberships.collectionId, collection.id), eq(schema.memberships.creatorId, creatorId)));
}

/** Add someone to a shared studio (personal collections have no other members). */
export async function addMember(db: Db, collection: Collection, creatorId: string, role: Role) {
  if (collection.personalOf) throw new Forbidden("Personal collections have no other members.");
  await db.insert(schema.memberships).values({ collectionId: collection.id, creatorId, role })
    .onConflictDoUpdate({ target: [schema.memberships.collectionId, schema.memberships.creatorId], set: { role } });
}

/** Change a member's role, keeping at least one owner. */
export async function setRole(db: Db, collection: Collection, creatorId: string, role: Role) {
  if (role === "contributor") {
    const owners = await db.query.memberships.findMany({
      where: and(eq(schema.memberships.collectionId, collection.id), eq(schema.memberships.role, "owner")),
    });
    if (owners.length === 1 && owners[0].creatorId === creatorId) throw new Forbidden("A collection needs at least one owner.");
  }
  await db.update(schema.memberships).set({ role })
    .where(and(eq(schema.memberships.collectionId, collection.id), eq(schema.memberships.creatorId, creatorId)));
}

/** Delete a studio: its games go offline but aren't erased. Personal collections can't be deleted. */
export async function deleteCollection(db: Db, collection: Collection) {
  if (collection.personalOf) throw new Forbidden("A personal collection can't be deleted.");
  await db.update(schema.collections).set({ deletedAt: new Date() }).where(eq(schema.collections.id, collection.id));
}
