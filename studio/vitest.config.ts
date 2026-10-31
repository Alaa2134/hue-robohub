import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "core", include: ["packages/core/src/**/*.test.ts"], environment: "node" } },
      { test: { name: "services", include: ["apps/{api,worker}/src/**/*.test.ts"], environment: "node", testTimeout: 240_000, hookTimeout: 120_000, fileParallelism: false } },
    ],
  },
});
