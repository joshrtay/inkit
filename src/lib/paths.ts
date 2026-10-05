// Build links that respect the site's base path (/escape-room/ on GitHub Pages).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** url("line-maze/") -> "/escape-room/line-maze/" */
export function url(path = ""): string {
  return `${BASE}/${path.replace(/^\//, "")}`;
}
