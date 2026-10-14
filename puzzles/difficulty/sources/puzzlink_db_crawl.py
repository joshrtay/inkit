# puzz.link's database (puzz.link/db) as one local table, for non-commercial research only
# (docs/research-puzzle-sources.md, section 7: "go with care"). Never published. Writes
# references/puzzlink-db/.
#
#   nohup python3 -I puzzles/difficulty/sources/puzzlink_db_crawl.py > /dev/null 2>&1 &
#
# The page's own API is a PostgREST at /db/api. Two public tables only:
#   pzvs_anon       every indexed puzz.link/pzv link (~80,800): its source (a Twitter handle, blog or
#                   feed name, and the post's URL), type, size, solves (logged-in puzz.link users)
#                   and the 1-5 difficulty.
#   gmpuzzles_anon  GM Puzzles' blog posts (~2,000) with their setters' time standards.
# Never the per-solve tables (pzv_solves_anon, griddle_solves_anon: 401 anyway) or anything that
# needs a login. Keyset pages on sort_key, 5,000 rows a request, so ~20 requests in all.
#
# Crawl rules: robots.txt read first (Cloudflare's content-signal template; a Disallow or an
# ai-train=no would stop us), one connection, 3 s between requests, an honest User-Agent, every
# response cached (cache/), a stop on HTTP errors and 429s. Resumable: rerun and it walks the cached
# pages again for free and fetches from where it stopped.
#
# Files: rows.jsonl (pzvs_anon), gmpuzzles.jsonl, state.json, progress.txt, crawl.log, crawl.pid
# while running.
import json, os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from polite import REFERENCES, Fetcher, Stop

API = "https://puzz.link/db/api/"
OUT = os.path.join(REFERENCES, "puzzlink-db")
DELAY = 3.0
PAGE = 5000
TABLES = {
    "pzvs_anon": ("rows.jsonl", "source_name,source_type,source_url,published_at,url,type,size,pzv,pzv_override,solves,difficulty,sort_key,generated,tags_default,tags_filter", 80848),
    "gmpuzzles_anon": ("gmpuzzles.jsonl", "title,author,base_type,type,bonus,variant,time_standards,link,published,griddle_id,sort_key", 2026),
}

os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, "crawl.log"), "a")
def log(msg):
    LOG.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n"); LOG.flush()

fetch = Fetcher(os.path.join(OUT, "cache"), DELAY, log=log, accept="application/json")
state = {"tables": {}}

def save():
    tmp = os.path.join(OUT, "state.json.tmp"); json.dump(state, open(tmp, "w"), indent=1); os.replace(tmp, os.path.join(OUT, "state.json"))

def progress(note, t0):
    rows = sum(t["rows"] for t in state["tables"].values())
    expected = sum(v[2] for v in TABLES.values())
    left = max(0, expected - rows) / PAGE * DELAY / 60
    open(os.path.join(OUT, "progress.txt"), "w").write(
        f"{time.strftime('%Y-%m-%d %H:%M:%S')} {note}; rows {rows}/~{expected}; {fetch.requests} requests this run; ~{left:.1f} min left; pid {os.getpid()}\n")

def robots_ok():
    url = "https://puzz.link/robots.txt"
    try: os.remove(fetch.path(url))  # read afresh every run
    except OSError: pass
    body = fetch.get(url) or b""
    text = body.decode("utf8", "replace")
    lines = [l.split("#")[0].strip() for l in text.splitlines()]
    for l in lines:
        if re.match(r"(?i)disallow\s*:\s*/", l) or re.search(r"(?i)ai-train\s*=\s*no", l):
            raise Stop(f"robots.txt now restricts us: {l!r}")
    return True

def walk(table, t0):
    name, cols, _ = TABLES[table]
    out = open(os.path.join(OUT, name + ".tmp"), "w")
    st = state["tables"][table] = {"rows": 0, "pages": 0, "last": ""}
    last = ""
    while True:
        q = {"select": cols, "order": "sort_key.asc", "limit": str(PAGE)}
        if last:
            q["sort_key"] = f"gt.{last}"
        body = fetch.get(API + table + "?" + urllib.parse.urlencode(q, safe=",.:"))
        rows = json.loads(body)
        if not rows:
            break
        for r in rows:
            out.write(json.dumps(r, ensure_ascii=False) + "\n")
        last = rows[-1]["sort_key"]
        st.update(rows=st["rows"] + len(rows), pages=st["pages"] + 1, last=last)
        save(); progress(f"{table} page {st['pages']}", t0)
    out.close()
    os.replace(os.path.join(OUT, name + ".tmp"), os.path.join(OUT, name))
    st["done"] = True
    log(f"{table}: {st['rows']} rows in {st['pages']} pages")

if __name__ == "__main__":
    import signal; signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    open(os.path.join(OUT, "crawl.pid"), "w").write(str(os.getpid()))
    t0 = time.time()
    try:
        robots_ok()
        for table in TABLES:
            walk(table, t0)
        save(); progress("finished", t0); log("finished")
    except Stop as e:
        save(); log(f"STOPPED: {e}"); progress(f"STOPPED: {e}", t0); sys.exit(2)
    finally:
        try: os.remove(os.path.join(OUT, "crawl.pid"))
        except OSError: pass
