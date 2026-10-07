#!/usr/bin/env node
/**
 * Web files for the two store apps, taken from the static build (run scripts/build-static.mjs first):
 *
 *   mobile/student/www  →  BuildX HUE   (students: content, quizzes, attendance, points, certificates)
 *   mobile/team/www     →  BuildX Team  (staff: barcode attendance, students, content, dashboard)
 *
 * Both carry the same BuildX App (/app/) plus the files it loads (_next, brand). The start page sets
 * the app mode, which the app reads to show only its own side (see appMode() in src/portal/core.ts).
 *
 *   node scripts/build-static.mjs && node scripts/build-native.mjs && (cd mobile && npm run sync)
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "out-static");
const log = (m) => console.log(`[native] ${m}`);

if (!existsSync(path.join(out, "app", "index.html"))) {
  console.error("[native] out-static/app/index.html is missing: run `node scripts/build-static.mjs` first.");
  process.exit(1);
}

const APPS = [
  { dir: "student", mode: "student", start: "#/me" },
  { dir: "team", mode: "staff", start: "#/staff" },
];

for (const app of APPS) {
  const www = path.join(root, "mobile", app.dir, "www");
  rmSync(www, { recursive: true, force: true });
  mkdirSync(www, { recursive: true });
  for (const part of ["_next", "app", "brand"]) cpSync(path.join(out, part), path.join(www, part), { recursive: true });
  // The offline worker and the install manifest are for the website only.
  rmSync(path.join(www, "app", "sw.js"), { force: true });
  writeFileSync(
    path.join(www, "index.html"),
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html{background:#081634}</style>` +
      `<script>try{localStorage.setItem("rh-app-mode","${app.mode}")}catch(e){}location.replace("/app/index.html${app.start}")</script></head><body></body></html>\n`,
  );
  log(`${app.dir}: ${www}`);
}
