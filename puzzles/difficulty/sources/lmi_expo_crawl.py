# Logic Masters India's Puzzle Expo (logicmastersindia.com/expo/): each puzzle's public summary
# figures, for non-commercial research only (docs/research-puzzle-sources.md, section 7: "go with
# care" for per-puzzle aggregates). Never published. Writes references/lmi-expo/.
#
#   nohup python3 -I puzzles/difficulty/sources/lmi_expo_crawl.py > /dev/null 2>&1 &
#
# How the site serves it (the same calls its pages make, logged out, no cookies kept):
#   POST /live/misc-pp?action=apply-filters  the search page's table, 100 puzzles a request:
#            genre, size, author handle, published, solved by, started (numViewed), best time,
#            top-10/50/100 average times, rating and comment counts.
#   POST /live/misc-pp?action=get-puzzle     one puzzle's page: title (titletheme), rules, info,
#            variant level, tags, the post it was also published at, and the same stats.
# The puzzle itself (Penpa data, action=pqr) needs a login: never fetched. Never collected: the
# "Timings & Replays" tab (other solvers' names, countries, times, replays), comments or profiles.
# get-puzzle's answer carries comments with solver handles and the author's profile text, so it is
# cut down to the fields below before it's cached: those never reach the disk.
#
# Crawl rules: robots.txt read first each run (none was found; if one appears, its Disallow lines
# for * are obeyed and a Crawl-delay above ours stops us), one connection, 5 s between requests, an
# honest User-Agent, every response cached (cache/), a stop on HTTP errors and 429s. Our genres'
# puzzles first. Resumable: rerun and it continues from the cache and state.json.
#
# Files: list.jsonl (the table's rows), puzzles.jsonl (one line a puzzle: the list row merged with
# its page's fields), state.json, progress.txt, crawl.log, crawl.pid while running.
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from polite import REFERENCES, Fetcher, Stop

SITE = "https://logicmastersindia.com"
API = SITE + "/live/misc-pp?action="
OUT = os.path.join(REFERENCES, "lmi-expo")
DELAY = 5.0
PAGE = 100

# the list's fields we keep (solveStatus and the my* fields are the viewer's own)
LIST_FIELDS = ["ppid", "genre", "size", "cells", "author", "lastEditedAt", "submittedAt", "exclusive", "numSolved", "numViewed",
               "numFavorites", "numComments", "numRated", "avgRatings", "lastSolvedAt", "bestTime", "avgTop10", "avgTop50", "avgTop100"]
# the puzzle page's fields we keep; everything else (messages, authorDetails, ...) is dropped before caching
PAGE_FIELDS = ["success", "message", "ppid", "genre", "author", "titletheme", "rules", "info", "variantLevel", "exclusive", "exclusivity",
               "gridtype", "numRows", "numCols", "solvingTags", "genresTags", "beginnerFriendly", "specialGridShape", "isExample",
               "originalPost", "exampleLink", "lastEditedAt", "puzzlestats", "avgRatings", "ratings"]
STATS_FIELDS = ["numRated", "bestTime", "avgTop10", "avgTop50", "avgTop100", "numSolved", "numViewed", "numSolvedToday",
                "numSolvedinLast7Days", "avgRatings", "avgRating", "ratings"]

# Expo genre names (lower case) that are our genres; the rest are fetched after these
OURS = re.compile(r"^(slitherlink|masyu|nurikabe|akari|light ?up|hitori|shikaku|rectangles|fillomino|sudoku|classic sudoku|irregular sudoku|thermo sudoku|skyscrapers?|"
                  r"easy as abc|star battle|star battle \(\d+ stars?\)|minesweeper|numberlink|spiral galaxies|tentaisho|cave|aquarium|"
                  r"nonogram|simple loop|square jam|hidoku|binairo|takuzu|light and shadow|yin[- ]yang|kurodoko|kuromasu|norinori|"
                  r"lits|heyawake|yajilin|tapa|kakuro|suguru|tents?|battleships?|thermometers?)$", re.I)

os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, "crawl.log"), "a")
def log(msg):
    LOG.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n"); LOG.flush()

fetch = Fetcher(os.path.join(OUT, "cache"), DELAY, log=log, accept="application/json")
STATE = os.path.join(OUT, "state.json")
state = json.load(open(STATE)) if os.path.exists(STATE) else {"listed": 0, "order": [], "done": []}

def save():
    tmp = STATE + ".tmp"; json.dump(state, open(tmp, "w")); os.replace(tmp, STATE)

def progress(note, t0):
    done, total = len(state["done"]), len(state["order"])
    left_h = (total - done) * DELAY / 3600
    eta = time.strftime("%Y-%m-%d %H:%M", time.localtime(time.time() + left_h * 3600))
    open(os.path.join(OUT, "progress.txt"), "w").write(
        f"{time.strftime('%Y-%m-%d %H:%M:%S')} {note}; listed {state['listed']}; pages {done}/{total}; "
        f"{fetch.requests} requests this run; ~{left_h:.1f} h left, ETA {eta}; pid {os.getpid()}\n")

def robots():
    url = SITE + "/robots.txt"
    try: os.remove(fetch.path(url))  # read afresh every run
    except OSError: pass
    try: os.remove(fetch.path(url) + ".missing")
    except OSError: pass
    body = fetch.get(url)
    rules, mine = [], False
    for raw in (body or b"").decode("utf8", "replace").splitlines():
        line = raw.split("#")[0].strip()
        m = re.match(r"([A-Za-z-]+)\s*:\s*(.*)$", line)
        if not m: continue
        k, v = m.group(1).lower(), m.group(2).strip()
        if k == "user-agent": mine = v == "*" or "inkit" in v.lower()
        elif k == "disallow" and mine and v: rules.append(v)
        elif k == "crawl-delay" and mine and float(v) > DELAY: raise Stop(f"robots.txt asks for Crawl-delay {v}")
    if any(r == "/" for r in rules): raise Stop("robots.txt disallows everything")
    for path in ("/live/", "/live/misc-pp", "/expo/"):
        if any(path.startswith(r) for r in rules): raise Stop(f"robots.txt disallows {path}")
    log(f"robots.txt: {'none (404)' if body is None else f'{len(rules)} Disallow lines, none ours'}")

def keep_fields(fields, stats=None):
    def keep(body):
        d = json.loads(body)
        out = {k: d[k] for k in fields if k in d}
        if stats and isinstance(out.get("puzzlestats"), dict):
            out["puzzlestats"] = {k: v for k, v in out["puzzlestats"].items() if k in stats}
        return json.dumps(out, ensure_ascii=False).encode()
    return keep

def keep_list(body):
    d = json.loads(body)
    rows = [{k: r[k] for k in LIST_FIELDS if k in r} for r in d.get("data") or []]
    return json.dumps({"success": d.get("success"), "message": d.get("message"), "last_page": d.get("last_page"), "data": rows}).encode()

def post(action, payload, keep):
    return json.loads(fetch.post(API + action, json.dumps(payload).encode(), keep=keep))

def list_all():
    filters = [{"field": f, "currentValue": "", "selected": True} for f in ("solveStatus", "genre", "author")]
    sorters = [{"field": "lastEditedAt", "dir": "desc", "selected": False}]
    rows, page, last = {}, 1, 1
    while page <= last:
        d = post("apply-filters", {"page": page, "size": PAGE, "filters": filters, "firstTime": False, "sorters": sorters,
                                   "filterCategory": "expo-puzzles"}, keep_list)
        if not d.get("success"): raise Stop(f"list page {page}: {d.get('message')}")
        last = d.get("last_page") or page
        for r in d["data"]: rows.setdefault(r["ppid"], r)
        page += 1
    with open(os.path.join(OUT, "list.jsonl"), "w") as f:
        for r in rows.values(): f.write(json.dumps(r, ensure_ascii=False) + "\n")
    log(f"listed {len(rows)} puzzles ({last} pages)")
    return rows

if __name__ == "__main__":
    import signal; signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    open(os.path.join(OUT, "crawl.pid"), "w").write(str(os.getpid()))
    t0 = time.time()
    try:
        robots()
        rows = list_all()
        state["listed"] = len(rows)
        known = set(state["order"])
        new = [p for p in rows if p not in known]
        ours = [p for p in new if OURS.match((rows[p].get("genre") or "").strip())]
        state["order"] += ours + [p for p in new if p not in set(ours)]
        save()
        done = set(state["done"])
        keep = keep_fields(PAGE_FIELDS, STATS_FIELDS)
        for ppid in state["order"]:
            if ppid in done: continue
            d = post("get-puzzle", {"ppid": ppid, "summaryOnly": True}, keep)
            if not d.get("success"): log(f"{ppid}: {d.get('message')}")
            state["done"].append(ppid); done.add(ppid)
            if len(state["done"]) % 10 == 0:
                save(); progress(f"fetched {ppid}", t0)
        # puzzles.jsonl: the list row and the page's fields, from the cache
        with open(os.path.join(OUT, "puzzles.jsonl"), "w") as f:
            for ppid in state["order"]:
                d = post("get-puzzle", {"ppid": ppid, "summaryOnly": True}, keep)
                r = dict(rows.get(ppid, {"ppid": ppid}))
                if d.get("success"):
                    r.update({k: v for k, v in d.items() if k not in ("success", "message", "puzzlestats")})
                    r["stats"] = d.get("puzzlestats")
                else:
                    r["pageError"] = d.get("message")
                r["url"] = f"{SITE}/expo/?ppid={ppid}"
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        save(); progress("finished", t0); log("finished")
    except Stop as e:
        save(); log(f"STOPPED: {e}"); progress(f"STOPPED: {e}", t0); sys.exit(2)
    finally:
        try: os.remove(os.path.join(OUT, "crawl.pid"))
        except OSError: pass
