// @ts-check
import { defineConfig } from "astro/config";

// The site is served from GitHub Pages at its own domain, https://wyattsgames.com/
export default defineConfig({
  site: "https://wyattsgames.com",
  base: "/",
  trailingSlash: "always",
  // RYB was renamed Three Coats; keep the old (already published) links working.
  redirects: Object.fromEntries([
    ["/ryb/", "/three-coats/"],
    ...[1, 2, 3, 4, 5, 6].map((n) => [`/ryb/${n}/`, `/three-coats/${n}/`]),
  ]),
});
