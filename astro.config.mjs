// @ts-check
import { defineConfig } from "astro/config";

// The site is served from GitHub Pages at https://joshrtay.github.io/wyattsgames/
export default defineConfig({
  site: "https://joshrtay.github.io",
  base: "/wyattsgames",
  trailingSlash: "always",
});
