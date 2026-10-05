// @ts-check
import { defineConfig } from "astro/config";

// The site is served from GitHub Pages at its own domain, https://wyattsgames.com/
export default defineConfig({
  site: "https://wyattsgames.com",
  base: "/",
  trailingSlash: "always",
});
