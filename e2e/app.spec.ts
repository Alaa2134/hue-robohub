import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/** BuildX App staff screens, signed in as a mocked owner with mocked Supabase data. */
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "owner@example.com", role: "authenticated", exp: 4102444800 })}.sig`;
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const RPC: Record<string, unknown> = {
  staff_access_requests: [
    { id: "r1", kind: "pin", note: "01001234567", at: at(20), studentId: "s1", staffUserId: null, name: "Mona Adel", code: "2024001", group: "Robotics A", email: null, phone: null },
  ],
  staff_set_pins: [{ id: "s1", code: "2024001", name: "Mona Adel", group: "Robotics A", pin: "482913" }],
  staff_push_keys_status: { web: true, android: true, ios: false, devices: { android: 7, ios: 0 } },
  staff_set_push_keys: { ok: true },
  staff_usage: { db_bytes: 420 * 1024 * 1024, buckets: [{ bucket: "materials", bytes: 300 * 1024 * 1024, files: 40 }] },
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
  await expect(page.getByRole("button", { name: "طباعة" })).toBeVisible();
  await expect(page.getByRole("img", { name: "QR BXC-1A2B3C4D" })).toBeVisible();
  // The Robotics artwork is picked from the title; the name and date are drawn on it.
  expect(inserted).toEqual([[expect.objectContaining({ recipient_name: "Mona Adel", title: "Robotics Bootcamp 2026", hours: 24, kind: "completion", student_id: null, design: "robotics" })]]);
  await expect(page.locator(".cert-page img[src$='/certificates/robotics.webp']")).toBeVisible();
  await expect(page.locator(".cert-page").getByText("Mona Adel")).toBeVisible();
  await expect(page.locator(".cert-page").getByText("7 October 2026")).toBeVisible();
  // The PDF is made in the page: one A4 landscape page with the certificate as an image.
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "تحميل PDF" }).click()]);
  expect(file.suggestedFilename()).toBe("certificate-BXC-1A2B3C4D.pdf");
  const pdf = (await import("node:fs")).readFileSync(await file.path()).toString("latin1");
  expect(pdf.startsWith("%PDF-1.4")).toBe(true);
  expect(pdf).toContain("/Count 1");
  expect(pdf).toContain("/MediaBox [0 0 841.89 595.28]");
  expect(pdf).toMatch(/\/Width 2480 \/Height 175\d/);
  expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  if (process.env.SAVE_PDF) (await import("node:fs")).copyFileSync(await file.path(), process.env.SAVE_PDF);
  expect(errors).toEqual([]);
});

test("a team role in the title picks its certificate design (Volunteer), and staff can pick another", async ({ page }) => {
  await signInAsOwner(page);
  const inserted: Record<string, unknown>[][] = [];
  await page.route(/\/rest\/v1\/certificates/, async (route) => {
    if (route.request().method() === "POST") {
      inserted.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: [{ id: "c1" }] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/app/#/staff/certificates");
  await page.getByRole("button", { name: "إصدار" }).first().click();
  await page.getByRole("button", { name: "شهادة تقدير" }).click();
  await page.getByLabel("عنوان الشهادة (English)").fill("Volunteer — Robotics Day 2026");
  await expect(page.getByRole("button", { name: "متطوع · تلقائي", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("الفريق والمنظمين والمساهمين")).toBeVisible();
  await page.getByRole("button", { name: "محكّم", exact: true }).click();
  await page.getByRole("button", { name: "أسماء بإيدي" }).click();
  await page.getByLabel("الأسماء — اسم في كل سطر").fill("Mona Adel\n");
  await page.getByRole("button", { name: "إصدار 1 شهادة" }).click();
  await expect.poll(() => inserted[0]?.[0]?.design).toBe("judge");
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
      streak: { current: 3, best: 4 },
      top: [{ name: "Mona A.", points: 75, me: true }, { name: "Omar A.", points: 66, me: false }],
    },
    student_weekly: {
      quiz: { id: "wq1", title: "Sensors sprint", opensAt: at(60 * 24), endsAt: new Date(Date.now() + 864e5 * 3).toISOString(), state: "open" },
      top: [
        { rank: 1, name: "Omar A.", score: 10, max: 10, seconds: 95, me: false },
        { rank: 2, name: "Sara K.", score: 9, max: 10, seconds: 120, me: false },
      ],
      me: null,
      players: 2,
    },
    student_certificates: [{ id: "c1", code: "BXC-1A2B3C4D", name: "Mona Adel", kind: "completion", title: "Robotics Bootcamp 2026", title_ar: "بوتكامب الروبوتات", details: null, details_ar: null, hours: 24, issued_on: "2026-10-07" }],
  };
  await page.route(/supabase\.co/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    return route.fulfill({ json: fn ? (rpcs[fn] ?? null) : [] });
  });
  await page.goto("/app/#/me");
  await expect(page.getByText("ترتيبك 1 من 2 في مجموعتك · 3 وسام · 🔥 3 سيشن ورا بعض")).toBeVisible();
  // This week's contest: the top players and a way in for someone who hasn't played.
  await expect(page.getByText("Sensors sprint")).toBeVisible();
  await expect(page.getByText("Omar A.")).toBeVisible();
  await expect(page.getByRole("link", { name: "ادخل" })).toHaveAttribute("href", "#/me/quiz/wq1");
  await expect(page.getByText("بوتكامب الروبوتات")).toBeVisible();
  await page.getByText("ترتيبك 1 من 2").click();
  await expect(page.getByText("الأوسمة (3 من 10)")).toBeVisible();
  await expect(page.getByText("3 سيشن ورا بعض")).toBeVisible();
  await expect(page.getByText("أطول سلسلة ليك: 4 · فاضلك 1 عشان وسام «نار»")).toBeVisible();
  await expect(page.getByText("Mona A. (انت)")).toBeVisible();
  expect(errors).toEqual([]);
});

test("admins send a push notification to one group", async ({ page }) => {
  RPC.staff_list_students = [{ id: "s1", code: "S1", codeKey: "s1", barcode: null, barcodeKey: null, name: "Mona", group: "Robotics A", phone: null, notes: null, active: true, createdAt: at(10), hasPin: true }];
  await signInAsOwner(page);
  let sent: unknown = null;
  await page.route(/\/functions\/v1\/send-push/, async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, id: "m1", targets: 12, delivered: 11 } });
  });
  await page.goto("/app/#/staff/notify");
  await page.getByRole("button", { name: "مجموعة", exact: true }).click();
  await page.getByRole("button", { name: "Robotics A" }).click();
  await page.getByLabel("العنوان").fill("Quiz is live");
  await page.getByRole("button", { name: "إرسال", exact: true }).click();
  await expect(page.getByText("اتبعت لـ 11 من 12 جهاز")).toBeVisible();
  expect(sent).toEqual({ title: "Quiz is live", body: "", url: "/app/", audience: "group", group: "Robotics A" });
});

test("a portfolio photo from the phone is compressed and uploaded with its thumbnail", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const profile = { id: "p1", user_id: "u1", slug: "owner-test", full_name: "Owner Test", full_name_ar: null, headline: "", headline_ar: null, bio: "", bio_ar: null, group_kind: "founder", track: null, photo_path: null, skills: [], links: {}, external_url: null, published: false, sort_order: 0 };
  const uploads: { path: string; type: string | undefined }[] = [];
  await page.route(/\/storage\/v1\/object\/team\//, async (route) => {
    uploads.push({ path: new URL(route.request().url()).pathname.split("/object/team/")[1], type: route.request().headers()["content-type"] });
    await route.fulfill({ json: { Key: "ok" } });
  });
  await page.route(/\/rest\/v1\/team_profiles/, (route) => {
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    const body = route.request().method() === "PATCH" ? { ...profile, ...(route.request().postDataJSON() as object) } : profile;
    return route.fulfill({ json: single ? body : [body] });
  });
  await page.route(/\/rest\/v1\/team_projects/, (route) => route.fulfill({ json: [] }));
  await page.goto("/app/#/staff/portfolio");
  const input = page.locator('input[type="file"]').first();
  await expect(input).toHaveAttribute("accept", "image/*");
  await input.setInputFiles("public/brand/icon-512.png");
  await expect(page.getByText("اتغيّرت الصورة")).toBeVisible();
  expect(uploads.map((u) => u.path.replace(/[0-9a-f-]{36}/, "ID"))).toEqual(["u1/ID.w.webp", "u1/ID.t.webp"]);
  expect(uploads.every((u) => u.type === "image/webp")).toBe(true);
  expect(errors).toEqual([]);
});

test("a photo the browser can't open gets a clear message and is reported", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page, calls);
  const profile = { id: "p1", user_id: "u1", slug: "owner-test", full_name: "Owner Test", full_name_ar: null, headline: "", headline_ar: null, bio: "", bio_ar: null, group_kind: "founder", track: null, photo_path: null, skills: [], links: {}, external_url: null, published: false, sort_order: 0 };
  await page.route(/\/rest\/v1\/team_profiles/, (route) => route.fulfill({ json: [profile] }));
  await page.route(/\/rest\/v1\/team_projects/, (route) => route.fulfill({ json: [] }));
  await page.goto("/app/#/staff/portfolio");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "IMG_0001.HEIC", mimeType: "image/heic", buffer: Buffer.from("not really an image") });
  await expect(page.getByText("المتصفح مقدرش يفتح الصورة دي").first()).toBeVisible();
  await expect.poll(() => (calls.find((c) => c.fn === "log_client_error")?.body as { p?: { message?: string } })?.p?.message ?? "").toContain("upload team: image_unreadable [image/heic");
});

test("photo upload still works when the site is opened over plain http (no crypto.randomUUID)", async ({ page }) => {
  await page.addInitScript(() => {
    // Insecure contexts don't have randomUUID; localhost tests are secure, so remove it by hand.
    Object.defineProperty(Crypto.prototype, "randomUUID", { value: undefined, configurable: true });
  });
  await signInAsOwner(page);
  const profile = { id: "p1", user_id: "u1", slug: "owner-test", full_name: "Owner Test", full_name_ar: null, headline: "", headline_ar: null, bio: "", bio_ar: null, group_kind: "founder", track: null, photo_path: null, skills: [], links: {}, external_url: null, published: false, sort_order: 0 };
  const uploads: string[] = [];
  await page.route(/\/storage\/v1\/object\/team\//, async (route) => {
    uploads.push(new URL(route.request().url()).pathname.split("/object/team/")[1]);
    await route.fulfill({ json: { Key: "ok" } });
  });
  await page.route(/\/rest\/v1\/team_profiles/, (route) => {
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    const body = route.request().method() === "PATCH" ? { ...profile, ...(route.request().postDataJSON() as object) } : profile;
    return route.fulfill({ json: single ? body : [body] });
  });
  await page.route(/\/rest\/v1\/team_projects/, (route) => route.fulfill({ json: [] }));
  await page.goto("/app/#/staff/portfolio");
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  await page.locator('input[type="file"]').first().setInputFiles("public/brand/icon-512.png");
  await expect(page.getByText("اتغيّرت الصورة")).toBeVisible();
  expect(uploads).toHaveLength(2);
  expect(uploads[0]).toMatch(/^u1\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.w\.webp$/);
});

test("a student asks to delete their account and the owner deletes it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("rh-app-student", JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" })));
  let pending = false;
  let asked: unknown = null;
  await page.route(/supabase\.co/, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "student_home") return route.fulfill({ json: { now: new Date().toISOString(), student: { name: "Mona Adel", code: "S1", group: "G1" }, materials: [], quizzes: [], attendance: [] } });
    if (fn === "student_deletion_status") return route.fulfill({ json: pending ? { pending: true, at: at(0) } : { pending: false } });
    if (fn === "student_request_deletion") {
      asked = route.request().postDataJSON();
      pending = true;
      return route.fulfill({ json: { ok: true, at: at(0) } });
    }
    return route.fulfill({ json: fn ? null : [] });
  });
  await page.goto("/app/#/me/account");
  await page.getByRole("button", { name: "حذف حسابي" }).click();
  await page.getByRole("dialog").locator("textarea").fill("خلصت الكورس");
  await page.getByRole("button", { name: "ابعت طلب الحذف" }).click();
  await page.locator('[role="dialog"] button', { hasText: "ابعت الطلب" }).last().click();
  await expect(page.getByText("طلب حذف حسابك اتبعت")).toBeVisible();
  expect(asked).toEqual({ p_token: "a".repeat(64), p_reason: "خلصت الكورس" });
  expect(errors).toEqual([]);
});

test("the owner carries out a deletion request from the dashboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_resolve_deletion = { ok: true };
  await signInAsOwner(page, calls);
  const request = { id: "d1", kind: "student", student_id: "s1", user_id: null, name: "Mona Adel", identifier: "S1", reason: "خلصت الكورس", status: "pending", created_at: at(60), handled_at: null };
  await page.route(/\/rest\/v1\/deletion_requests/, (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({ status: 200, headers: { "content-range": "0-0/1", "access-control-expose-headers": "content-range" } })
      : route.fulfill({ json: [request] }),
  );
  await page.goto("/app/#/staff");
  await expect(page.getByText("فيه طلب حذف حساب مستني")).toBeVisible();
  await page.goto("/app/#/staff/deletions");
  await expect(page.getByText("خلصت الكورس")).toBeVisible();
  await page.getByRole("button", { name: "احذف الحساب" }).click();
  await page.locator('[role="dialog"] button', { hasText: "احذف نهائيًا" }).last().click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_resolve_deletion")?.body).toEqual({ p_request: "d1", p_approve: true });
  expect(errors).toEqual([]);
});

test("the coach projects a rotating check-in QR for an open session", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_checkin_qr = { ok: true, window: 59712746, code: "0123456789ab", next_in: 12, count: 7 };
  RPC.staff_checkin_stop = null;
  await signInAsOwner(page, calls);
  const session = { id: "11111111-2222-3333-4444-555555555555", title: "Session 6", group_name: "G1", starts_at: at(10), late_after_min: 15, closed_at: null, created_by: "u1", created_at: at(20), self_checkin: false };
  await page.route(/\/rest\/v1\/attendance_sessions/, (route) => route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? session : [session] }));
  await page.route(/\/rest\/v1\/attendance\?/, (route) => route.fulfill({ json: [] }));
  await page.goto(`/app/#/staff/attendance/${session.id}`);
  await page.getByRole("button", { name: /الطلاب يسجّلوا بنفسهم/ }).click();
  await expect(page.getByRole("img", { name: "QR تسجيل الحضور" })).toBeVisible();
  await expect(page.locator("span.font-mono", { hasText: "7" })).toBeVisible();
  await page.getByRole("button", { name: "إيقاف التسجيل الذاتي" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_checkin_stop")?.body).toEqual({ p_session: session.id });
  expect(errors).toEqual([]);
});

test("a student checks in from the projector QR link", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("rh-app-student", JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" })));
  let sent: unknown = null;
  await page.route(/supabase\.co/, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "student_self_checkin") {
      sent = route.request().postDataJSON();
      return route.fulfill({ json: { result: "marked", title: "Session 6", status: "present", at: new Date().toISOString() } });
    }
    if (fn === "student_home") return route.fulfill({ json: { now: new Date().toISOString(), student: { name: "Mona Adel", code: "S1", group: "G1" }, materials: [], quizzes: [], attendance: [] } });
    return route.fulfill({ json: fn ? null : [] });
  });
  await page.goto("/app/#/me");
  await expect(page.getByText("سجّل حضوري")).toBeVisible();
  await page.goto("/app/#/me/checkin?s=11111111-2222-3333-4444-555555555555&w=59712746&c=0123456789ab");
  await expect(page.getByText("اتسجّل حضورك")).toBeVisible();
  await expect(page.getByText("Session 6")).toBeVisible();
  expect(sent).toEqual({ p_token: "a".repeat(64), p_session: "11111111-2222-3333-4444-555555555555", p_window: 59712746, p_code: "0123456789ab" });
  expect(errors).toEqual([]);
});

test("a student hands in a task and sees it on the tasks tab", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("rh-app-student", JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" })));
  const task = { id: "t1", title: "Photo of your circuit", description: "Upload a photo or a link.", dueAt: new Date(Date.now() + 864e5).toISOString(), maxPoints: 10, allowLate: true, submission: null as unknown };
  let sent: unknown = null;
  await page.route(/supabase\.co/, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "student_home") return route.fulfill({ json: { now: new Date().toISOString(), student: { name: "Mona Adel", code: "S1", group: "G1" }, materials: [], quizzes: [], attendance: [] } });
    if (fn === "student_tasks") return route.fulfill({ json: [task] });
    if (fn === "student_submit") {
      sent = route.request().postDataJSON();
      task.submission = { submittedAt: new Date().toISOString(), late: false, body: "Done", link: "https://github.com/mona/circuit", files: [], grade: null, feedback: "", gradedAt: null };
      return route.fulfill({ json: { ok: true, late: false } });
    }
    return route.fulfill({ json: fn ? null : [] });
  });
  await page.goto("/app/#/me");
  await expect(page.getByText("تاسك مطلوب منك")).toBeVisible();
  await page.getByText("تاسك مطلوب منك").click();
  // The tasks tab (Baqloz on home also names the task, so wait until home is gone).
  await expect(page).toHaveURL(/#\/me\/tasks$/);
  await page.getByText("Photo of your circuit").click();
  await page.getByLabel("ردّك (اختياري)").fill("Done");
  await page.getByLabel("لينك (اختياري)").fill("https://github.com/mona/circuit");
  await page.getByRole("button", { name: "سلّم", exact: true }).click();
  await expect(page.getByText("تسليمك")).toBeVisible();
  expect(sent).toEqual({ p_token: "a".repeat(64), p_assignment: "t1", p_body: "Done", p_link: "https://github.com/mona/circuit", p_files: [] });
  expect(errors).toEqual([]);
});

test("a coach grades a submission with feedback", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_list_students = [{ id: "s1", code: "S1", codeKey: "s1", barcode: null, barcodeKey: null, name: "Mona Adel", group: "G1", phone: null, notes: null, active: true, createdAt: at(10), hasPin: true }];
  RPC.staff_grade_submission = { ok: true };
  await signInAsOwner(page, calls);
  const a = { id: "t1", title: "Photo of your circuit", description: "", group_name: "G1", due_at: null, max_points: 10, allow_late: true, published: true, created_at: at(60) };
  const sub = { id: "sub1", assignment_id: "t1", student_id: "s1", body: "Done", link: "https://github.com/mona/circuit", files: [], submitted_at: at(5), late: false, grade: null, feedback: "", graded_at: null };
  await page.route(/\/rest\/v1\/assignments\?/, (route) => route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? a : [{ ...a, assignment_submissions: [{ id: "sub1", grade: null }] }] }));
  await page.route(/\/rest\/v1\/assignment_submissions/, (route) => route.fulfill({ json: [sub] }));
  await page.goto("/app/#/staff/tasks");
  await expect(page.getByText("1 مستني تصحيح")).toBeVisible();
  await page.getByText("Photo of your circuit").click();
  await page.getByText("Mona Adel").click();
  await page.getByLabel("الدرجة (من 10)").fill("8");
  await page.getByLabel("ملاحظاتك للطالب (اختياري)").fill("Nice wiring");
  await page.getByRole("button", { name: "حفظ الدرجة" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_grade_submission")?.body).toEqual({ p_submission: "sub1", p_grade: 8, p_feedback: "Nice wiring" });
  expect(errors).toEqual([]);
});

test("a student sees announcements and the next session, and adds it to the calendar", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("rh-app-student", JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" })));
  const soon = new Date(Date.now() + 2 * 864e5).toISOString();
  const rpcs: Record<string, unknown> = {
    student_home: { now: new Date().toISOString(), student: { name: "Mona Adel", code: "S1", group: "G1" }, materials: [], quizzes: [], attendance: [] },
    student_announcements: [{ id: "n1", title: "Session moved to 5 PM", body: "Same room.", pinned: true, at: at(30) }],
    student_schedule: [{ kind: "session", id: "s9", title: "Session 7: Sensors", startsAt: soon, endsAt: null, location: null }],
  };
  await page.route(/supabase\.co/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    return route.fulfill({ json: fn ? (rpcs[fn] ?? null) : [] });
  });
  await page.goto("/app/#/me");
  await expect(page.getByText("Session moved to 5 PM")).toBeVisible();
  await expect(page.getByText("السيشن الجاية")).toBeVisible();
  await page.getByText("Session 7: Sensors").click();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "أضف للتقويم" }).click()]);
  const ics = (await import("node:fs")).readFileSync(await file.path(), "utf8");
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toContain("SUMMARY:Session 7: Sensors · BuildX HUE");
  expect(ics).toContain("UID:session-s9@buildxhue.com");
  expect(errors).toEqual([]);
});

test("a coach posts an announcement to one group", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  RPC.staff_list_students = [{ id: "s1", code: "S1", codeKey: "s1", barcode: null, barcodeKey: null, name: "Mona", group: "G1", phone: null, notes: null, active: true, createdAt: at(10), hasPin: true }];
  await signInAsOwner(page);
  let inserted: unknown = null;
  let pushed: unknown = null;
  await page.route(/\/rest\/v1\/announcements/, (route) => {
    if (route.request().method() === "POST") {
      inserted = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: [] });
    }
    return route.fulfill({ json: [] });
  });
  await page.route(/\/functions\/v1\/send-push/, (route) => {
    pushed = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true, targets: 0, delivered: 0 } });
  });
  await page.goto("/app/#/staff/announcements");
  await page.getByRole("button", { name: "إعلان" }).first().click();
  await page.getByLabel("العنوان").fill("Session moved to 5 PM");
  await page.getByRole("dialog").getByRole("combobox").selectOption("G1");
  await page.getByRole("button", { name: "نشر" }).click();
  await expect.poll(() => inserted).toEqual(expect.objectContaining({ title: "Session moved to 5 PM", group_name: "G1", pinned: false }));
  await expect.poll(() => pushed).toEqual(expect.objectContaining({ title: "Session moved to 5 PM", audience: "group", group: "G1" }));
  expect(errors).toEqual([]);
});

test("staff make a student's monthly report as a PDF", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_list_students = [{ id: "s1", code: "S1", codeKey: "s1", barcode: null, barcodeKey: null, name: "Mona Adel", group: "G1", phone: null, notes: null, active: true, createdAt: at(10), hasPin: true }];
  RPC.staff_student_report = {
    student: { name: "Mona Adel", code: "S1", group: "G1" },
    from: "2026-10-01",
    to: "2026-10-31",
    attendance: [
      { title: "Session 1", at: "2026-10-02T15:00:00Z", status: "present" },
      { title: "Session 2", at: "2026-10-05T15:00:00Z", status: "late" },
      { title: "Session 3", at: "2026-10-07T15:00:00Z", status: "absent" },
    ],
    quizzes: [{ title: "Sensors quiz", score: 9, max: 10, at: "2026-10-06T10:00:00Z" }],
    tasks: [{ title: "Photo of your circuit", max: 10, due: "2026-10-06T20:00:00Z", submitted: "2026-10-06T18:00:00Z", late: false, grade: 8 }],
    points: { points: 120, rank: 2, of: 14, badges: ["first_step", "full_marks"] },
  };
  await signInAsOwner(page, calls);
  await page.goto("/app/#/staff/students");
  await page.getByText("Mona Adel").click();
  await page.getByRole("button", { name: "تقرير شهري PDF" }).click();
  await page.getByLabel("الشهر").fill("2026-10");
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "اعمل التقرير PDF" }).click()]);
  expect(file.suggestedFilename()).toBe("report-S1-2026-10.pdf");
  const pdf = (await import("node:fs")).readFileSync(await file.path()).toString("latin1");
  expect(pdf).toContain("/Count 1");
  expect(pdf).toContain("/MediaBox [0 0 595.28 841.89]");
  if (process.env.SAVE_PDF) (await import("node:fs")).copyFileSync(await file.path(), process.env.SAVE_PDF);
  expect(calls.find((c) => c.fn === "staff_student_report")?.body).toEqual({ p_student: "s1", p_from: "2026-10-01", p_to: "2026-10-31" });
  expect(errors).toEqual([]);
});

test("a trainer only sees the areas the owner gave them", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  // This account is a trainer with the website content area only.
  await page.route(/\/rest\/v1\/staff/, (route) => {
    const row = { user_id: "u1", email: "media@example.com", full_name: "Media Lead", role: "lead", active: true, created_at: at(9999), title: "مسؤول الإعلام والتصميم", permissions: ["content"] };
    return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row] });
  });
  await page.goto("/app/#/staff");
  await expect(page.getByText("مسؤول الإعلام والتصميم").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /تسجيل حضور جديد/ })).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "التنقل" });
  await expect(nav.getByRole("link", { name: "الطلاب" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "المزيد" })).toBeVisible();
  await page.goto("/app/#/staff/students");
  await expect(page.getByText("القسم ده مش من صلاحياتك")).toBeVisible();
  await page.goto("/app/#/staff/more");
  await expect(page.getByText("محتوى الموقع (فعاليات، أخبار، جاليري…)")).toBeVisible();
  await expect(page.getByText("طلبات الانضمام")).toHaveCount(0);
  await expect(page.getByText("رسائل الموقع وطلبات الرعاية")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the owner sets a member's position and areas", async ({ page }) => {
  await signInAsOwner(page);
  const owner = { user_id: "u1", email: "owner@example.com", full_name: "Owner Test", role: "owner", active: true, created_at: at(9999) };
  const lead = { user_id: "u2", email: "lead@example.com", full_name: "Lead Two", role: "lead", active: true, created_at: at(10), title: null, permissions: null };
  const patches: unknown[] = [];
  await page.route(/\/rest\/v1\/staff/, (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().postDataJSON());
      return route.fulfill({ json: [{ ...lead, ...(route.request().postDataJSON() as object) }] });
    }
    // The team list orders by created_at; the sign-in check asks for the signed-in row only.
    const list = route.request().url().includes("order=created_at");
    return route.fulfill({ json: list ? [owner, lead] : [owner] });
  });
  await page.goto("/app/#/staff/team");
  await page.getByText("Lead Two").click();
  await page.getByLabel("المنصب").fill("مسؤول الإعلام والتصميم");
  // Picking a position suggests its areas: media gets the website content only.
  await expect(page.getByRole("checkbox", { name: /^محتوى الموقع/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^بيانات الطلاب/ })).not.toBeChecked();
  await page.getByRole("checkbox", { name: /^رسائل الموقع/ }).check();
  await page.getByRole("button", { name: "احفظ المنصب والصلاحيات" }).click();
  await expect.poll(() => patches[0]).toEqual({ title: "مسؤول الإعلام والتصميم", permissions: ["site", "inbox"] });
});

test("the head of media publishes, edits the team's pages and sends notifications, and nothing else", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  await page.route(/\/rest\/v1\/staff/, (route) => {
    const row = { user_id: "u1", email: "media@example.com", full_name: "Media Head", role: "lead", active: true, created_at: at(9999), title: "هيد الميديا", permissions: ["content", "publish", "portfolios", "notify"] };
    return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row] });
  });
  await page.goto("/app/#/staff/more");
  await expect(page.getByText("محتوى الموقع (فعاليات، أخبار، جاليري…)")).toBeVisible();
  await expect(page.getByText("بورتفوليو الفريق")).toBeVisible();
  await expect(page.getByText("إرسال إشعار للطلاب أو الفريق")).toBeVisible();
  await expect(page.getByText("إعدادات الموقع (التواصل، الواجهة، الإعلان، الأهداف)")).toHaveCount(0);
  await expect(page.getByText("طلبات الانضمام")).toHaveCount(0);
  await expect(page.getByText("الأمان والهجمات")).toHaveCount(0);
  // Publishes directly (no "draft" note).
  await page.goto("/app/#/staff/site");
  await expect(page.getByText("انت تقدر تنشر على الموقع")).toBeVisible();
  await page.goto("/app/#/staff/settings");
  await expect(page.getByText("القسم ده مش من صلاحياتك")).toBeVisible();
  await page.goto("/app/#/staff/students");
  await expect(page.getByText("القسم ده مش من صلاحياتك")).toBeVisible();
  expect(errors).toEqual([]);
});

test("positions for the website admin and the head of media suggest their areas", async ({ page }) => {
  await signInAsOwner(page);
  const owner = { user_id: "u1", email: "owner@example.com", full_name: "Owner Test", role: "owner", active: true, created_at: at(9999) };
  const lead = { user_id: "u2", email: "lead@example.com", full_name: "Lead Two", role: "lead", active: true, created_at: at(10), title: null, permissions: null };
  const patches: unknown[] = [];
  await page.route(/\/rest\/v1\/staff/, (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().postDataJSON());
      return route.fulfill({ json: [{ ...lead, ...(route.request().postDataJSON() as object) }] });
    }
    const list = route.request().url().includes("order=created_at");
    return route.fulfill({ json: list ? [owner, lead] : [owner] });
  });
  await page.goto("/app/#/staff/team");
  await page.getByText("Lead Two").click();
  await page.getByLabel("المنصب").fill("إداري الموقع");
  await expect(page.getByRole("checkbox", { name: /إعدادات الموقع/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /النشر على الموقع/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^بيانات الطلاب/ })).not.toBeChecked();
  await page.getByLabel("المنصب").fill("هيد الميديا");
  await expect(page.getByRole("checkbox", { name: /إعدادات الموقع/ })).not.toBeChecked();
  await page.getByRole("button", { name: "احفظ المنصب والصلاحيات" }).click();
  await expect.poll(() => patches[0]).toEqual({ title: "هيد الميديا", permissions: ["site", "publish", "portfolios", "notify"] });
});

test("the owner limits an admin to chosen areas too (all ticked keeps them a full admin)", async ({ page }) => {
  await signInAsOwner(page);
  const owner = { user_id: "u1", email: "owner@example.com", full_name: "Owner Test", role: "owner", active: true, created_at: at(9999) };
  const admin = { user_id: "u3", email: "admin@example.com", full_name: "Admin Three", role: "admin", active: true, created_at: at(10), title: null, permissions: null };
  const patches: unknown[] = [];
  await page.route(/\/rest\/v1\/staff/, (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().postDataJSON());
      return route.fulfill({ json: [{ ...admin, ...(route.request().postDataJSON() as object) }] });
    }
    const list = route.request().url().includes("order=created_at");
    return route.fulfill({ json: list ? [owner, admin] : [owner] });
  });
  await page.goto("/app/#/staff/team");
  await page.getByText("Admin Three").click();
  // A full admin starts with every area ticked, the new security area included.
  await expect(page.getByRole("checkbox", { name: /الأمان والمتابعة/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^بيانات الطلاب/ })).toBeChecked();
  await expect(page.getByRole("button", { name: "احفظ المنصب والصلاحيات" })).toBeDisabled();
  await page.getByLabel("المنصب").fill("مسؤول الروبوتكس");
  await expect(page.getByRole("checkbox", { name: /الأمان والمتابعة/ })).not.toBeChecked();
  await page.getByRole("button", { name: "احفظ المنصب والصلاحيات" }).click();
  await expect.poll(() => patches[0]).toEqual({ title: "مسؤول الروبوتكس", permissions: ["roster", "attendance", "quizzes", "tasks", "materials", "announcements", "points"] });
});

test("an admin the owner limited sees only those areas: no security, activity log, deleting or team management", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const me = { user_id: "u1", email: "coach@example.com", full_name: "Coach Admin", role: "admin", active: true, created_at: at(9999), title: "مسؤول الروبوتكس", permissions: ["students"] };
  const other = { user_id: "u2", email: "lead@example.com", full_name: "Lead Two", role: "lead", active: true, created_at: at(10), title: null, permissions: null };
  await page.route(/\/rest\/v1\/staff/, (route) => {
    const list = route.request().url().includes("order=created_at");
    if (list) return route.fulfill({ json: [me, other] });
    return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? me : [me] });
  });
  await page.goto("/app/#/staff/more");
  await expect(page.getByText("التاسكات (تسليم وتصحيح)")).toBeVisible();
  for (const item of ["الأمان والهجمات", "سجل النشاط", "زيارات الموقع (مين بيزور وبيشوف إيه)", "أخطاء الموقع", "طلبات الانضمام", "رسائل الموقع وطلبات الرعاية"])
    await expect(page.getByText(item, { exact: true })).toHaveCount(0);
  for (const path of ["security", "audit", "stats", "errors"]) {
    await page.goto(`/app/#/staff/${path}`);
    await expect(page.getByText("القسم ده مش من صلاحياتك")).toBeVisible();
  }
  // The team list is read-only for them: no adding members, no opening someone's settings.
  await page.goto("/app/#/staff/team");
  await expect(page.getByText("Lead Two")).toBeVisible();
  await expect(page.getByRole("button", { name: "عضو" })).toHaveCount(0);
  await page.getByText("Lead Two").click();
  await expect(page.getByRole("button", { name: "احفظ المنصب والصلاحيات" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("permissions come in small parts: someone with quizzes only gets the quizzes and nothing else of the training", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const me = { user_id: "u1", email: "quiz@example.com", full_name: "Quiz Coach", role: "lead", active: true, created_at: at(9999), title: null, permissions: ["quizzes"] };
  await page.route(/\/rest\/v1\/staff/, (route) => route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? me : [me] }));
  await page.goto("/app/#/staff");
  const nav = page.getByRole("navigation", { name: "التنقل" });
  await expect(nav.getByRole("link", { name: "الكويزات" })).toBeVisible();
  for (const tab of ["الحضور", "الطلاب", "المحتوى"]) await expect(nav.getByRole("link", { name: tab })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /تسجيل حضور جديد/ })).toHaveCount(0);
  for (const path of ["attendance", "students", "tasks", "content", "announcements", "site", "forms"]) {
    await page.goto(`/app/#/staff/${path}`);
    await expect(page.getByText("القسم ده مش من صلاحياتك")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("the owner ticks a whole group at once, and older lists show as all their parts", async ({ page }) => {
  await signInAsOwner(page);
  const owner = { user_id: "u1", email: "owner@example.com", full_name: "Owner Test", role: "owner", active: true, created_at: at(9999) };
  // Saved before the split: "content" means website content and forms.
  const lead = { user_id: "u2", email: "lead@example.com", full_name: "Lead Two", role: "lead", active: true, created_at: at(10), title: null, permissions: ["content"] };
  const patches: unknown[] = [];
  await page.route(/\/rest\/v1\/staff/, (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().postDataJSON());
      return route.fulfill({ json: [{ ...lead, ...(route.request().postDataJSON() as object) }] });
    }
    const list = route.request().url().includes("order=created_at");
    return route.fulfill({ json: list ? [owner, lead] : [owner] });
  });
  await page.goto("/app/#/staff/team");
  await page.getByText("Lead Two").click();
  await expect(page.getByRole("checkbox", { name: /^محتوى الموقع/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^الفورمات/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^الحضور/ })).not.toBeChecked();
  await page.getByRole("button", { name: "علّم الكل" }).first().click();
  await page.getByRole("checkbox", { name: /^الفورمات/ }).uncheck();
  await page.getByRole("button", { name: "احفظ المنصب والصلاحيات" }).click();
  await expect.poll(() => patches[0]).toEqual({ title: null, permissions: ["roster", "attendance", "quizzes", "tasks", "materials", "announcements", "points", "site"] });
});

test("signed in, students and the team can go back to the website and come back still signed in", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rh-app-student", JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" })));
  await page.route(/supabase\.co/, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "student_home") return route.fulfill({ json: { now: new Date().toISOString(), student: { name: "Mona Adel", code: "S1", group: "G1" }, materials: [], quizzes: [], attendance: [] } });
    if (fn === "student_deletion_status") return route.fulfill({ json: { pending: false } });
    return route.fulfill({ json: fn ? null : [] });
  });
  await page.goto("/app/#/me");
  await expect(page.getByRole("heading", { name: "Mona Adel" })).toBeVisible();
  await page.getByRole("link", { name: "موقع BuildX HUE" }).click();
  await expect(page).toHaveURL(/\/ar\/$/);
  await expect(page.locator("main").first()).toBeVisible();
  // Back to the app: still signed in.
  await page.goto("/app/#/me");
  await expect(page.getByRole("heading", { name: "Mona Adel" })).toBeVisible();
  await page.goto("/app/#/me/account");
  await expect(page.getByRole("link", { name: /تصفّح موقع BuildX HUE/ })).toHaveAttribute("href", "/ar/");
});

test("the team's home and menu link to the website", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/app/#/staff");
  await expect(page.getByRole("link", { name: "موقع BuildX HUE" })).toHaveAttribute("href", "/ar/");
  await page.goto("/app/#/staff/more");
  await expect(page.getByRole("link", { name: /تصفّح موقع BuildX HUE/ })).toBeVisible();
  // How much of the free plan is used: the database is at 84%, so it warns.
  await expect(page.getByRole("meter", { name: "قاعدة البيانات" })).toHaveAttribute("aria-valuenow", "84");
  await expect(page.getByText("قرّبت توصل للحد المجاني")).toBeVisible();
});

test("drafts the team wrote wait at the top of the content screen for whoever publishes", async ({ page }) => {
  await signInAsOwner(page);
  const draft = { id: "d1", kind: "post", slug: "robot-day", title: "Robot day", title_ar: "يوم الروبوت", published: false, pinned: false, created_by: "u9", created_at: at(5), starts_at: null, publish_at: null, image_path: null, tags: [] };
  const mine = { ...draft, id: "d2", title_ar: "مسودتي", created_by: "u1" };
  await page.route(/\/rest\/v1\/site_content/, (route) => route.fulfill({ json: [draft, mine] }));
  await page.goto("/app/#/staff/site");
  await expect(page.getByText("مستنية النشر (1)")).toBeVisible();
  await page.getByText("يوم الروبوت").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("certificates go in one tap to every student who attended enough sessions", async ({ page }) => {
  await signInAsOwner(page);
  const s = (id: string, name: string) => ({ id, code: id, codeKey: id, barcode: null, barcodeKey: null, name, group: "G1", phone: null, notes: null, active: true, createdAt: at(10), hasPin: true });
  RPC.staff_list_students = [s("s1", "Mona"), s("s2", "Omar"), s("s3", "Laila")];
  RPC.staff_attendance_rates = [
    { student_id: "s1", attended: 9, sessions: 10 },
    { student_id: "s2", attended: 5, sessions: 10 },
    { student_id: "s3", attended: 8, sessions: 10 },
  ];
  const inserted: Record<string, unknown>[][] = [];
  await page.route(/\/rest\/v1\/certificates/, async (route) => {
    if (route.request().method() === "POST") {
      inserted.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: [{ id: "c1" }, { id: "c2" }] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/app/#/staff/certificates");
  await page.getByRole("button", { name: "إصدار" }).first().click();
  await page.getByLabel("عنوان الشهادة (English)").fill("Robotics Bootcamp 2026");
  await expect(page.getByText("% أو أكتر: 2")).toBeVisible();
  await page.getByRole("button", { name: "اختارهم" }).click();
  await page.getByRole("button", { name: "إصدار 2 شهادة" }).click();
  await expect.poll(() => inserted[0]?.map((r) => r.recipient_name)).toEqual(["Mona", "Laila"]);
  delete RPC.staff_attendance_rates;
});

test("certificates for everyone who finished the course track, and the student's progress bar", async ({ page }) => {
  await signInAsOwner(page);
  const s = (id: string, name: string) => ({ id, code: id, codeKey: id, barcode: null, barcodeKey: null, name, group: "G1", phone: null, notes: null, active: true, createdAt: at(10), hasPin: true });
  RPC.staff_list_students = [s("s1", "Mona"), s("s2", "Omar")];
  RPC.staff_progress = [
    { student_id: "s1", percent: 55 },
    { student_id: "s2", percent: 92 },
  ];
  const inserted: Record<string, unknown>[][] = [];
  await page.route(/\/rest\/v1\/certificates/, async (route) => {
    if (route.request().method() === "POST") {
      inserted.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: [{ id: "c1" }] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/app/#/staff/certificates");
  await page.getByRole("button", { name: "إصدار" }).first().click();
  await page.getByLabel("عنوان الشهادة (English)").fill("Robotics Bootcamp 2026");
  await expect(page.getByText("اللي خلّصوا 80% من المسار أو أكتر: 1")).toBeVisible();
  await page.getByText("اللي خلّصوا 80% من المسار أو أكتر: 1").locator("..").getByRole("button", { name: "اختارهم" }).click();
  await page.getByRole("button", { name: "إصدار 1 شهادة" }).click();
  await expect.poll(() => inserted[0]?.map((r) => r.recipient_name)).toEqual(["Omar"]);
  delete RPC.staff_progress;
});

test("a student sees the course progress and opening a lecture counts", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rh-app-student", JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" })));
  const seen: unknown[] = [];
  const material = { id: "m1", title: "Lecture 5: sensors", description: "", kind: "link", path: null, url: "https://example.com/l5", fileName: null, mime: null, size: null, pinned: false, at: at(60) };
  const rpcs: Record<string, unknown> = {
    student_home: { now: new Date().toISOString(), student: { name: "Mona Adel", code: "S1", group: "G1" }, materials: [material, { ...material, id: "m2", title: "Lecture 4" }], quizzes: [], attendance: [] },
    student_progress: { percent: 63, materials: { seen: 1, total: 2 }, quizzes: { done: 1, total: 2 }, sessions: { attended: 7, total: 8 }, seenIds: ["m2"] },
  };
  await page.route(/supabase\.co/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "student_material_seen") seen.push(route.request().postDataJSON());
    return route.fulfill({ json: fn ? (rpcs[fn] ?? null) : [] });
  });
  await page.route("https://example.com/**", (route) => route.fulfill({ body: "ok" }));
  await page.goto("/app/#/me");
  await expect(page.getByText("مسار الكورس")).toBeVisible();
  await expect(page.getByText("63%")).toBeVisible();
  await expect(page.getByText("7/8")).toBeVisible();
  await page.goto("/app/#/me/content");
  await expect(page.getByLabel("شفته")).toHaveCount(1);
  const popup = page.waitForEvent("popup");
  await page.getByText("Lecture 5: sensors").click();
  await (await popup).close();
  await expect.poll(() => seen).toEqual([{ p_token: "a".repeat(64), p_material: "m1" }]);
});

test("one sign-in: a student number goes to the student dashboard, an email to the team's", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  let signedIn = false;
  await page.route(/supabase\.co/, async (route) => {
    const url = new URL(route.request().url());
    const fn = url.pathname.split("/rpc/")[1];
    if (fn) {
      calls.push({ fn, body: route.request().postDataJSON() });
      if (fn === "app_status") return route.fulfill({ json: { ready: true } });
      if (fn === "student_login") return route.fulfill({ json: { ok: true, token: "t", student: { name: "طالب تجربة", code: "900100", group: "تجريبي" } } });
      return route.fulfill({ json: null });
    }
    if (url.pathname.endsWith("/auth/v1/token")) {
      signedIn = true;
      return route.fulfill({ json: { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: { id: "u1", email: "owner@example.com", aud: "authenticated", role: "authenticated" } } });
    }
    if (url.pathname.endsWith("/staff")) {
      const row = { user_id: "u1", email: "owner@example.com", full_name: "Owner Test", role: "owner", active: true, created_at: at(9999) };
      return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row] });
    }
    return route.fulfill({ json: [], headers: { "content-range": "0-0/0" } });
  });

  // No role picker: the app opens on the sign-in form, and old links land on it too.
  await page.goto("/app/#/login/student?c=900100");
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  const id = page.getByLabel("رقم الطالب أو البريد الإلكتروني");
  await expect(id).toHaveValue("900100");
  await expect(page.getByLabel("رمز الدخول (PIN)")).toBeVisible();
  await page.getByLabel("رمز الدخول (PIN)").fill("١٢٣٤٥٦");
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL(/#\/me$/);
  expect(calls.find((c) => c.fn === "student_login")?.body).toEqual({ p_code: "900100", p_pin: "123456" });

  // A team member on the same form: the "@" makes it an email sign-in.
  await page.evaluate(() => {
    localStorage.removeItem("rh-app-student");
    location.hash = "#/";
  });
  await page.reload();
  await expect(page).toHaveURL(/#\/login$/);
  await page.getByLabel("رقم الطالب أو البريد الإلكتروني").fill("owner@example.com");
  await page.getByLabel("كلمة المرور").fill("a-long-password");
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page).toHaveURL(/#\/staff$/);
  expect(signedIn).toBe(true);
  expect(calls.filter((c) => c.fn === "student_login")).toHaveLength(1);
});

test("the owner adds the phone notification keys from the app (write-only)", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page, calls);
  await page.goto("/app/#/staff/notify");
  const card = page.locator("section", { hasText: "إشعارات التطبيق على الموبايل" });
  await expect(card.getByText("Android ✓")).toBeVisible();
  await expect(card.getByText("7 أندرويد · 0 آيفون مسجّلين")).toBeVisible();
  await card.getByRole("button", { name: "تغيير المفاتيح" }).click();
  await card.getByLabel("Apple (iPhone): ملف AuthKey .p8").setInputFiles({ name: "AuthKey_ABCDE12345.p8", mimeType: "application/octet-stream", buffer: Buffer.from("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n") });
  await card.getByLabel("Key ID").fill("abcde12345");
  await card.getByLabel("Team ID").fill("TEAM123456");
  await card.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("اتحفظت ✓")).toBeVisible();
  expect(calls.find((c) => c.fn === "staff_set_push_keys")?.body).toEqual({
    p_fcm: null,
    p_apns_p8: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
    p_apns_key_id: "ABCDE12345",
    p_apns_team_id: "TEAM123456",
  });
});

test("forgot PIN: the student asks from the sign-in screen and a coach sends a new one", async ({ page }) => {
  // The request, signed out.
  const asked: unknown[] = [];
  await page.route(/supabase\.co/, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "request_access_help") asked.push(route.request().postDataJSON());
    return route.fulfill({ json: fn === "request_access_help" ? { ok: true } : fn === "app_status" ? { ready: true } : null });
  });
  await page.goto("/app/#/login");
  await page.getByLabel("رقم الطالب أو البريد الإلكتروني").fill("2024001");
  await page.getByRole("button", { name: "نسيت رمز الدخول أو كلمة المرور؟" }).click();
  await page.getByLabel("رقم موبايلك أو ملاحظة (اختياري)").fill("01001234567");
  await page.getByRole("button", { name: "ابعت الطلب" }).click();
  await expect(page.getByText("وصل طلبك للمدرّبين. هيبعتولك رمز دخول جديد.")).toBeVisible();
  expect(asked).toEqual([{ p_ident: "2024001", p_note: "01001234567" }]);
  await page.unrouteAll();

  // The coach's side.
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page, calls);
  await page.goto("/app/#/staff");
  await page.reload();
  await page.getByText("فيه حد نسي رمز الدخول أو كلمة المرور ومستني.").locator("..").getByRole("button", { name: "افتح" }).click();
  await expect(page).toHaveURL(/#\/staff\/access$/);
  await expect(page.getByText("2024001 · Robotics A")).toBeVisible();
  await page.getByRole("button", { name: "رمز جديد" }).click();
  await expect(page.getByText("482913")).toBeVisible();
  expect(calls.find((c) => c.fn === "staff_set_pins")?.body).toEqual({ p_ids: ["s1"], p_only_missing: false });
  expect(calls.find((c) => c.fn === "staff_access_resolve")?.body).toEqual({ p_id: "r1", p_status: "done" });
});

test("the store app shows four first-run screens once, then the sign-in form", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { CapacitorCustomPlatform: unknown }).CapacitorCustomPlatform = { name: "android", plugins: {} };
  });
  await page.route(/supabase\.co/, (route) => route.fulfill({ json: { ready: true } }));
  await page.goto("/app/");
  await expect(page.getByRole("heading", { name: "أهلاً بيك في BuildX HUE" })).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByRole("heading", { name: "خليك عارف كل جديد" })).toBeVisible();
  // This build has no push set up (no app/push.json), so it never asks.
  await expect(page.getByRole("button", { name: "شغّل الإشعارات" })).toHaveCount(0);
  await page.getByRole("button", { name: "يلا نبدأ" }).click();
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "أهلاً بيك في BuildX HUE" })).toHaveCount(0);
});

test("a student sends a project for the website and sees the open team tryouts", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rh-app-student", JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" })));
  const sent: unknown[] = [];
  const rpcs: Record<string, unknown> = {
    student_home: { now: new Date().toISOString(), student: { name: "Mona Adel", code: "S1", group: "G1" }, materials: [], quizzes: [], attendance: [] },
    student_projects_mine: [{ id: "p0", title: "Line follower", status: "published", note: null, at: at(600), slug: "student-line-follower-ab12" }],
    public_forms: [
      { slug: "robocup-tryouts", title_ar: "اختبارات فريق RoboCup", intro_ar: "انضم لفريق المسابقة", team: "robocup", open: true },
      { slug: "volunteers", title_ar: "متطوعين يوم الروبوت", intro_ar: null, team: null, open: true },
      { slug: "old", title_ar: "فورم قديم", intro_ar: null, team: null, open: false },
    ],
    student_project_submit: { ok: true },
  };
  await page.route(/supabase\.co/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "student_project_submit") sent.push(route.request().postDataJSON());
    return route.fulfill({ json: fn ? (rpcs[fn] ?? null) : [] });
  });
  await page.goto("/app/#/me/account");
  await page.getByText("مشاريعي وفرق المسابقات").click();
  await expect(page.getByText("اتنشر على الموقع ✓")).toBeVisible();
  await expect(page.getByRole("link", { name: "شوفه على الموقع" })).toHaveAttribute("href", "/ar/projects/student-line-follower-ab12/");
  await expect(page.getByRole("link", { name: /اختبارات فريق RoboCup/ })).toHaveAttribute("href", "/ar/form/?f=robocup-tryouts");
  await expect(page.getByText("متطوعين يوم الروبوت")).toBeVisible();
  await expect(page.getByText("فورم قديم")).toHaveCount(0);
  await page.getByLabel("اسم المشروع").fill("Smart plant");
  await page.getByLabel("بيعمل إيه؟").fill("Waters itself");
  await page.getByLabel("لينك (GitHub، فيديو، Drive…) — اختياري").fill("github.com/mona/plant");
  await page.getByRole("button", { name: "ابعت المشروع" }).click();
  await expect(page.getByText("اتبعت ✓ الفريق هيراجعه وينشره على الموقع")).toBeVisible();
  expect(sent).toEqual([{ p_token: "a".repeat(64), p_title: "Smart plant", p_description: "Waters itself", p_url: "github.com/mona/plant", p_photo: null }]);
});

test("content staff publish a student's project on the website or decline it", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_student_projects = [
    { id: "sp1", title: "Smart plant", description: "Waters itself", url: "https://github.com/mona/plant", photo: null, at: at(30), student: "Mona Adel", group: "G1" },
    { id: "sp2", title: "Spam", description: "", url: null, photo: null, at: at(20), student: "Omar", group: "G1" },
  ];
  await signInAsOwner(page, calls);
  const inserted: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/site_content/, async (route) => {
    if (route.request().method() === "POST") {
      inserted.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { id: "sc1" } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/app/#/staff/projects");
  const card = (t: string) => page.locator("div", { has: page.getByText(t, { exact: true }) }).filter({ has: page.getByRole("button") }).last();
  await card("Smart plant").getByRole("button", { name: "انشر على الموقع" }).click();
  await expect(page.getByText("اتنشر على الموقع ✓")).toBeVisible();
  expect(inserted[0]).toMatchObject({ kind: "project", title_ar: "Smart plant", url: "https://github.com/mona/plant", published: true, tags: ["students"] });
  expect(String(inserted[0]?.slug)).toMatch(/^student-smart-plant-[a-z0-9]+$/);
  expect(calls.find((c) => c.fn === "staff_review_project")?.body).toEqual({ p_id: "sp1", p_status: "published", p_note: null, p_site: "sc1" });
  await card("Spam").getByPlaceholder("ملاحظة للطالب لو مش هينتشر (اختياري)").fill("مش مشروع");
  await card("Spam").getByRole("button", { name: "مش هينتشر" }).click();
  await expect.poll(() => calls.filter((c) => c.fn === "staff_review_project").map((c) => c.body)).toContainEqual({ p_id: "sp2", p_status: "declined", p_note: "مش مشروع", p_site: null });
  delete RPC.staff_student_projects;
});

test("coaches see who needs a word, with a WhatsApp nudge ready", async ({ page }) => {
  RPC.staff_at_risk = [
    { id: "s1", name: "Mona Adel", group: "G1", phone: "01001234567", missed: 2, lastSeen: at(60 * 24 * 9), reasons: ["missed_two"] },
    { id: "s2", name: "Omar Ali", group: "G1", phone: null, missed: 0, lastSeen: null, reasons: ["inactive"] },
  ];
  await signInAsOwner(page);
  await page.goto("/app/#/staff");
  await page.getByText("فيه 2 طلاب محتاجين متابعة (غابوا أو اختفوا).").locator("..").getByRole("button", { name: "شوفهم" }).click();
  await expect(page).toHaveURL(/#\/staff\/at-risk$/);
  await expect(page.getByText("غاب آخر سيشنين")).toBeVisible();
  await expect(page.getByText("مختفي من أسبوعين")).toBeVisible();
  const wa = await page.getByRole("link", { name: "واتساب Mona Adel" }).getAttribute("href");
  expect(wa).toMatch(/^https:\/\/wa\.me\/201001234567\?text=/);
  await expect(page.getByRole("link", { name: "واتساب Omar Ali" })).toHaveCount(0);
  delete RPC.staff_at_risk;
});

test("a lecture can be scheduled: hidden until its time, then it publishes itself", async ({ page }) => {
  await signInAsOwner(page);
  const inserted: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/materials/, async (route) => {
    if (route.request().method() === "POST") {
      inserted.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: [{ id: "m9" }] });
    }
    const later = new Date(Date.now() + 864e5).toISOString();
    return route.fulfill({ json: [{ id: "m1", title: "Lecture 6", description: "", kind: "link", storage_path: null, url: "https://x.y", file_name: null, mime: null, size_bytes: null, group_name: "", published: false, publish_at: later, pinned: false, created_by: "u1", created_at: at(5) }] });
  });
  await page.goto("/app/#/staff/content");
  await expect(page.getByText(/^ينزل /)).toBeVisible();
  await page.getByRole("button", { name: "إضافة رابط" }).click();
  await page.getByLabel("العنوان").fill("Lecture 7");
  await page.getByLabel("الرابط").fill("youtube.com/watch?v=1");
  const when = new Date(Date.now() + 2 * 864e5);
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  await page.getByLabel("انشره في (اختياري)").fill(local);
  await page.getByRole("dialog").getByRole("button", { name: "إضافة", exact: true }).click();
  await expect.poll(() => inserted[0]).toMatchObject({ title: "Lecture 7", published: false });
  expect(new Date(String(inserted[0]?.publish_at)).getTime()).toBeGreaterThan(Date.now() + 864e5);
});

test("expo visit responses: accepted list as Excel, WhatsApp acceptance with the expo link, and who registered there", async ({ page }) => {
  await signInAsOwner(page);
  const form = {
    id: "f1", slug: "robotex-2026", title_ar: "زيارة معرض Robotex & NDTX 2026", title_en: null, intro_ar: null, intro_en: null, success_ar: null, success_en: null, team: null,
    open: true, opens_at: null, closes_at: null, max_responses: null, listed: true, archived: false, created_at: at(100),
    accepted_ar: "اتقبلت", accepted_url: "https://expo.ndtcorner.com/visitor",
    fields: [
      { id: "name", type: "name", label_ar: "الاسم بالكامل (بالعربي)", required: true },
      { id: "name_en", type: "text", label_ar: "الاسم بالإنجليزي", required: true },
      { id: "phone", type: "phone", label_ar: "رقم الموبايل (واتساب)", required: true },
    ],
  };
  const resp = (id: string, name: string, status: string, ref: string, done: string | null = null) => ({
    id, form_id: "f1", ref, answers: { name, name_en: "X", phone: "+201012345678" }, name, phone: "+201012345678", email: null, locale: "ar", status, note: null, external_done_at: done, created_at: at(50),
  });
  const rows = [resp("r1", "منى عادل", "accepted", "F-1A2B3C4D"), resp("r2", "علي حسن", "accepted", "F-22222222", at(10)), resp("r3", "سارة", "new", "F-33333333")];
  const patches: unknown[] = [];
  await page.route(/\/rest\/v1\/forms/, (route) => route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form] }));
  await page.route(/\/rest\/v1\/form_responses/, (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().postDataJSON());
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ json: rows });
  });
  await page.goto("/app/#/staff/forms/f1/responses");
  await expect(page.getByText("2 مقبول · 1 سجّلوا في اللينك")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel المقبولين" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^buildx-robotex-2026-accepted-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const bytes = readFileSync((await file.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  expect(bytes.toString("utf8")).toContain("منى عادل");
  expect(bytes.toString("utf8")).not.toContain("سارة");
  await page.getByText("منى عادل").click();
  const wa = page.getByRole("link", { name: "ابعتله رسالة القبول على واتساب" });
  await expect(wa).toHaveAttribute("href", /wa\.me\/201012345678/);
  const text = decodeURIComponent((await wa.getAttribute("href"))!.split("text=")[1]!);
  expect(text).toContain("https://expo.ndtcorner.com/visitor");
  expect(text).toContain("F-1A2B3C4D");
  expect(text).toContain("https://buildxhue.com/ar/robotex/?ref=F-1A2B3C4D#status");
  await page.getByRole("switch", { name: /سجّل في اللينك/ }).click();
  await expect.poll(() => patches.length).toBe(1);
  expect((patches[0] as { external_done_at: string }).external_done_at).toMatch(/^\d{4}-/);
});

/* ─── Sectors and team tasks ─────────────────────────────────────────────── */

/** Answers these RPCs for this test only (registered after signInAsOwner, so it wins). */
async function mockRpc(page: Page, calls: { fn: string; body: unknown }[], answers: Record<string, unknown>) {
  await page.route(/\/rest\/v1\/rpc\/staff_[a-z_]+$/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    calls.push({ fn, body: route.request().postDataJSON() });
    return route.fulfill({ json: answers[fn] ?? RPC[fn] ?? null });
  });
}
const later = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const member = (o: object) => ({ staff_id: "u3", name: "Omar Design", title: null, is_head: false, assigned: 2, on_time: 1, late: 0, missed: 1, open: 1, warnings: 1, ...o });
const assignee = (o: object) => ({ staff_id: "u3", name: "Omar Design", state: "todo", note: null, link: null, submitted_at: null, late: false, feedback: null, reviewed_by_name: null, reviewed_at: null, missed_at: null, excused: false, due_at: null, checked: [], files: [], ...o });
const teamTask = (o: object) => ({ id: "t1", sector_id: "sec1", sector_name: "الميديا", sector_color: "#ff7a45", title: "Event poster", description: "Instagram post for the workshop", link: null, priority: "high", due_at: later(30), warn_on_miss: true, status: "open", created_by_name: "Reem Media", created_at: at(60), checklist: [], repeat: "none", requests: [], comments: [], assignees: [assignee({ state: "submitted", note: "Done", link: "https://canva.com/x", submitted_at: at(5) })], ...o });

test("the owner makes a sector and picks its head and members", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await mockRpc(page, calls, {
    staff_sectors: { oversees: true, sectors: [], staff: [{ user_id: "u1", name: "Owner Test", title: null }, { user_id: "u2", name: "Reem Media", title: "هيد الميديا" }, { user_id: "u3", name: "Omar Design", title: null }] },
    staff_sector_save: "sec1",
    staff_sector_members: { ok: true, members: 2 },
  });
  await page.goto("/app/#/staff/sectors");
  await page.getByRole("button", { name: "سيكتور جديد" }).click();
  await page.getByLabel("اسم السيكتور").fill("الميديا");
  await page.getByRole("checkbox", { name: "عضو: Reem Media" }).check();
  await page.getByRole("checkbox", { name: "هيد: Reem Media" }).check();
  await page.getByRole("checkbox", { name: "عضو: Omar Design" }).check();
  await expect(page.getByText("(2 عضو · 1 هيد)")).toBeVisible();
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_sector_members")?.body).toEqual({ p_sector: "sec1", p_members: [{ staff_id: "u2", is_head: true }, { staff_id: "u3", is_head: false }] });
  expect(calls.find((c) => c.fn === "staff_sector_save")?.body).toEqual({ p_id: null, p_name: "الميديا", p_description: "", p_color: "#2f7bff", p_archived: false });
  expect(errors).toEqual([]);
});

test("a head gives the sector an urgent task, approves a hand-in and gives a warning", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await page.route(/\/rest\/v1\/staff/, (route) => {
    const row = { user_id: "u1", email: "reem@example.com", full_name: "Reem Media", role: "lead", active: true, created_at: at(9999), title: "هيد الميديا", permissions: ["site"] };
    return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row] });
  });
  const sector = { id: "sec1", name: "الميديا", description: "", color: "#ff7a45", archived: false, is_head: true, leads: true, open_tasks: 1, to_review: 1, overdue: 0, warnings: 1, members: [member({ staff_id: "u1", name: "Reem Media", is_head: true, assigned: 0, warnings: 0 }), member({})] };
  await mockRpc(page, calls, {
    staff_my_summary: { open: 0, overdue: 0, due_soon: 0, warnings_unseen: 0, warnings_active: 0, sectors: 1, heads: 1, to_review: 1, oversees: false },
    staff_sectors: { oversees: false, sectors: [sector], staff: [] },
    staff_sector_tasks: [teamTask({})],
    staff_warnings: [],
    staff_task_save: "t1",
    staff_task: { ...teamTask({}), leads: true },
    staff_task_review: { ok: true },
    staff_warning_give: "w1",
  });
  // Home tells the head a hand-in is waiting.
  await page.goto("/app/#/staff");
  await expect(page.getByText("فيه تسليم مستني مراجعتك.")).toBeVisible();
  await page.goto("/app/#/staff/sectors/sec1");
  await expect(page.getByText("Event poster")).toBeVisible();
  await page.getByRole("button", { name: "تاسك", exact: true }).click();
  await page.getByLabel("العنوان").fill("Workshop reel");
  await page.getByLabel("الأولوية").selectOption("urgent");
  await page.getByRole("checkbox", { name: "Omar Design" }).check();
  await page.getByRole("button", { name: "ابعت التاسك" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_task_save")?.body).toMatchObject({ p_id: null, p_sector: "sec1", p_title: "Workshop reel", p_priority: "urgent", p_assignees: ["u3"], p_warn: true });
  // The task page: review Omar's hand-in, then a warning.
  await expect(page).toHaveURL(/#\/staff\/sectors\/sec1\/t1$/);
  await expect(page.getByText("https://canva.com/x")).toBeVisible();
  await page.getByRole("button", { name: "راجِع" }).click();
  await page.getByLabel("ملاحظة (بتوصله)").fill("Nice");
  await page.getByRole("button", { name: "اقبل" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_task_review")?.body).toEqual({ p_task: "t1", p_staff: "u3", p_decision: "approved", p_feedback: "Nice" });
  await page.getByRole("button", { name: "إنذار", exact: true }).click();
  await page.getByRole("button", { name: "ابعت الإنذار" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_warning_give")?.body).toEqual({ p_staff: "u3", p_reason: "مسلّمش تاسك «Event poster» زي المطلوب.", p_sector: "sec1", p_task: "t1" });
  expect(errors).toEqual([]);
});

test("a member sees a late task and a new warning, then hands the task in", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await page.route(/\/rest\/v1\/staff/, (route) => {
    const row = { user_id: "u3", email: "omar@example.com", full_name: "Omar Design", role: "lead", active: true, created_at: at(9999), title: "عضو في الفريق", permissions: [] };
    return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row] });
  });
  await mockRpc(page, calls, {
    staff_my_summary: { open: 1, overdue: 1, due_soon: 0, warnings_unseen: 1, warnings_active: 1, sectors: 1, heads: 0, to_review: 0, oversees: false },
    staff_my_tasks: [teamTask({ id: "t9", title: "Sponsor deck", due_at: at(120), assignees: [assignee({ missed_at: at(110) })] })],
    staff_warnings: [{ id: "w1", staff_id: "u3", name: "Omar Design", sector_id: "sec1", sector_name: "الميديا", task_id: "t9", task_title: "Sponsor deck", kind: "missed", reason: "ما سلّمتش تاسك «Sponsor deck» في ميعاده.", issued_by_name: null, created_at: at(110), seen_at: null, cancelled_at: null, cancelled_by_name: null, cancel_note: null }],
    staff_warnings_seen: { ok: true },
    staff_task_submit: { ok: true, late: true },
  });
  await page.goto("/app/#/staff");
  await expect(page.getByTestId("home-warnings")).toContainText("جالك إنذار جديد.");
  await page.getByRole("button", { name: /عليك تاسك/ }).click();
  await expect(page).toHaveURL(/#\/staff\/mytasks$/);
  await expect(page.getByTestId("my-warnings")).toContainText("ما سلّمتش تاسك «Sponsor deck» في ميعاده.");
  await expect.poll(() => calls.some((c) => c.fn === "staff_warnings_seen")).toBe(true);
  await page.getByRole("button", { name: /^Sponsor deck/ }).click();
  await expect(page.getByText("الميعاد فات، هيتسجّل إنه متأخر.")).toBeVisible();
  await page.getByLabel("عملت إيه").fill("Deck ready");
  await page.getByLabel(/^لينك/).fill("https://drive.google.com/deck");
  await page.getByRole("button", { name: "سلّم", exact: true }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_task_submit")?.body).toEqual({ p_task: "t9", p_note: "Deck ready", p_link: "https://drive.google.com/deck" });
  await expect(page.getByText("اتسلّم (متأخر)")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the owner sees every warning in the team and cancels one", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  const w = (id: string, name: string, o: object = {}) => ({ id, staff_id: name, name, sector_id: "sec1", sector_name: "الميديا", task_id: null, task_title: null, kind: "manual", reason: "اتأخر على الاجتماع", issued_by_name: "Reem Media", created_at: at(60), seen_at: null, cancelled_at: null, cancelled_by_name: null, cancel_note: null, ...o });
  await mockRpc(page, calls, {
    staff_warnings: [w("w1", "Omar Design"), w("w2", "Omar Design", { kind: "missed" }), w("w3", "Omar Design"), w("w4", "Sara Ops", { cancelled_at: at(10), cancelled_by_name: "Owner Test", cancel_note: "ظرف" })],
    staff_warning_cancel: { ok: true },
  });
  await page.goto("/app/#/staff/warnings");
  await expect(page.getByText("الأكتر إنذارات (آخر 90 يوم)")).toBeVisible();
  await expect(page.getByText("Sara Ops")).toHaveCount(0);
  await page.getByRole("button", { name: "إلغاء", exact: true }).first().click();
  await page.getByLabel("ليه؟ (بيوصله)").fill("كان عيان");
  await page.getByRole("button", { name: "إلغاء الإنذار" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_warning_cancel")?.body).toEqual({ p_id: "w1", p_note: "كان عيان" });
});

/* ─── Notifications, founder's dashboard, requests, appeals, meetings ───── */

const summary = (o: object = {}) => ({ open: 0, overdue: 0, due_soon: 0, warnings_unseen: 0, warnings_active: 0, sectors: 1, heads: 0, to_review: 0, requests: 0, appeals: 0, unread: 0, oversees: false, ...o });
async function signInAs(page: Page, row: object) {
  await page.route(/\/rest\/v1\/staff/, (route) => {
    const r = { user_id: "u1", email: "x@example.com", full_name: "Test", role: "lead", active: true, created_at: at(9999), title: null, permissions: [], ...row };
    return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? r : [r] });
  });
}

test("the bell shows unread notifications; opening one marks it read and goes to the task", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  await mockRpc(page, calls, {
    staff_my_summary: summary({ unread: 2 }),
    staff_notifications: { unread: 2, items: [{ id: "n1", title: "تاسك جديد: Sponsor deck", body: "الميديا · آخر ميعاد 12/10 18:00", url: "/app/#/staff/mytasks", created_at: at(3), read: false }, { id: "n2", title: "📅 اجتماع: Weekly", body: "", url: null, created_at: at(90), read: true }] },
    staff_notifications_read: { ok: true },
    staff_my_tasks: [],
    staff_warnings: [],
  });
  await page.goto("/app/#/staff");
  await expect(page.getByTestId("bell-count")).toHaveText("2");
  await page.getByRole("button", { name: /الإشعارات/ }).click();
  await expect(page).toHaveURL(/#\/staff\/notifications$/);
  await page.getByText("تاسك جديد: Sponsor deck").click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_notifications_read")?.body).toEqual({ p_ids: ["n1"] });
  await expect(page).toHaveURL(/#\/staff\/mytasks$/);
  expect(errors).toEqual([]);
});

test("the founder's dashboard: the team at a glance, team rules, and naming the member of the month", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  const rules = { warn_threshold: 3, warn_window_days: 90, remind_hours: 24, grace_minutes: 0, auto_warn: true, meeting_absence_warn: false, weekly_report: true };
  await mockRpc(page, calls, {
    staff_my_summary: summary({ oversees: true, appeals: 1 }),
    staff_overview: {
      team: { members: 7, in_sectors: 5, heads: 2, sectors: 2 },
      tasks: { given: 10, on_time: 7, late: 1, missed: 2, open: 4, overdue: 1, to_review: 2 },
      warnings: { active: 3, appeals: 1, requests: 1 },
      sectors: [{ id: "sec1", name: "الميديا", color: "#ff7a45", members: 3, given: 6, done: 5, on_time: 4, missed: 1, overdue: 1, warnings: 2 }],
      people: [
        { staff_id: "u3", name: "Omar Design", title: null, assigned: 4, on_time: 1, late: 1, missed: 2, warnings: 2 },
        { staff_id: "u4", name: "Sara Ops", title: null, assigned: 4, on_time: 4, late: 0, missed: 0, warnings: 0 },
      ],
      org: { students: 120, applications_new: 4, responses_new: 9 },
      rules,
    },
    staff_team_settings_save: rules,
    staff_month_scores: { month: "2026-10-01", award: null, people: [{ staff_id: "u4", name: "Sara Ops", title: null, on_time: 4, late: 0, approved: 4, missed: 0, present: 2, absent: 0, warnings: 0, score: 22 }] },
    staff_award_month: { ok: true, certificate_id: "c1" },
  });
  await page.goto("/app/#/staff");
  await page.getByRole("button", { name: /لوحة المؤسس/ }).click();
  await expect(page.getByText("70%")).toBeVisible();
  await expect(page.getByText("تظلّمات من إنذارات")).toBeVisible();
  await expect(page.getByText("محتاجين متابعة")).toBeVisible();
  await page.getByRole("button", { name: "قواعد الفريق" }).click();
  await page.getByLabel("فترة سماح بعد الميعاد (دقيقة)").fill("30");
  await page.getByRole("button", { name: "حفظ القواعد" }).click();
  await expect.poll(() => (calls.find((c) => c.fn === "staff_team_settings_save")?.body as { p: { grace_minutes: number } })?.p.grace_minutes).toBe(30);
  await page.getByRole("button", { name: "اختار Sara Ops" }).click();
  await page.getByLabel("كلمة للفريق (اختياري)").fill("أحسن التزام");
  await page.getByRole("button", { name: "أعلن عضو الشهر" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_award_month")?.body).toMatchObject({ p_staff: "u4", p_note: "أحسن التزام", p_certificate: true });
  expect(errors).toEqual([]);
});

test("a member ticks the steps, asks for more time and writes on the task; then appeals a warning", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  const task = teamTask({ id: "t5", title: "Workshop reel", due_at: later(20), checklist: [{ id: "a", text: "Shoot" }, { id: "b", text: "Edit" }], assignees: [assignee({})] });
  await mockRpc(page, calls, {
    staff_my_tasks: [task],
    staff_task: task,
    staff_warnings: [{ id: "w9", staff_id: "u3", name: "Omar Design", sector_id: "sec1", sector_name: "الميديا", task_id: null, task_title: null, kind: "manual", reason: "اتأخر على الاجتماع", issued_by_name: "Reem Media", created_at: at(60), seen_at: at(30), cancelled_at: null, cancelled_by_name: null, cancel_note: null, appeal: null, appeal_at: null, appeal_status: null, appeal_note: null }],
    staff_task_check: { ok: true },
    staff_task_request: "r1",
    staff_task_comment: { ok: true },
    staff_warning_appeal: { ok: true },
  });
  await page.goto("/app/#/staff/mytasks");
  await page.getByRole("button", { name: /^Workshop reel/ }).click();
  await page.getByRole("checkbox", { name: "Shoot" }).check();
  await expect.poll(() => calls.find((c) => c.fn === "staff_task_check")?.body).toEqual({ p_task: "t5", p_item: "a", p_done: true });
  await page.getByLabel("رسالة على التاسك").fill("ممكن أستخدم الكاميرا بتاعة المعمل؟");
  await page.getByRole("button", { name: "ابعت", exact: true }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_task_comment")?.body).toEqual({ p_task: "t5", p_body: "ممكن أستخدم الكاميرا بتاعة المعمل؟" });
  await page.getByRole("button", { name: "اطلب مد الميعاد" }).click();
  await page.getByLabel("السبب").fill("عندي امتحان");
  await page.getByRole("button", { name: "ابعت الطلب" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_task_request")?.body).toMatchObject({ p_task: "t5", p_kind: "extension", p_reason: "عندي امتحان" });
  // Close the task sheet and appeal the warning.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /ليك حق تتظلّم/ }).click();
  await page.getByLabel("ظرفك أو اعتراضك").fill("كنت مبلّغ الهيد قبلها إني هتأخر");
  await page.getByRole("button", { name: "ابعت التظلّم" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_warning_appeal")?.body).toEqual({ p_id: "w9", p_text: "كنت مبلّغ الهيد قبلها إني هتأخر" });
  expect(errors).toEqual([]);
});

test("a head approves an extension with a new date; the owner accepts an appeal", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  const req = { id: "r1", staff_id: "u3", name: "Omar Design", kind: "extension", reason: "عندي امتحان", new_due: later(48), status: "pending", note: null, decided_by_name: null, created_at: at(10) };
  await mockRpc(page, calls, {
    staff_sectors: { oversees: true, sectors: [{ id: "sec1", name: "الميديا", description: "", color: "#ff7a45", archived: false, is_head: false, leads: true, open_tasks: 1, to_review: 0, overdue: 0, warnings: 0, members: [member({})] }], staff: [] },
    staff_task: { ...teamTask({ assignees: [assignee({})], requests: [req] }), leads: true },
    staff_task_request_decide: { ok: true },
    staff_warnings: [{ id: "w9", staff_id: "u3", name: "Omar Design", sector_id: "sec1", sector_name: "الميديا", task_id: null, task_title: null, kind: "manual", reason: "اتأخر على الاجتماع", issued_by_name: "Reem Media", created_at: at(60), seen_at: at(30), cancelled_at: null, cancelled_by_name: null, cancel_note: null, appeal: "كنت مبلّغ الهيد", appeal_at: at(5), appeal_status: "pending", appeal_note: null }],
    staff_warning_appeal_decide: { ok: true },
  });
  await page.goto("/app/#/staff/sectors/sec1/t1");
  await expect(page.getByText("طلبات مستنية ردك")).toBeVisible();
  await page.getByRole("button", { name: "وافق", exact: true }).click();
  await page.getByLabel("ملاحظة (بتوصله، اختياري)").fill("بالتوفيق");
  await page.getByRole("button", { name: "وافق", exact: true }).last().click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_task_request_decide")?.body).toMatchObject({ p_id: "r1", p_approve: true, p_note: "بالتوفيق" });
  await page.goto("/app/#/staff/warnings");
  await page.getByRole("button", { name: /^تظلّمات/ }).click();
  await page.getByRole("button", { name: "اقبل التظلّم" }).click();
  await page.getByLabel("ردك (بيوصله)").fill("مقبول");
  await page.getByRole("button", { name: "اقبل واشيل الإنذار" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_warning_appeal_decide")?.body).toEqual({ p_id: "w9", p_accept: true, p_note: "مقبول" });
  expect(errors).toEqual([]);
});

test("meetings: the head schedules one and opens attendance; a member checks in from the QR link; minutes become a task", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  const meeting = (o: object) => ({ id: "m1", sector_id: "sec1", sector_name: "الميديا", sector_color: "#ff7a45", title: "Weekly sync", agenda: "Plan the week", starts_at: later(1), place: "Lab", link: null, status: "open", code: "482913", minutes: null, leads: true, invited: 3, present: 1, mine: null, attendance: [{ staff_id: "u3", name: "Omar Design", status: null, method: null, note: null }], ...o });
  const answers: Record<string, unknown> = {
    staff_sectors: { oversees: true, sectors: [{ id: "sec1", name: "الميديا", description: "", color: "#ff7a45", archived: false, is_head: true, leads: true, open_tasks: 0, to_review: 0, overdue: 0, warnings: 0, members: [member({})] }], staff: [] },
    staff_sector_tasks: [],
    staff_warnings: [],
    staff_meetings: [],
    staff_meeting_save: "m1",
    staff_meeting: meeting({}),
    staff_meeting_open: { ok: true, code: "482913" },
    staff_meeting_close: { ok: true, absent: 1 },
    staff_task_templates: [],
  };
  await mockRpc(page, calls, answers);
  await page.goto("/app/#/staff/sectors/sec1");
  await page.getByRole("button", { name: /^الاجتماعات/ }).click();
  await page.getByRole("button", { name: "اجتماع جديد" }).click();
  await page.getByLabel("العنوان").fill("Weekly sync");
  await page.getByRole("button", { name: "حدد الاجتماع" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_meeting_save")?.body).toMatchObject({ p_id: null, p_sector: "sec1", p_title: "Weekly sync" });
  await expect(page).toHaveURL(/#\/staff\/meetings\/m1$/);
  await page.getByRole("button", { name: "اعرض كود الحضور" }).click();
  await expect(page.getByTestId("meeting-code")).toHaveText("482913");
  await page.getByRole("button", { name: "رجوع" }).last().click();
  await page.getByRole("button", { name: "اقفل واكتب المحضر" }).click();
  await page.getByLabel(/المحضر والقرارات/).fill("- Design the workshop post\n- Book the room");
  await page.getByRole("button", { name: "اقفل الاجتماع" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_meeting_close")?.body).toEqual({ p_id: "m1", p_minutes: "- Design the workshop post\n- Book the room" });
  // After closing: the minutes, and a line becomes a task in the sector.
  answers.staff_meeting = meeting({ status: "done", code: null, minutes: "- Design the workshop post\n- Book the room" });
  await page.reload();
  await page.getByRole("button", { name: "حوّلها لتاسك" }).first().click();
  await expect(page).toHaveURL(/#\/staff\/sectors\/sec1\?task=/);
  await expect(page.getByLabel("العنوان")).toHaveValue("Design the workshop post");
  expect(errors).toEqual([]);
});

test("a member opening the meeting's QR link is checked in with its code", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  await mockRpc(page, calls, {
    staff_meeting: { id: "m1", sector_id: "sec1", sector_name: "الميديا", sector_color: "#ff7a45", title: "Weekly sync", agenda: "", starts_at: at(5), place: null, link: null, status: "open", code: null, minutes: null, leads: false, invited: 3, present: 1, mine: null, attendance: null },
    staff_meeting_checkin: { ok: true, status: "present" },
  });
  await page.goto("/app/#/staff/meetings/m1?code=482913");
  await expect.poll(() => calls.find((c) => c.fn === "staff_meeting_checkin")?.body).toEqual({ p_id: "m1", p_code: "482913" });
  await expect(page.getByText("اتسجّل حضورك ✓")).toBeVisible();
});

test("a head picks a template, adds steps and makes the task repeat weekly; the board shows the columns", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await mockRpc(page, calls, {
    staff_sectors: { oversees: true, sectors: [{ id: "sec1", name: "الميديا", description: "", color: "#ff7a45", archived: false, is_head: true, leads: true, open_tasks: 1, to_review: 1, overdue: 0, warnings: 0, members: [member({})] }], staff: [] },
    staff_sector_tasks: [teamTask({}), teamTask({ id: "t2", title: "Old poster", status: "closed" })],
    staff_warnings: [],
    staff_task_templates: [{ id: "tp1", sector_id: "sec1", title: "Weekly post", description: "Post for the week", link: null, priority: "high", checklist: [{ id: "x", text: "Design" }], days: 2 }],
    staff_task_save: "t9",
    staff_task_extras: { ok: true },
    staff_task: { ...teamTask({ id: "t9" }), leads: true },
  });
  await page.goto("/app/#/staff/sectors/sec1");
  await page.getByRole("button", { name: "لوحة", exact: true }).click();
  await expect(page.getByTestId("task-board")).toContainText("مستني مراجعة");
  await expect(page.getByTestId("task-board")).toContainText("Old poster");
  await page.getByRole("button", { name: "تاسك", exact: true }).click();
  await page.getByLabel("من قالب جاهز (اختياري)").selectOption("tp1");
  await expect(page.getByLabel("العنوان")).toHaveValue("Weekly post");
  await page.getByLabel("خطوة جديدة").fill("Publish");
  await page.getByRole("button", { name: "ضيف الخطوة" }).click();
  await page.getByLabel("بيتكرر؟").selectOption("weekly");
  await page.getByRole("checkbox", { name: "Omar Design" }).check();
  await page.getByRole("button", { name: "ابعت التاسك" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_task_extras")?.body).toMatchObject({ p_task: "t9", p_repeat: "weekly" });
  const extras = calls.find((c) => c.fn === "staff_task_extras")?.body as { p_checklist: { text: string }[] };
  expect(extras.p_checklist.map((c) => c.text)).toEqual(["Design", "Publish"]);
  expect(calls.find((c) => c.fn === "staff_task_save")?.body).toMatchObject({ p_title: "Weekly post", p_priority: "high" });
  expect(errors).toEqual([]);
});

/* ─── Baqloz in the app ─────────────────────────────────────────────────── */

test("Baqloz on the team home says what's on you, most urgent first, and takes you there", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  const late = teamTask({ id: "t7", title: "Sponsor deck", due_at: at(120), assignees: [assignee({})] });
  await mockRpc(page, calls, {
    staff_my_summary: summary({ open: 1, overdue: 1 }),
    staff_reminders: [
      { kind: "overdue", rank: 1, id: "t7", title: "Sponsor deck", at: at(120), to: "/staff/mytasks?t=t7" },
      { kind: "meeting", rank: 4, id: "m1", title: "Weekly sync", at: later(3), place: "Lab", to: "/staff/meetings/m1" },
    ],
    staff_my_tasks: [late],
    staff_task: late,
    staff_warnings: [],
  });
  await page.goto("/app/#/staff");
  await expect(page.getByTestId("baqloz-line")).toContainText("«Sponsor deck» فات ميعادها");
  await expect(page.getByTestId("baqloz-coach")).toContainText("1 من 2");
  await page.getByRole("button", { name: "اللي بعده" }).click();
  await expect(page.getByTestId("baqloz-line")).toContainText("عندك اجتماع «Weekly sync»");
  await page.getByRole("button", { name: "اللي بعده" }).click();
  // "Take me there" opens that very task.
  await page.getByRole("button", { name: "ودّيني ←" }).click();
  await expect(page).toHaveURL(/#\/staff\/mytasks\?t=t7$/);
  await expect(page.getByRole("dialog")).toContainText("Sponsor deck");
  expect(errors).toEqual([]);
});

test("on other screens Baqloz waits in the corner and pops up about something forgotten", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  await mockRpc(page, calls, {
    staff_reminders: [{ kind: "meeting_open", rank: 1, id: "m1", title: "Weekly sync", at: at(5), to: "/staff/meetings/m1" }],
    staff_notifications: { unread: 0, items: [] },
    staff_meeting: { id: "m1", sector_id: "sec1", sector_name: "الميديا", sector_color: "#ff7a45", title: "Weekly sync", agenda: "", starts_at: at(5), place: null, link: null, status: "open", code: null, minutes: null, leads: false, invited: 3, present: 1, mine: null, attendance: null },
  });
  await page.goto("/app/#/staff/notifications");
  await expect(page.getByTestId("baqloz-buddy")).toBeVisible();
  await expect(page.getByTestId("baqloz-nudge")).toContainText("الاجتماع «Weekly sync» شغال دلوقتي");
  await page.getByTestId("baqloz-nudge").getByRole("button", { name: "ودّيني ←" }).click();
  await expect(page).toHaveURL(/#\/staff\/meetings\/m1$/);
  await expect(page.getByLabel("كود الحضور")).toBeVisible();
});

test("with nothing on you, Baqloz waves and cheers", async ({ page }) => {
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  await mockRpc(page, [], { staff_reminders: [] });
  await page.goto("/app/#/staff");
  await expect(page.getByTestId("baqloz-line")).toContainText("يا Omar");
  await expect(page.getByRole("button", { name: "ودّيني ←" })).toHaveCount(0);
});

test("Baqloz on the student home reminds of a task not handed in and an open quiz", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("rh-app-student", JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" })));
  const rpcs: Record<string, unknown> = {
    student_home: {
      now: new Date().toISOString(),
      student: { name: "Mona Adel", code: "S1", group: "G1" },
      materials: [],
      quizzes: [{ id: "q1", title: "Sensors quiz", description: "", opensAt: at(60), closesAt: later(5), timeLimit: null, maxAttempts: 1, questions: 5, maxScore: 5, used: 0, best: null, inProgress: null, state: "open" }],
      attendance: [],
    },
    student_tasks: [{ id: "a1", title: "Photo of your circuit", description: "", dueAt: at(60), maxPoints: 10, allowLate: true, submission: null }],
    student_schedule: [],
  };
  await page.route(/supabase\.co/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    return route.fulfill({ json: fn ? (rpcs[fn] ?? null) : [] });
  });
  await page.goto("/app/#/me");
  await expect(page.getByTestId("baqloz-line")).toContainText("يا Mona، تاسك «Photo of your circuit» فات ميعاده");
  await page.getByRole("button", { name: "اللي بعده" }).click();
  await expect(page.getByTestId("baqloz-line")).toContainText("كويز «Sensors quiz» مفتوح");
  await page.getByRole("button", { name: "ودّيني ←" }).click();
  await expect(page).toHaveURL(/#\/me\/quiz\/q1$/);
  expect(errors).toEqual([]);
});

const storeItem = (o: object) => ({ id: "i1", name: "Arduino Uno", category: "بوردات", description: "", location: "الدولاب 1", quantity: 5, min_quantity: 2, unit: "قطعة", consumable: false, archived: false, low_notified_at: null, available: 3, out: 2, ...o });
const storeLoan = (o: object) => ({ id: "l1", item_id: "i1", item_name: "Arduino Uno", unit: "قطعة", quantity: 2, staff_id: "u3", student_id: null, student_code: null, borrower_name: "Omar Design", purpose: "Line robot", due_at: later(5), status: "out", lent_by_name: "Owner Test", lent_at: at(60 * 24), returned_at: null, return_note: null, ...o });

test("the store keeper adds an item, lends it to a student, takes a loan back and approves a request", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await mockRpc(page, calls, {
    staff_inventory: {
      keeps: true,
      items: [storeItem({}), storeItem({ id: "i2", name: "مقاومات 220", category: "قطع صغيرة", quantity: 8, min_quantity: 10, unit: "قطعة", consumable: true, available: 8, out: 0, low_notified_at: at(30) })],
      loans: [storeLoan({ due_at: at(120) })],
      requests: [{ id: "r1", item_id: "i1", item_name: "Arduino Uno", staff_id: "u4", name: "Reem Media", quantity: 1, purpose: "Workshop demo", needed_until: later(48), status: "pending", note: null, available: 3, created_at: at(10) }],
      staff: [{ id: "u3", name: "Omar Design", title: null }],
      students: [{ id: "s1", name: "Mona Adel", code: "S1", group: "G1" }],
    },
    staff_inventory_item_save: "i9",
    staff_inventory_lend: "l9",
    staff_inventory_return: { ok: true },
    staff_inventory_request_decide: { ok: true, loan_id: "l10" },
  });
  await page.goto("/app/#/staff/inventory");
  await expect(page.getByText("قرّب يخلص").first()).toBeVisible();

  // A new item.
  await page.getByRole("button", { name: "قطعة", exact: true }).click();
  await page.getByLabel("الاسم").fill("Servo SG90");
  await page.getByLabel("العدد كله").fill("10");
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_inventory_item_save")?.body).toMatchObject({ p_id: null, p: { name: "Servo SG90", quantity: 10, consumable: false } });

  // Lend two to a student.
  await page.getByText("Arduino Uno").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "سلّف" }).click();
  await page.getByRole("button", { name: "طالب" }).click();
  await page.getByLabel("الطالب").selectOption("s1");
  await page.getByLabel("الكمية").fill("2");
  await page.getByRole("button", { name: "سجّل السلفة" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_inventory_lend")?.body).toMatchObject({ p_item: "i1", p_qty: 2, p_student: "s1", p_staff: null });

  // A late loan comes back.
  await page.getByRole("button", { name: /برا المخزن/ }).click();
  await expect(page.getByText(/فات من/)).toBeVisible();
  await page.getByRole("button", { name: "رجعت", exact: true }).click();
  await page.getByRole("button", { name: "رجعت ✓" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_inventory_return")?.body).toEqual({ p_loan: "l1", p_status: "returned", p_note: null });

  // A request is approved.
  await page.getByRole("button", { name: /الطلبات/ }).click();
  await expect(page.getByText("Workshop demo")).toBeVisible();
  await page.getByRole("button", { name: "وافق", exact: true }).click();
  await page.getByRole("button", { name: "وافق وسلّم" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_inventory_request_decide")?.body).toMatchObject({ p_id: "r1", p_approve: true });
  expect(errors).toEqual([]);
});

test("a team member asks to borrow from the store, sees what they have, and Baqloz reminds them to return it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  await mockRpc(page, calls, {
    staff_reminders: [{ kind: "loan_due", rank: 3, id: "l1", title: "Arduino Uno", count: 2, at: later(5), to: "/staff/inventory" }],
    staff_inventory: { keeps: false, items: [storeItem({}), storeItem({ id: "i3", name: "Soldering iron", category: "أدوات", available: 0, quantity: 1, out: 1, min_quantity: 0 })], loans: [storeLoan({})], requests: [], staff: null, students: null },
    staff_inventory_request: "r2",
  });
  await page.goto("/app/#/staff");
  await expect(page.getByTestId("baqloz-line")).toContainText("متنساش ترجّع «Arduino Uno» للمخزن");
  await page.getByRole("button", { name: "ودّيني ←" }).click();
  await expect(page).toHaveURL(/#\/staff\/inventory$/);
  // Keeper-only actions are not there.
  await expect(page.getByRole("button", { name: /الطلبات/ })).toHaveCount(0);
  await page.getByText("Soldering iron").click();
  await expect(page.getByRole("button", { name: "مش متاح دلوقتي" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByText("Arduino Uno").first().click();
  await page.getByRole("button", { name: "اطلب استعارة" }).click();
  await page.getByLabel("محتاجها في إيه؟").fill("Line follower");
  await page.getByRole("button", { name: "ابعت الطلب" }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_inventory_request")?.body).toMatchObject({ p_item: "i1", p_qty: 1, p_purpose: "Line follower" });
  await page.getByRole("button", { name: /حاجاتي/ }).click();
  await expect(page.getByText("Arduino Uno × 2")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a student sees what they borrowed from the store, and Baqloz reminds them when it's late", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("rh-app-student", JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" })));
  const rpcs: Record<string, unknown> = {
    student_home: { now: new Date().toISOString(), student: { name: "Mona Adel", code: "S1", group: "G1" }, materials: [], quizzes: [], attendance: [] },
    student_tasks: [],
    student_schedule: [],
    student_inventory: [{ id: "l5", item: "Ultrasonic sensor", unit: "قطعة", quantity: 1, dueAt: at(60 * 26), status: "out", lentAt: at(60 * 24 * 8), returnedAt: null }],
  };
  await page.route(/supabase\.co/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    return route.fulfill({ json: fn ? (rpcs[fn] ?? null) : [] });
  });
  await page.goto("/app/#/me");
  await expect(page.getByTestId("baqloz-line")).toContainText("«Ultrasonic sensor» اللي استلفتها من المخزن ميعادها فات");
  await expect(page.getByTestId("student-loans")).toContainText("Ultrasonic sensor × 1");
  expect(errors).toEqual([]);
});

test("points and levels: the home card shows my level, the points screen my badges and the team table", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  const lvl = (level: number, name: string, from: number, next: number | null) => ({ level, name, from, next });
  await mockRpc(page, calls, {
    staff_reminders: [],
    staff_xp: {
      staff_id: "u3", name: "Omar Design", xp: 245, month: 60, rank: 2, level: lvl(2, "مسمار شاطر", 100, 250), badges: ["first_task", "streak_5"],
      parts: { tasks: 230, meetings: 15, store: 0, awards: 0, warnings: 0 },
      stats: { on_time: 5, late: 1, approved: 6, missed: 1, present: 1, meeting_late: 0, absent: 0, warnings: 0, awards: 0, returned: 0, streak: 5 },
    },
    staff_xp_board: [
      { staff_id: "u2", name: "Reem Media", title: null, xp: 900, month: 20, level: lvl(5, "موتور شغّال", 700, 1000), badges: ["member_of_month"], me: false },
      { staff_id: "u3", name: "Omar Design", title: null, xp: 245, month: 60, level: lvl(2, "مسمار شاطر", 100, 250), badges: ["first_task", "streak_5"], me: true },
    ],
  });
  await page.goto("/app/#/staff");
  await expect(page.getByTestId("xp-card")).toContainText("مسمار شاطر");
  await expect(page.getByTestId("xp-card")).toContainText("فاضل 5 نقطة على ليفل 3");
  await page.getByTestId("xp-card").click();
  await expect(page).toHaveURL(/#\/staff\/xp$/);
  await expect(page.getByText("🔥 أطول سلسلة تسليم في الميعاد: 5")).toBeVisible();
  await expect(page.getByTestId("badge-streak_5")).toHaveAttribute("data-earned", "true");
  await expect(page.getByTestId("badge-member_of_month")).toHaveAttribute("data-earned", "false");
  // This month Omar leads; all-time Reem does.
  await expect(page.getByTestId("xp-row").first()).toContainText("Omar Design");
  await page.getByRole("button", { name: "من الأول" }).click();
  await expect(page.getByTestId("xp-row").first()).toContainText("Reem Media");
  expect(errors).toEqual([]);
});

test("Ask Baqloz: he answers about my points himself and asks the AI the rest, then takes me to the page it names", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  await mockRpc(page, calls, {
    staff_reminders: [{ kind: "due_soon", rank: 3, id: "t7", title: "Sponsor deck", at: later(5), to: "/staff/mytasks?t=t7" }],
    staff_xp: { staff_id: "u3", name: "Omar Design", xp: 245, month: 60, rank: 2, level: { level: 2, name: "مسمار شاطر", from: 100, next: 250 }, badges: [], parts: null, stats: null },
    staff_inventory: { keeps: false, items: [], loans: [], requests: [], staff: null, students: null },
  });
  const asked: { body: { question: string; history: unknown[] }; auth: string | undefined }[] = [];
  await page.route(/\/functions\/v1\/bakloz-app$/, (route) => {
    asked.push({ body: route.request().postDataJSON(), auth: route.request().headers().authorization });
    return route.fulfill({ json: { text: "حساس الألتراسونيك HC-SR04 مناسب للمسافة، واطلبه من المخزن 📦\n[[/staff/inventory]]" } });
  });
  await page.goto("/app/#/staff");
  await page.getByRole("button", { name: "اسأل بقلظ 💬" }).click();
  const chat = page.getByTestId("baqloz-chat");
  await chat.getByRole("button", { name: "نقطي كام؟" }).click();
  await expect(chat.getByTestId("chat-bot").last()).toContainText("انت ليفل 2 (مسمار شاطر) ومعاك 245 نقطة");
  await chat.getByLabel("سؤالك لبقلظ").fill("ورايا ايه؟");
  await chat.getByRole("button", { name: "ابعت" }).click();
  await expect(chat.getByTestId("chat-bot").last()).toContainText("«Sponsor deck»");
  expect(asked).toEqual([]);
  // Not something he knows: the AI answers, with the person's sign-in.
  await chat.getByLabel("سؤالك لبقلظ").fill("إيه أحسن حساس للمسافة؟");
  await chat.getByRole("button", { name: "ابعت" }).click();
  await expect(chat.getByTestId("chat-bot").last()).toContainText("HC-SR04");
  await expect(chat.getByTestId("chat-bot").last()).not.toContainText("[[");
  expect(asked[0].body.question).toBe("إيه أحسن حساس للمسافة؟");
  expect(asked[0].auth).toMatch(/^Bearer ey/);
  await chat.getByTestId("chat-bot").last().getByRole("button", { name: "ودّيني ←" }).click();
  await expect(page).toHaveURL(/#\/staff\/inventory$/);
  expect(errors).toEqual([]);
});

test("Ask Baqloz in the student app: what's on me, and a friendly answer when the AI is off", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("rh-app-student", JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" })));
  const rpcs: Record<string, unknown> = {
    student_home: { now: new Date().toISOString(), student: { name: "Mona Adel", code: "S1", group: "G1" }, materials: [], quizzes: [], attendance: [] },
    student_tasks: [{ id: "a1", title: "Photo of your circuit", description: "", dueAt: later(20), maxPoints: 10, allowLate: true, submission: null }],
    student_schedule: [],
    student_inventory: [],
  };
  await page.route(/supabase\.co/, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/functions/v1/bakloz-app")) return route.fulfill({ json: { disabled: true } });
    const fn = url.pathname.split("/rpc/")[1];
    return route.fulfill({ json: fn ? (rpcs[fn] ?? null) : [] });
  });
  await page.goto("/app/#/me");
  await page.getByRole("button", { name: "اسأل بقلظ 💬" }).click();
  const chat = page.getByTestId("baqloz-chat");
  await chat.getByRole("button", { name: "ورايا إيه؟" }).click();
  await expect(chat.getByTestId("chat-bot").last()).toContainText("Photo of your circuit");
  await chat.getByLabel("سؤالك لبقلظ").fill("احكيلي نكتة عن الفضاء");
  await chat.getByRole("button", { name: "ابعت" }).click();
  await expect(chat.getByTestId("chat-bot").last()).toContainText("مش متأكد إني فاهمك");
  await expect(chat.getByRole("button", { name: "إزاي أسلّم التاسك؟" })).toBeVisible();
  expect(errors).toEqual([]);
});
