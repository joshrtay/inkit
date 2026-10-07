// Browser tests (tests/e2e): the editor for every puzzle type, against the site running locally
// (local D1, migrated and seeded with the example puzzles). Locally they reuse a running
// `npm run dev`; in CI they start one.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/setup.ts",
  globalTeardown: "./tests/e2e/teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL: "http://localhost:5173", storageState: "tests/e2e/.auth.json", trace: "retain-on-failure", ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
  webServer: { command: "npm run dev", url: "http://localhost:5173", reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
