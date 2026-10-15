# Janko's puzzles (www.janko.at/Raetsel/), every type, for local non-commercial research only
# (docs/research-puzzle-sources.md: CC BY-NC-SA puzzles "go", the others "go with care"). Never
# published. Writes references/janko-full/, leaving references/janko/ alone.
#
#   nohup python3 -I puzzles/difficulty/sources/janko_crawl.py > /dev/null 2>&1 &
#
# Crawl rules: our own fetcher (robots.txt blocks site copiers such as HTTrack), one connection,
# 3 s between requests, an honest User-Agent, every response cached (cache/), a stop on HTTP errors
# and 429s. Resumable: rerun and it picks up from the cache and state.json.
#
# 1. Discovery: Raetsel/index.htm lists every type's folder; each folder's index.htm (and its
#    index-N.htm pages and subfolders) lists the puzzle pages, NNNN.a.htm.
# 2. Puzzles: each page's [begin] … [end] block (the puzzle's text file, as Janko's player reads
#    it) goes to <Folder>/<NNNN>.txt, the format puzzles/difficulty/janko.ts reads; the page's
#    footer (Autor, Quelle, Lizenz) goes to meta.jsonl, one line per puzzle. Our types first.
#
# Files: state.json (the folders, their puzzles, what's done), progress.txt (one line, rewritten),
# crawl.log, crawl.pid while running.
import html, json, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from polite import REFERENCES, Fetcher, Stop

BASE = "https://www.janko.at/Raetsel/"
OUT = os.path.join(REFERENCES, "janko-full")
DELAY = 6.0   # 3 s, then 4 s, drew connection resets (2026-10-14): gentler still
# our types and those close to them, in this order; then every other folder, A to Z
FIRST = ["Sternenschlacht", "Slitherlink", "Masyu", "Nurikabe", "Akari", "Hitori", "Sikaku", "Fillomino", "Sudoku",
         "Wolkenkratzer", "Abc-End-View", "Arukone", "Hidoku", "Minesweeper", "Nonogramme", "Galaxien", "Heyawake",
         "LITS", "Yajilin", "Kuromasu", "Norinori", "Tapa", "Thermometer", "Kakuro", "Hashi", "Suguru", "Kojun",
         "Futoshiki", "Battleships", "Schlange", "Tatamibari", "Shakashaka", "Mochikoro", "Kurotto", "Masyu-2",
         "Arukone-2", "Arukone-3", "Wolkenkratzer-2", "Hashi-2"]

os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, "crawl.log"), "a")
def log(msg):
    LOG.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n"); LOG.flush()

STATE = os.path.join(OUT, "state.json")
state = json.load(open(STATE)) if os.path.exists(STATE) else {"folders": {}, "discovered": False, "done": {}}
def save():
    tmp = STATE + ".tmp"; json.dump(state, open(tmp, "w")); os.replace(tmp, STATE)

fetch = Fetcher(os.path.join(OUT, "cache"), DELAY, log=log)
def text(url):
    b = fetch.get(url)
    return None if b is None else b.decode("utf-8", "replace")

def progress(note):
    listed = sum(len(v) for v in state["folders"].values())
    done = sum(state["done"].values())
    left = listed - done
    line = (f"{time.strftime('%Y-%m-%d %H:%M:%S')} {note}; folders {len(state['folders'])}; puzzles {done}/{listed}; "
            f"requests this run {fetch.requests}; ~{left * DELAY / 3600:.1f} h left at {DELAY:.0f} s a request; pid {os.getpid()}\n")
    open(os.path.join(OUT, "progress.txt"), "w").write(line)

def order(folders):
    top = {f: i for i, f in enumerate(FIRST)}
    return sorted(folders, key=lambda f: (top.get(f.split("/")[0], len(FIRST)), top.get(f, len(FIRST)), f))

def discover():
    root = text(BASE + "index.htm")
    folders = sorted({m for m in re.findall(r'href="([A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)?)/index\.htm"', root)})
    queue = order(folders)
    seen = set(queue)
    while queue:
        folder = queue.pop(0)
        if folder in state["folders"]:
            continue
        pages, todo, got = set(), ["index.htm"], set()
        while todo:
            page = todo.pop(0)
            if page in pages: continue
            pages.add(page)
            h = text(f"{BASE}{folder}/{page}")
            if h is None: continue
            got |= set(re.findall(r'href="(\d+)\.a\.htm"', h))
            todo += [p for p in re.findall(r'href="(index-\d+\.htm)"', h) if p not in pages]
            for sub in re.findall(r'href="([A-Za-z0-9_-]+)/index\.htm"', h):
                f = f"{folder}/{sub}"
                if f not in seen and folder.count("/") == 0:
                    seen.add(f); queue.append(f)
        state["folders"][folder] = sorted(got)
        state["done"].setdefault(folder, 0)
        save(); progress(f"discovering ({folder}: {len(got)})")
        log(f"listed {folder}: {len(got)} puzzles on {len(pages)} index pages")
    state["discovered"] = True
    save()

def cell(h, label):
    m = re.search(rf"<td>\s*{label}:\s*</td>\s*<td>(.*?)</td>", h, re.S)
    return html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else ""

def puzzles():
    meta = open(os.path.join(OUT, "meta.jsonl"), "a")
    for folder in order(state["folders"]):
        ids = state["folders"][folder]
        os.makedirs(os.path.join(OUT, folder), exist_ok=True)
        done = 0
        for n in ids:
            out = os.path.join(OUT, folder, f"{n}.txt")
            if os.path.exists(out) or os.path.exists(out + ".none"):
                done += 1; continue
            url = f"{BASE}{folder}/{n}.a.htm"
            h = text(url)
            if h is None:
                open(out + ".none", "w").write("missing\n"); done += 1; continue
            block = re.search(r"\[begin\].*?\[end\]", h, re.S)
            title = re.search(r"<title>(.*?)</title>", h, re.S)
            rec = {"folder": folder, "n": n, "url": url, "title": html.unescape(title.group(1)).strip() if title else "",
                   "author": cell(h, "Autor"), "quelle": cell(h, "Quelle"), "licence": cell(h, "Lizenz"),
                   "has_text": bool(block)}
            if block:
                open(out + ".tmp", "w").write(block.group(0) + "\n"); os.replace(out + ".tmp", out)
            else:
                open(out + ".none", "w").write("no [begin] block\n")
            meta.write(json.dumps(rec, ensure_ascii=False) + "\n"); meta.flush()
            done += 1
            if done % 10 == 0:
                state["done"][folder] = done; save(); progress(f"fetching {folder} {done}/{len(ids)}")
        state["done"][folder] = done; save(); progress(f"fetched {folder}")
        log(f"done {folder}: {done}/{len(ids)}")

if __name__ == "__main__":
    # kill <pid> ends it cleanly (state saved as it goes; crawl.pid removed)
    import signal; signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    open(os.path.join(OUT, "crawl.pid"), "w").write(str(os.getpid()))
    only_discover = "--discover" in sys.argv
    try:
        if not state["discovered"]:
            discover()
        listed = sum(len(v) for v in state["folders"].values())
        log(f"discovered {len(state['folders'])} folders, {listed} puzzles: ~{listed * DELAY / 3600:.1f} h at {DELAY:.0f} s")
        if not only_discover:
            puzzles()
            progress("finished")
            log("finished")
    except Stop as e:
        log(f"STOPPED: {e}"); progress(f"STOPPED: {e}"); sys.exit(2)
    finally:
        try: os.remove(os.path.join(OUT, "crawl.pid"))
        except OSError: pass
