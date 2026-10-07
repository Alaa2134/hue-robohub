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

test("staff issue certificates to typed names and get a printable A4 page with a QR", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const inserted: unknown[] = [];
  const cert = { id: "c1", code: "BXC-1A2B3C4D", name: "Mona Adel", kind: "completion", title: "Robotics Bootcamp 2026", title_ar: null, details: null, details_ar: null, hours: 24, issued_on: "2026-10-07", student_id: null, revoked_at: null, created_at: at(1) };
  await page.route(/\/rest\/v1\/certificates/, async (route) => {
    if (route.request().method() === "POST") {
      inserted.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: [{ id: "c1" }] });
    }
    return route.fulfill({ json: [cert] });
  });
  await page.goto("/app/#/staff/certificates");
  await page.getByRole("button", { name: "إصدار" }).first().click();
  await page.getByLabel("عنوان الشهادة (English)").fill("Robotics Bootcamp 2026");
  await page.getByLabel("عدد الساعات (اختياري)").fill("24");
  await page.getByRole("button", { name: "أسماء بإيدي" }).click();
  await page.getByLabel("الأسماء — اسم في كل سطر").fill("Mona Adel\n");
  await page.getByRole("button", { name: "إصدار 1 شهادة" }).click();
  await expect(page.getByRole("button", { name: "طباعة / PDF" })).toBeVisible();
  await expect(page.getByRole("img", { name: "QR BXC-1A2B3C4D" })).toBeVisible();
  expect(inserted).toEqual([[expect.objectContaining({ recipient_name: "Mona Adel", title: "Robotics Bootcamp 2026", hours: 24, kind: "completion", student_id: null })]]);
  expect(errors).toEqual([]);
});

test("door check-in by a typed ticket code marks the attendee", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_check_in = { ok: true, name: "Mona Adel", status: "going", ticket: "BXT-1A2B3C4D" };
  await signInAsOwner(page, calls);
  await page.route(/\/rest\/v1\/site_content/, (route) => route.fulfill({ json: { id: "e1", title: "Kickoff", title_ar: "اجتماع البداية", starts_at: at(-60), capacity: 40, rsvp_open: true, published: true } }));
  await page.route(/\/rest\/v1\/event_registrations/, (route) =>
    route.fulfill({ json: [{ id: "r1", ticket: "BXT-1A2B3C4D", full_name: "Mona Adel", phone: "+201012345678", email: null, faculty: "Engineering", status: "going", checked_in_at: null, created_at: at(100) }] }),
  );
  await page.goto("/app/#/staff/events/e1");
  await expect(page.getByText("Mona Adel")).toBeVisible();
  await page.getByPlaceholder("أو اكتب كود التذكرة BXT-…").fill("bxt-1a2b3c4d");
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Mona Adel ✓" })).toBeVisible();
  expect(calls.find((c) => c.fn === "staff_check_in")?.body).toEqual({ p_event: "e1", p_ticket: "BXT-1A2B3C4D" });
});

test("leaderboard ranks students and staff can give bonus points", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_leaderboard = [
    { id: "s1", name: "Mona Adel", group: "G1", points: 75, attended: 1, quizzes: 1, perfect: 1, certs: 1, events: 1, bonus: 0, badges: ["first_step", "full_marks", "certified"] },
    { id: "s2", name: "Omar Ali", group: "G1", points: 66, attended: 1, quizzes: 1, perfect: 0, certs: 0, events: 0, bonus: 50, badges: ["first_step", "team_star"] },
  ];
  await signInAsOwner(page, calls);
  const bonus: unknown[] = [];
  await page.route(/\/rest\/v1\/student_bonus/, async (route) => {
    bonus.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: [] });
  });
  await page.goto("/app/#/staff/leaderboard");
  await expect(page.getByText("Mona Adel")).toBeVisible();
  await expect(page.getByText("تقدير +50")).toBeVisible();
  await page.getByText("Omar Ali").click();
  await page.getByRole("button", { name: "+20" }).click();
  await page.getByLabel("السبب").fill("Ran a workshop");
  await page.getByRole("button", { name: "إضافة 20 نقطة" }).click();
  await expect.poll(() => bonus).toEqual([{ student_id: "s2", points: 20, reason: "Ran a workshop" }]);
});

test("the owner can take a backup and download it as JSON", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_backups = [{ slot: 3, taken_at: at(60), counts: { students: 42, applications: 7 }, bytes: 20480 }];
  RPC.staff_backup_download = { version: 1, students: [] };
  RPC.staff_backup_now = { students: 42 };
  await signInAsOwner(page, calls);
  await page.goto("/app/#/staff/backups");
  await expect(page.getByText("42 طالب · 7 طلب · 20 KB")).toBeVisible();
  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: "تنزيل" }).click();
  expect((await file).suggestedFilename()).toMatch(/^buildx-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await page.getByRole("button", { name: "نسخة دلوقتي" }).click();
  await expect.poll(() => calls.some((c) => c.fn === "staff_backup_now")).toBe(true);
});

test("a student sees their points, badges, group ranking and certificates", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("rh-app-student", JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" })));
  const rpcs: Record<string, unknown> = {
    student_home: { now: new Date().toISOString(), student: { name: "Mona Adel", code: "S1", group: "G1" }, materials: [], quizzes: [], attendance: [{ title: "Session 1", at: at(2000), status: "present" }] },
    student_points: {
      points: 75, rank: 1, of: 2, group: "G1",
      breakdown: { attended: 1, quizzes: 1, perfect: 1, certs: 1, events: 1, bonus: 0 },
      badges: ["first_step", "full_marks", "certified"],
      top: [{ name: "Mona A.", points: 75, me: true }, { name: "Omar A.", points: 66, me: false }],
    },
    student_certificates: [{ id: "c1", code: "BXC-1A2B3C4D", name: "Mona Adel", kind: "completion", title: "Robotics Bootcamp 2026", title_ar: "بوتكامب الروبوتات", details: null, details_ar: null, hours: 24, issued_on: "2026-10-07" }],
  };
  await page.route(/supabase\.co/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    return route.fulfill({ json: fn ? (rpcs[fn] ?? null) : [] });
  });
  await page.goto("/app/#/me");
  await expect(page.getByText("ترتيبك 1 من 2 في مجموعتك · 3 وسام")).toBeVisible();
  await expect(page.getByText("بوتكامب الروبوتات")).toBeVisible();
  await page.getByText("ترتيبك 1 من 2").click();
  await expect(page.getByText("الأوسمة (3 من 9)")).toBeVisible();
  await expect(page.getByText("Mona A. (انت)")).toBeVisible();
  expect(errors).toEqual([]);
});
