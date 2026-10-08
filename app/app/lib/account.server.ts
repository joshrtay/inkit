// A creator's own account, from Settings: their name and bio (shown on their profile, which is
// their personal collection) and their handle (their profile's address). Email and password
// changes go through Better Auth from the page (auth.server.ts).
import { eq } from "drizzle-orm";
import { schema, type Db } from "../db";
import { HANDLE_HINT, isReserved, isValidHandle, slugTaken } from "./names.server";
import { Invalid } from "./errors.server";

type Creator = typeof schema.creators.$inferSelect;

const text = (form: FormData, name: string, max: number) => String(form.get(name) ?? "").trim().slice(0, max);

/** The profile: a name (the creator's, and their personal collection's title) and a bio. */
export async function changeProfile(db: Db, me: Creator, form: FormData) {
  const name = text(form, "name", 80);
  if (!name) throw new Invalid("Your profile needs a name.");
  const bio = text(form, "bio", 1000);
  await db.batch([
    db.update(schema.creators).set({ name, updatedAt: new Date() }).where(eq(schema.creators.id, me.id)),
    db.update(schema.collections).set({ title: name, description: bio, updatedAt: new Date() }).where(eq(schema.collections.personalOf, me.id)),
  ]);
}

/** A new handle: the profile moves to its new address (puzzles keep theirs, at /g/<id>). */
export async function changeHandle(db: Db, me: Creator, form: FormData) {
  const handle = text(form, "handle", 31).replace(/^@/, "").toLowerCase();
  if (handle === me.handle) return handle;
  if (isReserved(handle)) throw new Invalid("That handle is reserved for the site. Try another.");
  if (!isValidHandle(handle)) throw new Invalid(HANDLE_HINT);
  if (await slugTaken(db, handle)) throw new Invalid("That handle is taken.");
  await db.batch([
    db.update(schema.creators).set({ handle, updatedAt: new Date() }).where(eq(schema.creators.id, me.id)),
    db.update(schema.collections).set({ slug: handle, updatedAt: new Date() }).where(eq(schema.collections.personalOf, me.id)),
  ]);
  return handle;
}
