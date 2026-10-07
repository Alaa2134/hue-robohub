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

test("staff with an authenticator must enter the code before the dashboard opens", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const factor = { id: "f1", friendly_name: "BuildX phone", factor_type: "totp", status: "verified", created_at: at(500), updated_at: at(500) };
  const user = { id: "u1", email: "owner@example.com", aud: "authenticated", role: "authenticated", factors: [factor] };
  const aal1 = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "owner@example.com", role: "authenticated", aal: "aal1", amr: [{ method: "password", timestamp: 1 }], exp: 4102444800 })}.sig`;
  const aal2 = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "owner@example.com", role: "authenticated", aal: "aal2", amr: [{ method: "totp", timestamp: 2 }], exp: 4102444800 })}.sig`;
  await page.addInitScript(
    ([token, u]) => localStorage.setItem("rh-app-staff", JSON.stringify({ access_token: token, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: u })),
    [aal1, user] as const,
  );
  const verified: string[] = [];
  await page.route(/supabase\.co/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/v1/user")) return route.fulfill({ json: user });
    if (url.pathname.endsWith("/factors/f1/challenge")) return route.fulfill({ json: { id: "c1", type: "totp", expires_at: 4102444800 } });
    if (url.pathname.endsWith("/factors/f1/verify")) {
      const body = route.request().postDataJSON() as { code: string };
      verified.push(body.code);
      if (body.code !== "123456") return route.fulfill({ status: 422, json: { code: "mfa_verification_failed", message: "Invalid TOTP code entered" } });
      return route.fulfill({ json: { access_token: aal2, refresh_token: "r2", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user } });
    }
    if (url.pathname.includes("/rpc/")) return route.fulfill({ json: RPC[url.pathname.split("/rpc/")[1]] ?? null });
    if (url.pathname.endsWith("/staff")) {
      const row = { user_id: "u1", email: "owner@example.com", full_name: "Owner Test", role: "owner", active: true, created_at: at(9999) };
      return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row] });
    }
    return route.fulfill({ json: [], headers: { "content-range": "0-0/0" } });
  });
  await page.goto("/app/#/staff");
  await expect(page.getByRole("heading", { name: "كود التحقق" })).toBeVisible();
  const code = page.getByPlaceholder("000000");
  await code.fill("111111");
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page.getByText("الكود غلط").first()).toBeVisible();
  await code.fill("123456");
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page.getByText("هجوم محتمل دلوقتي")).toBeVisible();
  expect(verified).toEqual(["111111", "123456"]);
  expect(errors).toEqual([]);
});

test("the two-factor screen lists the team and walks through adding an authenticator", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_mfa_overview = { require: false, staff: [{ user_id: "u1", name: "Owner Test", role: "owner", factors: 0 }, { user_id: "u2", name: "Lead Two", role: "lead", factors: 1 }] };
  await signInAsOwner(page, calls);
  await page.route(/\/auth\/v1\/user$/, (route) => route.fulfill({ json: { id: "u1", email: "owner@example.com", aud: "authenticated", role: "authenticated", factors: [] } }));
  await page.route(/\/auth\/v1\/factors$/, (route) =>
    route.fulfill({ json: { id: "f9", type: "totp", friendly_name: "BuildX", totp: { qr_code: "data:image/svg+xml;utf-8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>", secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/BuildX%20HUE:owner@example.com?secret=JBSWY3DPEHPK3PXP&issuer=BuildX%20HUE" } } }),
  );
  await page.goto("/app/#/staff/2fa");
  await expect(page.getByText("Lead Two")).toBeVisible();
  await expect(page.getByText("مش مفعّل")).toBeVisible();
  await page.getByRole("button", { name: "فعّل التحقق بخطوتين" }).click();
  await expect(page.getByText("JBSWY3DPEHPK3PXP")).toBeVisible();
  await expect(page.getByRole("img", { name: "QR code للتحقق بخطوتين" })).toBeVisible();
});
