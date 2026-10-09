// Bug reports on the Worker (docs/bug-pipeline.md): taking one in (signed in, rate limited, size
// limited), storing it (the row in D1; the replay, screenshot and state in R2 under bugs/<id>/),
// the gatekeeper's review after the response has gone, and what the admin pages do with it.
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema, type Db } from "~/db";
import { newId } from "../names.server";
import { reviewReport, type GatekeeperInput } from "./gatekeeper.server";
import { fileIssue } from "./github.server";
import { capVerdict, LIMITS, quarantined, validateReport, Verdict, type ReportState } from "./report";
import type { FailedFetch } from "./ring";

export class BugError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export const bugKey = (id: string, file: "replay.json.gz" | "screenshot.jpeg" | "state.json") => `bugs/${id}/${file}`;
const DAY = 24 * 60 * 60 * 1000;

export function perDay(env: Env) {
  const n = Number(env.BUG_REPORTS_PER_DAY);
  return Number.isInteger(n) && n > 0 ? n : LIMITS.perDay;
}

/** How many reports this person has sent in the last day: the D1 counter the rate limit reads. */
export async function sentToday(db: Db, creatorId: string, now = Date.now()) {
  const rows = await db.select({ id: schema.bugReports.id }).from(schema.bugReports)
    .where(and(eq(schema.bugReports.creatorId, creatorId), gte(schema.bugReports.createdAt, new Date(now - DAY))));
  return rows.length;
}

async function fileOf(form: FormData, name: string, max: number, types: string[]) {
  const f = form.get(name);
  if (!(f instanceof File) || !f.size) return null;
  if (f.size > max) throw new BugError(`The ${name} is too big to send (over ${Math.round(max / 1024 / 1024)} MB).`, 413);
  if (types.length && !types.includes(f.type)) throw new BugError(`The ${name} isn't a ${types.join(" or ")}.`, 415);
  return new Uint8Array(await f.arrayBuffer());
}

/** Take a report in. Returns its id; the gatekeeper runs afterwards (`ctx.waitUntil`). */
export async function createReport(env: Env, ctx: ExecutionContext, creatorId: string, form: FormData) {
  const db = getDb(env);
  if (await sentToday(db, creatorId) >= perDay(env)) {
    throw new BugError("That's as many reports as we can take from you today. Thank you! Try again tomorrow.", 429);
  }
  const checked = validateReport({ what: form.get("what"), expected: form.get("expected"), state: form.get("state") });
  if (!checked.ok) throw new BugError(checked.error);
  const { what, expected, state, stateJson } = checked.value;
  const replay = await fileOf(form, "replay", LIMITS.replay, ["application/gzip", "application/x-gzip", "application/octet-stream"]);
  // a gzip file starts 1f 8b: anything else isn't the recording
  if (replay && !(replay[0] === 0x1f && replay[1] === 0x8b)) throw new BugError("The recording didn't come through.");
  const screenshot = await fileOf(form, "screenshot", LIMITS.screenshot, ["image/jpeg"]);

  const id = newId(12);
  await env.MEDIA.put(bugKey(id, "state.json"), stateJson, { httpMetadata: { contentType: "application/json" } });
  if (replay) await env.MEDIA.put(bugKey(id, "replay.json.gz"), replay, { httpMetadata: { contentType: "application/gzip" } });
  if (screenshot) await env.MEDIA.put(bugKey(id, "screenshot.jpeg"), screenshot, { httpMetadata: { contentType: "image/jpeg" } });
  await db.insert(schema.bugReports).values({
    id, creatorId, what, expected, state: "new", version: state.version, route: state.route, gameId: state.gameId,
    hasReplay: !!replay, hasScreenshot: !!screenshot,
  });

  // the browser tests give the verdict themselves, so they never call Claude; only in development
  const given = import.meta.env.DEV ? form.get("given-verdict") : null;
  ctx.waitUntil(review(env, id, { what, expected, state }, typeof given === "string" && given ? given : null));
  return id;
}

/** The gatekeeper's review, stored on the report. Never throws: a failure is recorded instead. */
export async function review(env: Env, id: string, report: { what: string; expected: string; state: ReportState }, given: string | null = null) {
  const db = getDb(env);
  try {
    const open = await db.select({ id: schema.bugReports.id, verdict: schema.bugReports.verdict }).from(schema.bugReports)
      .where(inArray(schema.bugReports.state, ["new", "reviewed", "sent"])).orderBy(desc(schema.bugReports.createdAt)).limit(21);
    const others = open.filter((o) => o.id !== id && o.verdict).slice(0, 20)
      .map((o) => ({ id: o.id, restatement: (o.verdict as Verdict).restatement ?? "" }));
    const logs = (report.state.logs as { text?: string }[] | undefined) ?? [];
    const fails = (report.state.fails as FailedFetch[] | undefined) ?? [];
    const input: GatekeeperInput = {
      what: report.what, expected: report.expected, open: others,
      page: { route: report.state.route, errors: logs.map((l) => String(l.text ?? "")), failedFetches: fails.map((f) => `${f.method} ${f.path} ${f.status}`) },
    };
    const verdict = given ? capVerdict(Verdict.parse(JSON.parse(given)), others.map((o) => o.id)) : (await reviewReport(env, input)).verdict;
    await db.update(schema.bugReports).set({ verdict, verdictError: null, state: quarantined(verdict) ? "quarantined" : "reviewed" })
      .where(eq(schema.bugReports.id, id));
  } catch (e) {
    console.log(`bug report ${id}: gatekeeper failed: ${(e as Error).message}`);
    await db.update(schema.bugReports).set({ verdictError: (e as Error).message.slice(0, 500) }).where(eq(schema.bugReports.id, id));
  }
}

// ---- the admin pages ----

export async function listReports(db: Db, limit = 200) {
  return db.select({
    id: schema.bugReports.id, createdAt: schema.bugReports.createdAt, what: schema.bugReports.what, state: schema.bugReports.state,
    verdict: schema.bugReports.verdict, verdictError: schema.bugReports.verdictError, route: schema.bugReports.route,
    issueNumber: schema.bugReports.issueNumber, handle: schema.creators.handle,
  }).from(schema.bugReports).leftJoin(schema.creators, eq(schema.creators.id, schema.bugReports.creatorId))
    .orderBy(desc(schema.bugReports.createdAt)).limit(limit);
}

export async function getReport(db: Db, id: string) {
  const [row] = await db.select({ report: schema.bugReports, handle: schema.creators.handle }).from(schema.bugReports)
    .leftJoin(schema.creators, eq(schema.creators.id, schema.bugReports.creatorId)).where(eq(schema.bugReports.id, id));
  return row ? { ...row.report, handle: row.handle } : null;
}

/** Send to GitHub: only a reviewed report that the gatekeeper didn't flag, and only once. */
export async function sendToGitHub(env: Env, id: string, origin: string, options: { api?: string; token?: string } = {}) {
  const db = getDb(env);
  const r = await getReport(db, id);
  if (!r) throw new BugError("No such report.", 404);
  if (r.issueNumber) throw new BugError(`Already sent: issue #${r.issueNumber}.`);
  if (!r.verdict) throw new BugError("The gatekeeper hasn't reviewed it, so there's no restatement to send.");
  const verdict = r.verdict as Verdict;
  if (quarantined(verdict) || r.state === "quarantined") throw new BugError("The gatekeeper flagged this report; it never goes to GitHub.");
  const issue = await fileIssue(env, { id, verdict, version: r.version, route: r.route, adminUrl: `${origin}/admin/bugs/${id}` }, options);
  await db.update(schema.bugReports).set({ state: "sent", issueNumber: issue.number, issueUrl: issue.url }).where(eq(schema.bugReports.id, id));
  return issue;
}

export async function setReportState(db: Db, id: string, state: "dismissed" | "duplicate" | "reviewed", duplicateOf: string | null = null) {
  if (state === "duplicate" && (!duplicateOf || duplicateOf === id || !(await getReport(db, duplicateOf)))) throw new BugError("Name the report it repeats.");
  await db.update(schema.bugReports).set({ state, duplicateOf: state === "duplicate" ? duplicateOf : null }).where(eq(schema.bugReports.id, id));
}

/** What the bug-fix workflow gets (GET /admin/bugs/<id>/bundle): the gatekeeper's words and our own
 *  recorded data, the state and the console log. Not the reporter's text, not the replay. */
export async function bundleOf(env: Env, id: string) {
  const r = await getReport(getDb(env), id);
  if (!r || !r.verdict || r.state === "quarantined") return null;
  const v = r.verdict as Verdict;
  const state = JSON.parse(await (await env.MEDIA.get(bugKey(id, "state.json")))?.text() ?? "{}") as Record<string, unknown>;
  const { logs, fails, ...page } = state;
  return {
    id, version: r.version, route: r.route, gameId: r.gameId,
    restatement: v.restatement, repro_steps: v.repro_steps, severity: v.severity, area: v.area,
    state: page, console: logs ?? [], failedFetches: fails ?? [],
  };
}
