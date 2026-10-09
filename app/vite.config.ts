import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/** The commit this build is made from, for bug reports (app/lib/bugs/state.ts): CI's GITHUB_SHA, or git's. */
function buildSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try { return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "unknown"; }
}

export default defineConfig({
  define: { __BUILD_SHA__: JSON.stringify(buildSha()) },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
    // The game engine, player and guides are shared code in ../src.
    alias: { "~site": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  server: { fs: { allow: [".."] } },
  // clingo-wasm starts a Web Worker from its own files; pre-bundling would break that path.
  optimizeDeps: { exclude: ["clingo-wasm"] },
  worker: { format: "es" },
});
