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
export const RUN_FILE = "tests/e2e/.run.json";
