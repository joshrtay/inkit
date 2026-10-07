// Unit tests (tests/unit): plain functions only, so none of the site's Vite plugins are needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "~site": fileURLToPath(new URL("../src", import.meta.url)),
      "~": fileURLToPath(new URL("./app", import.meta.url)),
    },
  },
  test: { include: ["tests/unit/**/*.test.ts"] },
});
