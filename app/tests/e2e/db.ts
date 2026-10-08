// The local database, for the browser tests: set things up, and check what the editor saved.
import { execFileSync } from "node:child_process";

/** Run SQL against the local D1 and return the rows of its last statement. */
export function sql<T = Record<string, unknown>>(command: string): T[] {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", command], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const results = JSON.parse(out) as { results: T[] }[];
  return results.at(-1)?.results ?? [];
}

export const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The test run's account and drafts (written by setup.ts). */
export interface Run { userId: string; handle: string; collectionId: string; drafts: Record<string, string> }
// The reader evaluation (READER_EVAL=1, reader.spec.ts) keeps its own account, so it can run while
// the other browser tests do.
const own = process.env.READER_EVAL ? ".reader" : "";
export const RUN_FILE = `tests/e2e/${own}.run.json`;
export const AUTH_FILE = `tests/e2e/${own}.auth.json`;
/** The local site the browser tests drive: http://localhost:5173, or E2E_PORT's (a second checkout's
 *  own site, whose .dev.vars BETTER_AUTH_URL says that port). */
export const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "5173"}`;
