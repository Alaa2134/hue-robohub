#!/usr/bin/env node
/**
 * Lighthouse on a phone (Moto G-class CPU, slow 4G) for the main pages of the built site, so the
 * performance scores and Core Web Vitals (LCP, CLS, TBT as the lab stand-in for INP) are numbers on
 * every CI run, not a guess. Serves out-static with gzip like the host does, writes one JSON report
 * per page to lh-reports/ and a table to the CI summary. It reports; it doesn't fail the build.
 *
 *   node scripts/lighthouse-mobile.mjs [out-static]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const root = path.resolve(process.argv[2] || "out-static");
const PAGES = ["/ar/", "/ar/join/", "/ar/events/", "/ar/tracks/", "/"];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml", ".wasm": "application/wasm" };

const server = http
  .createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let f = path.join(root, p);
    if (!f.startsWith(root)) return res.writeHead(403).end();
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    let status = 200;
    if (!fs.existsSync(f)) [f, status] = [path.join(root, "404.html"), 404];
    const type = TYPES[path.extname(f)] ?? "application/octet-stream";
    const body = fs.readFileSync(f);
    const headers = { "Content-Type": type, "Cache-Control": "max-age=600" };
    if (/text|javascript|json|svg|xml/.test(type) && /gzip/.test(String(req.headers["accept-encoding"]))) res.writeHead(status, { ...headers, "Content-Encoding": "gzip" }).end(zlib.gzipSync(body));
    else res.writeHead(status, headers).end(body);
  })
  .listen(0);
const port = server.address().port;

// The Chromium Playwright installed (CI) unless CHROME_PATH says otherwise.
let chrome = process.env.CHROME_PATH;
if (!chrome) {
  try {
    chrome = createRequire(import.meta.url)("playwright").chromium.executablePath();
  } catch {
    /* lighthouse looks for one itself */
  }
}

fs.mkdirSync("lh-reports", { recursive: true });
const rows = [];
for (const page of PAGES) {
  const out = path.join("lh-reports", `${page.replace(/\W+/g, "_") || "_"}.json`);
  const r = spawnSync(
    "npx",
    ["-y", "lighthouse@13.5.0", `http://localhost:${port}${page}`, "--form-factor=mobile", "--only-categories=performance,accessibility,best-practices,seo", "--chrome-flags=--headless=new --no-sandbox", "--output=json", `--output-path=${out}`, "--quiet"],
    { stdio: "inherit", env: { ...process.env, ...(chrome ? { CHROME_PATH: chrome } : {}) }, timeout: 300_000 },
  );
  if (r.status !== 0 || !fs.existsSync(out)) {
    rows.push(`| ${page} | — | — | — | — | — | — | — |`);
    continue;
  }
  const d = JSON.parse(fs.readFileSync(out, "utf8"));
  const score = (k) => Math.round((d.categories[k]?.score ?? 0) * 100);
  const v = (k) => d.audits[k]?.displayValue ?? "—";
  rows.push(`| ${page} | ${score("performance")} | ${score("accessibility")} | ${score("seo")} | ${v("largest-contentful-paint")} | ${v("cumulative-layout-shift")} | ${v("total-blocking-time")} | ${v("first-contentful-paint")} |`);
}
server.close();

const table = ["### Lighthouse — mobile", "", "| Page | Perf | A11y | SEO | LCP | CLS | TBT | FCP |", "|---|---|---|---|---|---|---|---|", ...rows, ""].join("\n");
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
