# Puzzle Square JP's public puzzles in text form (a puzz.link, pzprxs or Penpa link), for local
# non-commercial research only (docs/research-puzzle-sources.md: "go with care"; the site's CC0
# example puzzles "go"). Never published. Writes references/psjp-full/.
#
#   nohup python3 -I puzzles/difficulty/sources/psjp_crawl.py > /dev/null 2>&1 &
#
# How the site serves a puzzle: the puzzle page (/puzzle/<id>, a Next.js app) loads it through a
# Firebase function, and shows a "solve with" button for the puzzle's link (puzz.link, pzprxs,
# Penpa). The same link is in the site's public REST API, one day of puzzles per request:
# /api/problem/date/<YYYY-MM-DD> -> {id: {kind, difficulty, variation, img, url, registered, user}}
# (the API bay-puz/psjp reads; data.json is its copy). So one request covers a day's puzzles, not
# one each. No login anywhere. Puzzles whose url is empty are images only: skipped and counted.
#
# Crawl rules (the guideline bans load on the system): one connection, 5 s between requests, an
# honest User-Agent, every response cached (cache/), a stop on HTTP errors and 429s. Days with our
# types first, then the rest. Resumable: rerun and it picks up from state.json and the cache.
#
# Files: records.jsonl (one line per puzzle: the API's fields, the link, and from data.json
# favorite_n and answered_n, from /api/user the author's name), state.json, progress.txt,
# crawl.log, crawl.pid while running.
import datetime, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from polite import REFERENCES, Fetcher, Stop

API = "https://puzsq.logicpuzzle.app/api"
OUT = os.path.join(REFERENCES, "psjp-full")
OLD = os.path.join(REFERENCES, "psjp")
DELAY = 5.0
FIRST_DAY = datetime.date(2019, 5, 9)
# PSJP kinds of our genres (kind.json's name_e), crawled first
OURS = {"Slitherlink", "Slitherlink / Fences", "Masyu", "Numberlink", "Nurikabe", "Akari", "Star Battle", "Shikaku",
        "Sudoku", "Hitori", "Minesweeper", "Tentaisho / Spiral Galaxies", "Skyscrapers", "Easy as ABC", "Cave",
        "Aquarium", "Nonogram", "Square Jam", "Simple Loop", "Wittgenstein Briquet / Desk Place", "Fillomino",
        "Hidoku", "Binairo", "Light and Shadow"}

os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, "crawl.log"), "a")
def log(msg):
    LOG.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n"); LOG.flush()

STATE = os.path.join(OUT, "state.json")
state = json.load(open(STATE)) if os.path.exists(STATE) else {"days": [], "done": [], "puzzles": 0, "with_link": 0}
def save():
    tmp = STATE + ".tmp"; json.dump(state, open(tmp, "w")); os.replace(tmp, STATE)

fetch = Fetcher(os.path.join(OUT, "cache"), DELAY, log=log)
def api(path):
    b = fetch.get(API + path)
    return None if b is None else json.loads(b)

def progress(note, t0):
    done, total = len(state["done"]), len(state["days"])
    rate = fetch.requests / max(1e-9, time.time() - t0) * 3600
    left_h = (total - done) * DELAY / 3600
    eta = time.strftime("%Y-%m-%d %H:%M", time.localtime(time.time() + left_h * 3600))
    open(os.path.join(OUT, "progress.txt"), "w").write(
        f"{time.strftime('%Y-%m-%d %H:%M:%S')} {note}; days {done}/{total}; puzzles {state['puzzles']} "
        f"({state['with_link']} with a link); {rate:.0f} requests/h this run; ~{left_h:.1f} h left, ETA {eta}; pid {os.getpid()}\n")

def plan(kinds):
    """Days to fetch: those with our kinds first (from data.json's dates), then the rest; every day
    after data.json's last update, since it can't tell."""
    data = json.load(open(os.path.join(OLD, "data.json")))
    ours = {k for k, v in kinds.items() if v["name_e"] in OURS or v["name_e"].split(" / ")[0] in OURS}
    days_ours, days_any = set(), set()
    for p in data.values():
        d = p["registered"][:10]
        days_any.add(d)
        if str(p["kind"]) in ours: days_ours.add(d)
    last = max(days_any)
    yesterday = datetime.date.today() - datetime.timedelta(days=1)
    tail, d = [], datetime.date.fromisoformat(last) + datetime.timedelta(days=1)
    while d <= yesterday:
        tail.append(d.isoformat()); d += datetime.timedelta(days=1)
    return sorted(days_ours) + sorted(days_any - days_ours) + tail

if __name__ == "__main__":
    open(os.path.join(OUT, "crawl.pid"), "w").write(str(os.getpid()))
    t0 = time.time()
    try:
        kinds = api("/kind"); users = api("/user")
        json.dump(kinds, open(os.path.join(OUT, "kind.json"), "w"), ensure_ascii=False)
        json.dump(users, open(os.path.join(OUT, "user.json"), "w"), ensure_ascii=False)
        if not state["days"]:
            state["days"] = plan(kinds); save()
            log(f"planned {len(state['days'])} days: ~{len(state['days']) * DELAY / 3600:.1f} h at {DELAY:.0f} s")
        data = json.load(open(os.path.join(OLD, "data.json")))
        done = set(state["done"])
        out = open(os.path.join(OUT, "records.jsonl"), "a")
        for day in state["days"]:
            if day in done: continue
            got = api(f"/problem/date/{day}") or {}
            for pid, p in sorted(got.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0):
                old = data.get(pid, {})
                k = kinds.get(str(p.get("kind")), {})
                rec = {"id": pid, "kind": p.get("kind"), "kind_name": k.get("name_e", ""), "difficulty": p.get("difficulty"),
                       "variation": p.get("variation"), "registered": p.get("registered"), "user": p.get("user"),
                       "user_name": users.get(str(p.get("user")), {}).get("name", ""),
                       "favorite_n": old.get("favorite_n"), "answered_n": old.get("answered_n"), "url": p.get("url") or ""}
                out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                state["puzzles"] += 1; state["with_link"] += bool(rec["url"])
            out.flush()
            state["done"].append(day); done.add(day)
            if len(state["done"]) % 5 == 0:
                save(); progress(f"fetched {day}", t0)
        save(); progress("finished", t0); log("finished")
    except Stop as e:
        save(); log(f"STOPPED: {e}"); progress(f"STOPPED: {e}", t0); sys.exit(2)
    finally:
        try: os.remove(os.path.join(OUT, "crawl.pid"))
        except OSError: pass
