// The database (Cloudflare D1, SQLite) for the social site. Migrations in app/drizzle/ are
// generated from this file with `npm run db:generate`.
//
//   creators     people who make games (also Better Auth's "user" table)
//   collections  studios that own games; every creator has one personal collection
//   memberships  who belongs to which collection, as owner or contributor
//   games        one game each: its sketch (the "code"), details and state
//   featured     the site's Featured shelf, curated by admins
//
// Rules the database can't express are enforced in app/lib/permissions.server.ts
// (e.g. a collection always keeps at least one owner).
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;
const created = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(now);
const updated = () => integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now);

// ---- creators (Better Auth's user model, plus our fields) ----
export const creators = sqliteTable("creators", {
  id: text("id").primaryKey(),
  /** Display name. */
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: created(),
  updatedAt: updated(),
  /** Unique username; also the web address of their personal collection. */
  handle: text("handle").notNull().unique(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  /** Deleted accounts are hidden but keep their name, so their games stay credited. */
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
});

// ---- Better Auth's own tables ----
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: created(),
  updatedAt: updated(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => creators.id, { onDelete: "cascade" }),
}, (t) => [index("sessions_user").on(t.userId)]);

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => creators.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  /** Password hash, for email + password sign-in. */
  password: text("password"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("accounts_user").on(t.userId)]);

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("verifications_identifier").on(t.identifier)]);

// ---- collections ----
export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  /** Web address: wyattsgames.com/<slug>. Shares one namespace with creator handles. */
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** Set on a creator's personal collection: it can't be deleted and has no other members. */
  personalOf: text("personal_of").unique().references(() => creators.id),
  /** Deleting a studio takes its games offline but doesn't erase them. */
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  createdAt: created(),
  updatedAt: updated(),
});

// ---- memberships ----
export const ROLES = ["owner", "contributor"] as const;
export type Role = (typeof ROLES)[number];

export const memberships = sqliteTable("memberships", {
  collectionId: text("collection_id").notNull().references(() => collections.id),
  creatorId: text("creator_id").notNull().references(() => creators.id),
  role: text("role", { enum: ROLES }).notNull(),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.collectionId, t.creatorId] }), index("memberships_creator").on(t.creatorId)]);

// ---- games ----
export const GAME_STATES = ["draft", "published", "hidden"] as const;
export type GameState = (typeof GAME_STATES)[number];

export const games = sqliteTable("games", {
  /** Permanent: the game's web address is wyattsgames.com/g/<id> and never changes. */
  id: text("id").primaryKey(),
  collectionId: text("collection_id").notNull().references(() => collections.id),
  authorId: text("author_id").notNull().references(() => creators.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** The game's "code": its sketch, which a game parser turns into a playable game. */
  sketch: text("sketch").notNull(),
  /** The sketch format version it was written for, so old games keep parsing. */
  sketchVersion: integer("sketch_version").notNull().default(1),
  /** The game type its sketch parses as (e.g. "round-the-bend"); set when it's saved. */
  kind: text("kind").notNull(),
  /** Thumbnail image key in R2, if any. */
  thumbnail: text("thumbnail"),
  /** The hand-drawn sketch it was made from: an image key in R2. */
  sketchImage: text("sketch_image"),
  /** What Claude wasn't sure of when it read the drawing (JSON list of notes), for the creator to confirm. */
  /** what Claude wasn't sure of (Doubt[], or strings in older drafts) */
  parseNotes: text("parse_notes", { mode: "json" }).$type<unknown[]>(),
  /** Claude's latest reading of the drawing, as it came back (what Reset goes back to) */
  reading: text("reading"),
  /** The game types Claude thought the drawing could be, best first (the creator picks one). */
  kindChoices: text("kind_choices", { mode: "json" }).$type<string[]>(),
  state: text("state", { enum: GAME_STATES }).notNull().default("draft"),
  /** Why it was hidden, and by whom (an admin or a collection owner). */
  hiddenNote: text("hidden_note"),
  hiddenBy: text("hidden_by").references(() => creators.id),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  index("games_collection").on(t.collectionId, t.state),
  index("games_author").on(t.authorId),
  index("games_published").on(t.state, t.publishedAt),
]);

// ---- subscriptions: creators following collections (a person's own, or a studio) ----
export const subscriptions = sqliteTable("subscriptions", {
  subscriberId: text("subscriber_id").notNull().references(() => creators.id),
  collectionId: text("collection_id").notNull().references(() => collections.id),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.subscriberId, t.collectionId] }), index("subscriptions_collection").on(t.collectionId)]);

// ---- likes: a creator liking a game (one each) ----
export const likes = sqliteTable("likes", {
  creatorId: text("creator_id").notNull().references(() => creators.id),
  gameId: text("game_id").notNull().references(() => games.id),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.creatorId, t.gameId] }), index("likes_game").on(t.gameId)]);

// ---- the Featured shelf ----
export const featured = sqliteTable("featured", {
  gameId: text("game_id").primaryKey().references(() => games.id),
  /** Order on the shelf, lowest first. */
  position: integer("position").notNull().default(0),
  featuredBy: text("featured_by").notNull().references(() => creators.id),
  createdAt: created(),
}, (t) => [index("featured_position").on(t.position)]);
