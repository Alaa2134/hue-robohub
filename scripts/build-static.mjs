#!/usr/bin/env node
/**
 * Static export of the public website for GitHub Pages: no server, no database, no Command Center.
 * Forms show "opening soon" notices; everything else renders from the built-in content and key art.
 *
 *   BASE_PATH=/hue-robohub SITE_URL=https://alaa2134.github.io/hue-robohub node scripts/build-static.mjs
 *   CNAME=buildxhue.com SITE_URL=https://buildxhue.com node scripts/build-static.mjs   (custom domain)
 *
 * Output: ./out-static — push its contents to a gh-pages branch.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { contentVersion } from "./content-version.mjs";

const root = path.resolve(import.meta.dirname, "..");
const work = path.join(root, ".static-build");
const out = path.join(root, "out-static");
const base = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");
const site = (process.env.SITE_URL ?? `https://alaa2134.github.io${base}`).replace(/\/+$/, "");
const log = (m) => console.log(`[static] ${m}`);

// Fingerprint the published content before reading it, so an edit made mid-build triggers the next run.
const version = await contentVersion().catch(() => "unknown");

// 0. Self-hosted barcode reader for the RoboHub App (public/app/zxing_reader.wasm).
execSync("node scripts/app-assets.mjs", { cwd: root, stdio: "inherit" });

// 1. Clean copy of the sources (node_modules is linked, render sources and local data stay behind).
const SKIP = new Set([".git", "node_modules", ".next", ".static-build", "out-static", "out", "art", "storage", "logs", "coverage", "playwright-report", "test-results", ".env"]);
rmSync(work, { recursive: true, force: true });
mkdirSync(work);
for (const f of readdirSync(root)) if (!SKIP.has(f)) cpSync(path.join(root, f), path.join(work, f), { recursive: true });
symlinkSync(path.join(root, "node_modules"), path.join(work, "node_modules"), "dir");

// 2. Drop everything that needs a server, plus record pages that only exist with a database.
for (const p of [
  "src/app/(app)",
  "src/app/api",
  "src/app/uploads",
  "src/proxy.ts",
  "src/app/[locale]/[...rest]",
  "src/app/[locale]/projects/[slug]",
  "src/app/[locale]/team/[slug]",
  "src/app/[locale]/events/[slug]",
  "src/app/[locale]/gallery/[slug]",
  "src/app/[locale]/news/[slug]",
])
  rmSync(path.join(work, p), { recursive: true, force: true });

// 2b. Static-only pages take their place: one page per published member, post, project and event,
// read from Supabase at build time (src/static-routes).
const staticRoutes = path.join(work, "src/static-routes");
for (const d of readdirSync(staticRoutes).filter((d) => statSync(path.join(staticRoutes, d)).isDirectory()))
  cpSync(path.join(staticRoutes, d), path.join(work, "src/app/[locale]", d), { recursive: true });

// 3. Server actions become inert (static pages render notices instead of forms).
writeFileSync(
  path.join(work, "src/server/actions/public.ts"),
  `import type { ActionResult } from "../action";
const off = async (): Promise<ActionResult<{ id: string }>> => ({ ok: false, error: "Not available on the static site.", code: "UNAVAILABLE" });
export const submitApplication = (_p: unknown, _f: FormData) => off();
export const submitContact = (_p: unknown, _f: FormData) => off();
`,
);

// 4. Static segment config: every page is fully pre-rendered.
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
for (const f of walk(path.join(work, "src/app")).filter((f) => /\.(tsx?|mts)$/.test(f))) {
  const s = readFileSync(f, "utf8");
  const n = s.replace(/export const dynamicParams = true;/g, "export const dynamicParams = false;").replace(/export const revalidate = \d+;\n/g, "");
  if (n !== s) writeFileSync(f, n);
}
// Metadata routes (robots, sitemap, manifest) must be declared static for an export.
for (const f of ["robots.ts", "sitemap.ts", "manifest.ts"].map((x) => path.join(work, "src/app", x)).filter(existsSync)) {
  const s = readFileSync(f, "utf8");
  if (!s.includes("export const dynamic")) writeFileSync(f, `${s}\nexport const dynamic = "force-static";\n`);
}
writeFileSync(
  path.join(work, "next.config.ts"),
  `import type { NextConfig } from "next";
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  ${base ? `basePath: ${JSON.stringify(base)},` : ""}
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["sharp", "@node-rs/argon2", "postgres", "ioredis"],
  images: { unoptimized: true },
};
export default config;
`,
);

// 5. Build without any database or secrets.
log(`building for ${site}`);
const env = { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_STATIC_SITE: "1", NEXT_PUBLIC_BASE_PATH: base, APP_URL: site, NEXT_TELEMETRY_DISABLED: "1" };
for (const k of ["DATABASE_URL", "APP_SECRET", "VERCEL", "VERCEL_ENV"]) delete env[k];
execSync("npx next build", { cwd: work, env, stdio: "inherit" });

// 6. English lives at the root (links never carry /en), Arabic under /ar.
rmSync(out, { recursive: true, force: true });
renameSync(path.join(work, "out"), out);
// Merge rather than replace: /brand is both a page and the logo-file folder from public/.
const merge = (from, to) => {
  for (const f of readdirSync(from)) {
    const a = path.join(from, f);
    const b = path.join(to, f);
    if (statSync(a).isDirectory() && existsSync(b) && statSync(b).isDirectory()) merge(a, b);
    else {
      rmSync(b, { recursive: true, force: true });
      renameSync(a, b);
    }
  }
};
const en = path.join(out, "en");
if (existsSync(en)) {
  merge(en, out);
  rmSync(en, { recursive: true, force: true });
}

// 6a. GitHub Pages serves /404.html for every missing URL: use the site's own 404 page (it forwards
// clean URLs of items published after this build to their live pages).
if (existsSync(path.join(out, "lost/index.html"))) {
  renameSync(path.join(out, "lost/index.html"), path.join(out, "404.html"));
  for (const d of [path.join(out, "lost"), path.join(out, "ar/lost"), path.join(out, "404")]) rmSync(d, { recursive: true, force: true });
}

// 6a'. A section with nothing published yet only builds its "_" placeholder (an export needs one path).
for (const sec of ["team", "news", "projects", "events"]) for (const l of ["", "ar"]) rmSync(path.join(out, l, sec, "_"), { recursive: true, force: true });

// 6b. Arabic pages preload the Arabic fonts instead of the Latin ones: their text is set in Kufi and
// Plex, and late Arabic fonts made the first view reflow on phones.
{
  const media = readdirSync(path.join(out, "_next/static/media"));
  const ar = ["kufi_var", "plex_arabic_400"].map((n) => media.find((f) => f.startsWith(n) && f.endsWith(".woff2"))).filter(Boolean);
  const latin = /<link rel="preload" href="([^"]*\/_next\/static\/media\/)(?:inter_var|saira_var)[^"]*" as="font"[^>]*>/g;
  let n = 0;
  if (ar.length === 2 && existsSync(path.join(out, "ar")))
    for (const f of walk(path.join(out, "ar")).filter((f) => f.endsWith(".html"))) {
      const s = readFileSync(f, "utf8");
      let i = 0;
      const t = s.replace(latin, (_m, dir) => (i < ar.length ? `<link rel="preload" href="${dir}${ar[i++]}" as="font" crossorigin="" type="font/woff2"/>` : ""));
      if (t !== s) (writeFileSync(f, t), n++);
    }
  log(`arabic font preloads in ${n} pages`);
}

// 7. Project sites live under /<repo>: prefix root-relative media and brand URLs that are plain strings.
if (base) {
  const re = /(["'(\s,=])\/(media|brand)\//g;
  let n = 0;
  for (const f of walk(out).filter((f) => /\.(html|txt|js|css|json|xml|webmanifest|svg)$/.test(f))) {
    const s = readFileSync(f, "utf8");
    const t = s.replace(re, (_m, pre, dir) => `${pre}${base}/${dir}/`);
    if (t !== s) (writeFileSync(f, t), n++);
  }
  log(`prefixed media/brand URLs in ${n} files`);
}

// 8. A new service-worker version per build, so phones drop old app files.
const sw = path.join(out, "app/sw.js");
if (existsSync(sw)) writeFileSync(sw, readFileSync(sw, "utf8").replace("__BUILD_ID__", Date.now().toString(36)));

writeFileSync(path.join(out, ".nojekyll"), "");
// What the scheduled deploy compares against to decide whether published content changed.
writeFileSync(path.join(out, "content-version.txt"), `${version}\n`);
// Custom domain for GitHub Pages (the CNAME file is what binds the domain to the gh-pages branch).
if (process.env.CNAME) writeFileSync(path.join(out, "CNAME"), `${process.env.CNAME.trim()}\n`);
log(`done → ${path.relative(root, out)}`);
