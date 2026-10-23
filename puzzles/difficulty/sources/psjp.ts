// Puzzle Square JP's public puzzles (references/psjp-full/records.jsonl, from psjp_crawl.py) as our
// puzzles, through the app's own puzz.link and Penpa reader (app/app/lib/import-link.ts). Local,
// non-commercial research only: the rights stay with each poster (docs/research-puzzle-sources.md,
// "go with care").
//
//   node puzzles/difficulty/sources/psjp.ts
//
// Writes references/psjp-full/converted/<genre>.jsonl and summary.json: counts by PSJP kind and
// outcome, and, as a check on the links, how often a link agrees with the one puzz.link's own index
// records for the same PSJP puzzle (references/psjp/puzzlink-psjp.json, fetched earlier).
import "./app-alias.ts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { GenreName } from "../../../src/engine/puzzle.ts";
import { REFERENCES, writeByGenre, type Converted } from "./common.ts";
import type { Spec } from "./grids.ts";

// a computed path: the root type-check (tsconfig: src, puzzles) doesn't follow it into the app,
// whose aliases it can't resolve; the app's own typecheck covers import-link.ts
const IMPORT_LINK = "../../../app/app/lib/import-link.ts";
const { readLink } = (await import(IMPORT_LINK)) as {
  readLink: (text: string, chosen?: GenreName) => Promise<{ kind: "puzzle"; spec: Spec } | { kind: "unsupported"; variant?: string } | { kind: "choose" | "unreadable" }>;
};
const ROOT = `${REFERENCES}psjp-full/`;
export const TERMS = "PSJP guideline: rights stay with the poster; public puzzle, read without login";

/** PSJP kinds of our genres (for Penpa links, which don't say their type) */
const KINDS: Record<number, GenreName> = {
  1: "slitherlink", 2: "masyu", 5: "numberlink", 21: "fillomino", 6: "nurikabe", 8: "hitori", 16: "shikaku", 17: "spiral-galaxies",
  18: "akari", 19: "sudoku", 48: "cave", 59: "skyscrapers", 68: "star-battle", 91: "easy-as-abc", 113: "minesweeper",
  141: "aquarium", 165: "nonogram", 185: "simple-loop", 235: "wittgenstein-briquet", 500: "square-jam", 613: "hidoku",
};

const seen = new Map<string, any>();
for (const line of readFileSync(`${ROOT}records.jsonl`, "utf8").split("\n")) {
  if (!line.trim()) continue;
  try { const r = JSON.parse(line); seen.set(r.id, r); } catch { /* a line cut short by a stop */ }
}
const out: Converted[] = [];
const byKind: Record<string, Record<string, number>> = {};
const tally = (kind: string, what: string) => { (byKind[kind] ??= {})[what] = (byKind[kind][what] ?? 0) + 1; };
for (const r of seen.values()) {
  const kind = r.kind_name || `kind ${r.kind}`;
  tally(kind, "puzzles");
  if (!r.url) { tally(kind, "no link (image only)"); continue; }
  const host = /^https?:\/\/([^/?]+)/.exec(r.url)?.[1] ?? "other";
  tally(kind, `link ${host}`);
  let res;
  // some links were stored HTML-escaped
  const link = r.url.replace(/&amp;/g, "&").trim();
  try { res = await readLink(link, KINDS[r.kind]); } catch { res = { kind: "unreadable" as const }; }
  if (res.kind !== "puzzle") { tally(kind, res.kind === "unsupported" ? `not ours${res.variant ? `: ${res.variant}` : ""}` : res.kind); continue; }
  // the kind must be ours and match: a Penpa link's type is guessed from its contents (Kurohori read
  // as Minesweeper), and PSJP's variation flag marks puzzles with variant rules
  if (KINDS[r.kind] !== res.spec.genre) { tally(kind, `not ours: read as ${res.spec.genre}`); continue; }
  if (r.variation) { tally(kind, "variant rules (PSJP's variation flag)"); continue; }
  tally(kind, `converted ${res.spec.genre}`);
  out.push({
    source: "psjp", sourceId: r.id, licence: TERMS, author: r.user_name ?? "", url: `https://puzsq.logicpuzzle.app/puzzle/${r.id}`,
    genre: res.spec.genre, spec: res.spec as Spec,
    meta: { link: r.url, kind: r.kind, kindName: r.kind_name, difficulty: r.difficulty, variation: r.variation, registered: r.registered,
      user: r.user, favorite_n: r.favorite_n, answered_n: r.answered_n },
  });
}

// the links against puzz.link's index of PSJP puzzles: the same puzzle text?
const agree = { compared: 0, same: 0, differs: [] as string[] };
const plFile = `${REFERENCES}psjp/puzzlink-psjp.json`;
if (existsSync(plFile)) {
  const body = (u: string) => u.trim().replace(/^.*\?/, "").replace(/\/$/, "");
  for (const row of JSON.parse(readFileSync(plFile, "utf8"))) {
    const pid = /pid=(\d+)|puzzle\/(\d+)|problem\/(\d+)/.exec(row.source_url ?? "");
    const id = pid && (pid[1] ?? pid[2] ?? pid[3]);
    const r = id ? seen.get(id) : null;
    if (!r?.url || !row.pzv) continue;
    agree.compared++;
    if (body(r.url).endsWith(body(row.pzv)) || body(row.pzv).endsWith(body(r.url).replace(/^[a-z]+\//, ""))) agree.same++;
    else if (agree.differs.length < 10) agree.differs.push(`${id}: ${r.url} vs ${row.pzv}`);
  }
}

const counts = writeByGenre(`${ROOT}converted`, out);
const summary = { records: seen.size, withLink: [...seen.values()].filter((r) => r.url).length, converted: counts, byKind, linksAgainstPuzzlinkIndex: agree };
writeFileSync(`${ROOT}summary.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ records: summary.records, withLink: summary.withLink, converted: counts, agree: { compared: agree.compared, same: agree.same } }, null, 1));
