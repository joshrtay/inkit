import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
    // The game engines are shared with the current site in ../src (no copies).
    alias: { "~site": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  server: { fs: { allow: [".."] } },
});
