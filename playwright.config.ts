import { defineConfig, devices } from "@playwright/test";

/** Smoke tests against the static export in out-static/ (build it first). Supabase is mocked per test. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "python3 -m http.server 4173 --directory out-static",
    url: "http://localhost:4173/",
    reuseExistingServer: !process.env.CI,
  },
});
