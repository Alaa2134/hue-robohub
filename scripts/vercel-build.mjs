// Vercel build entry (runs instead of `npm run build` because the script is named `vercel-build`).
// With a database configured, schema migrations and the idempotent core-content seed run first, so a
// new deployment needs no manual database steps. Previews skip migrations unless MIGRATE_PREVIEWS=1.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });
const isPreview = process.env.VERCEL_ENV === "preview";

if (process.env.DATABASE_URL && (!isPreview || process.env.MIGRATE_PREVIEWS === "1")) {
  console.log("▸ Applying database migrations");
  run("npx tsx scripts/migrate.ts");
  console.log("▸ Seeding core content (idempotent)");
  run("npx tsx --conditions=react-server scripts/seed.ts");
} else {
  console.log(process.env.DATABASE_URL ? "▸ Preview build: skipping migrations" : "▸ No DATABASE_URL: building with built-in content");
}
run("node scripts/app-assets.mjs");
run("npx next build");
