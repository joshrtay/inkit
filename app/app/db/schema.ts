// The database (Cloudflare D1, SQLite) for the social site. Migrations in app/drizzle/ are
// generated from this file with `npm run db:generate`.
//
//   creators     people who make games (also Better Auth's "user" table)
//   collections  studios that own games; every creator has one personal collection
//   memberships  who belongs to which collection, as owner or contributor
//   games        one game each: its sketch (the "code"), details and state
//   featured     a Featured shelf (retired: nothing reads or writes it; kept to avoid a migration)
//   recommendations  who a creator recommends (up to five, in order, each with a line why): the
//                profile's Recommends tab and Explore's "… recommends" row
//   bug_reports  "Report a bug": the report, the gatekeeper's verdict; its files are in R2 (docs/bug-pipeline.md)
//
// Rules the database can't express are enforced in app/lib/permissions.server.ts
// (e.g. a collection always keeps at least one owner).
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  /** An AI creator (app/ai/personas.ts): no password, can't sign in, labelled AI wherever it's named. */
  isAi: integer("is_ai", { mode: "boolean" }).notNull().default(false),
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
  /** Web address: inkit.games/<slug>. Shares one namespace with creator handles. */
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
/** draft → published (locked: it can't be changed, only deleted); hidden = taken down by an owner or
 *  admin; deleted = deleted by its author or an admin, gone for everyone (a soft delete, not undone). */
export const GAME_STATES = ["draft", "published", "hidden", "deleted"] as const;
export type GameState = (typeof GAME_STATES)[number];

export const games = sqliteTable("games", {
  /** Permanent: the game's web address is inkit.games/g/<id> and never changes. */
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
  /** The paint drawing it's made from (docs/creation-flow.md), as JSON: the drawing, its type and
   *  its rule settings (app/games/paint-save.ts). The source of truth once it has one: `sketch` is
   *  converted from it on every save. */
  drawing: text("drawing", { mode: "json" }).$type<unknown>(),
  state: text("state", { enum: GAME_STATES }).notNull().default("draft"),
  /** Why it was hidden, and by whom (an admin or a collection owner). */
  hiddenNote: text("hidden_note"),
  hiddenBy: text("hidden_by").references(() => creators.id),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  /** A scheduled draft: the cron publishes it at this time (app/lib/ai.server.ts), then clears it. */
  publishAt: integer("publish_at", { mode: "timestamp_ms" }),
  /** How hard it is, 0 (a warm-up) to 1, and the rough time to solve it in minutes (Explore's cards
   *  and shelves): app/games/estimate.ts, set whenever the sketch is saved; an AI creator's post
   *  keeps its scorer's difficulty. Null until estimated (the cron fills in older games). */
  difficulty: real("difficulty"),
  /** 1 easy, 2 medium, 3 hard: the difficulty's three dots */
  level: integer("level"),
  minutes: integer("minutes"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  index("games_scheduled").on(t.state, t.publishAt),
  index("games_kind").on(t.kind, t.state, t.publishedAt),
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

// ---- reads: every time Claude read a drawing, and how the published puzzle differed ----
// The measure of how well drawings are read, and (photo + reading + what the creator published)
// the makings of a training set. See app/lib/reads.server.ts.
export const reads = sqliteTable("reads", {
  id: text("id").primaryKey(),
  /** the draft it made or re-read (null when an upload's read failed before a draft existed) */
  gameId: text("game_id").references(() => games.id),
  creatorId: text("creator_id").notNull().references(() => creators.id),
  createdAt: created(),
  /** "upload" (a new drawing) or "reread" (corrections, or a type the creator chose) */
  kind: text("kind", { enum: ["upload", "reread"] }).notNull(),
  /** the photo in R2 */
  imageKey: text("image_key"),
  /** a re-read's corrections and chosen type */
  feedback: text("feedback"),
  chosenKind: text("chosen_kind"),
  /** each reader that looked: model, effort, time, tokens, why it handed over */
  attempts: text("attempts", { mode: "json" }).$type<unknown[]>().notNull(),
  /** the model whose reading was used */
  model: text("model"),
  /** Claude's structured answer, as it came back, and the sketch made from it */
  reading: text("reading", { mode: "json" }).$type<unknown>(),
  sketch: text("sketch"),
  /** the puzzle type it was read as */
  puzzleKind: text("puzzle_kind"),
  /** why it failed, if it did */
  error: text("error"),
  /** the puzzle as first published, and how it differs from `sketch` (see app/games/diff.ts) */
  publishedSketch: text("published_sketch"),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  diff: text("diff", { mode: "json" }).$type<unknown>(),
}, (t) => [index("reads_game").on(t.gameId), index("reads_created").on(t.createdAt)]);

// ---- likes: a creator liking a game (one each) ----
export const likes = sqliteTable("likes", {
  creatorId: text("creator_id").notNull().references(() => creators.id),
  gameId: text("game_id").notNull().references(() => games.id),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.creatorId, t.gameId] }), index("likes_game").on(t.gameId)]);

// ---- solves: a signed-in creator solving a game (one each; not its author's own) ----
export const solves = sqliteTable("solves", {
  creatorId: text("creator_id").notNull().references(() => creators.id),
  gameId: text("game_id").notNull().references(() => games.id),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.creatorId, t.gameId] }), index("solves_game").on(t.gameId)]);

// ---- the Featured shelf ----
export const featured = sqliteTable("featured", {
  gameId: text("game_id").primaryKey().references(() => games.id),
  /** Order on the shelf, lowest first. */
  position: integer("position").notNull().default(0),
  featuredBy: text("featured_by").notNull().references(() => creators.id),
  createdAt: created(),
}, (t) => [index("featured_position").on(t.position)]);

// ---- recommendations: a creator recommending other creators (people or AI), after Substack's;
//      at most five each (app/lib/rank.ts MAX_RECOMMENDATIONS) ----
export const recommendations = sqliteTable("recommendations", {
  recommenderId: text("recommender_id").notNull().references(() => creators.id),
  recommendedId: text("recommended_id").notNull().references(() => creators.id),
  /** order on the profile, lowest first */
  position: integer("position").notNull().default(0),
  /** a line, in their own words, of why */
  note: text("note").notNull().default(""),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.recommenderId, t.recommendedId] }), index("recommendations_recommended").on(t.recommendedId)]);

// ---- bug reports (docs/bug-pipeline.md): the row; the replay, screenshot and state are in R2 under bugs/<id>/ ----
export const BUG_STATES = ["new", "reviewed", "quarantined", "dismissed", "duplicate", "sent"] as const;
export type BugState = (typeof BUG_STATES)[number];
export const bugReports = sqliteTable("bug_reports", {
  id: text("id").primaryKey(),
  creatorId: text("creator_id").notNull().references(() => creators.id),
  createdAt: created(),
  /** what the reporter typed: never leaves the site (not to GitHub, not to the fixer) */
  what: text("what").notNull(),
  expected: text("expected").notNull().default(""),
  state: text("state", { enum: BUG_STATES }).notNull().default("new"),
  /** the gatekeeper's structured answer (app/lib/bugs/gatekeeper.server.ts), or why there isn't one */
  verdict: text("verdict", { mode: "json" }).$type<unknown>(),
  verdictError: text("verdict_error"),
  /** the build (commit) the reporter's browser ran, the page and the game it was on */
  version: text("version").notNull().default(""),
  route: text("route").notNull().default(""),
  gameId: text("game_id"),
  hasReplay: integer("has_replay", { mode: "boolean" }).notNull().default(false),
  hasScreenshot: integer("has_screenshot", { mode: "boolean" }).notNull().default(false),
  duplicateOf: text("duplicate_of"),
  issueNumber: integer("issue_number"),
  issueUrl: text("issue_url"),
}, (t) => [index("bug_reports_creator").on(t.creatorId, t.createdAt), index("bug_reports_created").on(t.createdAt)]);
