// Logic Masters Deutschland's Rätselportal (logic-masters.de/Raetselportal), crawled for
// non-commercial research: every puzzle's public metadata (beauty and difficulty ratings, solvers,
// tags, links) and comments. Data stays in references/lmd (gitignored), never published. Terms,
// verdict and rules: docs/research-puzzle-sources.md; the manifest: ./README.md.
//
// What an anonymous visitor sees (checked October 2026): the simple search
// (Suche/einfach.php?sort=neu, 20 puzzles a page) lists every puzzle with its solver count, its
// difficulty level (1–5 stars; red "levelN" when computed from solvers' ratings, blue "ulevelN" when
// still the author's estimate) and its beauty ("Bewertung", a percentage, N/A until enough solvers
// have rated). The puzzle page (Raetsel/zeigen.php?id=…) adds the type tags and labels, the
// watchers ("Beobachtet"), the puzzle's own HTML (links to images, PDFs, Penpa+, puzz.link,
// SudokuPad) and every comment. The number of ratings behind each average isn't shown anywhere
// public.
//
//   node puzzles/difficulty/sources/lmd.ts crawl    listing, then every puzzle page, then the image
//                                                   and PDF files and short links of puzzles in our
//                                                   types; resumable (the cache), state in state.json
//   node puzzles/difficulty/sources/lmd.ts parse    the cache → puzzles.jsonl, comments.jsonl
//   node puzzles/difficulty/sources/lmd.ts status   progress
//
// Polite fetching (one connection, ≥ 4 s apart, cached, stop on any error): ./lmd-fetch.ts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Blocked, ORIGIN, USER_AGENT, GAP_MS, cachePath, counts, dataDir, fetchRaw, fetchText } from "./lmd-fetch.ts";

const PORTAL = `${ORIGIN}/Raetselportal`;
const listUrl = (start: number) => `${PORTAL}/Suche/einfach.php?start=${start}&sort=neu`;
export const pageUrl = (id: string) => `${PORTAL}/Raetsel/zeigen.php?id=${id}`;

// ---- parsing ----

const MONTHS: Record<string, number> = {
  Januar: 1, Februar: 2, "März": 3, April: 4, Mai: 5, Juni: 6, Juli: 7, August: 8,
  September: 9, Oktober: 10, November: 11, Dezember: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");

/** "am 1. Dezember 2009, 10:53 Uhr", "Heute, 05:00 Uhr", "Gestern, …" → "2009-12-01T10:53" (the
 *  site's local time); relative days against `fetched`, when the page was fetched. */
export function parseDate(s: string, fetched: Date): string | null {
  const t = s.replace(/&nbsp;/g, " ").trim();
  const m = t.match(/(\d{1,2})\.\s*(\S+)\s+(\d{4}),?\s*(\d{1,2}):(\d{2})/);
  if (m && MONTHS[m[2]]) return `${m[3]}-${pad(MONTHS[m[2]])}-${pad(+m[1])}T${pad(+m[4])}:${m[5]}`;
  const r = t.match(/(Heute|Gestern|Vorgestern),?\s*(\d{1,2}):(\d{2})/);
  if (r) {
    // the day in Berlin, where the site is
    const d = new Date(fetched.getTime() - { Heute: 0, Gestern: 1, Vorgestern: 2 }[r[1] as "Heute"] * 864e5);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    return `${day}T${pad(+r[2])}:${r[3]}`;
  }
  return null;
}

const decode = (s: string) =>
  s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).trim();

export interface Difficulty { level: number | null; source: "solvers" | "author" | null; label: string | null }

function difficulty(html: string): Difficulty {
  const m = html.match(/bilder\/(u?)level(\d+)\.png"[^>]*title="([^"]*)"/);
  if (!m) return { level: null, source: null, label: null };
  return { level: Number(m[2]), source: m[1] ? "author" : "solvers", label: m[3] };
}

function beauty(html: string): { pct: number | null; label: string | null } {
  const m = html.match(/<span title="([^"]*)">([^<]*)<\/span>/);
  if (!m) return { pct: null, label: null };
  const pct = m[2].match(/(\d+)\s*(?:&nbsp;)?\s*%/);
  return pct ? { pct: Number(pct[1]), label: m[1] } : { pct: null, label: null };
}

export interface ListRow {
  id: string; title: string; author: string; date: string | null; solvers: number;
  difficulty: Difficulty; beauty: number | null; beautyLabel: string | null;
}

/** The rows of a listing page (Suche/einfach.php or Suche/spezial.php). */
export function parseList(html: string, fetched: Date): ListRow[] {
  const out: ListRow[] = [];
  for (const row of html.split(/<tr>/).slice(1)) {
    const a = row.match(/zeigen\.php\?id=([0-9A-Z]+)">([\s\S]*?)<\/a>/);
    if (!a) continue;
    const by = row.match(/von ([\s\S]*?) \(([^)]*)\)<\/span>/);
    const cells = row.split(/<td[^>]*>/);
    const solved = cells.map((c) => c.trim()).find((c, i) => i > 3 && /^\d+$/.test(c));
    const b = beauty(row);
    out.push({
      id: a[1], title: decode(a[2]), author: by ? decode(by[1]) : "", date: by ? parseDate(by[2], fetched) : null,
      solvers: solved ? Number(solved) : NaN, difficulty: difficulty(row), beauty: b.pct, beautyLabel: b.label,
    });
  }
  return out;
}

export interface Link { url: string; kind: LinkKind; text?: string }
export type LinkKind = "image" | "pdf" | "penpa" | "puzzlink" | "sudokupad" | "fpuzzles" | "short" | "other";

export function linkKind(url: string): LinkKind {
  const u = url.toLowerCase();
  if (/\/dateien\/bild\.php|\.(png|jpe?g|gif|svg|webp)(\?|$)/.test(u)) return "image";
  if (/\.pdf(\?|$)|\/dateien\/.*pdf/.test(u)) return "pdf";
  if (/penpa-edit|swaroopg92\.github\.io|penpa/.test(u)) return "penpa";
  if (/puzz\.link|pzv\.jp|pzprxs|pzplus/.test(u)) return "puzzlink";
  if (/sudokupad|crackingthecryptic\.com\/sudoku|app\.crackingthecryptic/.test(u)) return "sudokupad";
  if (/f-puzzles\.com/.test(u)) return "fpuzzles";
  if (/tinyurl\.com|bit\.ly|is\.gd|t\.ly|goo\.gl|tiny\.cc|shorturl\.at|rb\.gy|cutt\.ly|v\.gd/.test(u)) return "short";
  return "other";
}

function links(html: string, base: string): Link[] {
  const out: Link[] = [];
  const seen = new Set<string>();
  const add = (raw: string, text?: string) => {
    let url = decode(raw).trim();
    if (!url || url.startsWith("#") || url.startsWith("mailto:") || url.startsWith("javascript:")) return;
    try { url = new URL(url, base).href; } catch { return; }
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url, kind: linkKind(url), ...(text ? { text } : {}) });
  };
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) add(m[1], decode(m[2]).slice(0, 80) || undefined);
  for (const m of html.matchAll(/<(?:img|embed|iframe|object)\s[^>]*(?:src|data)="([^"]*)"/gi)) add(m[1]);
  // bare URLs in text (comments mostly)
  for (const m of decode(html.replace(/<a\s[\s\S]*?<\/a>/gi, "")).matchAll(/https?:\/\/[^\s<>"')\]]+/g)) add(m[0]);
  return out;
}

export interface Comment { id: string; author: string; date: string | null; edited: string | null; text: string }

export interface Page {
  id: string; title: string; author: string; date: string | null;
  difficulty: Difficulty; beauty: number | null; beautyLabel: string | null;
  solvers: number | null; watchers: number | null;
  labels: string[]; tags: { id: number; name: string }[];
  solutionCode: string | null;
  links: Link[]; commentLinks: Link[];
  comments: Comment[];
  /** the puzzle's own text (rules), without tags */
  text: string;
}

/** A puzzle page (Raetsel/zeigen.php). null when it isn't one (deleted, hidden). */
export function parsePage(id: string, html: string, fetched: Date): Page | null {
  const title = html.match(/<div class="rp_titel"><h2>([\s\S]*?)<\/h2>/);
  if (!title) return null;
  const by = html.match(/<span class="rp_eingestellt">\(Eingestellt ([\s\S]*?) von ([\s\S]*?)\)<\/span>/);
  const bodyStart = html.indexOf("<!-- HTML-Code des Raetsels: Anfang -->");
  const bodyEnd = html.indexOf("<!-- HTML-Code des Raetsels: Ende -->");
  const body = bodyStart >= 0 && bodyEnd > bodyStart ? html.slice(bodyStart, bodyEnd) : "";
  const right = html.slice(html.indexOf('<div class="rightcolumn">'));
  const box = right.slice(0, right.indexOf("</table>"));
  const num = (label: string) => { const m = box.match(new RegExp(`${label}:<td>(\\d+) mal`)); return m ? Number(m[1]) : null; };
  const b = beauty(box);
  const labelsHtml = right.match(/<div class="rp_labels">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const tagsHtml = right.match(/<div class="rp_tags">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const center = html.slice(0, html.indexOf('<div class="rightcolumn">'));
  const kIdx = center.indexOf("<h3>Kommentare</h3>");
  const comments: Comment[] = [];
  const commentLinks: Link[] = [];
  if (kIdx >= 0) {
    const part = center.slice(kIdx);
    for (const chunk of part.split(/<div [^>]*>(?=(?:<span[^>]*>Zuletzt geändert[^<]*<\/span>)?<p><b>am )/).slice(1)) {
      const m = chunk.match(/^(?:<span[^>]*>Zuletzt geändert (?:am )?([^<]*)<\/span>)?<p><b>(am [\s\S]*?) von ([\s\S]*?)<\/b><br>\s*([\s\S]*?)<\/div>/);
      if (!m) continue;
      const text = decode(m[4]);
      comments.push({ id, author: decode(m[3]), date: parseDate(m[2], fetched), edited: m[1] ? parseDate(m[1], fetched) : null, text });
      commentLinks.push(...links(m[4], pageUrl(id)));
    }
  }
  const code = html.match(/<span class="rp_loesungscode_descr">([\s\S]*?)<\/span>/);
  return {
    id, title: decode(title[1]), author: by ? decode(by[2]) : "", date: by ? parseDate(by[1], fetched) : null,
    difficulty: difficulty(box), beauty: b.pct, beautyLabel: b.label,
    solvers: num("Gelöst"), watchers: num("Beobachtet"),
    labels: [...labelsHtml.matchAll(/alt="([^"]*)"/g)].map((m) => decode(m[1])),
    tags: [...tagsHtml.matchAll(/tag_id=(\d+)">([\s\S]*?)<\/a>/g)].map((m) => ({ id: Number(m[1]), name: decode(m[2]) })),
    solutionCode: code ? decode(code[1]) : null,
    links: links(body, pageUrl(id)),
    commentLinks: dedupe(commentLinks),
    comments,
    text: decode(body.replace(/<!--[\s\S]*?-->/g, "")).slice(0, 4000),
  };
}

const dedupe = (ls: Link[]) => [...new Map(ls.map((l) => [l.url, l])).values()];

// ---- our types ----

/** LMD tag → our genre (src/engine/puzzle.ts), for standard puzzles of that type. */
export const TAG_GENRES: Record<string, string> = {
  "Rundweg": "slitherlink", "Slitherlink": "slitherlink",
  "Masyu": "masyu", "Nurikabe": "nurikabe", "Akari": "akari", "Lichter": "akari", "Hitori": "hitori",
  "Shikaku": "shikaku", "Fillomino": "fillomino", "Galaxien": "spiral-galaxies",
  "Hochhäuser": "skyscrapers", "Wolkenkratzer": "skyscrapers", "Buchstabensalat": "easy-as-abc",
  "Höhle": "cave", "Aquarium": "aquarium", "Nonogramm": "nonogram", "Minesweeper": "minesweeper",
  "Arukone": "numberlink", "Numberlink": "numberlink",
  "Sternenschlacht": "star-battle", "Star Battle": "star-battle", "Doppelstern": "star-battle",
  "Sudoku": "sudoku", "Binairo": "binary-puzzle", "Hidato": "hidoku",
};
/** Sudoku variant tags that are our own sudoku genres (when the only variant). */
const SUDOKU_VARIANTS: Record<string, string> = { "Irregular (Variante)": "irregular-sudoku", "Thermo (Variante)": "thermo-sudoku" };
const NOT_STANDARD = new Set(["Rätselvariante", "Variantenkombination", "Rätselkombination", "Mysteryrätsel", "Instructionless", "Optimierrätsel", "Metarätsel", "Mehrgitterrätsel", "Permakultur", "Geisterbahn", "Matchmaker"]);

/** The genre of ours a puzzle is, with our rules: one type tag of ours and no variant. */
export function ourGenre(p: Pick<Page, "tags" | "labels">): string | null {
  if (p.labels.some((l) => NOT_STANDARD.has(l))) {
    // a Sudoku whose one variant is one of our sudoku genres
    const variants = p.tags.filter((t) => t.name.endsWith("(Variante)"));
    if (p.tags.length === 2 && p.tags.some((t) => t.name === "Sudoku") && variants.length === 1 && SUDOKU_VARIANTS[variants[0].name]
      && p.labels.every((l) => l === "Rätselvariante" || !NOT_STANDARD.has(l))) return SUDOKU_VARIANTS[variants[0].name];
    return null;
  }
  const types = p.tags.filter((t) => !t.name.includes("(Thema)"));
  if (types.length !== 1) return null;
  if (types[0].name.endsWith("(Variante)")) return null;
  return TAG_GENRES[types[0].name] ?? null;
}

// ---- state ----

interface State {
  pid: number; phase: string; started: string; updated: string;
  listing: { pages: number; done: boolean; estimate: number };
  pages: { done: number; total: number };
  files: { done: number; total: number };
  fetched: number; error?: string; finished?: string;
}

const statePath = () => join(dataDir(), "state.json");
function loadState(): State | null { try { return JSON.parse(readFileSync(statePath(), "utf8")); } catch { return null; } }
function saveState(s: State) {
  s.updated = new Date().toISOString();
  const tmp = statePath() + ".tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, statePath());
}

const fetchedAt = (url: string) => { try { return statSync(cachePath(url)).mtime; } catch { return new Date(); } };

/** Every row of the listing so far (from the cache), newest first, deduplicated. */
function cachedListing(): ListRow[] {
  const rows = new Map<string, ListRow>();
  for (let start = 0; ; start += 20) {
    const url = listUrl(start);
    if (!existsSync(cachePath(url))) break;
    const got = parseList(readFileSync(cachePath(url), "utf8"), fetchedAt(url));
    if (!got.length) break;
    for (const r of got) if (!rows.has(r.id)) rows.set(r.id, r);
  }
  return [...rows.values()];
}

/** Rated puzzles first, in a fixed random order (so a partial crawl is a fair sample), then the rest. */
function pageOrder(rows: ListRow[]): string[] {
  const key = (id: string) => createHash("sha1").update(`lmd:${id}`).digest("hex");
  const rated = rows.filter((r) => r.beauty !== null).map((r) => r.id).sort((a, b) => key(a).localeCompare(key(b)));
  const rest = rows.filter((r) => r.beauty === null).map((r) => r.id).sort((a, b) => key(a).localeCompare(key(b)));
  return [...rated, ...rest];
}

// ---- crawl ----

async function crawl() {
  mkdirSync(dataDir(), { recursive: true });
  const prev = loadState();
  if (prev && prev.pid !== process.pid && !prev.finished && !prev.error) {
    try { process.kill(prev.pid, 0); console.error(`already running as pid ${prev.pid}`); process.exit(1); } catch { /* stale */ }
  }
  const state: State = {
    pid: process.pid, phase: "listing", started: new Date().toISOString(), updated: "",
    listing: { pages: 0, done: false, estimate: 0 }, pages: { done: 0, total: 0 }, files: { done: 0, total: 0 }, fetched: 0,
  };
  const tick = () => { state.fetched = counts.fetched; saveState(state); };
  console.log(`LMD crawl, pid ${process.pid}, ${GAP_MS} ms apart, UA ${USER_AGENT}`);
  try {
    // 1. the listing
    const front = await fetchText(`${PORTAL}/`);
    const total = Number(front.match(/Derzeit befinden sich (\d+) Rätsel/)?.[1] ?? 0);
    state.listing.estimate = Math.ceil(total / 20);
    for (let start = 0; ; start += 20) {
      const url = listUrl(start);
      const rows = parseList(await fetchText(url), fetchedAt(url));
      state.listing.pages = start / 20 + 1;
      if (state.listing.pages % 10 === 0) tick();
      if (!rows.length) break;
    }
    // the hand-picked lists linked from the portal's front page (membership = a "nice" flag)
    for (const name of SPECIAL_LISTS) {
      for (let start = 0; start < 2000; start += 20) {
        const url = `${PORTAL}/Suche/spezial.php?listname=${name}${start ? `&start=${start}` : ""}`;
        const html = await fetchText(url);
        if (!parseList(html, new Date()).length || !html.includes(`start=${start + 20}`)) break;
      }
    }
    state.listing.done = true;
    // 2. every puzzle page
    const order = pageOrder(cachedListing());
    state.phase = "pages";
    state.pages.total = order.length;
    for (const id of order) {
      await fetchRaw(pageUrl(id));
      state.pages.done++;
      if (state.pages.done % 25 === 0) tick();
    }
    tick();
    // 3. files and short links of puzzles in our types
    state.phase = "files";
    const wanted: { id: string; link: Link }[] = [];
    for (const id of order) {
      const p = parsePage(id, readFileSync(cachePath(pageUrl(id)), "utf8"), fetchedAt(pageUrl(id)));
      if (!p || !ourGenre(p)) continue;
      for (const link of [...p.links, ...p.commentLinks]) {
        if ((link.kind === "image" || link.kind === "pdf") && new URL(link.url).hostname.endsWith("logic-masters.de") && p.links.includes(link)) wanted.push({ id, link });
        const short = shortTarget(link.url);
        if (short) wanted.push({ id, link: { url: short, kind: "short" } });
      }
    }
    state.files.total = wanted.length;
    for (const { id, link } of wanted) {
      if (link.kind === "short") await resolveShort(link.url);
      else await saveFile(id, link.url);
      state.files.done++;
      if (state.files.done % 25 === 0) tick();
    }
    state.phase = "done";
    state.finished = new Date().toISOString();
    tick();
    console.log("done");
  } catch (e) {
    state.error = `${e instanceof Blocked ? "stopped (blocked?)" : "error"}: ${(e as Error).message}`;
    tick();
    console.error(state.error);
    process.exit(2);
  }
}

const SPECIAL_LISTS = ["leichtundschoen", "schoenundmittel", "schwierigundschoen", "schoenundoft", "rundwege", "ABCtje", "Pentos", "Mystery", "Richard", "Luigi", "berni", "sudokus"];

/** A puzzle's image or PDF on logic-masters.de, saved under files/<id>/ (once). */
export function filePath(id: string, url: string): string {
  const h = createHash("sha1").update(url).digest("hex").slice(0, 12);
  const ext = linkKind(url) === "pdf" ? "pdf" : "img";
  return join(dataDir(), "files", id, `${h}.${ext}`);
}
async function saveFile(id: string, url: string) {
  const out = filePath(id, url);
  if (existsSync(out)) return;
  const body = await fetchRaw(url, { binary: true });
  mkdirSync(join(dataDir(), "files", id), { recursive: true });
  writeFileSync(out, body);
}

/** The short link to resolve for a link, if any: the link itself (tinyurl and the like), or an
 *  f-puzzles "?id=" link, whose id is a TinyURL alias for the full "?load=" link. */
export function shortTarget(url: string): string | null {
  if (linkKind(url) === "short") return url;
  const f = url.match(/f-puzzles\.com\/?\?id=([A-Za-z0-9_-]+)/);
  return f ? `https://tinyurl.com/${f[1]}` : null;
}

/** A short link's target (tinyurl and the like): one request for the redirect, no body, cached in
 *  shortlinks.json. Paced like everything else. */
const shortPath = () => join(dataDir(), "shortlinks.json");
export function shortLinks(): Record<string, string | null> { try { return JSON.parse(readFileSync(shortPath(), "utf8")); } catch { return {}; } }
let lastShort = 0;
async function resolveShort(url: string) {
  const known = shortLinks();
  if (url in known) return;
  const wait = lastShort + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastShort = Date.now();
  let target: string | null = null;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual", headers: { "User-Agent": USER_AGENT } });
    if (res.status === 429) throw new Blocked(`HTTP 429 on ${url}`);
    target = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
  } catch (e) {
    if (e instanceof Blocked) throw e;
  }
  known[url] = target;
  writeFileSync(shortPath(), JSON.stringify(known, null, 1));
}

// ---- parse: the cache → jsonl ----

function parseAll() {
  const rows = cachedListing();
  const special = new Map<string, string[]>();
  for (const name of SPECIAL_LISTS) {
    for (let start = 0; start < 2000; start += 20) {
      const url = `${PORTAL}/Suche/spezial.php?listname=${name}${start ? `&start=${start}` : ""}`;
      if (!existsSync(cachePath(url))) break;
      for (const r of parseList(readFileSync(cachePath(url), "utf8"), new Date())) special.set(r.id, [...(special.get(r.id) ?? []), name]);
    }
  }
  const short = shortLinks();
  const puzzles: string[] = [];
  const comments: string[] = [];
  let pages = 0;
  for (const r of rows) {
    const url = pageUrl(r.id);
    const p = existsSync(cachePath(url)) ? parsePage(r.id, readFileSync(cachePath(url), "utf8"), fetchedAt(url)) : null;
    if (p) pages++;
    const genre = p ? ourGenre(p) : null;
    const allLinks = p ? [...p.links, ...p.commentLinks.map((l) => ({ ...l, inComment: true }))] : [];
    for (const l of allLinks) {
      const to = short[shortTarget(l.url) ?? ""];
      if (to) Object.assign(l, { resolved: to, kind: linkKind(to) });
    }
    puzzles.push(JSON.stringify({
      source: "lmd", id: r.id, url, title: p?.title ?? r.title, author: p?.author || r.author, date: p?.date ?? r.date,
      beauty: p?.beauty ?? r.beauty, beautyLabel: p?.beautyLabel ?? r.beautyLabel,
      difficulty: p?.difficulty.level ?? r.difficulty.level, difficultySource: p?.difficulty.source ?? r.difficulty.source,
      difficultyLabel: p?.difficulty.label ?? r.difficulty.label,
      solvers: p?.solvers ?? r.solvers, watchers: p?.watchers ?? null,
      lists: special.get(r.id) ?? [],
      tags: p?.tags.map((t) => t.name) ?? null, labels: p?.labels ?? null, genre,
      solutionCode: p?.solutionCode ?? null,
      links: allLinks.filter((l) => l.kind !== "other" || !/logic-masters\.de\/(Raetselportal\/(Benutzer|Raetsel|Suche)|$)/.test(l.url)),
      comments: p?.comments.length ?? null,
      page: Boolean(p),
    }));
    for (const c of p?.comments ?? []) comments.push(JSON.stringify(c));
  }
  writeFileSync(join(dataDir(), "puzzles.jsonl"), puzzles.join("\n") + "\n");
  writeFileSync(join(dataDir(), "comments.jsonl"), comments.join("\n") + (comments.length ? "\n" : ""));
  console.log(`${rows.length} puzzles listed, ${pages} pages parsed, ${comments.length} comments`);
}

function status() {
  const s = loadState();
  if (!s) { console.log("not started"); return; }
  let alive = false;
  try { process.kill(s.pid, 0); alive = true; } catch { /* gone */ }
  const left = s.phase === "listing" ? (s.listing.estimate - s.listing.pages) + 37000 : s.phase === "pages" ? s.pages.total - s.pages.done : s.files.total - s.files.done;
  console.log(JSON.stringify({ ...s, alive, etaHours: Math.round((left * GAP_MS) / 36e5 * 10) / 10 }, null, 2));
}

const cmd = process.argv[2];
if (cmd === "crawl") await crawl();
else if (cmd === "parse") parseAll();
else if (cmd === "status") status();
else if (cmd) { console.error("usage: lmd.ts crawl | parse | status"); process.exit(1); }
