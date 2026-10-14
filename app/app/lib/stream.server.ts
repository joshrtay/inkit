// Parts of a page sent after it (React Router streams a loader's unawaited promises; the page shows
// them with components/Later.tsx). A part that fails shows its quiet fallback, so the failure
// mustn't also go unhandled: a promise that rejects before React Router takes it up (say, while
// the page's other loader is still running) would otherwise be reported as an unhandled rejection.
export function later<T>(p: Promise<T>): Promise<T> {
  p.catch((e) => console.error("a streamed part of the page failed:", e));
  return p;
}
