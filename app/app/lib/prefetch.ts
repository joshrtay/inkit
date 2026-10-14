// Prefetched page data, used once (components/Link.tsx prefetches on intent).
//
// React Router prefetches a page's data with <link rel="prefetch">, but the browser only hands that
// response to the click's own fetch if it may be cached; otherwise the click loads it again. So the
// server lets a prefetch be kept for a few seconds (`prefetchCaching`, in the root's middleware), and
// here every other page-data fetch skips the cache, so a kept response is used for the one
// navigation it was fetched for and never after a change (a like, a subscribe, a save).
const DATA = /\.data(?:\?|$)/;

// pages not loaded ahead on intent: heavy ones (the editors, admin), and ones we'd rather not load
// on a hover (/new, sign-in, the API, settings pages)
const NO_PREFETCH = /^\/(?:admin|api|new|signin|signup|account|studios|settings)(?:[/?#]|$)|^\/g\/[^/]+\/(?:draw|edit|publish|preview)(?:[?#]|$)|^\/[^/]+\/settings(?:[?#]|$)/;

/** Whether a link to `to` loads its page ahead on intent (components/Link.tsx). */
export function prefetchable(to: string | { pathname?: string }): boolean {
  return !NO_PREFETCH.test(typeof to === "string" ? to : to.pathname ?? "");
}

const KEEP_MS = 5_000;

/** The server's side: a prefetch of a page's data may be kept for a few seconds. */
export function prefetchCaching(request: Request, res: Response): void {
  const purpose = request.headers.get("sec-purpose") ?? request.headers.get("purpose") ?? "";
  if (request.method !== "GET" || !/prefetch/.test(purpose) || res.headers.has("cache-control")) return;
  if (!/x-script|turbo-stream/.test(res.headers.get("content-type") ?? "")) return;
  res.headers.set("cache-control", `private, max-age=${KEEP_MS / 1000}`);
}

/** The browser's side: page-data fetches skip the cache, but for the first one of a URL just
 *  prefetched (and nothing changed since). Installed once, before the router's first fetch. */
export function installPrefetchUse(): void {
  if (typeof window === "undefined" || (window as { __inkitFetch?: boolean }).__inkitFetch) return;
  (window as { __inkitFetch?: boolean }).__inkitFetch = true;
  const prefetched = new Map<string, number>();
  let changedAt = 0;
  // when each prefetch started (React Router puts a <link rel="prefetch" as="fetch"> beside the link);
  // a click while it's still loading waits for it in the browser's cache rather than asking again
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) {
      if (n instanceof HTMLLinkElement && n.rel === "prefetch" && DATA.test(n.href)) {
        const u = new URL(n.href);
        prefetched.set(u.pathname + u.search, performance.now());
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  const real = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET") { changedAt = performance.now(); prefetched.clear(); return real(input, init); }
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin || !DATA.test(url.pathname + url.search)) return real(input, init);
    const key = url.pathname + url.search, at = prefetched.get(key);
    prefetched.delete(key);
    if (at !== undefined && at > changedAt && performance.now() - at < KEEP_MS && !init?.cache) return real(input, init);
    return real(input, { ...init, cache: "no-cache" });
  };
}
