#!/usr/bin/env node
/**
 * Web files for the BuildX HUE store app, taken from the static build (run scripts/build-static.mjs first):
 *
 *   mobile/app/www  →  BuildX HUE (students and the training team, one sign-in)
 *
 * It carries the BuildX App (/app/) plus the files it loads (_next, brand). Students land on their
 * dashboard (#/me) and team members on theirs (#/staff), from the same sign-in screen.
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

const www = path.join(root, "mobile", "app", "www");
rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const part of ["_next", "app", "brand"]) cpSync(path.join(out, part), path.join(www, part), { recursive: true });
// The offline worker and the install manifest are for the website only.
rmSync(path.join(www, "app", "sw.js"), { force: true });
// rh-app-mode: left by the earlier separate student and team apps.
writeFileSync(
  path.join(www, "index.html"),
  `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html{background:#081634}</style>` +
    `<script>try{localStorage.removeItem("rh-app-mode")}catch(e){}location.replace("/app/index.html#/")</script></head><body></body></html>\n`,
);
log(`app: ${www}`);
