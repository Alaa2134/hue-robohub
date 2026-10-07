#!/usr/bin/env node
/**
 * Health and security check for buildxhue.com, run hourly by .github/workflows/monitor.yml.
 * Writes monitor-report.json: { ok, level, problems: [{ key, severity, text }], checks: [...] }.
 *
 *   SITE=https://buildxhue.com node scripts/monitor.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SITE = (process.env.SITE ?? "https://buildxhue.com").replace(/\/+$/, "");
const src = readFileSync(path.resolve(import.meta.dirname, "../src/lib/supabase-public.ts"), "utf8");
const SUPABASE = src.match(/"(https:\/\/[a-z0-9]+\.supabase\.co)"/)[1];
const KEY = src.match(/"(sb_publishable_[A-Za-z0-9_-]+)"/)[1];

const problems = [];
const checks = [];
const problem = (key, severity, text) => problems.push({ key, severity, text });
const note = (name, ok, detail = "") => checks.push({ name, ok, detail });

async function get(url, init = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), ...init });
    return { res, ms: Date.now() - started, body: await res.text() };
  } catch (e) {
    return { res: null, ms: Date.now() - started, body: "", error: e.cause?.code ?? e.message };
  }
}

// 1. Key pages answer, fast, with the security policy and a title in place.
for (const page of ["/", "/ar/", "/join/", "/ar/join/", "/team/", "/app/"]) {
  const { res, ms, body, error } = await get(`${SITE}${page}`);
  const ok = res?.status === 200;
  note(`GET ${page}`, ok, ok ? `${ms} ms` : (error ?? `HTTP ${res?.status}`));
  if (!ok) problem(`down:${page}`, page === "/" ? 3 : 2, `${page} is not answering (${error ?? `HTTP ${res?.status}`}).`);
  else {
    if (ms > 8000) problem(`slow:${page}`, 1, `${page} took ${(ms / 1000).toFixed(1)} s to answer.`);
    if (page !== "/app/" && !body.includes('http-equiv="Content-Security-Policy"')) problem(`csp:${page}`, 2, `${page} is missing its Content-Security-Policy.`);
    if (page !== "/app/" && !/<title>[^<]*BuildX HUE/.test(body)) problem(`title:${page}`, 2, `${page} has lost its title — the page may be broken or replaced.`);
  }
}

// 2. Search engines: robots.txt and the sitemap.
{
  const robots = await get(`${SITE}/robots.txt`);
  const sitemap = await get(`${SITE}/sitemap.xml`);
  const urls = (sitemap.body.match(/<loc>/g) ?? []).length;
  note("robots.txt + sitemap", robots.res?.status === 200 && urls > 20, `${urls} URLs`);
  if (robots.res?.status !== 200 || !robots.body.includes("Sitemap:")) problem("robots", 1, "robots.txt is missing or has no sitemap line.");
  if (sitemap.res?.status !== 200 || urls < 20) problem("sitemap", 1, `sitemap.xml is missing or nearly empty (${urls} URLs).`);
}

// 3. HTTPS certificate still has room.
try {
  const host = new URL(SITE).hostname;
  const out = execFileSync("sh", ["-c", `echo | openssl s_client -servername ${host} -connect ${host}:443 2>/dev/null | openssl x509 -noout -enddate`], { encoding: "utf8", timeout: 20_000 });
  const end = new Date(out.split("=")[1]);
  const days = Math.floor((end.getTime() - Date.now()) / 86_400_000);
  note("HTTPS certificate", days > 14, `${days} days left`);
  if (days <= 14) problem("tls", days <= 3 ? 3 : 2, `The HTTPS certificate expires in ${days} days.`);
} catch (e) {
  note("HTTPS certificate", false, e.message);
  problem("tls", 2, "Couldn't read the HTTPS certificate.");
}

// 4. Database up, and the attack signals of the last hour.
let level = "ok";
{
  const { res, body, error } = await get(`${SUPABASE}/rest/v1/rpc/security_pulse`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: "{}" });
  if (res?.status !== 200) {
    note("Database", false, error ?? `HTTP ${res?.status}`);
    problem("db", 3, `The database didn't answer (${error ?? `HTTP ${res?.status}`}). Applications, the app and live content are affected.`);
  } else {
    const pulse = JSON.parse(body);
    level = pulse.level;
    const counts = Object.entries(pulse.last_hour ?? {}).map(([k, n]) => `${k}: ${n}`).join(", ") || "nothing";
    note("Security level", pulse.level === "ok", `${pulse.level} (${counts})`);
    if (pulse.level === "attack") problem("attack", 3, `Possible attack in the last hour (${counts}). Open BuildX App → More → Security to block the addresses behind it.`);
    else if (pulse.level === "elevated") problem("elevated", 1, `Suspicious activity in the last hour was blocked (${counts}).`);
  }
}

// 5. The published site is the one the deploy built (nobody pushed other files to gh-pages).
if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
  const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/commits?sha=gh-pages&per_page=5`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } });
  if (r.ok) {
    const commits = await r.json();
    const foreign = commits.filter((c) => c.author?.login !== "github-actions[bot]" && c.commit?.author?.name !== "github-actions[bot]");
    note("gh-pages history", foreign.length === 0, `${commits.length} recent commits checked`);
    if (foreign.length) problem("gh-pages", 3, `gh-pages has commits not made by the deploy workflow: ${foreign.map((c) => `${c.sha.slice(0, 7)} by ${c.commit?.author?.name}`).join(", ")}. Check that nobody tampered with the live site.`);
  }
}

const report = { ok: problems.every((p) => p.severity < 2), level, problems, checks, at: new Date().toISOString(), site: SITE };
writeFileSync("monitor-report.json", JSON.stringify(report, null, 2));
for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name} — ${c.detail}`);
for (const p of problems) console.log(`${"!".repeat(p.severity)} ${p.text}`);
