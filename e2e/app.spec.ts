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
  await expect(page.getByRole("checkbox", { name: /محتوى الموقع والفورمات/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /الطلاب والتدريب/ })).not.toBeChecked();
  await page.getByRole("checkbox", { name: /رسائل الموقع/ }).check();
  await page.getByRole("button", { name: "احفظ المنصب والصلاحيات" }).click();
  await expect.poll(() => patches[0]).toEqual({ title: "مسؤول الإعلام والتصميم", permissions: ["content", "inbox"] });
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
  await expect(page.getByRole("checkbox", { name: /الطلاب والتدريب/ })).not.toBeChecked();
  await page.getByLabel("المنصب").fill("هيد الميديا");
  await expect(page.getByRole("checkbox", { name: /إعدادات الموقع/ })).not.toBeChecked();
  await page.getByRole("button", { name: "احفظ المنصب والصلاحيات" }).click();
  await expect.poll(() => patches[0]).toEqual({ title: "هيد الميديا", permissions: ["content", "publish", "portfolios", "notify"] });
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
