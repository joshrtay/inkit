// Browser tests (tests/e2e): the editor for every puzzle type, against the site running locally
// (local D1, migrated and seeded with the example puzzles). Locally they reuse a running
// `npm run dev`; in CI they start one.
import { defineConfig, devices } from "@playwright/test";
import { AUTH_FILE, BASE_URL } from "./tests/e2e/db";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/setup.ts",
  globalTeardown: "./tests/e2e/teardown.ts",
  // the "~/" and "~site/" paths, for specs that use the site's own code (reader.spec.ts)
  tsconfig: "./tsconfig.cloudflare.json",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL: BASE_URL, storageState: AUTH_FILE, trace: "retain-on-failure", ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
  webServer: { command: `npm run dev -- --port ${new URL(BASE_URL).port} --strictPort`, url: BASE_URL, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
