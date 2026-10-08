import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Security checks on the built static site (out-static): every page carries its Content-Security-
 * Policy, referrer policy and clickjacking guard; nothing secret ships in the bundles; links that
 * open a new tab can't reach back into the page; and a page framed by another site hides itself.
 */
const OUT = "out-static";

function files(dir: string, ext: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) files(full, ext, out);
    else if (name.endsWith(ext)) out.push(full);
  }
  return out;
}

// Next's internal stubs aren't pages (GitHub Pages serves 404.html for anything missing).
const pages = () => files(OUT, ".html").filter((f) => !f.includes(`${path.sep}_next${path.sep}`) && !f.includes("_not-found"));
const unescape = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

test("every page ships its security policy, referrer policy and clickjacking guard", () => {
  const list = pages();
  expect(list.length).toBeGreaterThan(40);
  const problems: string[] = [];
  for (const f of list) {
    const html = readFileSync(f, "utf8");
    if (!/<html/i.test(html)) continue; // redirect stubs
    const csp = unescape(html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "");
    if (!csp) problems.push(`${f}: no CSP`);
    else for (const d of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "default-src 'self'"]) if (!csp.includes(d)) problems.push(`${f}: CSP lacks ${d}`);
    if (!html.includes('name="referrer" content="strict-origin-when-cross-origin"')) problems.push(`${f}: no referrer policy`);
    if (!html.includes("window.top!==window.self")) problems.push(`${f}: no clickjacking guard`);
  }
  expect(problems).toEqual([]);
});

test("no secrets in what the site ships", () => {
  const shipped = [...files(OUT, ".js"), ...files(OUT, ".html"), ...files(OUT, ".txt"), ...files(OUT, ".json")];
  const leaks: string[] = [];
  const patterns = [/sk-ant-[A-Za-z0-9_-]{10,}/, /service_role/, /SUPABASE_SERVICE_ROLE_KEY/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bsb_secret_[A-Za-z0-9_-]{10,}/, /ANTHROPIC_API_KEY\s*[=:]\s*["']?sk-/];
  for (const f of shipped) {
    const text = readFileSync(f, "utf8");
    for (const p of patterns) if (p.test(text)) leaks.push(`${f}: ${p}`);
  }
  expect(leaks).toEqual([]);
});

test("links that open a new tab can't control the page (rel=noopener)", () => {
  const bad: string[] = [];
  for (const f of pages()) {
    const html = readFileSync(f, "utf8");
    for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) if (!/rel="[^"]*noopener/.test(m[0]) && !/rel="[^"]*noreferrer/.test(m[0])) bad.push(`${f}: ${m[0].slice(0, 120)}`);
  }
  expect(bad).toEqual([]);
});

test("the security contact is published", () => {
  const txt = readFileSync(path.join(OUT, ".well-known/security.txt"), "utf8");
  expect(txt).toMatch(/^Contact: /m);
  expect(new Date(txt.match(/^Expires: (.+)$/m)![1]).getTime()).toBeGreaterThan(Date.now());
});

test("framed by another site, the page hides itself (clickjacking)", async ({ page }) => {
  await page.route(/supabase\.co/, (r) => r.abort());
  // A page on another origin (about:blank here) frames the site.
  await page.setContent(`<iframe id="f" src="http://localhost:4173/ar/" style="width:800px;height:600px" sandbox="allow-scripts allow-same-origin"></iframe>`);
  const frame = page.frameLocator("#f");
  await expect(frame.locator("html")).toHaveCSS("display", "none", { timeout: 10_000 });
});

test("the site itself opens normally (not framed)", async ({ page }) => {
  await page.route(/supabase\.co/, (r) => r.abort());
  await page.goto("/ar/");
  await expect(page.locator("html")).not.toHaveCSS("display", "none");
  await expect(page.locator("main")).toBeVisible();
});

test("public forms tell the server how long they took (bot timer)", async ({ page }) => {
  let body: Record<string, unknown> | null = null;
  await page.route(/supabase\.co\//, async (route) => {
    const url = route.request().url();
    if (url.includes("/rpc/submit_message")) {
      body = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/ar/contact/");
  const form = page.locator("form").filter({ has: page.getByLabel("رسالتك") });
  await form.getByLabel("الاسم").fill("اختبار");
  await form.getByLabel("البريد الإلكتروني").fill("t@example.com");
  await form.getByLabel("رسالتك").fill("رسالة اختبار للتأكد من المؤقت");
  await page.waitForTimeout(600);
  await form.getByRole("button", { name: "ابعت" }).click();
  await expect(page.getByText("وصلتنا رسالتك")).toBeVisible();
  const p = (body as { p?: { elapsed?: number; website?: string } } | null)?.p;
  expect(p?.elapsed).toBeGreaterThan(500);
  expect(p?.website).toBe("");
});

test("registering again with someone's phone doesn't hand over their ticket", async ({ page }) => {
  await page.route(/supabase\.co\//, (route) => route.fulfill({ json: [] }));
  const event = { id: "e1", kind: "event", slug: "kickoff", title: "Kickoff meeting", title_ar: "اجتماع البداية", summary: null, summary_ar: null, body: null, body_ar: null, result: null, result_ar: null, image_path: null, url: null, starts_at: "2030-01-10T15:00:00Z", ends_at: null, location: "Hall B", location_ar: "قاعة ب", track: null, tags: [], pinned: false, published: true, sort_order: 0, created_at: "2026-10-01T00:00:00Z", rsvp_open: true, capacity: 40 };
  await page.route("**/rest/v1/site_content**", (route) => route.fulfill({ json: route.request().headers().accept?.includes("vnd.pgrst.object") ? event : [event] }));
  await page.route("**/rest/v1/rpc/event_rsvp", (route) => route.fulfill({ json: { open: true, capacity: 40, going: 10 } }));
  // The server answers a repeat the way it does now: no ticket, no status.
  await page.route("**/rest/v1/rpc/register_event", (route) => route.fulfill({ json: { ok: true, duplicate: true } }));
  await page.goto("/ar/events/item/?s=kickoff");
  await page.getByLabel("الاسم بالكامل").fill("Someone Else");
  await page.getByLabel("الموبايل (واتساب)").fill("01012345678");
  await page.getByRole("button", { name: "سجّل", exact: true }).click();
  await expect(page.getByText("تذكرتك على الجهاز اللي سجّلت منه")).toBeVisible();
  await expect(page.getByRole("link", { name: "افتح تذكرتي" })).toHaveCount(0);
});
