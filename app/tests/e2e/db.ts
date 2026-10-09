// The local database, for the browser tests: set things up, and check what the editor saved.
import { execFileSync } from "node:child_process";

/** Run SQL against the local D1 and return the rows of its last statement. Another test run (or the
 *  site) writing at the same moment locks the SQLite file, so a failed command is tried again. */
export function sql<T = Record<string, unknown>>(command: string): T[] {
  for (let tries = 1; ; tries++) {
    try {
      const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", command], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      const results = JSON.parse(out) as { results: T[] }[];
      return results.at(-1)?.results ?? [];
    } catch (e) {
      if (tries >= 5) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300 * tries);   // a short sleep, then again
    }
  }
}

export const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The test run's account and drafts (written by setup.ts). */
export interface Run { userId: string; handle: string; collectionId: string; drafts: Record<string, string> }
// Each Playwright run keeps its own account in its own files, so runs side by side (two agents, or the
// reader evaluation alongside the rest) don't sign each other out or delete each other's files. The
// main process names the run; its workers inherit the name through the environment.
process.env.E2E_RUN ??= `${process.env.READER_EVAL ? "reader-" : ""}${process.pid}`;
export const RUN_FILE = `tests/e2e/.run-${process.env.E2E_RUN}.json`;
export const AUTH_FILE = `tests/e2e/.auth-${process.env.E2E_RUN}.json`;
/** The local site the browser tests drive: http://localhost:5173, or E2E_PORT's (a second checkout's
 *  own site, whose .dev.vars BETTER_AUTH_URL says that port). */
export const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? "5173"}`;
