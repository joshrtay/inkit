// A polite, cached fetcher for Logic Masters Deutschland's Rätselportal (docs/research-puzzle-sources.md):
// anonymous only (never logs in, sends no cookies), one connection, at least 4 s between requests,
// a contact User-Agent, every response cached on disk and never fetched twice, and robots.txt's
// Disallow lines obeyed. Any HTTP error, a 429, or a page that looks like a block or a login wall
// throws Blocked, which stops the crawl.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ORIGIN = "https://logic-masters.de";
export const USER_AGENT = "inkit-research/1.0 (non-commercial research; contact josh@carina.fund)";
export const GAP_MS = Number(process.env.LMD_GAP_MS ?? 4500);
if (GAP_MS < 4000) throw new Error("LMD_GAP_MS must be at least 4000");

/** The data folder: references/lmd in the main checkout (references/ is gitignored and shared by
 *  worktrees), or LMD_DIR. */
export function dataDir(): string {
  if (process.env.LMD_DIR) return resolve(process.env.LMD_DIR);
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const wt = root.indexOf("/.claude/worktrees/");
  if (wt >= 0) root = root.slice(0, wt);
  return join(root, "references/lmd");
}

export class Blocked extends Error {}

/** robots.txt's Disallow prefixes for every user agent (read once per run, cached). */
let disallowed: string[] | null = null;
async function robots(): Promise<string[]> {
  if (disallowed) return disallowed;
  const text = (await fetchRaw(`${ORIGIN}/robots.txt`, { skipRobots: true })).toString("utf8");
  const out: string[] = [];
  let any = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === "user-agent") any = m[2] === "*" || /inkit/i.test(m[2]);
    else if (key === "disallow" && any && m[2]) out.push(m[2]);
    else if (key === "crawl-delay" && any && Number(m[2]) * 1000 > GAP_MS)
      throw new Blocked(`robots.txt asks for Crawl-delay ${m[2]}; raise LMD_GAP_MS`);
  }
  return (disallowed = out);
}

export function cachePath(url: string): string {
  const u = new URL(url);
  const h = createHash("sha1").update(u.pathname + u.search).digest("hex");
  return join(dataDir(), "cache", h.slice(0, 2), h);
}

let last = 0;
let fetched = 0;
export const counts = { cached: 0, fetched: 0 };

/** The body of `url`, from the cache when there, else fetched (after the gap). Binary-safe. */
export async function fetchRaw(url: string, opts: { skipRobots?: boolean; binary?: boolean } = {}): Promise<Buffer> {
  const file = cachePath(url);
  if (existsSync(file)) { counts.cached++; return readFileSync(file); }
  const u = new URL(url);
  if (u.origin !== ORIGIN && !u.hostname.endsWith("logic-masters.de")) throw new Error(`not LMD: ${url}`);
  if (!opts.skipRobots) for (const p of await robots()) if (u.pathname.startsWith(p)) throw new Error(`robots.txt disallows ${u.pathname}`);
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "de,en;q=0.5" }, redirect: "manual" });
  } catch (e) {
    throw new Blocked(`network error on ${url}: ${(e as Error).message}`);
  }
  if (res.status !== 200) throw new Blocked(`HTTP ${res.status} on ${url}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (!opts.binary) {
    const t = body.toString("utf8");
    // a block page is the site's absence: block words with none of the portal's own page (a puzzle's
    // comments can quote "Access denied" from elsewhere, as 0009AT's do)
    if (/captcha|cf-chl|Access denied|zu viele Anfragen|too many requests/i.test(t.slice(0, 20000)) && !/R(ä|ae|&auml;)tselportal/.test(t))
      throw new Blocked(`page looks like a block on ${url}`);
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
  fetched++;
  counts.fetched = fetched;
  return body;
}

export async function fetchText(url: string): Promise<string> {
  return (await fetchRaw(url)).toString("utf8");
}

// A command-line peek, for exploring: node lmd-fetch.ts <url> → prints the cache path.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  for (const url of process.argv.slice(2)) {
    await fetchRaw(url);
    console.log(cachePath(url));
  }
}
