// @ts-check
import { defineConfig } from "astro/config";

// The site is served from GitHub Pages at https://joshrtay.github.io/escape-room/
export default defineConfig({
  site: "https://joshrtay.github.io",
  base: "/escape-room",
  trailingSlash: "always",
});
