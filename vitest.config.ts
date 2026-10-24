import path from "node:path";
import { defineConfig } from "vitest/config";

/** Unit tests (BuildX Lab's compiler, circuit solver and simulator). Run `node scripts/lab-toolchain.mjs` first. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    projects: [{ extends: true, test: { name: "unit", include: ["src/**/*.test.ts"], environment: "node", testTimeout: 120_000 } }],
  },
});
