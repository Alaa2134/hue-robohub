#!/usr/bin/env node
/**
 * Share images: every page that would share the site's generic picture gets its own 1200×630 card
 * instead (its title in Arabic or English, a line of description, the BuildX mark), so a link sent
 * on WhatsApp, Facebook or LinkedIn says what the page is. Pages with their own photo (an event,
 * a news post, a member) keep it.
 *
 *   node scripts/build-share-images.mjs out-static https://buildxhue.com
 *
 * Needs Playwright's Chromium (the deploy installs it before building); without it, it skips.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.resolve(process.argv[2] ?? "out-static");
const site = (process.argv[3] ?? process.env.SITE_URL ?? "https://buildxhue.com").replace(/\/+$/, "");
const log = (m) => console.log(`[share-images] ${m}`);

const SKIP = /^(app|form|ticket|_next|og|mascot|certificates|\.well-known)(\/|$)/;
function pages(dir, rel = "") {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(full).isDirectory()) {
      if (!SKIP.test(r) && !SKIP.test(r.replace(/^ar\//, ""))) found.push(...pages(full, r));
    } else if (name === "index.html") found.push({ file: full, rel });
  }
  return found;
}

const attr = (html, prop) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, "i")) ?? html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${prop}"`, "i"));
  return m ? m[1] : null;
};
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const font = (f) => `data:font/woff2;base64,${readFileSync(path.join(root, "src/fonts", f)).toString("base64")}`;

function card({ title, description, ar, crumb }) {
  const mark = readFileSync(path.join(root, "public/brand/mark-color.svg"), "utf8");
  return `<!doctype html><html lang="${ar ? "ar" : "en"}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>
@font-face{font-family:Kufi;src:url(${font("kufi-var.woff2")}) format("woff2");font-weight:100 900}
@font-face{font-family:Saira;src:url(${font("saira-var.woff2")}) format("woff2");font-weight:100 900}
@font-face{font-family:Inter;src:url(${font("inter-var.woff2")}) format("woff2");font-weight:100 900}
*{margin:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:#050d24;color:#eef4ff;font-family:${ar ? "Kufi" : "Saira"},Inter,sans-serif;position:relative}
.bg{position:absolute;inset:0;background:radial-gradient(900px 520px at ${ar ? "15%" : "85%"} 0%,rgba(43,109,255,.55),transparent 65%),radial-gradient(700px 420px at ${ar ? "95%" : "5%"} 110%,rgba(60,196,255,.28),transparent 60%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(120,160,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(120,160,255,.08) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(to bottom,black,transparent 85%)}
.wrap{position:absolute;inset:0;padding:64px 72px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;gap:18px}
.top svg{width:64px;height:64px}
.brand{font-family:Saira,sans-serif;font-weight:800;font-size:34px;letter-spacing:.04em}
.brand b{color:#3cc4ff}
.crumb{margin-${ar ? "right" : "left"}:auto;font-family:Inter,sans-serif;font-size:22px;color:#8fa6cf;direction:ltr}
h1{margin-top:auto;font-weight:800;font-size:${title.length > 38 ? 60 : 76}px;line-height:1.18;max-width:1020px;${ar ? "" : "text-transform:uppercase;letter-spacing:.01em;"}display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
p{margin-top:22px;font-family:${ar ? "Kufi" : "Inter"},sans-serif;font-weight:400;font-size:28px;line-height:1.5;color:#b9c8e6;max-width:980px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bar{position:absolute;bottom:0;left:0;right:0;height:10px;background:linear-gradient(90deg,#2b6dff,#3cc4ff)}
</style></head><body><div class="bg"></div><div class="grid"></div><div class="wrap">
<div class="top">${mark}<span class="brand">BUILD<b>X</b> HUE</span><span class="crumb">${esc(crumb)}</span></div>
<h1>${esc(title)}</h1>${description ? `<p>${esc(description)}</p>` : ""}</div><div class="bar"></div></body></html>`;
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  log("Playwright isn't installed: skipped");
  process.exit(0);
}
let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  log(`no Chromium (${String(e.message ?? e).split("\n")[0]}): skipped`);
  process.exit(0);
}

const list = pages(out).map((p) => ({ ...p, html: readFileSync(p.file, "utf8") }));
// The generic picture is the one most pages share.
const counts = new Map();
for (const p of list) {
  const img = attr(p.html, "og:image");
  if (img) counts.set(img, (counts.get(img) ?? 0) + 1);
}
const generic = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
if (!generic) {
  log("no og:image found: skipped");
  await browser.close();
  process.exit(0);
}

mkdirSync(path.join(out, "og"), { recursive: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
let made = 0;
for (const p of list) {
  if (attr(p.html, "og:image") !== generic) continue;
  const ar = /<html[^>]+lang="ar"/.test(p.html);
  const title = decode(attr(p.html, "og:title") ?? "BuildX HUE").replace(/\s+—\s+BuildX HUE$/, "").replace(/^BuildX HUE\s+[—|-]\s+/, "");
  const description = decode(attr(p.html, "og:description") ?? attr(p.html, "description") ?? "").slice(0, 170);
  const crumb = `buildxhue.com/${p.rel}`.replace(/\/$/, "");
  const name = `${(p.rel || "home").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "home"}-${createHash("sha1").update(title + description).digest("hex").slice(0, 6)}.jpg`;
  await page.setContent(card({ title, description, ar, crumb }), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, "og", name), type: "jpeg", quality: 86 });
  const url = `${site}/og/${name}`;
  const html = p.html
    .split(`content="${generic}"`)
    .join(`content="${url}"`)
    .replace(/(<meta[^>]+property="og:image:height"[^>]+content=")675(")/, "$1630$2");
  writeFileSync(p.file, html);
  made++;
}
await browser.close();
log(`${made} share images (of ${list.length} pages; the rest have their own picture)`);
