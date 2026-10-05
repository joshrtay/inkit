// Build links that respect the site's base path (/wyattsgames/ on GitHub Pages).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** url("line-maze/") -> "/wyattsgames/line-maze/" */
export function url(path = ""): string {
  return `${BASE}/${path.replace(/^\//, "")}`;
}
