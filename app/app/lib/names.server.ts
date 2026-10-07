// Handles and collection web addresses share one namespace (wyattsgames.com/<slug>), so a
// creator's personal collection can always live at their handle.
import { eq } from "drizzle-orm";
import { schema, type Db } from "../db";

/** Paths the site itself uses; no handle or collection may take them. */
const RESERVED = new Set([
  "g", "api", "app", "admin", "new", "edit", "settings", "signin", "signup", "signout", "login", "logout",
  "account", "about", "help", "featured", "explore", "search", "studios", "studio", "collections", "games",
  "assets", "static", "public", "www", "wyattsgames", "puzzles", "rules", "guide", "guides", "privacy", "terms", "legal",
]);

export const HANDLE_HINT = "Handles are 3 to 30 lowercase letters, numbers or dashes, starting with a letter.";

export const isReserved = (s: string) => RESERVED.has(s);
export const isValidHandle = (s: string) => /^[a-z][a-z0-9-]{2,29}$/.test(s) && !s.endsWith("-") && !s.includes("--") && !RESERVED.has(s);

/** Is a web address already used by a creator or a collection (including deleted ones)? */
export async function slugTaken(db: Db, slug: string) {
  const [c, k] = await Promise.all([
    db.query.creators.findFirst({ columns: { id: true }, where: eq(schema.creators.handle, slug) }),
    db.query.collections.findFirst({ columns: { id: true }, where: eq(schema.collections.slug, slug) }),
  ]);
  return !!(c || k);
}

/** A short random id (games' permanent addresses, collections). */
export function newId(length = 10) {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";   // no 0/o, 1/l/i
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
