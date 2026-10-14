# A polite fetcher for the puzzle-source crawls (docs/research-puzzle-sources.md): one connection,
# a fixed gap between requests, an honest User-Agent, every response cached on disk (gzipped), and a
# hard stop on errors. Standard library only.
#
# Errors: a 404 or 410 is cached as missing and the crawl goes on (a dead link on an index page);
# a server error (5xx) is retried once, a minute later; 20 missing pages in a row, a 429, any other
# HTTP error, a second server error, or a network failure raises Stop, and the crawl ends there. Rerunning resumes from the cache.
import gzip, hashlib, os, re, ssl, time, urllib.error, urllib.request

UA = "inkit-research/1.0 (non-commercial research; contact josh@carina.fund)"

# references/ is gitignored and lives in the main checkout; a worktree under .claude/worktrees
# shares the main one's.
_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.normpath(os.path.join(_HERE, "..", "..", ".."))
_MAIN = re.sub(r"/\.claude/worktrees/[^/]+$", "", _REPO)
REFERENCES = os.environ.get("REFERENCES_DIR") or os.path.join(_MAIN, "references")


# python.org builds of Python ship without CA certificates; macOS's bundle is at /etc/ssl/cert.pem
_SSL = ssl.create_default_context(cafile="/etc/ssl/cert.pem") if os.path.exists("/etc/ssl/cert.pem") else ssl.create_default_context()


class Stop(Exception):
    pass


class Fetcher:
    def __init__(self, cache_dir, delay, log=print, accept=None):
        self.cache_dir, self.delay, self.log = cache_dir, delay, log
        self.accept = accept
        self.last = 0.0
        self.requests = 0
        self.missing_run = 0
        os.makedirs(cache_dir, exist_ok=True)

    def path(self, url):
        # readable where we can, hashed when the URL is long or has a query
        tail = re.sub(r"^https?://[^/]+/", "", url)
        if "?" in tail or len(tail) > 150:
            tail = tail.split("?")[0][:80] + "__" + hashlib.sha1(url.encode()).hexdigest()[:16]
        tail = re.sub(r"[^A-Za-z0-9._/-]", "_", tail).strip("/") or "index"
        return os.path.join(self.cache_dir, tail + ".gz")

    def cached(self, url):
        p = self.path(url)
        if os.path.exists(p):
            return gzip.open(p).read()
        if os.path.exists(p + ".missing"):
            return None
        return False

    def get(self, url, retry=True):
        """The body (bytes), None when the page is missing (404/410), from the cache when we have it."""
        return self.post(url, None, retry=retry)

    def post(self, url, data, keep=None, retry=True):
        """Like get, but POSTs `data` (bytes, e.g. a JSON body) when it isn't None; the cache is keyed
        on the URL and the body. `keep(body) -> body` runs before the response is cached, so fields we
        must not store (other people's names, comments) never reach the disk."""
        key = url if data is None else f"{url}#post-{hashlib.sha1(data).hexdigest()[:16]}"
        hit = self.cached(key)
        if hit is not False:
            return hit
        try:
            return self._fetch(url, data, key, keep)
        except Stop as e:
            # a server error (5xx) is often passing: one retry a minute later, then stop
            if retry and getattr(e, "code", 0) >= 500:
                self.log(f"{e}; retrying once in 60 s")
                time.sleep(60)
                return self.post(url, data, keep, retry=False)
            raise

    def _fetch(self, url, data=None, key=None, keep=None):
        wait = self.last + self.delay - time.time()
        if wait > 0:
            time.sleep(wait)
        headers = {"User-Agent": UA}
        if self.accept:
            headers["Accept"] = self.accept
        if data is not None:
            headers["Content-Type"] = "application/json;charset=utf-8"
        req = urllib.request.Request(url, data=data, headers=headers)
        p = self.path(key or url)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        try:
            self.requests += 1
            with urllib.request.urlopen(req, timeout=60, context=_SSL) as r:
                body = r.read()
        except urllib.error.HTTPError as e:
            self.last = time.time()
            if e.code in (404, 410):
                open(p + ".missing", "w").write(f"{e.code}\n")
                self.missing_run += 1
                self.log(f"missing {e.code} {url}")
                if self.missing_run >= 20:
                    raise Stop(f"20 missing pages in a row, last {url}")
                return None
            stop = Stop(f"HTTP {e.code} on {url}")
            stop.code = e.code
            raise stop
        except Exception as e:
            self.last = time.time()
            raise Stop(f"{type(e).__name__} on {url}: {e}")
        self.last = time.time()
        self.missing_run = 0
        if keep:
            body = keep(body)
        tmp = p + ".tmp"
        with gzip.open(tmp, "wb") as f:
            f.write(body)
        os.replace(tmp, p)
        return body


if __name__ == "__main__":
    # python3 polite.py <cache dir> <delay s> <url> ...: fetch (or read from the cache) and print where each is
    import sys
    f = Fetcher(sys.argv[1], float(sys.argv[2]))
    for u in sys.argv[3:]:
        b = f.get(u)
        print(u, "missing" if b is None else f"{len(b)} bytes", f.path(u))
