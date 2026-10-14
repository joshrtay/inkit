// puzz.link's database (references/puzzlink-db/rows.jsonl, from puzzlink_db_crawl.py) as our
// puzzles, through the app's own link reader (app/app/lib/import-link.ts), joined to the puzzles we
// already hold. Local, non-commercial research only: the rights stay with each setter
// (docs/research-puzzle-sources.md, section 7, "go with care").
//
//   node puzzles/difficulty/sources/puzzlink-db.ts
//
// Writes references/puzzlink-db/converted/<genre>.jsonl (source "puzzlink-db", each with puzz.link's
// difficulty and solve count and the post it came from) and summary.json: counts by type and
// genre, how many have 5+ solves, the overlap with Puzzle Square JP (by link, by PSJP id in the
// source URL, and by content) and with Janko and Logic Masters (by content), and Spearman's rho of
// puzz.link's difficulty against PSJP's where a puzzle is in both.
//
// puzz.link's `difficulty` runs -2..2 (five levels; null when too few solves); `difficulty5` is the
// same on 1..5. Puzzles tagged "variant" (their link starts type/v:/) or "broken" are left out.
import "./app-alias.ts";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GenreName } from "../../../src/engine/puzzle.ts";
import { spearman } from "../calibrate.ts";
import { REFERENCES, writeByGenre, type Converted } from "./common.ts";
import type { Spec } from "./grids.ts";

const IMPORT_LINK = "../../../app/app/lib/import-link.ts";
const { readLink } = (await import(IMPORT_LINK)) as {
  readLink: (text: string, chosen?: GenreName) => Promise<{ kind: "puzzle"; spec: Spec } | { kind: "unsupported"; variant?: string } | { kind: "choose" | "unreadable" }>;
};
const ROOT = `${REFERENCES}puzzlink-db/`;
export const TERMS = "puzz.link database: copyright with each setter; a public index of public puzzles; private research use only";

interface Row {
  source_name: string | null; source_type: string; source_url: string | null; published_at: string; url: string;
  type: string; size: [number, number] | null; pzv: string; pzv_override: string | null; solves: number | null;
  difficulty: number | null; sort_key: string; generated: boolean; tags_default: string[] | null; tags_filter: string[] | null;
}
const rows: Row[] = readFileSync(`${ROOT}rows.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

/** A link's puzzle text, whatever host and type alias: "<w>/<h>/<data>" (the type left off, since
 *  sites spell it differently: numlin/numberlink, slither/slitherlink). */
const body = (link: string) => {
  const q = link.replace(/&amp;/g, "&").trim().replace(/^[^?]*\?/, "").replace(/\/+$/, "");
  return q.replace(/^[a-z0-9_]+\/(v:\/)?/i, "").toLowerCase();
};
/** Spec JSON with sorted keys, for matching puzzles across sources by content. */
const canon = (v: unknown): string => Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).filter((k) => (v as any)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon((v as any)[k])}`).join(",")}}`
  : JSON.stringify(v);
const contentKey = (spec: Spec) => `${spec.genre}:${canon(spec)}`;
const readJsonl = (f: string) => existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : [];

// Puzzle Square JP: by link body and by id
const psjp = new Map<string, any>(), psjpByBody = new Map<string, any>();
for (const r of readJsonl(`${REFERENCES}psjp-full/records.jsonl`)) {
  psjp.set(String(r.id), r);
  if (r.url && body(r.url).length >= 12) psjpByBody.set(body(r.url), r);
}
// content keys of every converted puzzle we hold, by source
const byContent = new Map<string, { source: string; sourceId: string }[]>();
const addDir = (dir: string, source: string) => {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl")))
    for (const c of readJsonl(`${dir}/${f}`)) {
      if (!c.spec) continue;
      const k = contentKey(c.spec);
      byContent.set(k, [...(byContent.get(k) ?? []), { source: c.source === "puzzlekit" ? `puzzlekit (${c.meta?.origin ?? "janko"})` : source, sourceId: String(c.sourceId) }]);
    }
};
addDir(`${REFERENCES}psjp-full/converted`, "psjp");
addDir(`${REFERENCES}janko-full/converted`, "janko");
addDir(`${REFERENCES}puzzlekit/converted`, "janko");
addDir(`${REFERENCES}lmd/specs`, "lmd");

const psjpIdOf = (u: string | null) => {
  const m = /puzsq\.[^/]+\/.*(?:pid=|puzzle\/|problem\/)(\d+)/.exec(u ?? "");
  return m?.[1];
};

const byType: Record<string, Record<string, number>> = {};
const tally = (t: string, what: string) => { (byType[t] ??= {})[what] = (byType[t][what] ?? 0) + 1; };
const out: Converted[] = [];
const overlap = { psjpByLink: 0, psjpBySourceUrl: 0, psjpEither: 0, converted: { psjp: 0, janko: 0, lmd: 0 } as Record<string, number> };
const pairs: { type: string; pl: number; psjp: number; genre?: string }[] = [];
let fivePlus = 0, withDifficulty = 0;

for (const r of rows) {
  const t = r.type;
  tally(t, "rows");
  if ((r.solves ?? 0) >= 5) { fivePlus++; tally(t, "5+ solves"); }
  if (r.difficulty != null) withDifficulty++;
  const link = `https://puzz.link/p?${r.pzv_override ?? r.pzv}`;
  // Puzzle Square JP, every type: by link, then by the PSJP id in the post's URL
  const ps = psjpByBody.get(body(r.pzv)) ?? psjpByBody.get(body(link));
  const pid = psjpIdOf(r.source_url);
  if (ps) overlap.psjpByLink++;
  if (pid && psjp.has(pid)) overlap.psjpBySourceUrl++;
  const p = ps ?? (pid ? psjp.get(pid) : undefined);
  let pair: (typeof pairs)[number] | undefined;
  if (p) {
    overlap.psjpEither++;
    if (r.difficulty != null && p.difficulty != null) pairs.push(pair = { type: t, pl: r.difficulty, psjp: p.difficulty });
  }
  const tags = [...(r.tags_default ?? []), ...(r.tags_filter ?? [])];
  if (tags.includes("broken")) { tally(t, "broken (tag)"); continue; }
  if (tags.includes("variant") || /\/v:\//.test(link)) { tally(t, "variant (tag)"); continue; }
  let res;
  try { res = await readLink(link); } catch { res = { kind: "unreadable" as const }; }
  if (res.kind !== "puzzle") { tally(t, res.kind === "unsupported" ? "not ours" : res.kind); continue; }
  const spec = res.spec as Spec;
  tally(t, `converted ${spec.genre}`);
  const same = byContent.get(contentKey(spec)) ?? [];
  for (const s of new Set(same.map((x) => x.source.split(" ")[0]))) overlap.converted[s] = (overlap.converted[s] ?? 0) + 1;
  if (pair) pair.genre = spec.genre;
  out.push({
    source: "puzzlink-db", sourceId: r.sort_key, licence: TERMS, author: r.source_type === "twitter" ? `@${r.source_name ?? ""}` : r.source_name ?? "",
    url: link, genre: spec.genre, spec,
    meta: {
      difficulty: r.difficulty, difficulty5: r.difficulty == null ? null : r.difficulty + 3, solves: r.solves, generated: r.generated,
      type: t, size: r.size, published: r.published_at, sourceType: r.source_type, sourceName: r.source_name, sourceUrl: r.source_url, link: r.url,
      psjp: p ? { id: p.id, difficulty: p.difficulty, variation: p.variation, answered_n: p.answered_n } : undefined,
      alsoIn: same.length ? same : undefined,
    },
  });
}

// puzz.link's difficulty against PSJP's, overall, per genre we read and per puzz.link type
const rho = (ps: typeof pairs) => ({ n: ps.length, rho: ps.length >= 3 ? Number(spearman(ps.map((x) => x.pl), ps.map((x) => x.psjp)).toFixed(3)) : null });
const group = (key: (x: (typeof pairs)[number]) => string | undefined, min = 30) => {
  const m = new Map<string, typeof pairs>();
  for (const x of pairs) { const k = key(x); if (k) m.set(k, [...(m.get(k) ?? []), x]); }
  return Object.fromEntries([...m].filter(([, v]) => v.length >= min).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, rho(v)]));
};
const crosstab: Record<string, Record<string, number>> = {};
for (const x of pairs) { const row = (crosstab[`pl ${x.pl}`] ??= {}); row[`psjp ${x.psjp}`] = (row[`psjp ${x.psjp}`] ?? 0) + 1; }

const counts = writeByGenre(`${ROOT}converted`, out);
const fivePlusByGenre: Record<string, number> = {};
for (const c of out) if (((c.meta as any).solves ?? 0) >= 5) fivePlusByGenre[c.genre] = (fivePlusByGenre[c.genre] ?? 0) + 1;
const summary = {
  date: new Date().toISOString(), rows: rows.length, withDifficulty, fivePlusSolves: fivePlus, types: Object.keys(byType).length,
  converted: counts, convertedTotal: out.length, convertedFivePlusSolves: fivePlusByGenre,
  overlap, difficultyVsPsjp: { all: rho(pairs), byGenre: group((x) => x.genre, 10), byType: group((x) => x.type), crosstab },
  byType,
};
writeFileSync(`${ROOT}summary.json`, JSON.stringify(summary, null, 1));
const { byType: _, ...brief } = summary;
console.log(JSON.stringify(brief, null, 1));
