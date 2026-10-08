import { defineConfig, devices } from "@playwright/test";

/** Smoke tests against the static export in out-static/ (build it first). Supabase is mocked per test. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Service workers are off (they'd answer requests the tests mock); e2e/offline.spec.ts turns them on.
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure", serviceWorkers: "block" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node scripts/serve-static.mjs out-static 4173",
    url: "http://localhost:4173/",
    reuseExistingServer: !process.env.CI,
  },
});
