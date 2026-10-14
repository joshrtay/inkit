// What the source readers share: where references/ is, the record every converted puzzle becomes,
// and writing them out one genre to a file.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Spec } from "./grids.ts";

const repo = new URL("../../../", import.meta.url).pathname;
/** references/ (gitignored): this checkout's, or (in a worktree under .claude/worktrees) the main one's. */
export const REFERENCES = process.env.REFERENCES_DIR
  ?? [`${repo}references/`, repo.replace(/\.claude\/worktrees\/[^/]+\/$/, "") + "references/"].find((d) => existsSync(d))
  ?? `${repo}references/`;

/** A converted puzzle: always traceable to where it came from, so a source can be dropped later. */
export interface Converted {
  source: string;          // "janko", "psjp", "puzzlekit", "nikoli-100"
  sourceId: string;        // the source's own id ("Akari/001", "12345", "nhk2212m")
  licence: string;         // the licence or terms it's held under ("" when the page names none)
  author: string;          // "" when unknown
  url?: string;            // where it can be seen
  genre: string;
  spec: Spec;
  /** anything else the source says (difficulty, likes, solves, the origin behind a dataset) */
  meta?: Record<string, unknown>;
}

/** Write converted puzzles to <dir>/<genre>.jsonl (one per line), and return the counts by genre. */
export function writeByGenre(dir: string, items: Converted[]): Record<string, number> {
  mkdirSync(dir, { recursive: true });
  // a fresh set: a genre that no longer converts leaves no stale file behind
  for (const f of readdirSync(dir)) if (f.endsWith(".jsonl")) rmSync(`${dir}/${f}`);
  const by = new Map<string, Converted[]>();
  for (const c of items) { if (!by.has(c.genre)) by.set(c.genre, []); by.get(c.genre)!.push(c); }
  const counts: Record<string, number> = {};
  for (const [g, list] of [...by].sort()) {
    writeFileSync(`${dir}/${g}.jsonl`, list.map((c) => JSON.stringify(c)).join("\n") + "\n");
    counts[g] = list.length;
  }
  return counts;
}

/** Janko's page metadata from the full crawl (references/janko-full/meta.jsonl), by "Folder/NNN". */
export function jankoMeta(): Map<string, { licence: string; author: string; quelle: string; url: string; title: string }> {
  const out = new Map<string, { licence: string; author: string; quelle: string; url: string; title: string }>();
  const f = `${REFERENCES}janko-full/meta.jsonl`;
  if (!existsSync(f)) return out;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const m = JSON.parse(line); out.set(`${m.folder}/${m.n}`, m); } catch { /* a line cut short by a stop */ }
  }
  return out;
}

/** Janko's licence values as one of three words, for counting. */
export const licenceClass = (l: string) =>
  /creative commons/i.test(l) ? "cc-by-nc-sa" : /genehmigung/i.test(l) ? "author-permission" : /freeware/i.test(l) ? "freeware" : l === "?" ? "unknown (?)" : l ? "other" : "none-stated";
