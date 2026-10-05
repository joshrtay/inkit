// Build links that respect the site's base path (set in astro.config.mjs; "/" on wyattsgames.com).
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** url("three-coats/2/") -> "/three-coats/2/" (prefixed with the base path, if any) */
export function url(path = ""): string {
  return `${BASE}/${path.replace(/^\//, "")}`;
}
