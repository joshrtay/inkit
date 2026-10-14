// How long a request spent, for the `Server-Timing` header (db, auth, total), so pages can be timed
// locally and on the live site (the browser's Network panel shows it under Timing).
//
// The root's middleware (`timingMiddleware`, root.tsx) gives each request its own `env`: the
// Worker's bindings with the database wrapped so every query is timed. That `env` is also how a
// request's own things are found again (the timing, the signed-in creator: auth.server.ts), since
// every loader is handed it.
import type { MiddlewareFunction } from "react-router";
import { cloudflareContext } from "./context";
import { prefetchCaching } from "./prefetch";

export interface Timing {
  start: number;
  /** wall time with at least one query in flight (queries run side by side count once) */
  db: number;
  queries: number;
  /** the session lookup (auth.server.ts's currentCreator) */
  auth: number;
  inFlight: number;
  busySince: number;
  /** development only: each query waits this long first, as a round trip to D1 would */
  delay: number;
}

const timings = new WeakMap<object, Timing>();

/** This request's timing, if `env` is a request's own (null for the cron's, or a test's). */
export const timingOf = (env: object): Timing | null => timings.get(env) ?? null;

const now = () => performance.now();

async function timed<T>(t: Timing, run: () => Promise<T>): Promise<T> {
  if (t.inFlight++ === 0) t.busySince = now();
  t.queries++;
  try {
    if (t.delay) await new Promise((r) => setTimeout(r, t.delay));
    return await run();
  } finally {
    if (--t.inFlight === 0) t.db += now() - t.busySince;
  }
}

const RUNS = new Set(["first", "all", "run", "raw"]);
const RAW = Symbol("the statement itself");

/** A prepared statement whose runs are timed (and whose bind() gives another). */
function timedStatement(s: D1PreparedStatement, t: Timing): D1PreparedStatement {
  return new Proxy(s, {
    get(target, prop) {
      if (prop === RAW) return target;
      if (prop === "bind") return (...args: unknown[]) => timedStatement(target.bind(...args), t);
      const v: unknown = Reflect.get(target, prop, target);
      if (typeof v !== "function") return v;
      if (typeof prop === "string" && RUNS.has(prop)) return (...args: unknown[]) => timed(t, () => v.apply(target, args) as Promise<unknown>);
      return v.bind(target);
    },
  });
}

/** D1's batch() wants its own statements, not the timed ones. */
const unwrap = (s: D1PreparedStatement) => (s as unknown as Record<symbol, D1PreparedStatement | undefined>)[RAW] ?? s;

/** The database with every query timed. */
function timedD1(db: D1Database, t: Timing): D1Database {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") return (query: string) => timedStatement(target.prepare(query), t);
      if (prop === "batch") return (stmts: D1PreparedStatement[]) => timed(t, () => target.batch(stmts.map(unwrap)));
      if (prop === "exec") return (query: string) => timed(t, () => target.exec(query));
      const v: unknown = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/** The Server-Timing header's value. */
export function serverTiming(t: Timing): string {
  const ms = (v: number) => Math.round(v * 10) / 10;
  // (queries still running for a part of the page that comes later count up to now)
  const db = t.db + (t.inFlight ? now() - t.busySince : 0);
  return [`db;dur=${ms(db)};desc="${t.queries} quer${t.queries === 1 ? "y" : "ies"}"`, `auth;dur=${ms(t.auth)}`, `total;dur=${ms(now() - t.start)}`].join(", ");
}

/** Root middleware: a request's own `env` (its queries timed), and Server-Timing on its response
 *  (the time to the response's head: a page's streamed parts come after it). */
export const timingMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
  const cf = context.get(cloudflareContext);
  // development only: slow every query down, as on the live site (DB_DELAY_MS in .dev.vars), or for
  // one browser test's requests (an x-db-delay header: tests/e2e/speed.spec.ts)
  const delay = import.meta.env.DEV ? Number(request.headers.get("x-db-delay") ?? (cf.env as unknown as Record<string, unknown>).DB_DELAY_MS) || 0 : 0;
  const t: Timing = { start: now(), db: 0, queries: 0, auth: 0, inFlight: 0, busySince: 0, delay };
  const env = Object.create(cf.env, { DB: { value: timedD1(cf.env.DB, t), enumerable: true } }) as Env;
  timings.set(env, t);
  context.set(cloudflareContext, { env, ctx: cf.ctx });
  let res = await next();
  try {
    res.headers.append("Server-Timing", serverTiming(t));
  } catch {
    // a response whose headers can't be changed (one made by Response.redirect)
    res = new Response(res.body, res);
    res.headers.append("Server-Timing", serverTiming(t));
  }
  // a prefetch of a page's data may be kept for the click it's for (lib/prefetch.ts)
  prefetchCaching(request, res);
  return res;
};
