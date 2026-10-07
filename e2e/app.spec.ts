import { expect, test, type Page } from "@playwright/test";

/** BuildX App staff screens, signed in as a mocked owner with mocked Supabase data. */
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "owner@example.com", role: "authenticated", exp: 4102444800 })}.sig`;
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const RPC: Record<string, unknown> = {
  security_pulse: { level: "attack", last_hour: { rate_limited: 24 }, at: at(0) },
  staff_security_overview: {
    pulse: { level: "attack", last_hour: { rate_limited: 24 }, at: at(0) },
    counts: { rate_limited: 24, honeypot: 2 },
    events: [{ id: 1, at: at(3), kind: "rate_limited", severity: 2, ip: "203.0.113.9", detail: { bucket: "login" } }],
    top_ips: [{ ip: "203.0.113.9", events: 24, worst: 2, kinds: ["rate_limited"], last: at(3) }],
    blocked: [],
    locked_students: [],
  },
  staff_site_stats: {
    from: new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10),
    totals: { views: 120, visitors: 40 },
    daily: [{ day: new Date().toISOString().slice(0, 10), views: 120, visitors: 40 }],
    pages: [{ path: "/ar/", views: 80 }],
    referrers: [{ host: "facebook.com", views: 30 }],
    countries: { EG: 120 },
    devices: { mobile: 100, desktop: 20 },
    locales: { ar: 100, en: 20 },
  },
  staff_client_errors: [{ id: 1, message: "TypeError: boom", source: "/x.js:1:1", path: "/ar/", browser: "Chrome/129 Android", count: 3, first_at: at(100), last_at: at(5) }],
};

async function signInAsOwner(page: Page, calls: { fn: string; body: unknown }[] = []) {
  await page.addInitScript((token) => {
    localStorage.setItem("rh-app-staff", JSON.stringify({ access_token: token, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: { id: "u1", email: "owner@example.com", aud: "authenticated", role: "authenticated" } }));
  }, jwt);
  await page.route(/supabase\.co/, async (route) => {
    const url = new URL(route.request().url());
    const fn = url.pathname.split("/rpc/")[1];
    if (fn) {
      calls.push({ fn, body: route.request().postDataJSON() });
      return route.fulfill({ json: RPC[fn] ?? null });
    }
    if (url.pathname.endsWith("/staff")) {
      const row = { user_id: "u1", email: "owner@example.com", full_name: "Owner Test", role: "owner", active: true, created_at: at(9999) };
      return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row] });
    }
    return route.fulfill({ json: [], headers: { "content-range": "0-0/0" } });
  });
}

test("home warns the owner about an attack and the security screen blocks an address", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page, calls);
  await page.goto("/app/#/staff");
  await expect(page.getByText("هجوم محتمل دلوقتي")).toBeVisible();
  await page.goto("/app/#/staff/security");
  await expect(page.getByText("203.0.113.9").first()).toBeVisible();
  await page.getByRole("button", { name: "احظر" }).first().click();
  await page.locator('[role="dialog"] button', { hasText: "احظر" }).last().click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_block_ip")?.body).toEqual({ p_ip: "203.0.113.9", p_hours: 24, p_reason: "" });
  expect(errors).toEqual([]);
});

test("site visits and errors screens render", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  await page.goto("/app/#/staff/stats");
  await expect(page.getByText("الزيارات كل يوم", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("facebook.com")).toBeVisible();
  await page.goto("/app/#/staff/errors");
  await expect(page.getByText("TypeError: boom")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the website never sends analytics from a non-production host", async ({ page }) => {
  const sent: string[] = [];
  await page.route(/supabase\.co/, (route) => {
    sent.push(route.request().url());
    return route.fulfill({ json: [] });
  });
  await page.goto("/ar/");
  await page.waitForLoadState("networkidle");
  expect(sent.filter((u) => /track_view|log_client_error/.test(u))).toEqual([]);
});
