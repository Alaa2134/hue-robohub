import { copyFileSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { voiceLines } from "../src/lib/mascot/voice-lines";

/** BuildX App staff screens, signed in as a mocked owner with mocked Supabase data. */
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "owner@example.com", role: "authenticated", exp: 4102444800 })}.sig`;
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
/** One area's level switch in the owner's permission editor ("لا" / "مشاهدة" / "كامل"). */
const lvl = (page: Page, area: string, level: "لا" | "مشاهدة" | "كامل") =>
  page.getByRole("radiogroup", { name: area, exact: true }).getByRole("radio", { name: level });

const RPC: Record<string, unknown> = {
  staff_access_requests: [
    {
      id: "r1",
      kind: "pin",
      note: "01001234567",
      at: at(20),
      studentId: "s1",
      staffUserId: null,
      name: "Mona Adel",
      code: "2024001",
      group: "Robotics A",
      email: null,
      phone: null,
    },
  ],
  staff_set_pins: [{ id: "s1", code: "2024001", name: "Mona Adel", group: "Robotics A", pin: "482913" }],
  staff_push_keys_status: { web: true, android: true, ios: false, devices: { android: 7, ios: 0 } },
  staff_set_push_keys: { ok: true },
  staff_usage: {
    db_bytes: 420 * 1024 * 1024,
    buckets: [{ bucket: "materials", bytes: 300 * 1024 * 1024, files: 40 }],
  },
  security_pulse: { level: "attack", last_hour: { rate_limited: 24 }, at: at(0) },
  staff_security_overview: {
    pulse: { level: "attack", last_hour: { rate_limited: 24 }, at: at(0) },
    counts: { rate_limited: 24, honeypot: 2 },
    events: [
      { id: 1, at: at(3), kind: "rate_limited", severity: 2, ip: "203.0.113.9", detail: { bucket: "login" } },
    ],
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
  staff_client_errors: [
    {
      id: 1,
      message: "TypeError: boom",
      source: "/x.js:1:1",
      path: "/ar/",
      browser: "Chrome/129 Android",
      count: 3,
      first_at: at(100),
      last_at: at(5),
    },
  ],
};

async function signInAsOwner(page: Page, calls: { fn: string; body: unknown }[] = []) {
  await page.addInitScript((token) => {
    localStorage.setItem(
      "rh-app-staff",
      JSON.stringify({
        access_token: token,
        refresh_token: "r",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: 4102444800,
        user: { id: "u1", email: "owner@example.com", aud: "authenticated", role: "authenticated" },
      }),
    );
  }, jwt);
  await page.route(/supabase\.co/, async (route) => {
    const url = new URL(route.request().url());
    const fn = url.pathname.split("/rpc/")[1];
    if (fn) {
      calls.push({ fn, body: route.request().postDataJSON() });
      return route.fulfill({ json: RPC[fn] ?? null });
    }
    if (url.pathname.endsWith("/staff")) {
      const row = {
        user_id: "u1",
        email: "owner@example.com",
        full_name: "Owner Test",
        role: "owner",
        active: true,
        created_at: at(9999),
      };
      return route.fulfill({
        json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row],
      });
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
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_block_ip")?.body)
    .toEqual({ p_ip: "203.0.113.9", p_hours: 24, p_reason: "" });
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
  const factor = {
    id: "f1",
    friendly_name: "BuildX phone",
    factor_type: "totp",
    status: "verified",
    created_at: at(500),
    updated_at: at(500),
  };
  const user = {
    id: "u1",
    email: "owner@example.com",
    aud: "authenticated",
    role: "authenticated",
    factors: [factor],
  };
  const aal1 = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "owner@example.com", role: "authenticated", aal: "aal1", amr: [{ method: "password", timestamp: 1 }], exp: 4102444800 })}.sig`;
  const aal2 = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "owner@example.com", role: "authenticated", aal: "aal2", amr: [{ method: "totp", timestamp: 2 }], exp: 4102444800 })}.sig`;
  await page.addInitScript(
    ([token, u]) =>
      localStorage.setItem(
        "rh-app-staff",
        JSON.stringify({
          access_token: token,
          refresh_token: "r",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: 4102444800,
          user: u,
        }),
      ),
    [aal1, user] as const,
  );
  const verified: string[] = [];
  await page.route(/supabase\.co/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/v1/user")) return route.fulfill({ json: user });
    if (url.pathname.endsWith("/factors/f1/challenge"))
      return route.fulfill({ json: { id: "c1", type: "totp", expires_at: 4102444800 } });
    if (url.pathname.endsWith("/factors/f1/verify")) {
      const body = route.request().postDataJSON() as { code: string };
      verified.push(body.code);
      if (body.code !== "123456")
        return route.fulfill({
          status: 422,
          json: { code: "mfa_verification_failed", message: "Invalid TOTP code entered" },
        });
      return route.fulfill({
        json: {
          access_token: aal2,
          refresh_token: "r2",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: 4102444800,
          user,
        },
      });
    }
    if (url.pathname.includes("/rpc/"))
      return route.fulfill({ json: RPC[url.pathname.split("/rpc/")[1]] ?? null });
    if (url.pathname.endsWith("/staff")) {
      const row = {
        user_id: "u1",
        email: "owner@example.com",
        full_name: "Owner Test",
        role: "owner",
        active: true,
        created_at: at(9999),
      };
      return route.fulfill({
        json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row],
      });
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
  RPC.staff_mfa_overview = {
    require: false,
    staff: [
      { user_id: "u1", name: "Owner Test", role: "owner", factors: 0 },
      { user_id: "u2", name: "Lead Two", role: "lead", factors: 1 },
    ],
  };
  await signInAsOwner(page, calls);
  await page.route(/\/auth\/v1\/user$/, (route) =>
    route.fulfill({
      json: {
        id: "u1",
        email: "owner@example.com",
        aud: "authenticated",
        role: "authenticated",
        factors: [],
      },
    }),
  );
  await page.route(/\/auth\/v1\/factors$/, (route) =>
    route.fulfill({
      json: {
        id: "f9",
        type: "totp",
        friendly_name: "BuildX",
        totp: {
          qr_code:
            "data:image/svg+xml;utf-8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>",
          secret: "JBSWY3DPEHPK3PXP",
          uri: "otpauth://totp/BuildX%20HUE:owner@example.com?secret=JBSWY3DPEHPK3PXP&issuer=BuildX%20HUE",
        },
      },
    }),
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
  const cert = {
    id: "c1",
    code: "BXC-1A2B3C4D",
    name: "Mona Adel",
    kind: "completion",
    title: "Robotics Bootcamp 2026",
    title_ar: null,
    details: null,
    details_ar: null,
    hours: 24,
    issued_on: "2026-10-07",
    student_id: null,
    revoked_at: null,
    created_at: at(1),
  };
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
  expect(inserted).toEqual([
    [
      expect.objectContaining({
        recipient_name: "Mona Adel",
        title: "Robotics Bootcamp 2026",
        hours: 24,
        kind: "completion",
        student_id: null,
        design: "robotics",
      }),
    ],
  ]);
  await expect(page.locator(".cert-page img[src$='/certificates/robotics.webp']")).toBeVisible();
  await expect(page.locator(".cert-page").getByText("Mona Adel")).toBeVisible();
  await expect(page.locator(".cert-page").getByText("7 October 2026")).toBeVisible();
  // The PDF is made in the page: one A4 landscape page with the certificate as an image.
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "تحميل PDF" }).click(),
  ]);
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

test("a team role in the title picks its certificate design (Volunteer), and staff can pick another", async ({
  page,
}) => {
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
  await expect(page.getByRole("button", { name: "متطوع · تلقائي", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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
  await page.route(/\/rest\/v1\/site_content/, (route) =>
    route.fulfill({
      json: {
        id: "e1",
        title: "Kickoff",
        title_ar: "اجتماع البداية",
        starts_at: at(-60),
        capacity: 40,
        rsvp_open: true,
        published: true,
      },
    }),
  );
  await page.route(/\/rest\/v1\/event_registrations/, (route) =>
    route.fulfill({
      json: [
        {
          id: "r1",
          ticket: "BXT-1A2B3C4D",
          full_name: "Mona Adel",
          phone: "+201012345678",
          email: null,
          faculty: "Engineering",
          status: "going",
          checked_in_at: null,
          created_at: at(100),
        },
      ],
    }),
  );
  await page.goto("/app/#/staff/events/e1");
  await expect(page.getByText("Mona Adel")).toBeVisible();
  await page.getByPlaceholder("أو اكتب كود التذكرة BXT-…").fill("bxt-1a2b3c4d");
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Mona Adel ✓" })).toBeVisible();
  expect(calls.find((c) => c.fn === "staff_check_in")?.body).toEqual({
    p_event: "e1",
    p_ticket: "BXT-1A2B3C4D",
  });
});

test("leaderboard ranks students and staff can give bonus points", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_leaderboard = [
    {
      id: "s1",
      name: "Mona Adel",
      group: "G1",
      points: 75,
      attended: 1,
      quizzes: 1,
      perfect: 1,
      certs: 1,
      events: 1,
      bonus: 0,
      badges: ["first_step", "full_marks", "certified"],
    },
    {
      id: "s2",
      name: "Omar Ali",
      group: "G1",
      points: 66,
      attended: 1,
      quizzes: 1,
      perfect: 0,
      certs: 0,
      events: 0,
      bonus: 50,
      badges: ["first_step", "team_star"],
    },
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
  RPC.staff_backups = [
    { slot: 3, taken_at: at(60), counts: { students: 42, applications: 7 }, bytes: 20480 },
  ];
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
  await page.addInitScript(() =>
    localStorage.setItem(
      "rh-app-student",
      JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" }),
    ),
  );
  const rpcs: Record<string, unknown> = {
    student_home: {
      now: new Date().toISOString(),
      student: { name: "Mona Adel", code: "S1", group: "G1" },
      materials: [],
      quizzes: [],
      attendance: [{ title: "Session 1", at: at(2000), status: "present" }],
    },
    student_points: {
      points: 75,
      rank: 1,
      of: 2,
      group: "G1",
      breakdown: { attended: 1, quizzes: 1, perfect: 1, certs: 1, events: 1, bonus: 0 },
      badges: ["first_step", "full_marks", "certified"],
      streak: { current: 3, best: 4 },
      top: [
        { name: "Mona A.", points: 75, me: true },
        { name: "Omar A.", points: 66, me: false },
      ],
    },
    student_weekly: {
      quiz: {
        id: "wq1",
        title: "Sensors sprint",
        opensAt: at(60 * 24),
        endsAt: new Date(Date.now() + 864e5 * 3).toISOString(),
        state: "open",
      },
      top: [
        { rank: 1, name: "Omar A.", score: 10, max: 10, seconds: 95, me: false },
        { rank: 2, name: "Sara K.", score: 9, max: 10, seconds: 120, me: false },
      ],
      me: null,
      players: 2,
    },
    student_certificates: [
      {
        id: "c1",
        code: "BXC-1A2B3C4D",
        name: "Mona Adel",
        kind: "completion",
        title: "Robotics Bootcamp 2026",
        title_ar: "بوتكامب الروبوتات",
        details: null,
        details_ar: null,
        hours: 24,
        issued_on: "2026-10-07",
      },
    ],
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
  RPC.staff_list_students = [
    {
      id: "s1",
      code: "S1",
      codeKey: "s1",
      barcode: null,
      barcodeKey: null,
      name: "Mona",
      group: "Robotics A",
      phone: null,
      notes: null,
      active: true,
      createdAt: at(10),
      hasPin: true,
    },
  ];
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
  expect(sent).toEqual({
    title: "Quiz is live",
    body: "",
    url: "/app/",
    audience: "group",
    group: "Robotics A",
  });
});

test("a portfolio photo from the phone is compressed and uploaded with its thumbnail", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const profile = {
    id: "p1",
    user_id: "u1",
    slug: "owner-test",
    full_name: "Owner Test",
    full_name_ar: null,
    headline: "",
    headline_ar: null,
    bio: "",
    bio_ar: null,
    group_kind: "founder",
    track: null,
    photo_path: null,
    skills: [],
    links: {},
    external_url: null,
    published: false,
    sort_order: 0,
  };
  const uploads: { path: string; type: string | undefined }[] = [];
  await page.route(/\/storage\/v1\/object\/team\//, async (route) => {
    uploads.push({
      path: new URL(route.request().url()).pathname.split("/object/team/")[1],
      type: route.request().headers()["content-type"],
    });
    await route.fulfill({ json: { Key: "ok" } });
  });
  await page.route(/\/rest\/v1\/team_profiles/, (route) => {
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    const body =
      route.request().method() === "PATCH"
        ? { ...profile, ...(route.request().postDataJSON() as object) }
        : profile;
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
  const profile = {
    id: "p1",
    user_id: "u1",
    slug: "owner-test",
    full_name: "Owner Test",
    full_name_ar: null,
    headline: "",
    headline_ar: null,
    bio: "",
    bio_ar: null,
    group_kind: "founder",
    track: null,
    photo_path: null,
    skills: [],
    links: {},
    external_url: null,
    published: false,
    sort_order: 0,
  };
  await page.route(/\/rest\/v1\/team_profiles/, (route) => route.fulfill({ json: [profile] }));
  await page.route(/\/rest\/v1\/team_projects/, (route) => route.fulfill({ json: [] }));
  await page.goto("/app/#/staff/portfolio");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "IMG_0001.HEIC",
      mimeType: "image/heic",
      buffer: Buffer.from("not really an image"),
    });
  await expect(page.getByText("المتصفح مقدرش يفتح الصورة دي").first()).toBeVisible();
  await expect
    .poll(
      () =>
        (calls.find((c) => c.fn === "log_client_error")?.body as { p?: { message?: string } })?.p?.message ??
        "",
    )
    .toContain("upload team: image_unreadable [image/heic");
});

test("photo upload still works when the site is opened over plain http (no crypto.randomUUID)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Insecure contexts don't have randomUUID; localhost tests are secure, so remove it by hand.
    Object.defineProperty(Crypto.prototype, "randomUUID", { value: undefined, configurable: true });
  });
  await signInAsOwner(page);
  const profile = {
    id: "p1",
    user_id: "u1",
    slug: "owner-test",
    full_name: "Owner Test",
    full_name_ar: null,
    headline: "",
    headline_ar: null,
    bio: "",
    bio_ar: null,
    group_kind: "founder",
    track: null,
    photo_path: null,
    skills: [],
    links: {},
    external_url: null,
    published: false,
    sort_order: 0,
  };
  const uploads: string[] = [];
  await page.route(/\/storage\/v1\/object\/team\//, async (route) => {
    uploads.push(new URL(route.request().url()).pathname.split("/object/team/")[1]);
    await route.fulfill({ json: { Key: "ok" } });
  });
  await page.route(/\/rest\/v1\/team_profiles/, (route) => {
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    const body =
      route.request().method() === "PATCH"
        ? { ...profile, ...(route.request().postDataJSON() as object) }
        : profile;
    return route.fulfill({ json: single ? body : [body] });
  });
  await page.route(/\/rest\/v1\/team_projects/, (route) => route.fulfill({ json: [] }));
  await page.goto("/app/#/staff/portfolio");
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  await page.locator('input[type="file"]').first().setInputFiles("public/brand/icon-512.png");
  await expect(page.getByText("اتغيّرت الصورة")).toBeVisible();
  expect(uploads).toHaveLength(2);
  expect(uploads[0]).toMatch(
    /^u1\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.w\.webp$/,
  );
});

test("a student asks to delete their account and the owner deletes it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "rh-app-student",
      JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" }),
    ),
  );
  let pending = false;
  let asked: unknown = null;
  await page.route(/supabase\.co/, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "student_home")
      return route.fulfill({
        json: {
          now: new Date().toISOString(),
          student: { name: "Mona Adel", code: "S1", group: "G1" },
          materials: [],
          quizzes: [],
          attendance: [],
        },
      });
    if (fn === "student_deletion_status")
      return route.fulfill({ json: pending ? { pending: true, at: at(0) } : { pending: false } });
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
  const request = {
    id: "d1",
    kind: "student",
    student_id: "s1",
    user_id: null,
    name: "Mona Adel",
    identifier: "S1",
    reason: "خلصت الكورس",
    status: "pending",
    created_at: at(60),
    handled_at: null,
  };
  await page.route(/\/rest\/v1\/deletion_requests/, (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({
          status: 200,
          headers: { "content-range": "0-0/1", "access-control-expose-headers": "content-range" },
        })
      : route.fulfill({ json: [request] }),
  );
  await page.goto("/app/#/staff");
  await expect(page.getByText("فيه طلب حذف حساب مستني")).toBeVisible();
  await page.goto("/app/#/staff/deletions");
  await expect(page.getByText("خلصت الكورس")).toBeVisible();
  await page.getByRole("button", { name: "احذف الحساب" }).click();
  await page.locator('[role="dialog"] button', { hasText: "احذف نهائيًا" }).last().click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_resolve_deletion")?.body)
    .toEqual({ p_request: "d1", p_approve: true });
  expect(errors).toEqual([]);
});

test("the coach projects a rotating check-in QR for an open session", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_checkin_qr = { ok: true, window: 59712746, code: "0123456789ab", next_in: 12, count: 7 };
  RPC.staff_checkin_stop = null;
  await signInAsOwner(page, calls);
  const session = {
    id: "11111111-2222-3333-4444-555555555555",
    title: "Session 6",
    group_name: "G1",
    starts_at: at(10),
    late_after_min: 15,
    closed_at: null,
    created_by: "u1",
    created_at: at(20),
    self_checkin: false,
  };
  await page.route(/\/rest\/v1\/attendance_sessions/, (route) =>
    route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? session : [session],
    }),
  );
  await page.route(/\/rest\/v1\/attendance\?/, (route) => route.fulfill({ json: [] }));
  await page.goto(`/app/#/staff/attendance/${session.id}`);
  await page.getByRole("button", { name: /الطلاب يسجّلوا بنفسهم/ }).click();
  await expect(page.getByRole("img", { name: "QR تسجيل الحضور" })).toBeVisible();
  await expect(page.locator("span.font-mono", { hasText: "7" })).toBeVisible();
  await page.getByRole("button", { name: "إيقاف التسجيل الذاتي" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_checkin_stop")?.body)
    .toEqual({ p_session: session.id });
  expect(errors).toEqual([]);
});

test("a student checks in from the projector QR link", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "rh-app-student",
      JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" }),
    ),
  );
  let sent: unknown = null;
  await page.route(/supabase\.co/, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "student_self_checkin") {
      sent = route.request().postDataJSON();
      return route.fulfill({
        json: { result: "marked", title: "Session 6", status: "present", at: new Date().toISOString() },
      });
    }
    if (fn === "student_home")
      return route.fulfill({
        json: {
          now: new Date().toISOString(),
          student: { name: "Mona Adel", code: "S1", group: "G1" },
          materials: [],
          quizzes: [],
          attendance: [],
        },
      });
    return route.fulfill({ json: fn ? null : [] });
  });
  await page.goto("/app/#/me");
  await expect(page.getByText("سجّل حضوري")).toBeVisible();
  await page.goto("/app/#/me/checkin?s=11111111-2222-3333-4444-555555555555&w=59712746&c=0123456789ab");
  await expect(page.getByText("اتسجّل حضورك")).toBeVisible();
  await expect(page.getByText("Session 6")).toBeVisible();
  expect(sent).toEqual({
    p_token: "a".repeat(64),
    p_session: "11111111-2222-3333-4444-555555555555",
    p_window: 59712746,
    p_code: "0123456789ab",
  });
  expect(errors).toEqual([]);
});

test("a student hands in a task and sees it on the tasks tab", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "rh-app-student",
      JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" }),
    ),
  );
  const task = {
    id: "t1",
    title: "Photo of your circuit",
    description: "Upload a photo or a link.",
    dueAt: new Date(Date.now() + 864e5).toISOString(),
    maxPoints: 10,
    allowLate: true,
    submission: null as unknown,
  };
  let sent: unknown = null;
  await page.route(/supabase\.co/, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "student_home")
      return route.fulfill({
        json: {
          now: new Date().toISOString(),
          student: { name: "Mona Adel", code: "S1", group: "G1" },
          materials: [],
          quizzes: [],
          attendance: [],
        },
      });
    if (fn === "student_tasks") return route.fulfill({ json: [task] });
    if (fn === "student_submit") {
      sent = route.request().postDataJSON();
      task.submission = {
        submittedAt: new Date().toISOString(),
        late: false,
        body: "Done",
        link: "https://github.com/mona/circuit",
        files: [],
        grade: null,
        feedback: "",
        gradedAt: null,
      };
      return route.fulfill({ json: { ok: true, late: false } });
    }
    return route.fulfill({ json: fn ? null : [] });
  });
  await page.goto("/app/#/me");
  await expect(page.getByText("تاسك مطلوب منك")).toBeVisible();
  await page.getByText("تاسك مطلوب منك").click();
  // The tasks tab's row (Baqloz and the home card also name the task while home is still leaving).
  await expect(page).toHaveURL(/#\/me\/tasks$/);
  await page.getByRole("button", { name: /Photo of your circuit/ }).click();
  await page.getByLabel("ردّك (اختياري)").fill("Done");
  await page.getByLabel("لينك (اختياري)").fill("https://github.com/mona/circuit");
  await page.getByRole("button", { name: "سلّم", exact: true }).click();
  await expect(page.getByText("تسليمك")).toBeVisible();
  expect(sent).toEqual({
    p_token: "a".repeat(64),
    p_assignment: "t1",
    p_body: "Done",
    p_link: "https://github.com/mona/circuit",
    p_files: [],
  });
  expect(errors).toEqual([]);
});

test("a coach grades a submission with feedback", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_list_students = [
    {
      id: "s1",
      code: "S1",
      codeKey: "s1",
      barcode: null,
      barcodeKey: null,
      name: "Mona Adel",
      group: "G1",
      phone: null,
      notes: null,
      active: true,
      createdAt: at(10),
      hasPin: true,
    },
  ];
  RPC.staff_grade_submission = { ok: true };
  await signInAsOwner(page, calls);
  const a = {
    id: "t1",
    title: "Photo of your circuit",
    description: "",
    group_name: "G1",
    due_at: null,
    max_points: 10,
    allow_late: true,
    published: true,
    created_at: at(60),
  };
  const sub = {
    id: "sub1",
    assignment_id: "t1",
    student_id: "s1",
    body: "Done",
    link: "https://github.com/mona/circuit",
    files: [],
    submitted_at: at(5),
    late: false,
    grade: null,
    feedback: "",
    graded_at: null,
  };
  await page.route(/\/rest\/v1\/assignments\?/, (route) =>
    route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object")
        ? a
        : [{ ...a, assignment_submissions: [{ id: "sub1", grade: null }] }],
    }),
  );
  await page.route(/\/rest\/v1\/assignment_submissions/, (route) => route.fulfill({ json: [sub] }));
  await page.goto("/app/#/staff/tasks");
  await expect(page.getByText("1 مستني تصحيح")).toBeVisible();
  await page.getByText("Photo of your circuit").click();
  await page.getByText("Mona Adel").click();
  await page.getByLabel("الدرجة (من 10)").fill("8");
  await page.getByLabel("ملاحظاتك للطالب (اختياري)").fill("Nice wiring");
  await page.getByRole("button", { name: "حفظ الدرجة" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_grade_submission")?.body)
    .toEqual({ p_submission: "sub1", p_grade: 8, p_feedback: "Nice wiring" });
  expect(errors).toEqual([]);
});

test("a student sees announcements and the next session, and adds it to the calendar", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "rh-app-student",
      JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" }),
    ),
  );
  const soon = new Date(Date.now() + 2 * 864e5).toISOString();
  const rpcs: Record<string, unknown> = {
    student_home: {
      now: new Date().toISOString(),
      student: { name: "Mona Adel", code: "S1", group: "G1" },
      materials: [],
      quizzes: [],
      attendance: [],
    },
    student_announcements: [
      { id: "n1", title: "Session moved to 5 PM", body: "Same room.", pinned: true, at: at(30) },
    ],
    student_schedule: [
      {
        kind: "session",
        id: "s9",
        title: "Session 7: Sensors",
        startsAt: soon,
        endsAt: null,
        location: null,
      },
    ],
  };
  await page.route(/supabase\.co/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    return route.fulfill({ json: fn ? (rpcs[fn] ?? null) : [] });
  });
  await page.goto("/app/#/me");
  await expect(page.getByText("Session moved to 5 PM")).toBeVisible();
  await expect(page.getByText("السيشن الجاية")).toBeVisible();
  await page.getByText("Session 7: Sensors").click();
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "أضف للتقويم" }).click(),
  ]);
  const ics = (await import("node:fs")).readFileSync(await file.path(), "utf8");
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toContain("SUMMARY:Session 7: Sensors · BuildX HUE");
  expect(ics).toContain("UID:session-s9@buildxhue.com");
  expect(errors).toEqual([]);
});

test("a coach posts an announcement to one group", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  RPC.staff_list_students = [
    {
      id: "s1",
      code: "S1",
      codeKey: "s1",
      barcode: null,
      barcodeKey: null,
      name: "Mona",
      group: "G1",
      phone: null,
      notes: null,
      active: true,
      createdAt: at(10),
      hasPin: true,
    },
  ];
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
  await expect
    .poll(() => inserted)
    .toEqual(expect.objectContaining({ title: "Session moved to 5 PM", group_name: "G1", pinned: false }));
  await expect
    .poll(() => pushed)
    .toEqual(expect.objectContaining({ title: "Session moved to 5 PM", audience: "group", group: "G1" }));
  expect(errors).toEqual([]);
});

test("staff make a student's monthly report as a PDF", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_list_students = [
    {
      id: "s1",
      code: "S1",
      codeKey: "s1",
      barcode: null,
      barcodeKey: null,
      name: "Mona Adel",
      group: "G1",
      phone: null,
      notes: null,
      active: true,
      createdAt: at(10),
      hasPin: true,
    },
  ];
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
    tasks: [
      {
        title: "Photo of your circuit",
        max: 10,
        due: "2026-10-06T20:00:00Z",
        submitted: "2026-10-06T18:00:00Z",
        late: false,
        grade: 8,
      },
    ],
    points: { points: 120, rank: 2, of: 14, badges: ["first_step", "full_marks"] },
  };
  await signInAsOwner(page, calls);
  await page.goto("/app/#/staff/students");
  await page.getByText("Mona Adel").click();
  await page.getByRole("button", { name: "تقرير شهري PDF" }).click();
  await page.getByLabel("الشهر").fill("2026-10");
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "اعمل التقرير PDF" }).click(),
  ]);
  expect(file.suggestedFilename()).toBe("report-S1-2026-10.pdf");
  const pdf = (await import("node:fs")).readFileSync(await file.path()).toString("latin1");
  expect(pdf).toContain("/Count 1");
  expect(pdf).toContain("/MediaBox [0 0 595.28 841.89]");
  if (process.env.SAVE_PDF) (await import("node:fs")).copyFileSync(await file.path(), process.env.SAVE_PDF);
  expect(calls.find((c) => c.fn === "staff_student_report")?.body).toEqual({
    p_student: "s1",
    p_from: "2026-10-01",
    p_to: "2026-10-31",
  });
  expect(errors).toEqual([]);
});

test("adding a student needs only the name, and «add and next» keeps going with the codes shown at the end", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  RPC.staff_list_students = [
    {
      id: "s1",
      code: "S1",
      codeKey: "s1",
      barcode: null,
      barcodeKey: null,
      name: "Mona Adel",
      group: "G1",
      phone: null,
      notes: null,
      active: true,
      createdAt: at(10),
      hasPin: true,
    },
  ];
  await signInAsOwner(page);
  const inserted: Record<string, unknown>[] = [];
  let n = 1000;
  await page.route(/\/rest\/v1\/students/, (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: [] });
    inserted.push(route.request().postDataJSON());
    n += 1;
    return route.fulfill({ json: { id: `new${n}`, code: `BX${n}` } });
  });
  await page.goto("/app/#/staff/students");
  await page.getByRole("button", { name: "طالب", exact: true }).click();
  const form = page.getByTestId("student-form");
  await expect(form.getByLabel("رقم الطالب (اختياري)")).toBeVisible();
  await expect(form.getByLabel("ملاحظات (اختياري)")).toHaveCount(0);
  await form.getByLabel("الاسم").fill("Ahmed Ali");
  await form.getByTestId("add-next").click();
  await expect(form.getByTestId("added-list")).toContainText("Ahmed Ali (BX1001)");
  await expect(form.getByLabel("الاسم")).toHaveValue("");
  await expect(form.getByLabel("الاسم")).toBeFocused();
  await form.getByLabel("الاسم").fill("Mona  Adel");
  await expect(form.getByText("فيه طالب بنفس الاسم: Mona Adel (S1)")).toBeVisible();
  await form.getByLabel("الاسم").fill("Sara Nabil");
  await form.getByRole("button", { name: "أضِف وخلّصت" }).click();
  await expect(page.getByRole("dialog").getByText("2 رمز دخول")).toBeVisible();
  expect(inserted.map((r) => [r.code, r.full_name])).toEqual([
    ["", "Ahmed Ali"],
    ["", "Sara Nabil"],
  ]);
  expect(errors).toEqual([]);
});

test("the app in English: picked on the sign-in screen, then every screen reads left-to-right in English", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/supabase\.co/, (route) => route.fulfill({ json: [] }));
  await page.goto("/app/#/");
  await page.getByTestId("lang-switch").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("lang-switch")).toHaveText(/العربية/);
  expect(errors).toEqual([]);
});

test("in English, staff screens, buttons, search hints and dates are English, and typed names stay as typed", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("bx-app-lang", "en"));
  RPC.staff_list_students = [
    {
      id: "s1",
      code: "S1",
      codeKey: "s1",
      barcode: null,
      barcodeKey: null,
      name: "منى عادل",
      group: "G1",
      phone: null,
      notes: null,
      active: true,
      createdAt: at(10),
      hasPin: true,
    },
  ];
  await signInAsOwner(page);
  await page.goto("/app/#/staff/students");
  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
  await expect(page.getByPlaceholder("Search by name or ID number")).toBeVisible();
  await expect(page.getByText("منى عادل")).toBeVisible();
  await page
    .getByRole("button", { name: "طالب", exact: true })
    .or(page.getByRole("button", { name: "Student", exact: true }))
    .click();
  await expect(page.getByTestId("student-form").getByText("Student code (optional)")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/app/#/staff/more");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(page.getByTestId("app-language")).toContainText("اللغة · Language");
  await expect(page.getByText(/تسجيل الخروج/)).toHaveCount(0);
  expect(
    await page.evaluate(() => new Date(Date.UTC(2026, 9, 11)).toLocaleDateString("ar-EG", { month: "long" })),
  ).toBe("October");
  expect(errors).toEqual([]);
});

test("family list: sign-ups for the year, the Student Welfare list as a PDF (13 a page) and Excel, accept and add to the app", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const names = ["منى عادل سامي حسن", "أحمد علي محمود سعد", "يوسف خالد إبراهيم عمر"];
  const members = Array.from({ length: 15 }, (_, i) => ({
    id: `f${i + 1}`,
    ref: `FM-00000${i}`,
    academic_year: "2026/2027",
    full_name: `${names[i % 3]} ${i + 1}`,
    national_id: `3050101110${String(1000 + i).slice(-4)}`,
    phone: `0101234${String(5000 + i)}`,
    governorate: "دمياط",
    address: "دمياط الجديدة",
    level: (i % 5) + 1,
    faculty: "الذكاء الاصطناعي",
    student_number: null,
    email: null,
    status: i === 14 ? "rejected" : "new",
    notes: null,
    student_id: null,
    created_at: at(100 - i),
  }));
  const writes: { method: string; url: string; body: unknown }[] = [];
  await page.route(/\/rest\/v1\/(family_members|site_settings|students)/, (route) => {
    const req = route.request();
    const url = req.url();
    const one = (req.headers().accept ?? "").includes("vnd.pgrst.object");
    if (url.includes("site_settings"))
      return route.fulfill({
        json: one
          ? { value: { open: true, year: "2026/2027", family: "BuildX", faculty: "الذكاء الاصطناعي" } }
          : [],
      });
    if (req.method() !== "GET") {
      writes.push({ method: req.method(), url, body: req.postDataJSON() });
      if (url.includes("/students")) return route.fulfill({ json: { id: "s9", code: "BX1001" } });
      const m = { ...members[0], ...(req.postDataJSON() as object) };
      return route.fulfill({ json: one ? m : [m] });
    }
    if (url.includes("/students")) return route.fulfill({ json: [] });
    return route.fulfill({ json: members });
  });
  await page.goto("/app/#/staff/family");
  await expect(page.getByText("14 عضو · العام الجامعي 2026/2027")).toBeVisible();
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByTestId("family-pdf").click()]);
  expect(pdf.suggestedFilename()).toMatch(/^family-2026-2027-.*\.pdf$/);
  const bytes = (await import("node:fs")).readFileSync(await pdf.path()).toString("latin1");
  expect(bytes).toContain("/Count 2");
  if (process.env.SAVE_PDF) (await import("node:fs")).copyFileSync(await pdf.path(), process.env.SAVE_PDF);
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByTestId("family-xlsx").click()]);
  expect(xlsx.suggestedFilename()).toMatch(/^family-2026-2027-.*\.xlsx$/);

  await expect(page.getByTestId("family-accept-all")).toContainText("(14)");
  await page.getByText("منى عادل سامي حسن 1", { exact: true }).click();
  const sheet = page.getByTestId("family-member");
  await expect(sheet).toContainText("••••••••••1000");
  await sheet.getByRole("button", { name: "إظهار" }).click();
  await expect(sheet).toContainText("30501011101000");
  await sheet.getByRole("button", { name: "قبول" }).click();
  await expect
    .poll(() => writes.find((w) => w.url.includes("family_members"))?.body)
    .toEqual({ status: "accepted" });
  await sheet.getByTestId("family-to-student").click();
  await expect
    .poll(() => writes.find((w) => w.url.includes("/students"))?.body)
    .toEqual({
      code: "",
      full_name: "منى عادل سامي حسن 1",
      phone: "01012345000",
      group_name: "أسرة 2026/2027",
    });
  await expect(sheet.getByText("متضاف كطالب في التطبيق")).toBeVisible();
  expect(errors).toEqual([]);
});

test("family promo and welcome: the group link is saved privately, a welcome to everyone shown goes to WhatsApp, and the poster/post/story download", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const members = ["منى عادل سامي حسن", "أحمد علي محمود سعد"].map((full_name, i) => ({
    id: `f${i + 1}`,
    ref: `FM-00000${i}`,
    academic_year: "2026/2027",
    full_name,
    national_id: `3050101110100${i}`,
    phone: `0101234500${i}`,
    governorate: "دمياط",
    address: "دمياط الجديدة",
    level: 2,
    faculty: "الذكاء الاصطناعي",
    student_number: null,
    email: null,
    status: "new",
    notes: null,
    student_id: null,
    created_at: at(10 - i),
  }));
  const settings = { open: true, year: "2026/2027", family: "BuildX", faculty: "الذكاء الاصطناعي" };
  await page.route(/\/rest\/v1\/(family_members|site_settings)/, (route) => {
    const one = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    if (route.request().url().includes("site_settings"))
      return route.fulfill({ json: one ? { value: settings } : [] });
    return route.fulfill({ json: members });
  });
  const groupCalls: unknown[] = [];
  let group: string | null = null;
  await page.route(/\/rpc\/staff_family_(group|settings)/, (route) => {
    const body = route.request().postDataJSON() as { p_link?: string; p_set?: boolean };
    if (route.request().url().includes("settings")) return route.fulfill({ json: settings });
    groupCalls.push(body);
    if (body.p_set) group = body.p_link || null;
    return route.fulfill({ json: { group } });
  });
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === "bx-wa-handoff") (window as unknown as { handoff: string }).handoff = v;
      return set.call(this, k, v);
    };
  });
  await page.goto("/app/#/staff/family");
  await expect(page.getByText("2 عضو · العام الجامعي 2026/2027")).toBeVisible();

  // The family's WhatsApp group link: kept by the database, checked before it's sent.
  await page.getByRole("button", { name: "إعدادات الأسرة" }).click();
  const link = page.getByLabel("لينك جروب الأسرة على واتساب");
  await link.fill("https://example.com/group");
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("لينك الجروب لازم يبدأ بـ https://chat.whatsapp.com/")).toBeVisible();
  await link.fill("https://chat.whatsapp.com/AbCdEfGhIjKlMnOp");
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect
    .poll(() => groupCalls.at(-1))
    .toEqual({ p_link: "https://chat.whatsapp.com/AbCdEfGhIjKlMnOp", p_set: true });

  // One welcome for everyone shown, with each name and the group link.
  await page.getByTestId("family-welcome").click();
  await expect(page).toHaveURL(/#\/staff\/whatsapp/);
  const handoff = JSON.parse(
    await page.evaluate(() => (window as unknown as { handoff: string }).handoff),
  ) as {
    people: { phone: string; name: string }[];
    context: string;
    text: string;
  };
  expect(handoff.people).toEqual([
    { phone: "01012345000", name: "منى عادل سامي حسن" },
    { phone: "01012345001", name: "أحمد علي محمود سعد" },
  ]);
  expect(handoff.context).toBe("family");
  expect(handoff.text).toContain("أهلاً {name}");
  expect(handoff.text).toContain("https://chat.whatsapp.com/AbCdEfGhIjKlMnOp");

  // The promo kit: an A4 poster to print, an Instagram post and a story, each with the QR code.
  await page.goto("/app/#/staff/family");
  await page.getByRole("button", { name: "لينك التسجيل" }).click();
  const kit = page.getByTestId("family-promo");
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    kit.getByRole("button", { name: "بوستر A4 للطباعة (PDF)" }).click(),
  ]);
  expect(pdf.suggestedFilename()).toBe("buildx-family-poster-A4.pdf");
  const fs = await import("node:fs");
  expect(fs.readFileSync(await pdf.path()).toString("latin1")).toContain("/Count 1");
  if (process.env.SAVE_PROMO) fs.copyFileSync(await pdf.path(), `${process.env.SAVE_PROMO}/poster.pdf`);
  for (const [name, file, w, h] of [
    ["بوست إنستجرام", "buildx-family-post.png", 1080, 1080],
    ["ستوري", "buildx-family-story.png", 1080, 1920],
  ] as const) {
    await expect(kit.getByRole("button", { name })).toBeEnabled();
    const [png] = await Promise.all([
      page.waitForEvent("download"),
      kit.getByRole("button", { name }).click(),
    ]);
    expect(png.suggestedFilename()).toBe(file);
    const bytes = fs.readFileSync(await png.path());
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([w, h]);
    if (process.env.SAVE_PROMO) fs.copyFileSync(await png.path(), `${process.env.SAVE_PROMO}/${file}`);
  }
  expect(errors).toEqual([]);
});

test("a trainer only sees the areas the owner gave them", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  // This account is a trainer with the website content area only.
  await page.route(/\/rest\/v1\/staff/, (route) => {
    const row = {
      user_id: "u1",
      email: "media@example.com",
      full_name: "Media Lead",
      role: "lead",
      active: true,
      created_at: at(9999),
      title: "مسؤول الإعلام والتصميم",
      permissions: ["content"],
    };
    return route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row],
    });
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
  const owner = {
    user_id: "u1",
    email: "owner@example.com",
    full_name: "Owner Test",
    role: "owner",
    active: true,
    created_at: at(9999),
  };
  const lead = {
    user_id: "u2",
    email: "lead@example.com",
    full_name: "Lead Two",
    role: "lead",
    active: true,
    created_at: at(10),
    title: null,
    permissions: null,
  };
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
  // Picking a position suggests its areas: media gets the website content and the page builder.
  await expect(lvl(page, "محتوى الموقع", "كامل")).toBeChecked();
  await expect(lvl(page, "منشئ الصفحات", "كامل")).toBeChecked();
  await expect(lvl(page, "بيانات الطلاب", "لا")).toBeChecked();
  await lvl(page, "رسائل الموقع", "كامل").click();
  // Applications to read only.
  await lvl(page, "طلبات الانضمام", "مشاهدة").click();
  await page.getByRole("button", { name: "احفظ المنصب والصلاحيات" }).click();
  await expect
    .poll(() => patches[0])
    .toEqual({
      title: "مسؤول الإعلام والتصميم",
      permissions: ["site", "pages", "applications:view", "inbox"],
    });
});

test("the head of media publishes, edits the team's pages and sends notifications, and nothing else", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  await page.route(/\/rest\/v1\/staff/, (route) => {
    const row = {
      user_id: "u1",
      email: "media@example.com",
      full_name: "Media Head",
      role: "lead",
      active: true,
      created_at: at(9999),
      title: "هيد الميديا",
      permissions: ["content", "publish", "portfolios", "notify"],
    };
    return route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row],
    });
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
  const owner = {
    user_id: "u1",
    email: "owner@example.com",
    full_name: "Owner Test",
    role: "owner",
    active: true,
    created_at: at(9999),
  };
  const lead = {
    user_id: "u2",
    email: "lead@example.com",
    full_name: "Lead Two",
    role: "lead",
    active: true,
    created_at: at(10),
    title: null,
    permissions: null,
  };
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
  await expect(lvl(page, "إعدادات الموقع", "كامل")).toBeChecked();
  await expect(lvl(page, "النشر على الموقع", "كامل")).toBeChecked();
  await expect(lvl(page, "واتساب", "كامل")).toBeChecked();
  await expect(lvl(page, "بيانات الطلاب", "لا")).toBeChecked();
  await page.getByLabel("المنصب").fill("هيد الميديا");
  await expect(lvl(page, "إعدادات الموقع", "لا")).toBeChecked();
  await page.getByRole("button", { name: "احفظ المنصب والصلاحيات" }).click();
  await expect
    .poll(() => patches[0])
    .toEqual({
      title: "هيد الميديا",
      permissions: ["site", "pages", "publish", "portfolios", "voice", "notify"],
    });
});

test("the owner limits an admin to chosen areas too (all ticked keeps them a full admin)", async ({
  page,
}) => {
  await signInAsOwner(page);
  const owner = {
    user_id: "u1",
    email: "owner@example.com",
    full_name: "Owner Test",
    role: "owner",
    active: true,
    created_at: at(9999),
  };
  const admin = {
    user_id: "u3",
    email: "admin@example.com",
    full_name: "Admin Three",
    role: "admin",
    active: true,
    created_at: at(10),
    title: null,
    permissions: null,
  };
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
  // A full admin starts with every area in full, the newer ones included.
  await expect(lvl(page, "الأمان والمتابعة", "كامل")).toBeChecked();
  await expect(lvl(page, "بيانات الطلاب", "كامل")).toBeChecked();
  await expect(lvl(page, "واتساب", "كامل")).toBeChecked();
  await expect(page.getByRole("button", { name: "احفظ المنصب والصلاحيات" })).toBeDisabled();
  await page.getByLabel("المنصب").fill("مسؤول الروبوتكس");
  await expect(lvl(page, "الأمان والمتابعة", "لا")).toBeChecked();
  await page.getByRole("button", { name: "احفظ المنصب والصلاحيات" }).click();
  await expect
    .poll(() => patches[0])
    .toEqual({
      title: "مسؤول الروبوتكس",
      permissions: ["roster", "attendance", "quizzes", "tasks", "materials", "announcements", "points"],
    });
});

test("an admin the owner limited sees only those areas: no security, activity log, deleting or team management", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const me = {
    user_id: "u1",
    email: "coach@example.com",
    full_name: "Coach Admin",
    role: "admin",
    active: true,
    created_at: at(9999),
    title: "مسؤول الروبوتكس",
    permissions: ["students"],
  };
  const other = {
    user_id: "u2",
    email: "lead@example.com",
    full_name: "Lead Two",
    role: "lead",
    active: true,
    created_at: at(10),
    title: null,
    permissions: null,
  };
  await page.route(/\/rest\/v1\/staff/, (route) => {
    const list = route.request().url().includes("order=created_at");
    if (list) return route.fulfill({ json: [me, other] });
    return route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? me : [me],
    });
  });
  await page.goto("/app/#/staff/more");
  await expect(page.getByText("التاسكات (تسليم وتصحيح)")).toBeVisible();
  for (const item of [
    "الأمان والهجمات",
    "سجل الحركات (كل تعديل وحذف من كل الناس)",
    "زيارات الموقع (مين بيزور وبيشوف إيه)",
    "أخطاء الموقع",
    "طلبات الانضمام",
    "رسائل الموقع وطلبات الرعاية",
  ])
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

test("permissions come in small parts: someone with quizzes only gets the quizzes and nothing else of the training", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const me = {
    user_id: "u1",
    email: "quiz@example.com",
    full_name: "Quiz Coach",
    role: "lead",
    active: true,
    created_at: at(9999),
    title: null,
    permissions: ["quizzes"],
  };
  await page.route(/\/rest\/v1\/staff/, (route) =>
    route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? me : [me],
    }),
  );
  await page.goto("/app/#/staff");
  const nav = page.getByRole("navigation", { name: "التنقل" });
  await expect(nav.getByRole("link", { name: "الكويزات" })).toBeVisible();
  for (const tab of ["الحضور", "الطلاب", "المحتوى"])
    await expect(nav.getByRole("link", { name: tab })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /تسجيل حضور جديد/ })).toHaveCount(0);
  for (const path of ["attendance", "students", "tasks", "content", "announcements", "site", "forms"]) {
    await page.goto(`/app/#/staff/${path}`);
    await expect(page.getByText("القسم ده مش من صلاحياتك")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("the owner gives a whole group at once, and older lists show as all their parts", async ({ page }) => {
  await signInAsOwner(page);
  const owner = {
    user_id: "u1",
    email: "owner@example.com",
    full_name: "Owner Test",
    role: "owner",
    active: true,
    created_at: at(9999),
  };
  // Saved before the split: "content" means website content, forms, pages and expo delegations.
  const lead = {
    user_id: "u2",
    email: "lead@example.com",
    full_name: "Lead Two",
    role: "lead",
    active: true,
    created_at: at(10),
    title: null,
    permissions: ["content"],
  };
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
  await expect(lvl(page, "محتوى الموقع", "كامل")).toBeChecked();
  await expect(lvl(page, "الفورمات", "كامل")).toBeChecked();
  await expect(lvl(page, "وفود المعارض", "كامل")).toBeChecked();
  await expect(lvl(page, "الحضور", "لا")).toBeChecked();
  await page.getByRole("button", { name: "كامل للكل" }).first().click();
  await lvl(page, "الفورمات", "لا").click();
  await page.getByRole("button", { name: "احفظ المنصب والصلاحيات" }).click();
  await expect
    .poll(() => patches[0])
    .toEqual({
      title: null,
      permissions: [
        "roster",
        "attendance",
        "quizzes",
        "tasks",
        "materials",
        "announcements",
        "points",
        "site",
        "pages",
        "expo",
      ],
    });
});

test("signed in, students and the team can go back to the website and come back still signed in", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "rh-app-student",
      JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" }),
    ),
  );
  await page.route(/supabase\.co/, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "student_home")
      return route.fulfill({
        json: {
          now: new Date().toISOString(),
          student: { name: "Mona Adel", code: "S1", group: "G1" },
          materials: [],
          quizzes: [],
          attendance: [],
        },
      });
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

test("drafts the team wrote wait at the top of the content screen for whoever publishes", async ({
  page,
}) => {
  await signInAsOwner(page);
  const draft = {
    id: "d1",
    kind: "post",
    slug: "robot-day",
    title: "Robot day",
    title_ar: "يوم الروبوت",
    published: false,
    pinned: false,
    created_by: "u9",
    created_at: at(5),
    starts_at: null,
    publish_at: null,
    image_path: null,
    tags: [],
  };
  const mine = { ...draft, id: "d2", title_ar: "مسودتي", created_by: "u1" };
  await page.route(/\/rest\/v1\/site_content/, (route) => route.fulfill({ json: [draft, mine] }));
  await page.goto("/app/#/staff/site");
  await expect(page.getByText("مستنية النشر (1)")).toBeVisible();
  await page.getByText("يوم الروبوت").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("content staff set the points of a lecture and the bonus a group earns for finishing the course", async ({ page }) => {
  await signInAsOwner(page);
  const material = {
    id: "m1",
    title: "Servo basics",
    description: "",
    kind: "link",
    storage_path: null,
    url: "https://example.com/servo",
    file_name: null,
    mime: null,
    size_bytes: null,
    group_name: "G1",
    published: true,
    pinned: false,
    points: 7,
    created_by: "u1",
    created_at: at(3),
  };
  const patched: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/materials/, async (route) => {
    const m = route.request().method();
    if (m === "PATCH") {
      const body = route.request().postDataJSON();
      patched.push(body);
      return route.fulfill({ json: { ...material, ...body } });
    }
    return route.fulfill({ json: [material] });
  });
  const bonus: Record<string, unknown>[][] = [];
  await page.route(/\/rest\/v1\/course_bonus/, async (route) => {
    if (route.request().method() === "POST") {
      bonus.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: [{ group_name: "G1" }] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/app/#/staff/content");
  await page.getByRole("button", { name: /نقط إتمام الكورس/ }).click();
  await page.getByTestId("course-bonus-G1").fill("40");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect.poll(() => bonus[0]?.[0]).toMatchObject({ group_name: "G1", points: 40 });
  await page.getByText("Servo basics").first().click();
  await expect(page.getByText("7 نقطة")).toBeVisible();
  await page.getByRole("button", { name: "تعديل" }).click();
  await page.getByTestId("material-points").fill("12");
  await page.getByRole("button", { name: "حفظ", exact: true }).last().click();
  await expect.poll(() => patched[0]).toMatchObject({ points: 12 });
});

test("certificates go in one tap to every student who attended enough sessions", async ({ page }) => {
  await signInAsOwner(page);
  const s = (id: string, name: string) => ({
    id,
    code: id,
    codeKey: id,
    barcode: null,
    barcodeKey: null,
    name,
    group: "G1",
    phone: null,
    notes: null,
    active: true,
    createdAt: at(10),
    hasPin: true,
  });
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

test("certificates for everyone who finished the course track, and the student's progress bar", async ({
  page,
}) => {
  await signInAsOwner(page);
  const s = (id: string, name: string) => ({
    id,
    code: id,
    codeKey: id,
    barcode: null,
    barcodeKey: null,
    name,
    group: "G1",
    phone: null,
    notes: null,
    active: true,
    createdAt: at(10),
    hasPin: true,
  });
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
  await page
    .getByText("اللي خلّصوا 80% من المسار أو أكتر: 1")
    .locator("..")
    .getByRole("button", { name: "اختارهم" })
    .click();
  await page.getByRole("button", { name: "إصدار 1 شهادة" }).click();
  await expect.poll(() => inserted[0]?.map((r) => r.recipient_name)).toEqual(["Omar"]);
  delete RPC.staff_progress;
});

test("a student sees the course progress and opening a lecture counts", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "rh-app-student",
      JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" }),
    ),
  );
  const seen: unknown[] = [];
  const material = {
    id: "m1",
    title: "Lecture 5: sensors",
    description: "",
    kind: "link",
    path: null,
    url: "https://example.com/l5",
    fileName: null,
    mime: null,
    size: null,
    pinned: false,
    at: at(60),
  };
  const rpcs: Record<string, unknown> = {
    student_home: {
      now: new Date().toISOString(),
      student: { name: "Mona Adel", code: "S1", group: "G1" },
      materials: [material, { ...material, id: "m2", title: "Lecture 4" }],
      quizzes: [],
      attendance: [],
    },
    student_progress: {
      percent: 63,
      materials: { seen: 1, total: 2 },
      quizzes: { done: 1, total: 2 },
      sessions: { attended: 7, total: 8 },
      seenIds: ["m2"],
    },
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

test("one sign-in: a student number goes to the student dashboard, an email to the team's", async ({
  page,
}) => {
  const calls: { fn: string; body: unknown }[] = [];
  let signedIn = false;
  await page.route(/supabase\.co/, async (route) => {
    const url = new URL(route.request().url());
    const fn = url.pathname.split("/rpc/")[1];
    if (fn) {
      calls.push({ fn, body: route.request().postDataJSON() });
      if (fn === "app_status") return route.fulfill({ json: { ready: true } });
      if (fn === "student_login")
        return route.fulfill({
          json: { ok: true, token: "t", student: { name: "طالب تجربة", code: "900100", group: "تجريبي" } },
        });
      return route.fulfill({ json: null });
    }
    if (url.pathname.endsWith("/auth/v1/token")) {
      signedIn = true;
      return route.fulfill({
        json: {
          access_token: jwt,
          refresh_token: "r",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: 4102444800,
          user: { id: "u1", email: "owner@example.com", aud: "authenticated", role: "authenticated" },
        },
      });
    }
    if (url.pathname.endsWith("/staff")) {
      const row = {
        user_id: "u1",
        email: "owner@example.com",
        full_name: "Owner Test",
        role: "owner",
        active: true,
        created_at: at(9999),
      };
      return route.fulfill({
        json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row],
      });
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
  await card.getByLabel("Apple (iPhone): ملف AuthKey .p8").setInputFiles({
    name: "AuthKey_ABCDE12345.p8",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n"),
  });
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
    return route.fulfill({
      json: fn === "request_access_help" ? { ok: true } : fn === "app_status" ? { ready: true } : null,
    });
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
  await page
    .getByText("فيه حد نسي رمز الدخول أو كلمة المرور ومستني.")
    .locator("..")
    .getByRole("button", { name: "افتح" })
    .click();
  await expect(page).toHaveURL(/#\/staff\/access$/);
  await expect(page.getByText("2024001 · Robotics A")).toBeVisible();
  await page.getByRole("button", { name: "رمز جديد" }).click();
  await expect(page.getByText("482913")).toBeVisible();
  expect(calls.find((c) => c.fn === "staff_set_pins")?.body).toEqual({
    p_ids: ["s1"],
    p_only_missing: false,
  });
  expect(calls.find((c) => c.fn === "staff_access_resolve")?.body).toEqual({ p_id: "r1", p_status: "done" });
});

test("the store app shows four first-run screens once, then the sign-in form", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { CapacitorCustomPlatform: unknown }).CapacitorCustomPlatform = {
      name: "android",
      plugins: {},
    };
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
  await page.addInitScript(() =>
    localStorage.setItem(
      "rh-app-student",
      JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" }),
    ),
  );
  const sent: unknown[] = [];
  const rpcs: Record<string, unknown> = {
    student_home: {
      now: new Date().toISOString(),
      student: { name: "Mona Adel", code: "S1", group: "G1" },
      materials: [],
      quizzes: [],
      attendance: [],
    },
    student_projects_mine: [
      {
        id: "p0",
        title: "Line follower",
        status: "published",
        note: null,
        at: at(600),
        slug: "student-line-follower-ab12",
      },
    ],
    public_forms: [
      {
        slug: "robocup-tryouts",
        title_ar: "اختبارات فريق RoboCup",
        intro_ar: "انضم لفريق المسابقة",
        team: "robocup",
        open: true,
      },
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
  await expect(page.getByRole("link", { name: "شوفه على الموقع" })).toHaveAttribute(
    "href",
    "/ar/projects/student-line-follower-ab12/",
  );
  await expect(page.getByRole("link", { name: /اختبارات فريق RoboCup/ })).toHaveAttribute(
    "href",
    "/ar/form/?f=robocup-tryouts",
  );
  await expect(page.getByText("متطوعين يوم الروبوت")).toBeVisible();
  await expect(page.getByText("فورم قديم")).toHaveCount(0);
  await page.getByLabel("اسم المشروع").fill("Smart plant");
  await page.getByLabel("بيعمل إيه؟").fill("Waters itself");
  await page.getByLabel("لينك (GitHub، فيديو، Drive…) — اختياري").fill("github.com/mona/plant");
  await page.getByRole("button", { name: "ابعت المشروع" }).click();
  await expect(page.getByText("اتبعت ✓ الفريق هيراجعه وينشره على الموقع")).toBeVisible();
  expect(sent).toEqual([
    {
      p_token: "a".repeat(64),
      p_title: "Smart plant",
      p_description: "Waters itself",
      p_url: "github.com/mona/plant",
      p_photo: null,
    },
  ]);
});

test("content staff publish a student's project on the website or decline it", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_student_projects = [
    {
      id: "sp1",
      title: "Smart plant",
      description: "Waters itself",
      url: "https://github.com/mona/plant",
      photo: null,
      at: at(30),
      student: "Mona Adel",
      group: "G1",
    },
    {
      id: "sp2",
      title: "Spam",
      description: "",
      url: null,
      photo: null,
      at: at(20),
      student: "Omar",
      group: "G1",
    },
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
  const card = (t: string) =>
    page
      .locator("div", { has: page.getByText(t, { exact: true }) })
      .filter({ has: page.getByRole("button") })
      .last();
  await card("Smart plant").getByRole("button", { name: "انشر على الموقع" }).click();
  await expect(page.getByText("اتنشر على الموقع ✓")).toBeVisible();
  expect(inserted[0]).toMatchObject({
    kind: "project",
    title_ar: "Smart plant",
    url: "https://github.com/mona/plant",
    published: true,
    tags: ["students"],
  });
  expect(String(inserted[0]?.slug)).toMatch(/^student-smart-plant-[a-z0-9]+$/);
  expect(calls.find((c) => c.fn === "staff_review_project")?.body).toEqual({
    p_id: "sp1",
    p_status: "published",
    p_note: null,
    p_site: "sc1",
  });
  await card("Spam").getByPlaceholder("ملاحظة للطالب لو مش هينتشر (اختياري)").fill("مش مشروع");
  await card("Spam").getByRole("button", { name: "مش هينتشر" }).click();
  await expect
    .poll(() => calls.filter((c) => c.fn === "staff_review_project").map((c) => c.body))
    .toContainEqual({ p_id: "sp2", p_status: "declined", p_note: "مش مشروع", p_site: null });
  delete RPC.staff_student_projects;
});

test("coaches see who needs a word, with a WhatsApp nudge ready", async ({ page }) => {
  RPC.staff_at_risk = [
    {
      id: "s1",
      name: "Mona Adel",
      group: "G1",
      phone: "01001234567",
      missed: 2,
      lastSeen: at(60 * 24 * 9),
      reasons: ["missed_two"],
    },
    {
      id: "s2",
      name: "Omar Ali",
      group: "G1",
      phone: null,
      missed: 0,
      lastSeen: null,
      reasons: ["inactive"],
    },
  ];
  await signInAsOwner(page);
  await page.goto("/app/#/staff");
  await page
    .getByText("فيه 2 طلاب محتاجين متابعة (غابوا أو اختفوا).")
    .locator("..")
    .getByRole("button", { name: "شوفهم" })
    .click();
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
    return route.fulfill({
      json: [
        {
          id: "m1",
          title: "Lecture 6",
          description: "",
          kind: "link",
          storage_path: null,
          url: "https://x.y",
          file_name: null,
          mime: null,
          size_bytes: null,
          group_name: "",
          published: false,
          publish_at: later,
          pinned: false,
          created_by: "u1",
          created_at: at(5),
        },
      ],
    });
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

test("expo visit responses: accepted list as Excel, WhatsApp acceptance with the expo link, and who registered there", async ({
  page,
}) => {
  await signInAsOwner(page);
  const form = {
    id: "f1",
    slug: "robotex-2026",
    title_ar: "زيارة معرض Robotex & NDTX 2026",
    title_en: null,
    intro_ar: null,
    intro_en: null,
    success_ar: null,
    success_en: null,
    team: null,
    open: true,
    opens_at: null,
    closes_at: null,
    max_responses: null,
    listed: true,
    archived: false,
    created_at: at(100),
    accepted_ar: "اتقبلت",
    accepted_url: "https://expo.ndtcorner.com/visitor",
    fields: [
      { id: "name", type: "name", label_ar: "الاسم بالكامل (بالعربي)", required: true },
      { id: "name_en", type: "text", label_ar: "الاسم بالإنجليزي", required: true },
      { id: "phone", type: "phone", label_ar: "رقم الموبايل (واتساب)", required: true },
    ],
  };
  const resp = (id: string, name: string, status: string, ref: string, done: string | null = null) => ({
    id,
    form_id: "f1",
    ref,
    answers: { name, name_en: "X", phone: "+201012345678" },
    name,
    phone: "+201012345678",
    email: null,
    locale: "ar",
    status,
    note: null,
    external_done_at: done,
    created_at: at(50),
  });
  const rows = [
    resp("r1", "منى عادل", "accepted", "F-1A2B3C4D"),
    resp("r2", "علي حسن", "accepted", "F-22222222", at(10)),
    resp("r3", "سارة", "new", "F-33333333"),
  ];
  const patches: unknown[] = [];
  await page.route(/\/rest\/v1\/forms/, (route) =>
    route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form],
    }),
  );
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

test("expo delegation: accepting registers the student with a number, and the delegation list goes out as PDF and Excel", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const form = {
    id: "f1",
    slug: "robotex-2026",
    title_ar: "زيارة معرض Robotex & NDTX 2026",
    title_en: null,
    intro_ar: null,
    intro_en: null,
    success_ar: null,
    success_en: null,
    team: null,
    open: true,
    opens_at: null,
    closes_at: null,
    max_responses: null,
    listed: true,
    archived: false,
    created_at: at(100),
    accepted_ar: "اتقبلت",
    accepted_url: null,
    capacity: 40,
    delegation: {
      event: "Robotex & NDTX Expo 2026",
      dates: "14–16 November 2026",
      venue: "EIEC, New Cairo",
      org: "BuildX HUE",
      lead_name: "Alaa Saber",
      lead_phone: "01011112222",
      meet_ar: "التجمع 8:30 قدام بوابة الجامعة",
      register_url: "https://expo.ndtcorner.com/visitor",
    },
    fields: [
      { id: "name", type: "name", label_ar: "الاسم بالكامل (بالعربي)", required: true },
      { id: "name_en", type: "text", label_ar: "الاسم بالإنجليزي", required: true },
      { id: "phone", type: "phone", label_ar: "رقم الموبايل (واتساب)", required: true },
      { id: "day", type: "select", label_ar: "اليوم", required: true, options: [{ ar: "السبت 14 نوفمبر" }] },
    ],
  };
  const resp = (id: string, name: string, en: string, status: string, no: number | null) => ({
    id,
    form_id: "f1",
    ref: `F-${id.toUpperCase()}000000`,
    answers: { name, name_en: en, org: "Horus University", day: "السبت 14 نوفمبر" },
    name,
    phone: "+201012345678",
    email: `${id}@example.com`,
    locale: "ar",
    status,
    note: null,
    external_done_at: null,
    member_no: no,
    accepted_at: no ? at(20) : null,
    created_at: at(50),
  });
  const rows = [
    resp("r2", "علي حسن", "Ali Hassan", "accepted", 2),
    resp("r1", "منى عادل", "Mona Adel", "accepted", 1),
    resp("r3", "سارة محمود", "Sara Mahmoud", "new", null),
  ];
  const patches: unknown[] = [];
  await page.route(/\/rest\/v1\/forms/, (route) =>
    route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form],
    }),
  );
  await page.route(/\/rest\/v1\/form_responses/, (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().postDataJSON());
      return route.fulfill({
        json: { ...rows[2], status: "accepted", member_no: 3, accepted_at: new Date().toISOString() },
      });
    }
    return route.fulfill({ json: rows });
  });
  await page.goto("/app/#/staff/forms/f1/responses");
  const card = page.getByTestId("delegation-card");
  await expect(card).toContainText("وفد المعرض: 2 مسجّل من 40");
  await expect(card).toContainText("فاضل 38 مكان");
  await expect(card.getByTestId("expo-registered")).toContainText("0 من 2");
  // Excel for the expo: formatted, in delegation order.
  let download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Excel لإدارة المعرض" }).click();
  let file = await download;
  expect(file.suggestedFilename()).toMatch(/^delegation-robotex-2026-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const xlsx = readFileSync((await file.path())!).toString("utf8");
  expect(xlsx).toContain("Delegation List");
  expect(xlsx).toContain("Alaa Saber");
  expect(xlsx.indexOf("Mona Adel")).toBeLessThan(xlsx.indexOf("Ali Hassan"));
  expect(xlsx).toContain("BX-001");
  expect(xlsx).not.toContain("Sara Mahmoud");
  expect(xlsx).toContain("+20 10 1234 5678");
  // The PDF.
  download = page.waitForEvent("download");
  await card.getByRole("button", { name: "PDF لإدارة المعرض" }).click();
  file = await download;
  expect(file.suggestedFilename()).toMatch(/^delegation-robotex-2026-\d{4}-\d{2}-\d{2}\.pdf$/);
  expect(
    readFileSync((await file.path())!)
      .subarray(0, 5)
      .toString(),
  ).toBe("%PDF-");
  // Accepting registers: a number comes back.
  await page.getByText("سارة محمود").click();
  await page.getByRole("dialog").getByRole("button", { name: "مقبول", exact: true }).click();
  await expect.poll(() => patches[0]).toEqual({ status: "accepted" });
  await expect(page.getByText("اتسجّل في الوفد برقم BX-003")).toBeVisible();
  const wa = page.getByRole("link", { name: "ابعتله رسالة القبول على واتساب" });
  const text = decodeURIComponent((await wa.getAttribute("href"))!.split("text=")[1]!);
  expect(text).toContain("رقمك في الوفد: BX-003");
  expect(text).toContain("التجمع 8:30 قدام بوابة الجامعة");
  expect(text).not.toContain("expo.ndtcorner.com");
  expect(text).toContain("البادج بيوصلك على إيميلك");
  // The team registers them on the expo's own site: details ready to copy, then «done».
  const reg = page.getByTestId("expo-register");
  await expect(reg).toContainText("Sara Mahmoud");
  await expect(reg).toContainText("01012345678");
  await expect(reg.getByRole("link", { name: /افتح صفحة التسجيل/ })).toHaveAttribute(
    "href",
    "https://expo.ndtcorner.com/visitor",
  );
  await reg.getByRole("switch", { name: /اتسجّل في موقع المعرض/ }).click();
  await expect
    .poll(() => (patches[1] as { external_done_at?: string } | undefined)?.external_done_at)
    .toMatch(/^\d{4}-/);
  expect(errors).toEqual([]);
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
const member = (o: object) => ({
  staff_id: "u3",
  name: "Omar Design",
  title: null,
  is_head: false,
  assigned: 2,
  on_time: 1,
  late: 0,
  missed: 1,
  open: 1,
  warnings: 1,
  ...o,
});
const assignee = (o: object) => ({
  staff_id: "u3",
  name: "Omar Design",
  state: "todo",
  note: null,
  link: null,
  submitted_at: null,
  late: false,
  feedback: null,
  reviewed_by_name: null,
  reviewed_at: null,
  missed_at: null,
  excused: false,
  due_at: null,
  checked: [],
  files: [],
  ...o,
});
const teamTask = (o: object) => ({
  id: "t1",
  sector_id: "sec1",
  sector_name: "الميديا",
  sector_color: "#ff7a45",
  title: "Event poster",
  description: "Instagram post for the workshop",
  link: null,
  priority: "high",
  due_at: later(30),
  warn_on_miss: true,
  status: "open",
  created_by_name: "Reem Media",
  created_at: at(60),
  checklist: [],
  repeat: "none",
  requests: [],
  comments: [],
  assignees: [
    assignee({ state: "submitted", note: "Done", link: "https://canva.com/x", submitted_at: at(5) }),
  ],
  ...o,
});

test("the owner makes a sector and picks its head and members", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await mockRpc(page, calls, {
    staff_sectors: {
      oversees: true,
      sectors: [],
      staff: [
        { user_id: "u1", name: "Owner Test", title: null },
        { user_id: "u2", name: "Reem Media", title: "هيد الميديا" },
        { user_id: "u3", name: "Omar Design", title: null },
      ],
    },
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
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_sector_members")?.body)
    .toEqual({
      p_sector: "sec1",
      p_members: [
        { staff_id: "u2", is_head: true },
        { staff_id: "u3", is_head: false },
      ],
    });
  expect(calls.find((c) => c.fn === "staff_sector_save")?.body).toEqual({
    p_id: null,
    p_name: "الميديا",
    p_description: "",
    p_color: "#2f7bff",
    p_archived: false,
  });
  expect(errors).toEqual([]);
});

test("a head gives the sector an urgent task, approves a hand-in and gives a warning", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await page.route(/\/rest\/v1\/staff/, (route) => {
    const row = {
      user_id: "u1",
      email: "reem@example.com",
      full_name: "Reem Media",
      role: "lead",
      active: true,
      created_at: at(9999),
      title: "هيد الميديا",
      permissions: ["site"],
    };
    return route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row],
    });
  });
  const sector = {
    id: "sec1",
    name: "الميديا",
    description: "",
    color: "#ff7a45",
    archived: false,
    is_head: true,
    leads: true,
    open_tasks: 1,
    to_review: 1,
    overdue: 0,
    warnings: 1,
    members: [
      member({ staff_id: "u1", name: "Reem Media", is_head: true, assigned: 0, warnings: 0 }),
      member({}),
    ],
  };
  await mockRpc(page, calls, {
    staff_my_summary: {
      open: 0,
      overdue: 0,
      due_soon: 0,
      warnings_unseen: 0,
      warnings_active: 0,
      sectors: 1,
      heads: 1,
      to_review: 1,
      oversees: false,
    },
    staff_sectors: { oversees: false, sectors: [sector], staff: [] },
    staff_sector_tasks: [teamTask({})],
    staff_warnings: [],
    staff_task_save: "t1",
    staff_task_points: null,
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
  await expect(page.getByTestId("task-points")).toHaveValue("30");
  await page.getByTestId("task-points").fill("50");
  await page.getByRole("checkbox", { name: "Omar Design" }).check();
  await page.getByRole("button", { name: "ابعت التاسك" }).click();
  // The supervisor's points are saved with the task.
  await expect.poll(() => calls.find((c) => c.fn === "staff_task_points")?.body).toEqual({ p_task: "t1", p_points: 50 });
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_task_save")?.body)
    .toMatchObject({
      p_id: null,
      p_sector: "sec1",
      p_title: "Workshop reel",
      p_priority: "urgent",
      p_assignees: ["u3"],
      p_warn: true,
    });
  // The task page: review Omar's hand-in, then a warning.
  await expect(page).toHaveURL(/#\/staff\/sectors\/sec1\/t1$/);
  await expect(page.getByText("https://canva.com/x")).toBeVisible();
  await page.getByRole("button", { name: "راجِع" }).click();
  await page.getByLabel("ملاحظة (بتوصله)").fill("Nice");
  await page.getByRole("button", { name: "اقبل" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_task_review")?.body)
    .toEqual({ p_task: "t1", p_staff: "u3", p_decision: "approved", p_feedback: "Nice" });
  await page.getByRole("button", { name: "إنذار", exact: true }).click();
  await page.getByRole("button", { name: "ابعت الإنذار" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_warning_give")?.body)
    .toEqual({
      p_staff: "u3",
      p_reason: "مسلّمش تاسك «Event poster» زي المطلوب.",
      p_sector: "sec1",
      p_task: "t1",
    });
  expect(errors).toEqual([]);
});

test("a member sees a late task and a new warning, then hands the task in", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await page.route(/\/rest\/v1\/staff/, (route) => {
    const row = {
      user_id: "u3",
      email: "omar@example.com",
      full_name: "Omar Design",
      role: "lead",
      active: true,
      created_at: at(9999),
      title: "عضو في الفريق",
      permissions: [],
    };
    return route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row],
    });
  });
  await mockRpc(page, calls, {
    staff_my_summary: {
      open: 1,
      overdue: 1,
      due_soon: 0,
      warnings_unseen: 1,
      warnings_active: 1,
      sectors: 1,
      heads: 0,
      to_review: 0,
      oversees: false,
    },
    staff_my_tasks: [
      teamTask({
        id: "t9",
        title: "Sponsor deck",
        due_at: at(120),
        assignees: [assignee({ missed_at: at(110) })],
      }),
    ],
    staff_warnings: [
      {
        id: "w1",
        staff_id: "u3",
        name: "Omar Design",
        sector_id: "sec1",
        sector_name: "الميديا",
        task_id: "t9",
        task_title: "Sponsor deck",
        kind: "missed",
        reason: "ما سلّمتش تاسك «Sponsor deck» في ميعاده.",
        issued_by_name: null,
        created_at: at(110),
        seen_at: null,
        cancelled_at: null,
        cancelled_by_name: null,
        cancel_note: null,
      },
    ],
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
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_task_submit")?.body)
    .toEqual({ p_task: "t9", p_note: "Deck ready", p_link: "https://drive.google.com/deck" });
  await expect(page.getByText("اتسلّم (متأخر)")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the owner sees every warning in the team and cancels one", async ({ page }) => {
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  const w = (id: string, name: string, o: object = {}) => ({
    id,
    staff_id: name,
    name,
    sector_id: "sec1",
    sector_name: "الميديا",
    task_id: null,
    task_title: null,
    kind: "manual",
    reason: "اتأخر على الاجتماع",
    issued_by_name: "Reem Media",
    created_at: at(60),
    seen_at: null,
    cancelled_at: null,
    cancelled_by_name: null,
    cancel_note: null,
    ...o,
  });
  await mockRpc(page, calls, {
    staff_warnings: [
      w("w1", "Omar Design"),
      w("w2", "Omar Design", { kind: "missed" }),
      w("w3", "Omar Design"),
      w("w4", "Sara Ops", { cancelled_at: at(10), cancelled_by_name: "Owner Test", cancel_note: "ظرف" }),
    ],
    staff_warning_cancel: { ok: true },
  });
  await page.goto("/app/#/staff/warnings");
  await expect(page.getByText("الأكتر إنذارات (آخر 90 يوم)")).toBeVisible();
  await expect(page.getByText("Sara Ops")).toHaveCount(0);
  await page.getByRole("button", { name: "إلغاء", exact: true }).first().click();
  await page.getByLabel("ليه؟ (بيوصله)").fill("كان عيان");
  await page.getByRole("button", { name: "إلغاء الإنذار" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_warning_cancel")?.body)
    .toEqual({ p_id: "w1", p_note: "كان عيان" });
});

/* ─── Notifications, founder's dashboard, requests, appeals, meetings ───── */

const summary = (o: object = {}) => ({
  open: 0,
  overdue: 0,
  due_soon: 0,
  warnings_unseen: 0,
  warnings_active: 0,
  sectors: 1,
  heads: 0,
  to_review: 0,
  requests: 0,
  appeals: 0,
  unread: 0,
  oversees: false,
  ...o,
});
async function signInAs(page: Page, row: object) {
  await page.route(/\/rest\/v1\/staff/, (route) => {
    const r = {
      user_id: "u1",
      email: "x@example.com",
      full_name: "Test",
      role: "lead",
      active: true,
      created_at: at(9999),
      title: null,
      permissions: [],
      ...row,
    };
    return route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? r : [r],
    });
  });
}

test("the bell shows unread notifications; opening one marks it read and goes to the task", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  await mockRpc(page, calls, {
    staff_my_summary: summary({ unread: 2 }),
    staff_notifications: {
      unread: 2,
      items: [
        {
          id: "n1",
          title: "تاسك جديد: Sponsor deck",
          body: "الميديا · آخر ميعاد 12/10 18:00",
          url: "/app/#/staff/mytasks",
          created_at: at(3),
          read: false,
        },
        { id: "n2", title: "📅 اجتماع: Weekly", body: "", url: null, created_at: at(90), read: true },
      ],
    },
    staff_notifications_read: { ok: true },
    staff_my_tasks: [],
    staff_warnings: [],
  });
  await page.goto("/app/#/staff");
  await expect(page.getByTestId("bell-count")).toHaveText("2");
  await page.getByRole("button", { name: /الإشعارات/ }).click();
  await expect(page).toHaveURL(/#\/staff\/notifications$/);
  await page.getByText("تاسك جديد: Sponsor deck").click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_notifications_read")?.body)
    .toEqual({ p_ids: ["n1"] });
  await expect(page).toHaveURL(/#\/staff\/mytasks$/);
  expect(errors).toEqual([]);
});

test("the founder's dashboard: the team at a glance, team rules, and naming the member of the month", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  const rules = {
    warn_threshold: 3,
    warn_window_days: 90,
    remind_hours: 24,
    grace_minutes: 0,
    auto_warn: true,
    meeting_absence_warn: false,
    weekly_report: true,
  };
  await mockRpc(page, calls, {
    staff_my_summary: summary({ oversees: true, appeals: 1 }),
    staff_overview: {
      team: { members: 7, in_sectors: 5, heads: 2, sectors: 2 },
      tasks: { given: 10, on_time: 7, late: 1, missed: 2, open: 4, overdue: 1, to_review: 2 },
      warnings: { active: 3, appeals: 1, requests: 1 },
      sectors: [
        {
          id: "sec1",
          name: "الميديا",
          color: "#ff7a45",
          members: 3,
          given: 6,
          done: 5,
          on_time: 4,
          missed: 1,
          overdue: 1,
          warnings: 2,
        },
      ],
      people: [
        {
          staff_id: "u3",
          name: "Omar Design",
          title: null,
          assigned: 4,
          on_time: 1,
          late: 1,
          missed: 2,
          warnings: 2,
        },
        {
          staff_id: "u4",
          name: "Sara Ops",
          title: null,
          assigned: 4,
          on_time: 4,
          late: 0,
          missed: 0,
          warnings: 0,
        },
      ],
      org: { students: 120, applications_new: 4, responses_new: 9 },
      rules,
    },
    staff_team_settings_save: rules,
    staff_month_scores: {
      month: "2026-10-01",
      award: null,
      people: [
        {
          staff_id: "u4",
          name: "Sara Ops",
          title: null,
          on_time: 4,
          late: 0,
          approved: 4,
          missed: 0,
          present: 2,
          absent: 0,
          warnings: 0,
          score: 22,
        },
      ],
    },
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
  await expect
    .poll(
      () =>
        (calls.find((c) => c.fn === "staff_team_settings_save")?.body as { p: { grace_minutes: number } })?.p
          .grace_minutes,
    )
    .toBe(30);
  await page.getByRole("button", { name: "اختار Sara Ops" }).click();
  await page.getByLabel("كلمة للفريق (اختياري)").fill("أحسن التزام");
  await page.getByRole("button", { name: "أعلن عضو الشهر" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_award_month")?.body)
    .toMatchObject({ p_staff: "u4", p_note: "أحسن التزام", p_certificate: true });
  expect(errors).toEqual([]);
});

test("a member ticks the steps, asks for more time and writes on the task; then appeals a warning", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  const task = teamTask({
    id: "t5",
    title: "Workshop reel",
    due_at: later(20),
    checklist: [
      { id: "a", text: "Shoot" },
      { id: "b", text: "Edit" },
    ],
    assignees: [assignee({})],
  });
  await mockRpc(page, calls, {
    staff_my_tasks: [task],
    staff_task: task,
    staff_warnings: [
      {
        id: "w9",
        staff_id: "u3",
        name: "Omar Design",
        sector_id: "sec1",
        sector_name: "الميديا",
        task_id: null,
        task_title: null,
        kind: "manual",
        reason: "اتأخر على الاجتماع",
        issued_by_name: "Reem Media",
        created_at: at(60),
        seen_at: at(30),
        cancelled_at: null,
        cancelled_by_name: null,
        cancel_note: null,
        appeal: null,
        appeal_at: null,
        appeal_status: null,
        appeal_note: null,
      },
    ],
    staff_task_check: { ok: true },
    staff_task_request: "r1",
    staff_task_comment: { ok: true },
    staff_warning_appeal: { ok: true },
  });
  await page.goto("/app/#/staff/mytasks");
  await page.getByRole("button", { name: /^Workshop reel/ }).click();
  await page.getByRole("checkbox", { name: "Shoot" }).check();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_task_check")?.body)
    .toEqual({ p_task: "t5", p_item: "a", p_done: true });
  await page.getByLabel("رسالة على التاسك").fill("ممكن أستخدم الكاميرا بتاعة المعمل؟");
  await page.getByRole("button", { name: "ابعت", exact: true }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_task_comment")?.body)
    .toEqual({ p_task: "t5", p_body: "ممكن أستخدم الكاميرا بتاعة المعمل؟" });
  await page.getByRole("button", { name: "اطلب مد الميعاد" }).click();
  await page.getByLabel("السبب").fill("عندي امتحان");
  await page.getByRole("button", { name: "ابعت الطلب" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_task_request")?.body)
    .toMatchObject({ p_task: "t5", p_kind: "extension", p_reason: "عندي امتحان" });
  // Close the task sheet and appeal the warning.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /ليك حق تتظلّم/ }).click();
  await page.getByLabel("ظرفك أو اعتراضك").fill("كنت مبلّغ الهيد قبلها إني هتأخر");
  await page.getByRole("button", { name: "ابعت التظلّم" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_warning_appeal")?.body)
    .toEqual({ p_id: "w9", p_text: "كنت مبلّغ الهيد قبلها إني هتأخر" });
  expect(errors).toEqual([]);
});

test("a head approves an extension with a new date; the owner accepts an appeal", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  const req = {
    id: "r1",
    staff_id: "u3",
    name: "Omar Design",
    kind: "extension",
    reason: "عندي امتحان",
    new_due: later(48),
    status: "pending",
    note: null,
    decided_by_name: null,
    created_at: at(10),
  };
  await mockRpc(page, calls, {
    staff_sectors: {
      oversees: true,
      sectors: [
        {
          id: "sec1",
          name: "الميديا",
          description: "",
          color: "#ff7a45",
          archived: false,
          is_head: false,
          leads: true,
          open_tasks: 1,
          to_review: 0,
          overdue: 0,
          warnings: 0,
          members: [member({})],
        },
      ],
      staff: [],
    },
    staff_task: { ...teamTask({ assignees: [assignee({})], requests: [req] }), leads: true },
    staff_task_request_decide: { ok: true },
    staff_warnings: [
      {
        id: "w9",
        staff_id: "u3",
        name: "Omar Design",
        sector_id: "sec1",
        sector_name: "الميديا",
        task_id: null,
        task_title: null,
        kind: "manual",
        reason: "اتأخر على الاجتماع",
        issued_by_name: "Reem Media",
        created_at: at(60),
        seen_at: at(30),
        cancelled_at: null,
        cancelled_by_name: null,
        cancel_note: null,
        appeal: "كنت مبلّغ الهيد",
        appeal_at: at(5),
        appeal_status: "pending",
        appeal_note: null,
      },
    ],
    staff_warning_appeal_decide: { ok: true },
  });
  await page.goto("/app/#/staff/sectors/sec1/t1");
  await expect(page.getByText("طلبات مستنية ردك")).toBeVisible();
  await page.getByRole("button", { name: "وافق", exact: true }).click();
  await page.getByLabel("ملاحظة (بتوصله، اختياري)").fill("بالتوفيق");
  await page.getByRole("button", { name: "وافق", exact: true }).last().click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_task_request_decide")?.body)
    .toMatchObject({ p_id: "r1", p_approve: true, p_note: "بالتوفيق" });
  await page.goto("/app/#/staff/warnings");
  await page.getByRole("button", { name: /^تظلّمات/ }).click();
  await page.getByRole("button", { name: "اقبل التظلّم" }).click();
  await page.getByLabel("ردك (بيوصله)").fill("مقبول");
  await page.getByRole("button", { name: "اقبل واشيل الإنذار" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_warning_appeal_decide")?.body)
    .toEqual({ p_id: "w9", p_accept: true, p_note: "مقبول" });
  expect(errors).toEqual([]);
});

test("meetings: the head schedules one and opens attendance; a member checks in from the QR link; minutes become a task", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  const meeting = (o: object) => ({
    id: "m1",
    sector_id: "sec1",
    sector_name: "الميديا",
    sector_color: "#ff7a45",
    title: "Weekly sync",
    agenda: "Plan the week",
    starts_at: later(1),
    place: "Lab",
    link: null,
    status: "open",
    code: "482913",
    minutes: null,
    leads: true,
    invited: 3,
    present: 1,
    mine: null,
    attendance: [{ staff_id: "u3", name: "Omar Design", status: null, method: null, note: null }],
    ...o,
  });
  const answers: Record<string, unknown> = {
    staff_sectors: {
      oversees: true,
      sectors: [
        {
          id: "sec1",
          name: "الميديا",
          description: "",
          color: "#ff7a45",
          archived: false,
          is_head: true,
          leads: true,
          open_tasks: 0,
          to_review: 0,
          overdue: 0,
          warnings: 0,
          members: [member({})],
        },
      ],
      staff: [],
    },
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
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_meeting_save")?.body)
    .toMatchObject({ p_id: null, p_sector: "sec1", p_title: "Weekly sync" });
  await expect(page).toHaveURL(/#\/staff\/meetings\/m1$/);
  await page.getByRole("button", { name: "اعرض كود الحضور" }).click();
  await expect(page.getByTestId("meeting-code")).toHaveText("482913");
  await page.getByRole("button", { name: "رجوع" }).last().click();
  await page.getByRole("button", { name: "اقفل واكتب المحضر" }).click();
  await page.getByLabel(/المحضر والقرارات/).fill("- Design the workshop post\n- Book the room");
  await page.getByRole("button", { name: "اقفل الاجتماع" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_meeting_close")?.body)
    .toEqual({ p_id: "m1", p_minutes: "- Design the workshop post\n- Book the room" });
  // After closing: the minutes, and a line becomes a task in the sector.
  answers.staff_meeting = meeting({
    status: "done",
    code: null,
    minutes: "- Design the workshop post\n- Book the room",
  });
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
    staff_meeting: {
      id: "m1",
      sector_id: "sec1",
      sector_name: "الميديا",
      sector_color: "#ff7a45",
      title: "Weekly sync",
      agenda: "",
      starts_at: at(5),
      place: null,
      link: null,
      status: "open",
      code: null,
      minutes: null,
      leads: false,
      invited: 3,
      present: 1,
      mine: null,
      attendance: null,
    },
    staff_meeting_checkin: { ok: true, status: "present" },
  });
  await page.goto("/app/#/staff/meetings/m1?code=482913");
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_meeting_checkin")?.body)
    .toEqual({ p_id: "m1", p_code: "482913" });
  await expect(page.getByText("اتسجّل حضورك ✓")).toBeVisible();
});

test("a head picks a template, adds steps and makes the task repeat weekly; the board shows the columns", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await mockRpc(page, calls, {
    staff_sectors: {
      oversees: true,
      sectors: [
        {
          id: "sec1",
          name: "الميديا",
          description: "",
          color: "#ff7a45",
          archived: false,
          is_head: true,
          leads: true,
          open_tasks: 1,
          to_review: 1,
          overdue: 0,
          warnings: 0,
          members: [member({})],
        },
      ],
      staff: [],
    },
    staff_sector_tasks: [teamTask({}), teamTask({ id: "t2", title: "Old poster", status: "closed" })],
    staff_warnings: [],
    staff_task_templates: [
      {
        id: "tp1",
        sector_id: "sec1",
        title: "Weekly post",
        description: "Post for the week",
        link: null,
        priority: "high",
        checklist: [{ id: "x", text: "Design" }],
        days: 2,
      },
    ],
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
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_task_extras")?.body)
    .toMatchObject({ p_task: "t9", p_repeat: "weekly" });
  const extras = calls.find((c) => c.fn === "staff_task_extras")?.body as { p_checklist: { text: string }[] };
  expect(extras.p_checklist.map((c) => c.text)).toEqual(["Design", "Publish"]);
  expect(calls.find((c) => c.fn === "staff_task_save")?.body).toMatchObject({
    p_title: "Weekly post",
    p_priority: "high",
  });
  expect(errors).toEqual([]);
});

/* ─── Baqloz in the app ─────────────────────────────────────────────────── */

test("Baqloz on the team home says what's on you, most urgent first, and takes you there", async ({
  page,
}) => {
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
      {
        kind: "meeting",
        rank: 4,
        id: "m1",
        title: "Weekly sync",
        at: later(3),
        place: "Lab",
        to: "/staff/meetings/m1",
      },
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

test("on other screens Baqloz waits in the corner and pops up about something forgotten", async ({
  page,
}) => {
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  await mockRpc(page, calls, {
    staff_reminders: [
      { kind: "meeting_open", rank: 1, id: "m1", title: "Weekly sync", at: at(5), to: "/staff/meetings/m1" },
    ],
    staff_notifications: { unread: 0, items: [] },
    staff_meeting: {
      id: "m1",
      sector_id: "sec1",
      sector_name: "الميديا",
      sector_color: "#ff7a45",
      title: "Weekly sync",
      agenda: "",
      starts_at: at(5),
      place: null,
      link: null,
      status: "open",
      code: null,
      minutes: null,
      leads: false,
      invited: 3,
      present: 1,
      mine: null,
      attendance: null,
    },
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
  await page.addInitScript(() =>
    localStorage.setItem(
      "rh-app-student",
      JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" }),
    ),
  );
  const rpcs: Record<string, unknown> = {
    student_home: {
      now: new Date().toISOString(),
      student: { name: "Mona Adel", code: "S1", group: "G1" },
      materials: [],
      quizzes: [
        {
          id: "q1",
          title: "Sensors quiz",
          description: "",
          opensAt: at(60),
          closesAt: later(5),
          timeLimit: null,
          maxAttempts: 1,
          questions: 5,
          maxScore: 5,
          used: 0,
          best: null,
          inProgress: null,
          state: "open",
        },
      ],
      attendance: [],
    },
    student_tasks: [
      {
        id: "a1",
        title: "Photo of your circuit",
        description: "",
        dueAt: at(60),
        maxPoints: 10,
        allowLate: true,
        submission: null,
      },
    ],
    student_schedule: [],
  };
  await page.route(/supabase\.co/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    return route.fulfill({ json: fn ? (rpcs[fn] ?? null) : [] });
  });
  await page.goto("/app/#/me");
  await expect(page.getByTestId("baqloz-line")).toContainText(
    "يا Mona، تاسك «Photo of your circuit» فات ميعاده",
  );
  await page.getByRole("button", { name: "اللي بعده" }).click();
  await expect(page.getByTestId("baqloz-line")).toContainText("كويز «Sensors quiz» مفتوح");
  await page.getByRole("button", { name: "ودّيني ←" }).click();
  await expect(page).toHaveURL(/#\/me\/quiz\/q1$/);
  expect(errors).toEqual([]);
});

const storeItem = (o: object) => ({
  id: "i1",
  name: "Arduino Uno",
  category: "بوردات",
  description: "",
  location: "الدولاب 1",
  quantity: 5,
  min_quantity: 2,
  unit: "قطعة",
  consumable: false,
  archived: false,
  low_notified_at: null,
  available: 3,
  out: 2,
  ...o,
});
const storeLoan = (o: object) => ({
  id: "l1",
  item_id: "i1",
  item_name: "Arduino Uno",
  unit: "قطعة",
  quantity: 2,
  staff_id: "u3",
  student_id: null,
  student_code: null,
  borrower_name: "Omar Design",
  purpose: "Line robot",
  due_at: later(5),
  status: "out",
  lent_by_name: "Owner Test",
  lent_at: at(60 * 24),
  returned_at: null,
  return_note: null,
  ...o,
});

test("the store keeper adds an item, lends it to a student, takes a loan back and approves a request", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await mockRpc(page, calls, {
    staff_inventory: {
      keeps: true,
      items: [
        storeItem({}),
        storeItem({
          id: "i2",
          name: "مقاومات 220",
          category: "قطع صغيرة",
          quantity: 8,
          min_quantity: 10,
          unit: "قطعة",
          consumable: true,
          available: 8,
          out: 0,
          low_notified_at: at(30),
        }),
      ],
      loans: [storeLoan({ due_at: at(120) })],
      requests: [
        {
          id: "r1",
          item_id: "i1",
          item_name: "Arduino Uno",
          staff_id: "u4",
          name: "Reem Media",
          quantity: 1,
          purpose: "Workshop demo",
          needed_until: later(48),
          status: "pending",
          note: null,
          available: 3,
          created_at: at(10),
        },
      ],
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
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_inventory_item_save")?.body)
    .toMatchObject({ p_id: null, p: { name: "Servo SG90", quantity: 10, consumable: false } });

  // Lend two to a student.
  await page.getByText("Arduino Uno").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "سلّف" }).click();
  await page.getByRole("button", { name: "طالب" }).click();
  await page.getByLabel("الطالب").selectOption("s1");
  await page.getByLabel("الكمية").fill("2");
  await page.getByRole("button", { name: "سجّل السلفة" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_inventory_lend")?.body)
    .toMatchObject({ p_item: "i1", p_qty: 2, p_student: "s1", p_staff: null });

  // A late loan comes back.
  await page.getByRole("button", { name: /برا المخزن/ }).click();
  await expect(page.getByText(/فات من/)).toBeVisible();
  await page.getByRole("button", { name: "رجعت", exact: true }).click();
  await page.getByRole("button", { name: "رجعت ✓" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_inventory_return")?.body)
    .toEqual({ p_loan: "l1", p_status: "returned", p_note: null });

  // A request is approved.
  await page.getByRole("button", { name: /الطلبات/ }).click();
  await expect(page.getByText("Workshop demo")).toBeVisible();
  await page.getByRole("button", { name: "وافق", exact: true }).click();
  await page.getByRole("button", { name: "وافق وسلّم" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_inventory_request_decide")?.body)
    .toMatchObject({ p_id: "r1", p_approve: true });
  expect(errors).toEqual([]);
});

test("a team member asks to borrow from the store, sees what they have, and Baqloz reminds them to return it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  await mockRpc(page, calls, {
    staff_reminders: [
      {
        kind: "loan_due",
        rank: 3,
        id: "l1",
        title: "Arduino Uno",
        count: 2,
        at: later(5),
        to: "/staff/inventory",
      },
    ],
    staff_inventory: {
      keeps: false,
      items: [
        storeItem({}),
        storeItem({
          id: "i3",
          name: "Soldering iron",
          category: "أدوات",
          available: 0,
          quantity: 1,
          out: 1,
          min_quantity: 0,
        }),
      ],
      loans: [storeLoan({})],
      requests: [],
      staff: null,
      students: null,
    },
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
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_inventory_request")?.body)
    .toMatchObject({ p_item: "i1", p_qty: 1, p_purpose: "Line follower" });
  await page.getByRole("button", { name: /حاجاتي/ }).click();
  await expect(page.getByText("Arduino Uno × 2")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a student sees what they borrowed from the store, and Baqloz reminds them when it's late", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "rh-app-student",
      JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" }),
    ),
  );
  const rpcs: Record<string, unknown> = {
    student_home: {
      now: new Date().toISOString(),
      student: { name: "Mona Adel", code: "S1", group: "G1" },
      materials: [],
      quizzes: [],
      attendance: [],
    },
    student_tasks: [],
    student_schedule: [],
    student_inventory: [
      {
        id: "l5",
        item: "Ultrasonic sensor",
        unit: "قطعة",
        quantity: 1,
        dueAt: at(60 * 26),
        status: "out",
        lentAt: at(60 * 24 * 8),
        returnedAt: null,
      },
    ],
  };
  await page.route(/supabase\.co/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    return route.fulfill({ json: fn ? (rpcs[fn] ?? null) : [] });
  });
  await page.goto("/app/#/me");
  await expect(page.getByTestId("baqloz-line")).toContainText(
    "«Ultrasonic sensor» اللي استلفتها من المخزن ميعادها فات",
  );
  await expect(page.getByTestId("student-loans")).toContainText("Ultrasonic sensor × 1");
  expect(errors).toEqual([]);
});

test("points and levels: the home card shows my level, the points screen my badges and the team table", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  const lvl = (level: number, name: string, from: number, next: number | null) => ({
    level,
    name,
    from,
    next,
  });
  await mockRpc(page, calls, {
    staff_reminders: [],
    staff_xp: {
      staff_id: "u3",
      name: "Omar Design",
      xp: 245,
      month: 60,
      rank: 2,
      level: lvl(2, "مسمار شاطر", 100, 250),
      badges: ["first_task", "streak_5"],
      parts: { tasks: 230, meetings: 15, store: 0, awards: 0, warnings: 0 },
      stats: {
        on_time: 5,
        late: 1,
        approved: 6,
        missed: 1,
        present: 1,
        meeting_late: 0,
        absent: 0,
        warnings: 0,
        awards: 0,
        returned: 0,
        streak: 5,
      },
    },
    staff_xp_board: [
      {
        staff_id: "u2",
        name: "Reem Media",
        title: null,
        xp: 900,
        month: 20,
        level: lvl(5, "موتور شغّال", 700, 1000),
        badges: ["member_of_month"],
        me: false,
      },
      {
        staff_id: "u3",
        name: "Omar Design",
        title: null,
        xp: 245,
        month: 60,
        level: lvl(2, "مسمار شاطر", 100, 250),
        badges: ["first_task", "streak_5"],
        me: true,
      },
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

test("Ask Baqloz: he answers about my points himself and asks the AI the rest, then takes me to the page it names", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await signInAs(page, { user_id: "u3", full_name: "Omar Design" });
  await mockRpc(page, calls, {
    staff_reminders: [
      { kind: "due_soon", rank: 3, id: "t7", title: "Sponsor deck", at: later(5), to: "/staff/mytasks?t=t7" },
    ],
    staff_xp: {
      staff_id: "u3",
      name: "Omar Design",
      xp: 245,
      month: 60,
      rank: 2,
      level: { level: 2, name: "مسمار شاطر", from: 100, next: 250 },
      badges: [],
      parts: null,
      stats: null,
    },
    staff_inventory: { keeps: false, items: [], loans: [], requests: [], staff: null, students: null },
  });
  const asked: { body: { question: string; history: unknown[] }; auth: string | undefined }[] = [];
  await page.route(/\/functions\/v1\/bakloz-app$/, (route) => {
    asked.push({ body: route.request().postDataJSON(), auth: route.request().headers().authorization });
    return route.fulfill({
      json: { text: "حساس الألتراسونيك HC-SR04 مناسب للمسافة، واطلبه من المخزن 📦\n[[/staff/inventory]]" },
    });
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

test("Ask Baqloz in the student app: what's on me, and a friendly answer when the AI is off", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "rh-app-student",
      JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" }),
    ),
  );
  const rpcs: Record<string, unknown> = {
    student_home: {
      now: new Date().toISOString(),
      student: { name: "Mona Adel", code: "S1", group: "G1" },
      materials: [],
      quizzes: [],
      attendance: [],
    },
    student_tasks: [
      {
        id: "a1",
        title: "Photo of your circuit",
        description: "",
        dueAt: later(20),
        maxPoints: 10,
        allowLate: true,
        submission: null,
      },
    ],
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

test("delegation: pick several and accept them at once, send the WhatsApp messages one by one, then mark arrivals on the day", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const form = {
    id: "f1",
    slug: "robotex-2026",
    title_ar: "زيارة معرض Robotex & NDTX 2026",
    title_en: null,
    intro_ar: null,
    intro_en: null,
    success_ar: null,
    success_en: null,
    team: null,
    open: true,
    opens_at: null,
    closes_at: null,
    max_responses: null,
    listed: true,
    archived: false,
    created_at: at(100),
    accepted_ar: "اتقبلت",
    accepted_url: null,
    capacity: null,
    delegation: {
      event: "Robotex & NDTX Expo 2026",
      dates: "14–16 November 2026",
      venue: "EIEC",
      org: "BuildX HUE",
      meet_ar: "",
    },
    fields: [{ id: "name", type: "name", label_ar: "الاسم", required: true }],
  };
  const resp = (id: string, name: string, status: string, no: number | null, extra: object = {}) => ({
    id,
    form_id: "f1",
    ref: `F-${id.toUpperCase().padEnd(8, "0")}`,
    answers: { name, day: "السبت 14 نوفمبر" },
    name,
    phone: "+201012345678",
    email: null,
    locale: "ar",
    status,
    note: null,
    external_done_at: null,
    member_no: no,
    accepted_at: no ? at(20) : null,
    checked_in_at: null,
    messaged_at: null,
    created_at: at(50 - no!),
    ...extra,
  });
  const rows = [
    resp("a1", "منى عادل", "accepted", 1),
    resp("b2", "علي حسن", "new", null),
    resp("c3", "سارة محمود", "new", null),
  ];
  const patches: { id: string; body: Record<string, unknown> }[] = [];
  let next = 2;
  await page.route(/\/rest\/v1\/forms/, (route) =>
    route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form],
    }),
  );
  await page.route(/\/rest\/v1\/form_responses/, (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH") {
      const id = url.searchParams.get("id")!.replace("eq.", "");
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patches.push({ id, body });
      const row = rows.find((r) => r.id === id)!;
      Object.assign(row, body, body.status === "accepted" && !row.member_no ? { member_no: next++ } : {});
      return route.fulfill({
        json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [],
      });
    }
    const accepted = url.searchParams.get("status") === "eq.accepted";
    return route.fulfill({ json: accepted ? rows.filter((r) => r.status === "accepted") : rows });
  });
  await page.goto("/app/#/staff/forms/f1/responses");
  // Pick the two new ones and accept them together.
  await page.getByRole("button", { name: "تحديد أكتر من واحد" }).click();
  await page.getByText("علي حسن").click();
  await page.getByText("سارة محمود").click();
  await page.getByTestId("bulk-bar").getByRole("button", { name: "اقبل" }).click();
  await expect
    .poll(() =>
      patches
        .filter((p) => p.body.status === "accepted")
        .map((p) => p.id)
        .sort(),
    )
    .toEqual(["b2", "c3"]);
  await expect(page.getByTestId("delegation-card")).toContainText("وفد المعرض: 3 مسجّل");
  // The message queue: one tap each, remembered.
  await page.getByRole("button", { name: /رسايل القبول \(3\)/ }).click();
  const queue = page.getByTestId("message-queue");
  const send = queue.getByRole("link", { name: "ابعت" }).first();
  await expect(send).toHaveAttribute("href", /wa\.me\/201012345678/);
  await send.evaluate((a) => a.removeAttribute("target"));
  await send.evaluate((a) => a.addEventListener("click", (e) => e.preventDefault()));
  await send.click();
  await expect.poll(() => patches.some((p) => typeof p.body.messaged_at === "string")).toBe(true);
  await page.keyboard.press("Escape");
  // The day: scan (here: type) the pass, then a second time says "already".
  await page.getByRole("button", { name: "حضور يوم الزيارة" }).click();
  await expect(page).toHaveURL(/#\/staff\/forms\/f1\/checkin$/);
  await page
    .getByLabel("رقم الوفد أو كود الطلب")
    .fill("https://buildxhue.com/ar/robotex/?ref=F-A1000000#status");
  await page.getByRole("button", { name: "سجّل", exact: true }).click();
  await expect(page.getByTestId("checkin-result")).toContainText("منى عادل (BX-001) وصل");
  await page.getByLabel("رقم الوفد أو كود الطلب").fill("bx-001");
  await page.getByRole("button", { name: "سجّل", exact: true }).click();
  await expect(page.getByTestId("checkin-result")).toContainText("متسجّل من قبل");
  await page.getByLabel("رقم الوفد أو كود الطلب").fill("BX-099");
  await page.getByRole("button", { name: "سجّل", exact: true }).click();
  await expect(page.getByTestId("checkin-result")).toContainText("مش في الوفد");
  expect(errors).toEqual([]);
});

/** A short tone as a WAV file (what someone would upload). */
function toneWav(seconds = 1.2, rate = 16000) {
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  // Silence, then talking (a tone), then silence again: the silence is cut off.
  for (let i = 0; i < n; i++) {
    const talking = i > n * 0.3 && i < n * 0.7;
    buf.writeInt16LE(talking ? Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 12000) : 0, 44 + i * 2);
  }
  return buf;
}

test("Baqloz's voice: a team member uploads a recording for a line, it's cleaned and saved, and the next line opens", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const lines = voiceLines();
  const uploads: string[] = [];
  const saved: Record<string, unknown>[] = [];
  await page.route("**/voice/manifest.json", (route) => route.fulfill({ json: { clips: [lines[1]!.key] } }));
  await page.route(/\/rest\/v1\/voice_clips/, (route) => {
    if (route.request().method() === "POST")
      saved.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ json: [] });
  });
  await page.route(/\/storage\/v1\/object\/voice\//, (route) => {
    uploads.push(decodeURIComponent(new URL(route.request().url()).pathname.split("/object/voice/")[1]!));
    return route.fulfill({ json: { Key: "voice/x", Id: "x" } });
  });
  await page.goto("/app/#/staff/voice");
  await expect(page.getByText(`0 من ${lines.length} جملة بصوتكم`)).toBeVisible();
  const list = page.getByTestId("voice-lines");
  await expect(list.getByRole("button").nth(1)).toContainText("صوت آلي");
  await list.getByRole("button").first().click();
  const sheet = page.getByTestId("voice-recorder");
  await expect(sheet).toContainText(lines[0]!.text);
  await sheet
    .getByTestId("voice-file")
    .setInputFiles({ name: "line.wav", mimeType: "audio/wav", buffer: toneWav() });
  // The silence around the talking is cut: about half a second is left (a little higher with the Baqloz effect).
  await expect(sheet.getByTestId("voice-take")).toContainText(/\(0\.\d+ ث\)/);
  await sheet.getByRole("button", { name: "احفظ واللي بعدها" }).click();
  await expect.poll(() => uploads.length).toBe(1);
  expect(uploads[0]).toMatch(new RegExp(`^${lines[0]!.key}/\\d+\\.wav$`));
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0]).toMatchObject({
    key: lines[0]!.key,
    line: lines[0]!.said,
    path: uploads[0],
    active: true,
  });
  // The next line (still in the generated voice) opens straight away.
  await expect(page.getByTestId("voice-recorder")).toContainText(lines[1]!.text);
  expect(errors).toEqual([]);
});

test("the owner can give someone only Baqloz's voice", async ({ page }) => {
  await signInAsOwner(page);
  await signInAs(page, { role: "lead", title: "صوت بقلظ", permissions: ["voice"] });
  await page.goto("/app/#/staff/more");
  await expect(
    page
      .getByRole("link", { name: /صوت بقلظ/ })
      .or(page.getByRole("button", { name: /صوت بقلظ/ }))
      .first(),
  ).toBeVisible();
  await page.goto("/app/#/staff/site");
  await expect(page.getByText("القسم ده مش من صلاحياتك")).toBeVisible();
});

test("website pages: open and close the expo form from its card, then reorder the expo page by dragging, add a part and save", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const form = {
    id: "f1",
    slug: "robotex-2026",
    title_ar: "زيارة معرض Robotex & NDTX 2026",
    open: true,
    archived: false,
    opens_at: null,
    closes_at: null,
    created_at: at(100),
  };
  const formPatches: unknown[] = [];
  const saved: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/forms/, (route) => {
    if (route.request().method() === "PATCH") {
      formPatches.push(route.request().postDataJSON());
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ json: [form] });
  });
  await page.route(/\/rest\/v1\/site_pages/, (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      saved.push(body);
      return route.fulfill({ json: { id: "p1", archived: false, updated_at: at(0), ...body } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/app/#/staff/pages");
  const card = page.getByTestId("page-card").first();
  await expect(card).toContainText("الأصلية");
  // The expo form closes from here.
  await card.getByTestId("form-switch").getByRole("switch").click();
  await expect.poll(() => formPatches[0]).toEqual({ open: false });
  // Open the expo page: its parts, in order.
  await card
    .getByRole("button", { name: /زيارة معرض Robotex/ })
    .first()
    .click();
  await expect(page).toHaveURL(/#\/staff\/pages\/robotex$/);
  const blocks = page.getByTestId("page-blocks").getByTestId("block-card");
  await expect(blocks).toHaveCount(9);
  await expect(blocks.nth(1)).toContainText("معرضين في مكان واحد");
  // Keyboard: the areas go above "about".
  await blocks.nth(2).getByRole("button", { name: "اسحب عشان ترتّب" }).press("ArrowUp");
  await expect(blocks.nth(1)).toContainText("أهم مجالات المعرض");
  // Drag with the mouse (or a finger): "check your application" goes above the steps.
  await blocks.nth(5).scrollIntoViewIfNeeded();
  const handle = blocks.nth(5).getByRole("button", { name: "اسحب عشان ترتّب" });
  const from = (await handle.boundingBox())!;
  const to = (await blocks.nth(3).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++)
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y + 6 - from.y) * i) / 12);
  await page.mouse.up();
  await expect(blocks.nth(3)).toContainText("اعرف حالة طلبك");
  // Add a part and save: the page is saved (and stays published) with the new order.
  await page.getByRole("button", { name: "ضيف جزء" }).click();
  await page.getByTestId("block-palette").getByRole("button", { name: /فيديو/ }).click();
  await expect(blocks).toHaveCount(10);
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect.poll(() => saved.length).toBe(1);
  const order = (saved[0]!.blocks as { id: string; type: string }[]).map((b) => b.type);
  expect(order.slice(0, 5)).toEqual(["hero", "cards", "cards", "status", "steps"]);
  expect((saved[0]!.blocks as { id: string }[])[1]!.id).toBe("areas");
  expect(order.at(-1)).toBe("video");
  expect(saved[0]).toMatchObject({ slug: "robotex", published: true });
  // The preview draws the page.
  await page.getByRole("button", { name: "معاينة" }).click();
  await expect(page.getByTestId("page-preview").getByRole("heading", { level: 1 })).toContainText("Robotex");
  expect(errors).toEqual([]);
});

test("a new page from the expo template starts as a draft with its own address", async ({ page }) => {
  await signInAsOwner(page);
  const saved: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/site_pages/, (route) => {
    if (route.request().method() === "POST") {
      saved.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({ json: { id: "p9" } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/app/#/staff/pages");
  await page.getByRole("button", { name: "صفحة جديدة" }).first().click();
  await page.getByLabel("اسم الصفحة").fill("زيارة Cairo ICT");
  await page.getByLabel("الرابط").fill("cairo-ict");
  await page.getByRole("button", { name: /زيارة معرض \(زي Robotex\)/ }).click();
  await page.getByRole("button", { name: "اعمل الصفحة" }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0]).toMatchObject({ slug: "cairo-ict", title_ar: "زيارة Cairo ICT", published: false });
  const blocks = saved[0]!.blocks as { type: string; form?: string; title?: { ar: string } }[];
  expect(blocks[0]!.title!.ar).toBe("زيارة Cairo ICT");
  expect(blocks.find((b) => b.type === "form")!.form).toBe("");
  await expect(page).toHaveURL(/#\/staff\/pages\/p9$/);
});

test("after the visit: who didn't come gets a warning (a block if they had one), and a ban or a warning can be lifted", async ({
  page,
}) => {
  await signInAsOwner(page);
  const form = {
    id: "f1",
    slug: "robotex-2026",
    title_ar: "زيارة معرض Robotex",
    delegation: { event: "Robotex" },
    capacity: null,
  };
  const rows = [
    {
      id: "a1",
      ref: "F-A1000000",
      name: "منى عادل",
      phone: "+201012345678",
      status: "accepted",
      member_no: 1,
      checked_in_at: at(60),
      answers: {},
    },
    {
      id: "b2",
      ref: "F-B2000000",
      name: "علي حسن",
      phone: "+201099999999",
      status: "accepted",
      member_no: 2,
      checked_in_at: null,
      answers: {},
    },
  ];
  const calls: { apply: unknown }[] = [];
  await page.route(/\/rest\/v1\/forms/, (route) =>
    route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form],
    }),
  );
  await page.route(/\/rest\/v1\/form_responses/, (route) => route.fulfill({ json: rows }));
  await page.route(/\/rpc\/staff_delegation_no_shows/, (route) => {
    const body = route.request().postDataJSON() as { p_apply: boolean };
    calls.push({ apply: body.p_apply });
    return route.fulfill({
      json: {
        people: [
          { id: "b2", name: "علي حسن", phone: "+201099999999", no: 2, banned: false, warned: true },
          { id: "b3", name: "منى عادل", phone: "+201088888888", no: 3, banned: false, warned: false },
        ],
        applied: body.p_apply ? 1 : 0,
        warned: body.p_apply ? 1 : 0,
      },
    });
  });
  await page.goto("/app/#/staff/forms/f1/checkin");
  const box = page.getByTestId("no-shows");
  await expect(box).toContainText("اللي مجوش (1)");
  // A first no-show gets a warning; one who already had a warning is blocked.
  await box.getByRole("button", { name: "إنذار / حظر للي مجوش" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("إنذار: منى عادل (BX-003)");
  await expect(dialog).toContainText("حظر: علي حسن (BX-002)");
  await dialog.getByRole("button", { name: "تمام" }).click();
  await expect.poll(() => calls.map((c) => c.apply)).toEqual([false, true]);
  await expect(page.getByText("اتعمل إنذار لـ 1 وحظر لـ 1")).toBeVisible();
  // The bans list, with "lift".
  let lifted: unknown = null;
  await page.route(/\/rest\/v1\/community_bans/, (route) =>
    route.fulfill({
      json: [
        {
          id: "x1",
          name: "علي حسن",
          phone: "+201099999999",
          reason: "اتقبل في وفد «زيارة معرض Robotex» ومحضرش",
          created_at: at(5),
          lifted_at: null,
          student_id: "s2",
        },
      ],
    }),
  );
  await page.route(
    /\/rpc\/staff_lift_ban/,
    (route) => ((lifted = route.request().postDataJSON()), route.fulfill({ json: null })),
  );
  await page.goto("/app/#/staff/bans");
  await expect(page.getByText("اتقبل في وفد «زيارة معرض Robotex» ومحضرش")).toBeVisible();
  await page.getByRole("button", { name: "فك الحظر" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "فك الحظر" }).click();
  await expect.poll(() => lifted).toEqual({ p_id: "x1", p_restore: true });
  // The warnings, with "remove".
  let unwarned: unknown = null;
  await page.route(/\/rest\/v1\/community_strikes/, (route) =>
    route.fulfill({ json: [{ id: "k1", name: "منى عادل", phone: "+201088888888", reason: "اتسجل في «ورشة Arduino» ومجاش", created_at: at(60), outcome: "warning" }] }),
  );
  await page.route(/\/rpc\/staff_lift_strike/, (route) => ((unwarned = route.request().postDataJSON()), route.fulfill({ json: null })));
  await page.reload();
  await page.getByRole("button", { name: /عليهم إنذار/ }).click();
  await expect(page.getByTestId("strike-row")).toContainText("اتسجل في «ورشة Arduino» ومجاش");
  await page.getByRole("button", { name: "شيل الإنذار" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "شيل الإنذار" }).click();
  await expect.poll(() => unwarned).toEqual({ p_id: "k1" });
});

/* ─── View only, the permission table, WhatsApp ───────────────────────────── */

test("view only: the section opens with a note, and changes are stopped before they reach the database", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const writes: string[] = [];
  await signInAsOwner(page);
  await signInAs(page, { title: "متابع", permissions: ["applications:view", "inbox:view", "events"] });
  await page.route(/\/rest\/v1\/inbox_messages/, (route) => {
    if (route.request().method() !== "GET") writes.push(route.request().method());
    return route.fulfill({
      json: [
        {
          id: "m1",
          kind: "contact",
          name: "Sara Ali",
          email: "sara@example.com",
          phone: null,
          subject: "Hello",
          body: "A question",
          status: "new",
          created_at: at(30),
          meta: {},
        },
      ],
      headers: { "content-range": "0-0/1" },
    });
  });
  await page.goto("/app/#/staff/more");
  await expect(page.getByText("طلبات الانضمام", { exact: true })).toBeVisible();
  await expect(page.getByText("رسائل الموقع وطلبات الرعاية")).toBeVisible();
  await page.goto("/app/#/staff/inbox");
  await expect(page.getByTestId("view-only")).toBeVisible();
  // A full area has no note.
  await page.goto("/app/#/staff/events");
  await expect(page.getByTestId("view-only")).toHaveCount(0);
  // An area they don't have at all stays closed.
  await page.goto("/app/#/staff/students");
  await expect(page.getByText("القسم ده مش من صلاحياتك")).toBeVisible();
  // Opening a new message doesn't mark it read for them, and a change is stopped with a clear message.
  await page.goto("/app/#/staff/inbox");
  await expect(page.getByTestId("view-only")).toBeVisible();
  await page.getByText("Sara Ali").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "أرشيف", exact: true }).click();
  await expect(page.getByText("صلاحيتك هنا مشاهدة بس").first()).toBeVisible();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("the owner's table shows who has what, area by area", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  const areas = (o: Record<string, string>) => ({
    roster: "none",
    applications: "none",
    whatsapp: "none",
    expo: "none",
    ...o,
  });
  await mockRpc(page, calls, {
    staff_permission_matrix: [
      {
        user_id: "u1",
        name: "Owner Test",
        role: "owner",
        title: null,
        full: true,
        areas: areas({ roster: "full", applications: "full", whatsapp: "full", expo: "full" }),
      },
      {
        user_id: "u2",
        name: "Mona Viewer",
        role: "lead",
        title: "متابع",
        full: false,
        areas: areas({ applications: "view", expo: "full" }),
      },
    ],
  });
  await page.goto("/app/#/staff/more");
  await page.getByText("مين عنده إيه (مقارنة صلاحيات الفريق)").click();
  const table = page.getByTestId("permission-matrix");
  await expect(table.getByText("Mona Viewer")).toBeVisible();
  const mona = table.getByRole("row", { name: /Mona Viewer/ });
  await expect(mona.locator("td[data-level=view]")).toHaveCount(1);
  await expect(mona.locator("td[data-level=full]")).toHaveCount(1);
  await expect(page.getByText("كل صلاحية بتسمح بإيه")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the owner connects WhatsApp (the token is sent once, never shown) and sends to typed numbers", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  let state: "none" | "checking" | "ok" = "none";
  const status = () => ({
    connected: state === "ok",
    status: state,
    phone_number_id: state === "none" ? null : "123456789012345",
    business_id: null,
    display_phone: state === "ok" ? "+20 10 0000 0000" : null,
    verified_name: state === "ok" ? "BuildX HUE" : null,
    quality: null,
    error: null,
    checked_at: null,
    templates:
      state === "ok"
        ? [{ name: "expo_reminder", language: "ar", body: "أهلًا {{1}}، معادنا بكرة الساعة {{2}}" }]
        : [],
    has_token: state !== "none",
    sent_today: 0,
    failed_today: 0,
    can_send: true,
    can_connect: true,
  });
  await page.route(/\/rest\/v1\/rpc\/staff_whatsapp_[a-z]+$/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    calls.push({ fn, body: route.request().postDataJSON() });
    if (fn === "staff_whatsapp_connect") state = "checking";
    else if (
      fn === "staff_whatsapp_status" &&
      state === "checking" &&
      calls.filter((c) => c.fn === "staff_whatsapp_status").length > 2
    )
      state = "ok";
    if (fn === "staff_whatsapp_send") return route.fulfill({ json: { queued: 2, skipped: 1 } });
    return route.fulfill({ json: fn === "staff_whatsapp_status" ? status() : { ok: true } });
  });
  await page.goto("/app/#/staff/whatsapp");
  // Not connected: WhatsApp Web is first; the official connection is the other tab.
  await expect(page.getByTestId("wa-web")).toBeVisible();
  await page.getByRole("tab", { name: "ربط رسمي (API)" }).click();
  await expect(page.getByTestId("wa-connect")).toBeVisible();
  await page.getByLabel("Phone number ID").fill("123456789012345");
  await page.getByLabel("Access token").fill("EAAB" + "x".repeat(60));
  await page.getByRole("button", { name: "اربط" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_whatsapp_connect")?.body)
    .toEqual({ p_phone_number_id: "123456789012345", p_token: "EAAB" + "x".repeat(60), p_business_id: null });
  await expect(page.getByTestId("wa-status").getByText("مربوط")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("BuildX HUE")).toBeVisible();
  // The token never comes back: the field is empty and the status never carries it.
  await page.getByRole("button", { name: "تغيير الربط" }).click();
  await expect(page.getByLabel("Access token")).toHaveValue("");
  await page.getByRole("button", { name: "إلغاء" }).click();
  // A template to typed numbers: {{1}} is each person's name.
  await page.getByLabel("الأرقام").fill("Ahmed, 01012345678\n01198765432\nbad");
  await page.getByLabel("{{2}}").fill("9 الصبح");
  await page.getByRole("button", { name: "ابعت" }).click();
  await page.locator('[role="dialog"] button', { hasText: "ابعت" }).last().click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_whatsapp_send")?.body)
    .toEqual({
      p_people: [
        { phone: "01012345678", name: "Ahmed" },
        { phone: "01198765432", name: "" },
      ],
      p_text: null,
      p_template: "expo_reminder",
      p_lang: "ar",
      p_params: ["{name}", "9 الصبح"],
      p_context: null,
    });
  await expect(page.getByText("اتبعت لـ 2")).toBeVisible();
  expect(errors).toEqual([]);
});

test("WhatsApp says why messages fail (templates Meta won't give, the last refused message) and the automatic messages pick an approved template", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const rules = [
    { key: "application_received", section: "join", label_ar: "استلام طلب الانضمام", hint_ar: "أول ما حد يبعت فورم الانضمام", vars_ar: "{{1}} الاسم الأول · {{2}} كود الطلب", template: "bx_join_received", lang: "ar", enabled: true, ok: false, bulk: false, sent: 3 },
    { key: "application_review", section: "join", label_ar: "الطلب تحت المراجعة", template: "bx_application_received_v4", lang: "ar", enabled: true, ok: true, waiting: "bx_join_review_v5", bulk: false },
    { key: "family_joined", section: "family", label_ar: "استلام تسجيل الأسرة", template: "bx_join_received", lang: "ar", enabled: true, ok: false, bulk: false },
    { key: "form_received", section: "forms", label_ar: "استلام رد على فورم", template: "bx_form_received_v5", lang: "ar", enabled: true, ok: false, waiting: "bx_form_received_v5", bulk: false },
    { key: "event_published", section: "events", label_ar: "فعالية جديدة لكل الطلاب", template: "bx_application_received_v4", lang: "ar", enabled: false, ok: true, bulk: true, audience: 42 },
    { key: "certificate_issued", section: "students", label_ar: "شهادة جديدة", template: null, lang: "ar", enabled: false, ok: false, bulk: false },
    { key: "send_failed_alert", section: "team", label_ar: "تنبيه لما رسالة تفشل", template: "bx_application_received_v4", lang: "ar", enabled: false, ok: true, bulk: false, to_phone: null },
  ] as Record<string, unknown>[];
  const sets: unknown[] = [];
  await page.route(/\/rest\/v1\/rpc\/staff_wa_auto_(rules|set|template|phone)$/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "staff_wa_auto_rules") return route.fulfill({ json: rules });
    const b = route.request().postDataJSON() as { p_key: string; p_template?: string; p_lang?: string; p_enabled?: boolean; p_phone?: string };
    sets.push({ fn, ...b });
    const r = rules.find((x) => x.key === b.p_key)!;
    if (b.p_template) Object.assign(r, { template: b.p_template, lang: b.p_lang, ok: true });
    if (b.p_enabled !== undefined) r.enabled = b.p_enabled;
    if (b.p_phone) r.to_phone = "20" + b.p_phone.slice(1);
    return route.fulfill({ status: 204, body: "" });
  });
  const ours = [
    { name: "bx_join_received_v5", lang: "ar", category: "UTILITY", body: "أهلًا {{1}}، استلمنا طلب انضمامك لأسرة BuildX HUE ✅", moments: ["application_received"], status: "APPROVED", error: null, submitted_at: at(60) },
    { name: "bx_join_review_v5", lang: "ar", category: "UTILITY", body: "أهلًا {{1}}، طلبك تحت المراجعة.", moments: ["application_review"], status: "PENDING", error: null, submitted_at: at(60) },
    { name: "bx_certificate_ready_v5", lang: "ar", category: "UTILITY", body: "مبروك يا {{1}} 🎓 شهادتك جاهزة.", moments: [], status: "REJECTED", error: "INCORRECT_CATEGORY", submitted_at: at(60) },
    { name: "bx_loan_overdue_v5", lang: "ar", category: "UTILITY", body: "أهلًا {{1}}، ميعاد رجوع «{{2}}» عدّى.", moments: ["loan_overdue"], status: "NEW", error: null, submitted_at: null },
    { name: "bx_form_pass_v5", lang: "ar", category: "UTILITY", body: "مبروك 🎉 تم قبولك في «{{1}}».", moments: ["form_accepted"], button: "الـ QR بتاعي", status: "PENDING", error: null, submitted_at: at(5) },
  ] as Record<string, unknown>[];
  let submitted = 0;
  await page.route(/\/rest\/v1\/rpc\/staff_wa_templates(_submit)?$/, (route) => {
    if (route.request().url().endsWith("_submit")) {
      submitted++;
      ours[3].status = "PENDING";
      return route.fulfill({ json: 1 });
    }
    return route.fulfill({ json: ours });
  });
  await page.route(/\/rest\/v1\/rpc\/staff_whatsapp_status$/, (route) =>
    route.fulfill({
      json: {
        connected: true,
        status: "ok",
        phone_number_id: "123456789012345",
        business_id: "1214964801478471",
        display_phone: "+20 10 0000 0000",
        verified_name: "BuildX HUE",
        quality: "GREEN",
        error: null,
        checked_at: null,
        templates: [{ name: "bx_application_received_v4", language: "ar", body: "مرحبًا، نؤكد استلام طلب انضمامك إلى أسرة BuildX HUE." }],
        templates_error: "(#100) Tried accessing nonexisting field (message_templates)",
        has_token: true,
        sent_today: 0,
        failed_today: 3,
        last_failed: { error: "(#132001) Template name does not exist in the translation", template: "bx_join_received", at: at(30), count: 7 },
        can_send: true,
        can_connect: true,
      },
    }),
  );
  await page.goto("/app/#/staff/whatsapp");
  await page.getByRole("tab", { name: "ربط رسمي (API)" }).click();
  const tpl = page.getByTestId("wa-templates-error");
  await expect(tpl).toContainText("القوالب مش بتتقري من ميتا");
  await expect(tpl).toContainText("مش رقم البيزنس");
  const last = page.getByTestId("wa-last-failed");
  await expect(last).toContainText("7 رسالة فشلت في آخر 24 ساعة");
  await expect(last).toContainText("bx_join_received");
  await expect(last).toContainText("Assign assets");
  await expect(last).toContainText("#132001");

  // Automatic messages: a template that isn't approved is flagged; picking an approved one saves it, and a switch turns one off.
  const received = page.getByTestId("wa-auto-rule").filter({ hasText: "استلام طلب الانضمام" });
  await expect(received).toContainText("مش هتتبعت");
  await received.getByLabel("القالب").selectOption("bx_application_received_v4|ar");
  await expect.poll(() => sets).toContainEqual({ fn: "staff_wa_auto_template", p_key: "application_received", p_template: "bx_application_received_v4", p_lang: "ar" });
  await expect(received).toContainText("نؤكد استلام طلب انضمامك");
  await expect(received).toContainText("المتغيرات: {{1}} الاسم الأول · {{2}} كود الطلب · اتبعتت 3 مرات");
  await page.getByTestId("wa-auto-family").getByTestId("wa-auto-rule").filter({ hasText: "استلام تسجيل الأسرة" }).getByRole("switch").click();
  await expect.poll(() => sets).toContainEqual({ fn: "staff_wa_auto_set", p_key: "family_joined", p_enabled: false });

  // One that reaches many people asks first, with how many; a moment without a template can't be turned on.
  const bulk = page.getByTestId("wa-auto-events").getByTestId("wa-auto-rule").filter({ hasText: "فعالية جديدة لكل الطلاب" });
  await expect(bulk).toContainText("لناس كتير");
  await bulk.getByRole("switch").click();
  await expect(page.getByRole("dialog")).toContainText("42 شخص");
  await page.getByRole("dialog").getByRole("button", { name: "شغّلها" }).click();
  await expect.poll(() => sets).toContainEqual({ fn: "staff_wa_auto_set", p_key: "event_published", p_enabled: true });
  const none = page.getByTestId("wa-auto-students").getByTestId("wa-auto-rule").filter({ hasText: "شهادة جديدة" });
  await expect(none).toContainText("مفيش قالب للحظة دي لسه");
  await none.getByRole("switch").click();
  await expect(page.getByText("اختار قالب للرسالة دي الأول")).toBeVisible();
  expect(sets.some((x) => (x as { p_key: string }).p_key === "certificate_issued")).toBe(false);

  // The failure alert needs the owner's number first.
  const alert = page.getByTestId("wa-auto-team").getByTestId("wa-auto-rule");
  await alert.getByLabel("رقمك للتنبيهات").fill("01065316500");
  await alert.getByRole("button", { name: "حفظ الرقم" }).click();
  await expect.poll(() => sets).toContainEqual({ fn: "staff_wa_auto_phone", p_key: "send_failed_alert", p_phone: "01065316500" });
  await alert.getByRole("switch").click();
  await expect.poll(() => sets).toContainEqual({ fn: "staff_wa_auto_set", p_key: "send_failed_alert", p_enabled: true });

  // A moment whose new template Meta is reviewing: it keeps the approved one meanwhile, or waits if it has none.
  await expect(page.getByTestId("wa-auto-rule").filter({ hasText: "الطلب تحت المراجعة" })).toContainText("قالب أحسن ليها (bx_join_review_v5) عند ميتا للمراجعة");
  const waiting = page.getByTestId("wa-auto-forms").getByTestId("wa-auto-rule");
  await expect(waiting).toContainText("قالبها عند ميتا للمراجعة");
  await expect(waiting).not.toContainText("مش هتتبعت");

  // Our templates at Meta: counts, the refused one's reason, and the missing one sent.
  const ourCard = page.getByTestId("wa-templates");
  await expect(ourCard).toContainText("متوافق عليه 1");
  await expect(ourCard).toContainText("للمراجعة 2");
  await expect(ourCard).toContainText("محتاج تعديل 1");
  await ourCard.getByRole("button", { name: "اعرض القوالب (5)" }).click();
  const items = page.getByTestId("wa-templates-list").locator("li");
  await expect(items.filter({ hasText: "bx_certificate_ready_v5" })).toContainText("INCORRECT_CATEGORY");
  await expect(items.filter({ hasText: "bx_form_pass_v5" })).toContainText("زرار «الـ QR بتاعي» بيفتح الـ QR بتاع الشخص نفسه");
  await ourCard.getByRole("button", { name: "ابعت الناقص لميتا (1)" }).click();
  await expect(page.getByText("اتبعت 1 لميتا")).toBeVisible();
  expect(submitted).toBe(1);
  await expect(ourCard).toContainText("للمراجعة 3");
  expect(errors).toEqual([]);
});

test("an interview date on an application: set it, the status moves to interview, and it can be changed or removed", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const app: Record<string, unknown> = {
    id: "a1", ref: "BX-AB12CD", created_at: at(60), locale: "ar", full_name: "Mona Adel", phone: "+201012345678", email: "m@example.com",
    national_id: null, governorate: null, address: null, repeats: 0, last_repeat_at: null,
    faculty: null, academic_year: null, student_number: null, track_first: "ai-ml", track_second: null, team_roles: [], experience_level: null,
    skills: null, experience: null, portfolio_url: null, motivation: null, goals: null, hours_per_week: null, days: [], heard_from: null,
    answers: [], status: "contacted", staff_notes: "", public_note: "", reviewed_at: null, student_id: null, interview_at: null,
  };
  const patches: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/applications/, async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patches.push(body);
      Object.assign(app, body);
    }
    return route.fulfill({ json: app });
  });
  await page.goto("/app/#/staff/applications/a1");
  const box = page.getByTestId("interview");
  await box.getByLabel("ميعاد المقابلة").fill("2030-03-10T14:30");
  await box.getByRole("button", { name: "حدد الميعاد" }).click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].status).toBe("interview");
  expect(new Date(patches[0].interview_at as string).getTime()).toBe(new Date("2030-03-10T14:30").getTime());
  await expect(page.getByText(/المقابلة .*2030|المقابلة .*10/)).toBeVisible();
  await box.getByLabel("ميعاد المقابلة").fill("2030-03-11T10:00");
  await box.getByRole("button", { name: "غيّر الميعاد" }).click();
  await expect.poll(() => patches.length).toBe(2);
  expect(patches[1]).not.toHaveProperty("status");
  await box.getByRole("button", { name: "شيل الميعاد" }).click();
  await expect.poll(() => patches.length).toBe(3);
  expect(patches[2]).toEqual({ interview_at: null });
  expect(errors).toEqual([]);
});

test("the owner connects email (the Resend key is sent once, never shown), sends to typed emails, and edits an automatic email", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  let state: "none" | "checking" | "ok" = "none";
  const status = () => ({
    connected: state === "ok",
    status: state,
    from_email: state === "none" ? null : "hello@buildxhue.com",
    from_name: state === "none" ? null : "BuildX HUE",
    reply_to: null,
    daily_limit: 100,
    domains: state === "ok" ? [{ name: "buildxhue.com", status: "verified" }] : null,
    domain_ok: state === "ok" ? true : null,
    error: null,
    checked_at: null,
    has_key: state !== "none",
    sent_today: 0,
    failed_today: 0,
    last_day: 3,
    unsubscribed: 1,
    my_email: "owner@example.com",
    can_send: true,
    can_connect: true,
  });
  const templates = [
    {
      key: "application_received",
      enabled: true,
      subject: "وصلنا طلبك يا {name} 🎉",
      body: "أهلاً {name}\nرقم طلبك: {ref}",
      updated_at: at(10),
    },
    {
      key: "application_rejected",
      enabled: false,
      subject: "بخصوص طلبك",
      body: "أهلاً {name}\nرقم طلبك: {ref}\n{group}",
      updated_at: at(10),
    },
  ];
  await page.route(/\/rest\/v1\/rpc\/staff_email_[a-z_]+$/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1]!;
    calls.push({ fn, body: route.request().postDataJSON() });
    if (fn === "staff_email_connect") state = "checking";
    else if (
      fn === "staff_email_status" &&
      state === "checking" &&
      calls.filter((c) => c.fn === fn).length > 2
    )
      state = "ok";
    if (fn === "staff_email_status") return route.fulfill({ json: status() });
    if (fn === "staff_email_templates") return route.fulfill({ json: templates });
    if (fn === "staff_email_send") return route.fulfill({ json: { queued: 2, skipped: 1, unsubscribed: 0 } });
    if (fn === "staff_email_test") return route.fulfill({ json: { to: "owner@example.com" } });
    return route.fulfill({ json: { ok: true } });
  });
  await page.route(/\/rest\/v1\/email_messages/, (route) =>
    route.fulfill({
      json: [
        {
          id: 2,
          to_email: "sara@example.com",
          to_name: "Sara Ali",
          subject: "وصلنا طلبك يا Sara 🎉",
          kind: "auto",
          template: "application_received",
          status: "sent",
          error: null,
          created_at: at(5),
        },
        {
          id: 1,
          to_email: "x@example.com",
          to_name: null,
          subject: "خبر",
          kind: "manual",
          template: null,
          status: "skipped",
          error: "unsubscribed",
          created_at: at(9),
        },
      ],
    }),
  );
  await page.goto("/app/#/staff/more");
  await page.getByText("الإيميل (الربط، الإيميلات التلقائية والإرسال)").click();
  await expect(page.getByTestId("email-connect")).toBeVisible();
  // The automatic emails are listed even before email is connected.
  await expect(page.getByTestId("auto-application_received")).toContainText("شغّال");
  await page.getByLabel("مفتاح Resend (API key)").fill("re_" + "A1b2".repeat(8));
  await page.getByRole("button", { name: "اربط" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_email_connect")?.body)
    .toEqual({
      p_key: "re_" + "A1b2".repeat(8),
      p_from_email: "hello@buildxhue.com",
      p_from_name: "BuildX HUE",
      p_reply_to: null,
      p_daily_limit: 100,
    });
  await expect(page.getByTestId("email-status").getByText("مربوط")).toBeVisible({ timeout: 15_000 });
  // The key never comes back.
  await page.getByRole("button", { name: "تغيير الربط" }).click();
  await expect(page.getByLabel("مفتاح Resend (API key)")).toHaveValue("");
  await expect(page.getByTestId("email-connect").getByText("متأكد", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "إلغاء" }).click();
  // A test email to me.
  await page.getByTestId("email-test").click();
  await expect(page.getByText("اتبعت إيميل تجربة لـ owner@example.com")).toBeVisible();

  // Typed emails: names kept, repeats and wrong lines dropped; {name} is filled by the database.
  await page
    .getByLabel("الإيميلات")
    .fill("Ahmed Ali, Ahmed@Gmail.com\nsara@yahoo.com\nbad line\nahmed@gmail.com");
  await expect(page.getByTestId("email-count")).toHaveText("2 شخص");
  await page.getByTestId("email-subject").fill("ورشة الأردوينو يا {name}");
  await page
    .getByTestId("email-text")
    .fill("أهلاً {name} 👋\nالتسجيل من هنا: https://buildxhue.com/ar/events/");
  await page.getByRole("button", { name: "شكل الإيميل" }).click();
  await expect(page.getByTestId("email-preview")).toContainText("ورشة الأردوينو يا Ahmed");
  await expect(
    page.getByTestId("email-preview").getByRole("link", { name: "https://buildxhue.com/ar/events/" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("email-send-btn").click();
  await page.locator('[role="dialog"] button', { hasText: "ابعت" }).last().click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_email_send")?.body)
    .toEqual({
      p_people: [
        { email: "ahmed@gmail.com", name: "Ahmed Ali" },
        { email: "sara@yahoo.com", name: "" },
      ],
      p_subject: "ورشة الأردوينو يا {name}",
      p_text: "أهلاً {name} 👋\nالتسجيل من هنا: https://buildxhue.com/ar/events/",
      p_context: null,
    });
  await expect(page.getByText("اتبعت 2 · 1 إيميل غلط أو مكرر")).toBeVisible();
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/email-app-${page.viewportSize()?.width}.png`, fullPage: true });

  // An automatic email: turned on and reworded; the preview leaves out a line with nothing to fill in.
  await page.getByTestId("auto-application_rejected").click();
  const sheet = page.getByTestId("auto-sheet");
  await expect(sheet.getByTestId("email-preview")).toContainText("رقم طلبك: BX-7F3A2C");
  await expect(sheet.getByTestId("email-preview")).not.toContainText("{group}");
  await sheet.getByRole("switch").click();
  await sheet.getByLabel("العنوان").fill("بخصوص طلبك يا {name}");
  await sheet.getByRole("button", { name: "حفظ" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_email_template_save")?.body)
    .toEqual({
      p_key: "application_rejected",
      p_enabled: true,
      p_subject: "بخصوص طلبك يا {name}",
      p_body: "أهلاً {name}\nرقم طلبك: {ref}\n{group}",
    });
  // The log: sent, and skipped for someone who unsubscribed.
  await expect(page.getByTestId("email-log-row").first()).toContainText("تلقائي (طلب انضمام وصل)");
  await expect(page.getByTestId("email-log-row").nth(1)).toContainText("لاغي الاشتراك");
  expect(errors).toEqual([]);
});

test("from the family list, «إيميل» opens the email screen with the members who gave an email and a welcome ready", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const base = {
    academic_year: "2026/2027",
    governorate: "دمياط",
    address: "دمياط",
    level: 2,
    faculty: "AI",
    student_number: null,
    status: "new",
    notes: null,
    student_id: null,
    national_id: "30501011101000",
  };
  await page.route(/\/rest\/v1\/(family_members|site_settings)/, (route) => {
    const one = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    if (route.request().url().includes("site_settings"))
      return route.fulfill({ json: one ? { value: { open: true, year: "2026/2027" } } : [] });
    return route.fulfill({
      json: [
        {
          ...base,
          id: "f1",
          ref: "FM-000001",
          full_name: "منى عادل سامي حسن",
          phone: "01012345000",
          email: "mona@example.com",
          created_at: at(10),
        },
        {
          ...base,
          id: "f2",
          ref: "FM-000002",
          full_name: "أحمد علي محمود سعد",
          phone: "01012345001",
          email: null,
          created_at: at(11),
        },
      ],
    });
  });
  await page.route(/\/rest\/v1\/rpc\/staff_email_[a-z_]+$/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1]!;
    if (fn === "staff_email_templates") return route.fulfill({ json: [] });
    return route.fulfill({
      json: {
        connected: true,
        status: "ok",
        from_email: "hello@buildxhue.com",
        from_name: "BuildX HUE",
        reply_to: null,
        daily_limit: 100,
        domains: null,
        domain_ok: null,
        error: null,
        checked_at: null,
        has_key: true,
        sent_today: 0,
        failed_today: 0,
        last_day: 0,
        unsubscribed: 0,
        my_email: null,
        can_send: true,
        can_connect: true,
      },
    });
  });
  await page.goto("/app/#/staff/family");
  await page.getByTestId("family-email").click();
  await expect(page).toHaveURL(/#\/staff\/email/);
  await expect(page.getByTestId("email-source")).toHaveValue("handoff");
  await expect(page.getByTestId("email-count")).toHaveText("1 شخص");
  await expect(page.getByTestId("email-subject")).toHaveValue("أهلاً بيك في أسرة BuildX يا {name} 💙");
  await expect(page.getByTestId("email-text")).toHaveValue(/تسجيلك في أسرة BuildX وصلنا/);
  expect(errors).toEqual([]);
});

test("expo delegation runs by itself: dates per visit day, waiting list, WhatsApp acceptance and reminder, no-show bans", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await mockRpc(page, calls, {
    staff_whatsapp_status: {
      connected: true,
      templates: [
        { name: "expo_accept", language: "ar", body: "{{1}} {{4}}" },
        { name: "expo_reminder", language: "ar", body: "{{1}} {{2}} {{3}}" },
      ],
    },
  });
  const form = {
    id: "f1",
    slug: "robotex-2026",
    title_ar: "زيارة معرض Robotex",
    title_en: null,
    intro_ar: null,
    intro_en: null,
    success_ar: null,
    success_en: null,
    team: null,
    open: true,
    opens_at: null,
    closes_at: null,
    max_responses: null,
    listed: true,
    archived: false,
    created_at: at(100),
    accepted_ar: null,
    accepted_url: null,
    capacity: 40,
    delegation: { event: "Robotex", dates: "14–16 November 2026", meet_ar: "" },
    fields: [
      { id: "name", type: "name", label_ar: "الاسم", required: true },
      { id: "phone", type: "phone", label_ar: "الموبايل", required: true },
      {
        id: "day",
        type: "select",
        label_ar: "اليوم",
        required: true,
        options: [{ ar: "السبت 14 نوفمبر" }, { ar: "أي يوم" }],
      },
    ],
  };
  const patches: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/forms/, (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().postDataJSON());
      return route.fulfill({ json: [{ ...form, ...(route.request().postDataJSON() as object) }] });
    }
    return route.fulfill({
      json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form],
    });
  });
  await page.goto("/app/#/staff/forms/f1");
  const auto = page.getByTestId("delegation-auto");
  await expect(auto).toBeVisible();
  // Reminders and bans need the dates first.
  await expect(auto.getByRole("switch", { name: /تذكير قبلها بيوم/ })).toBeDisabled();
  await auto.getByLabel("تاريخ السبت 14 نوفمبر").fill("2026-11-14");
  await auto.getByLabel("تاريخ أي يوم").fill("2026-11-16");
  await auto.getByRole("switch", { name: /قائمة انتظار تلقائية/ }).click();
  await auto.getByLabel("رسالة القبول على الواتساب").selectOption("expo_accept|ar");
  await auto.getByRole("switch", { name: /تذكير قبلها بيوم/ }).click();
  await auto.getByLabel("قالب التذكير").selectOption("expo_reminder|ar");
  await auto.getByRole("switch", { name: /اللي مجاش ياخد الحظر/ }).click();
  await page.getByRole("button", { name: "حفظ", exact: true }).first().click();
  await expect
    .poll(() => (patches.at(-1) as { delegation?: object } | undefined)?.delegation)
    .toMatchObject({
      day_dates: { "السبت 14 نوفمبر": "2026-11-14", "أي يوم": "2026-11-16" },
      auto_waitlist: true,
      accept_template: "expo_accept|ar",
      remind: true,
      remind_template: "expo_reminder|ar",
      auto_no_show: true,
    });
  expect(errors).toEqual([]);
});

test("page builder: schedule a page to show and hide, bring back an older version, and copy a page", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const row = {
    id: "p1",
    slug: "cairo-ict",
    title_ar: "زيارة Cairo ICT",
    title_en: null,
    description_ar: null,
    description_en: null,
    accent: "#2b6dff",
    settings: {},
    blocks: [
      {
        id: "h",
        type: "hero",
        eyebrow: { ar: "" },
        title: { ar: "زيارة Cairo ICT" },
        body: { ar: "" },
        image: { src: "" },
        buttons: [],
        facts: [],
      },
    ],
    published: false,
    archived: false,
    updated_at: at(5),
    publish_at: null,
    unpublish_at: null,
  };
  const old = {
    id: 7,
    title_ar: "النسخة القديمة",
    title_en: null,
    description_ar: null,
    description_en: null,
    accent: "#ff7a45",
    settings: {},
    saved_by: "u1",
    saved_at: at(60),
    blocks: [
      {
        id: "h",
        type: "hero",
        eyebrow: { ar: "" },
        title: { ar: "عنوان قديم" },
        body: { ar: "" },
        image: { src: "" },
        buttons: [],
        facts: [],
      },
      { id: "t", type: "text", eyebrow: { ar: "" }, title: { ar: "نص" }, body: { ar: "" } },
    ],
  };
  const patches: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/site_page_versions/, (route) => route.fulfill({ json: [old] }));
  await page.route(/\/rest\/v1\/site_pages/, (route) => {
    const m = route.request().method();
    if (m === "PATCH") {
      patches.push(route.request().postDataJSON());
      return route.fulfill({ json: { ...row, ...(route.request().postDataJSON() as object) } });
    }
    if (m === "POST") {
      inserts.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: "p2" } });
    }
    return route.fulfill({
      json: route.request().url().includes("select=slug")
        ? [{ slug: "cairo-ict" }, { slug: "cairo-ict-copy" }]
        : [row],
    });
  });
  await page.route(/\/rest\/v1\/forms/, (route) => route.fulfill({ json: [] }));
  await page.goto("/app/#/staff/pages/p1");
  // Schedule: up on 1 Nov, down after the visit (Cairo time).
  const sched = page.getByTestId("page-schedule");
  await sched.locator("summary").click();
  await sched.getByLabel("تظهر على الموقع من").fill("2026-11-01T09:00");
  await sched.getByLabel("وتختفي بعد").fill("2026-11-17T00:00");
  await sched.getByRole("button", { name: "احفظ الجدولة" }).click();
  await expect
    .poll(() => patches.at(-1))
    .toMatchObject({ publish_at: "2026-11-01T07:00:00.000Z", unpublish_at: "2026-11-16T22:00:00.000Z" });
  // An older version comes back into the editor; saving puts it on the site.
  await page.getByRole("button", { name: "النسخ القديمة" }).click();
  await page.getByTestId("page-versions").getByRole("button", { name: "رجّعها" }).click();
  await expect(page.getByTestId("page-blocks").getByTestId("block-card")).toHaveCount(2);
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect.poll(() => patches.at(-1)).toMatchObject({ title_ar: "النسخة القديمة", accent: "#ff7a45" });
  // A copy starts as a draft at a free address.
  await page.getByRole("button", { name: "اعمل نسخة من الصفحة" }).click();
  await expect.poll(() => inserts[0]).toMatchObject({ slug: "cairo-ict-copy-2", published: false });
  await expect(page).toHaveURL(/#\/staff\/pages\/p2$/);
  expect(errors).toEqual([]);
});

test("a page's numbers: visits, visitors and how many applied through its form", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await mockRpc(page, calls, {
    staff_page_stats: {
      from: "2026-09-11",
      views: 200,
      visitors: 80,
      daily: [
        { day: "2026-10-09", views: 120 },
        { day: "2026-10-10", views: 80 },
      ],
      referrers: [
        { host: "facebook.com", views: 90 },
        { host: "", views: 40 },
      ],
      devices: { mobile: 170 },
      forms: [{ slug: "cairo-ict", title: "زيارة Cairo ICT", total: 30, period: 20, accepted: 12 }],
    },
  });
  const row = {
    id: "p1",
    slug: "cairo-ict",
    title_ar: "زيارة Cairo ICT",
    title_en: null,
    description_ar: null,
    description_en: null,
    accent: "#2b6dff",
    settings: {},
    published: true,
    archived: false,
    updated_at: at(5),
    blocks: [{ id: "f", type: "form", eyebrow: { ar: "" }, title: { ar: "قدّم" }, form: "cairo-ict" }],
  };
  await page.route(/\/rest\/v1\/site_pages/, (route) => route.fulfill({ json: [row] }));
  await page.route(/\/rest\/v1\/forms/, (route) => route.fulfill({ json: [] }));
  await page.goto("/app/#/staff/pages/p1");
  const stats = page.getByTestId("page-stats");
  await stats.locator("summary").click();
  await expect(stats).toContainText("200");
  await expect(stats).toContainText("25% من الزوار");
  await expect(stats).toContainText("20 في الفترة · 30 الكل · 12 اتقبلوا");
  await expect(stats).toContainText("facebook.com (90)، مباشر (40)");
  expect(calls.find((c) => c.fn === "staff_page_stats")?.body).toEqual({
    p_slug: "cairo-ict",
    p_forms: ["cairo-ict"],
    p_days: 30,
  });
  await stats.getByRole("button", { name: "أسبوع" }).click();
  await expect.poll(() => (calls.at(-1)?.body as { p_days: number }).p_days).toBe(7);
  expect(errors).toEqual([]);
});

test("WhatsApp Web: each chat opens with the message ready, with a wait between people, and each send is logged", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await page.clock.install();
  await page.addInitScript(() => {
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    window.open = ((url: string) => {
      w.__opened.push(url);
      return {
        closed: false,
        location: {
          set href(u: string) {
            w.__opened.push(u);
          },
        },
      } as unknown as Window;
    }) as typeof window.open;
  });
  await signInAsOwner(page);
  await mockRpc(page, calls, {
    staff_whatsapp_status: {
      connected: false,
      status: "none",
      templates: [],
      has_token: false,
      sent_today: 0,
      failed_today: 0,
      can_send: true,
      can_connect: true,
    },
    staff_whatsapp_web_sent: { today: 1, left: 149 },
  });
  await page.goto("/app/#/staff/whatsapp");
  const box = page.getByTestId("wa-web");
  await box.getByLabel("الأرقام").fill("Ahmed Ali, 01012345678\nMona, 01198765432\n01012345678");
  await box.getByLabel("الرسالة").fill("{hi} {name}، معادنا بكرة 9 الصبح");
  await page.getByRole("button", { name: "ابدأ الإرسال (3)" }).click();
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false))
    await dialog.getByRole("button", { name: "ابعت برضه" }).click();
  const run = page.getByTestId("wa-web-run");
  await expect(run).toContainText("0 اتبعت · 2 فاضل");
  const opened = () => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  await expect.poll(opened).toHaveLength(1);
  const first = decodeURIComponent((await opened())[0]!);
  // WhatsApp Web on a computer, the WhatsApp app on a phone.
  expect(first).toMatch(
    /^https:\/\/(web\.whatsapp\.com\/send\?phone=|wa\.me\/)(201012345678|201198765432)[?&]text=/,
  );
  expect(first).toMatch(
    /(أهلًا|إزيك|أهلًا بيك|مساء الخير|هاي|إزيك عامل إيه) (Ahmed|Mona)، معادنا بكرة 9 الصبح/,
  );
  // The next one waits (a random 12–25 seconds).
  const next = page.getByTestId("wa-web-next");
  await expect(next).toBeDisabled();
  await expect(next).toContainText("استنى");
  await page.clock.runFor(26_000);
  await expect(next).toBeEnabled();
  await next.click();
  await expect.poll(() => calls.filter((c) => c.fn === "staff_whatsapp_web_sent").length).toBe(1);
  await expect.poll(opened).toHaveLength(2);
  const urls = (await opened()).map(
    (u) => new URL(u).searchParams.get("phone") ?? new URL(u).pathname.slice(1),
  );
  expect(new Set(urls)).toEqual(new Set(["201012345678", "201198765432"]));
  await page.clock.runFor(26_000);
  await next.click();
  await expect(page.getByText("خلصت: 2 رسالة")).toBeVisible();
  // Done: no «continue» left (it used to open nobody and break the screen), only a new message.
  await expect(run.getByTestId("wa-web-done")).toContainText("خلصت: 2 اتبعت");
  await expect(run.getByRole("button", { name: /كمّل من مكانك/ })).toHaveCount(0);
  await run.getByRole("button", { name: "رسالة جديدة" }).click();
  await expect(page.getByTestId("wa-web")).toBeVisible();
  expect(errors).toEqual([]);
});

test("WhatsApp from any list: the chosen people arrive ready on the WhatsApp screen, with saved messages one tap away", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await mockRpc(page, calls, {
    staff_whatsapp_status: {
      connected: false,
      status: "none",
      templates: [],
      has_token: false,
      sent_today: 0,
      failed_today: 0,
      can_send: true,
      can_connect: true,
    },
  });
  const app = (id: string, name: string, phone: string) => ({
    id,
    ref: `A-${id}`,
    created_at: at(10),
    status: "new",
    full_name: name,
    phone,
    email: `${id}@example.com`,
    faculty: "AI",
    academic_year: "1",
    student_number: null,
    track_first: "robotics",
    track_second: null,
    experience_level: "beginner",
    skills: "",
    experience: "",
    portfolio_url: null,
    motivation: "",
    goals: "",
    hours_per_week: "5",
    days: [],
    team_roles: [],
    heard_from: "friend",
    staff_notes: null,
    public_note: null,
  });
  await page.route(/\/rest\/v1\/applications/, (route) =>
    route.fulfill({ json: [app("a1", "Mona Adel", "01012345678"), app("a2", "Ali Hassan", "01198765432")] }),
  );
  const snippets: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/whatsapp_snippets/, (route) => {
    if (route.request().method() === "POST") {
      snippets.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: "s9", title: "جديدة", body: "x" } });
    }
    return route.fulfill({
      json: [{ id: "s1", title: "القبول", body: "{hi} {name} 🎉\nاتقبلت في BuildX HUE!" }],
    });
  });
  await page.goto("/app/#/staff/applications");
  await page.getByRole("button", { name: "واتساب" }).click();
  await expect(page).toHaveURL(/#\/staff\/whatsapp$/);
  const box = page.getByTestId("wa-web");
  await expect(box.getByRole("combobox").first()).toHaveValue("handoff");
  await expect(box.getByRole("button", { name: "ابدأ الإرسال (2)" })).toBeVisible();
  // A saved message fills the text.
  await page.getByTestId("wa-snippets").getByRole("button", { name: "القبول" }).click();
  await expect(box.getByLabel("الرسالة")).toHaveValue(/اتقبلت في BuildX HUE!/);
  // And the one written now can be saved for next time.
  await box.getByLabel("الرسالة").fill("{hi} {name}، اجتماع بكرة 7");
  page.once("dialog", (d) => void d.accept("اجتماع"));
  await page.getByRole("button", { name: "احفظ اللي مكتوبة" }).click();
  await expect.poll(() => snippets[0]).toEqual({ title: "اجتماع", body: "{hi} {name}، اجتماع بكرة 7" });
  expect(errors).toEqual([]);
});

test("useful websites in the app: edit a site, add a visitor's suggestion in one tap, set another aside", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const site = (o: object) => ({
    id: "d1",
    slug: "wokwi",
    name: "Wokwi",
    url: "https://wokwi.com/",
    cat: "electronics",
    price: "free",
    idea_ar: "محاكي Arduino",
    tip_ar: "ابدأ بـ Blink",
    idea_en: "",
    tip_en: "",
    sort_order: 10,
    published: true,
    ...o,
  });
  const writes: { table: string; method: string; url: string; body: Record<string, unknown> }[] = [];
  await page.route(/\/rest\/v1\/directory_(sites|suggestions)/, (route) => {
    const req = route.request();
    const table = new URL(req.url()).pathname.split("/").pop()!;
    if (req.method() === "GET")
      return route.fulfill({
        json:
          table === "directory_sites"
            ? [
                site({}),
                site({
                  id: "d2",
                  slug: "kaggle",
                  name: "Kaggle",
                  cat: "ai",
                  sort_order: 20,
                  idea_ar: "داتا ومسابقات",
                }),
              ]
            : [
                {
                  id: "g1",
                  url: "https://falstad.com/circuit/",
                  name: null,
                  why: "محاكي دوائر بيوريك التيار",
                  contact: "Mona",
                  status: "new",
                  created_at: at(30),
                },
                {
                  id: "g2",
                  url: "https://spam.example/",
                  name: null,
                  why: "buy now",
                  contact: null,
                  status: "new",
                  created_at: at(60),
                },
              ],
      });
    const body = req.postDataJSON() as Record<string, unknown>;
    writes.push({ table, method: req.method(), url: req.url(), body });
    return route.fulfill({
      json: table === "directory_sites" ? site({ ...body, id: req.method() === "POST" ? "d9" : "d1" }) : [],
    });
  });
  await page.goto("/app/#/staff/more");
  await page
    .getByRole("link", { name: /مواقع هتفيدك/ })
    .or(page.getByRole("button", { name: /مواقع هتفيدك/ }))
    .first()
    .click();
  await expect(page).toHaveURL(/#\/staff\/directory$/);
  const sites = page.getByTestId("dir-sites");
  await expect(sites.getByRole("button")).toHaveCount(2);
  // Edit a site.
  await sites.getByRole("button", { name: /Wokwi/ }).click();
  const sheet = page.getByTestId("dir-sheet");
  await sheet.getByLabel("جرّب (أول حاجة تعملها)").fill("افتح مثال الـ Blink وغيّر الـ delay");
  await sheet.getByRole("button", { name: "احفظ" }).click();
  await expect
    .poll(() => writes[0])
    .toMatchObject({
      table: "directory_sites",
      method: "PATCH",
      body: { slug: "wokwi", tip_ar: "افتح مثال الـ Blink وغيّر الـ delay" },
    });
  await expect(sheet).toHaveCount(0);
  // A suggestion becomes a site.
  await page.getByRole("button", { name: /اقتراحات الزوار/ }).click();
  const list = page.getByTestId("dir-suggestions");
  await list.getByRole("button", { name: "ضيفه" }).first().click();
  await expect(sheet.getByLabel("اللينك")).toHaveValue("https://falstad.com/circuit/");
  await expect(sheet.getByLabel("فكرته في سطر")).toHaveValue("محاكي دوائر بيوريك التيار");
  await sheet.getByLabel("الاسم").fill("Falstad Circuit");
  await sheet.getByRole("button", { name: "احفظ" }).click();
  await expect
    .poll(() => writes.find((w) => w.method === "POST")?.body)
    .toMatchObject({
      slug: "falstad-circuit",
      name: "Falstad Circuit",
      url: "https://falstad.com/circuit/",
      cat: "electronics",
      sort_order: 30,
      published: true,
    });
  await expect
    .poll(() => writes.find((w) => w.table === "directory_suggestions"))
    .toMatchObject({ method: "PATCH", body: { status: "added" } });
  await expect(list.getByText("اتضاف")).toBeVisible();
  // The other one is set aside.
  await list.getByRole("button", { name: "مش مناسب" }).click();
  await expect(list.getByText("مش مناسب", { exact: true }).last()).toBeVisible();
  expect(
    writes
      .filter((w) => w.table === "directory_suggestions")
      .map((w) => [new URL(w.url).searchParams.get("id"), w.body.status]),
  ).toEqual([
    ["eq.g1", "added"],
    ["eq.g2", "declined"],
  ]);
  expect(errors).toEqual([]);
});

test("sponsor report: from the inbox, the month's numbers, then a one-page PDF to send", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_sponsor_report = {
    from: "2026-09-01",
    to: "2026-09-30",
    reach: {
      views: 1200,
      visitors: 430,
      views_before: 800,
      countries: 6,
      mobile: 900,
      top: [
        { path: "/ar/robotex/", views: 300 },
        { path: "/", views: 250 },
      ],
    },
    training: { sessions: 8, attendances: 140, students: 32, active: 40, quizzes: 55 },
    events: [{ title: "ورشة Arduino", at: "2026-09-12T14:00:00Z", registered: 60, attended: 48 }],
    community: { applications: 25, accepted: 12, new_students: 10 },
    output: {
      certificates: 18,
      projects: 3,
      posts: 4,
      highlights: [{ title: "المركز الأول في Robotex", kind: "achievement" }],
    },
    partners: [{ name: "Acme Electronics", image: null }],
  };
  await signInAsOwner(page, calls);
  await page.goto("/app/#/staff/inbox");
  await page.getByRole("button", { name: "تقرير للرعاة" }).click();
  await expect(page).toHaveURL(/#\/staff\/sponsor-report$/);
  await page.getByLabel("الشهر").fill("2026-09");
  await page.getByLabel("مقدَّم إلى (اختياري)").fill("Acme Electronics");
  await page.getByRole("button", { name: "هات أرقام الشهر" }).click();
  const numbers = page.getByTestId("sponsor-report");
  await expect(numbers).toContainText("1200");
  await expect(numbers).toContainText("+50% عن الشهر اللي قبله");
  await expect(numbers).toContainText("48 حضروا");
  expect(calls.find((c) => c.fn === "staff_sponsor_report")?.body).toEqual({
    p_from: "2026-09-01",
    p_to: "2026-09-30",
  });
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "نزّل التقرير PDF" }).click(),
  ]);
  expect(file.suggestedFilename()).toBe("buildx-sponsor-report-2026-09.pdf");
  const pdf = (await import("node:fs")).readFileSync(await file.path()).toString("latin1");
  expect(pdf).toContain("/Count 1");
  if (process.env.SAVE_PDF) (await import("node:fs")).copyFileSync(await file.path(), process.env.SAVE_PDF);
  expect(errors).toEqual([]);
});

test("membership card: the member shows a QR with the end date (and a nudge when it's ending), staff scan it at the door", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "rh-app-student",
      JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "S1", group: "G1" }),
    ),
  );
  const until = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
  await page.route(/supabase\.co/, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "student_card")
      return route.fulfill({
        json: {
          name: "Mona Adel",
          code: "S1",
          group: "G1",
          card: "BXM-1A2B3C4D5E",
          since: "2026-02-01T10:00:00Z",
          until,
          state: "expiring",
          daysLeft: 6,
        },
      });
    if (fn === "student_home")
      return route.fulfill({
        json: {
          now: new Date().toISOString(),
          student: { name: "Mona Adel", code: "S1", group: "G1" },
          materials: [],
          quizzes: [],
          attendance: [],
        },
      });
    return route.fulfill({ json: fn ? null : [] });
  });
  await page.goto("/app/#/me");
  const tile = page.getByTestId("member-tile");
  await expect(tile).toContainText("قرّبت تخلص");
  await expect(tile).toContainText("فاضل 6 يوم");
  await tile.click();
  await expect(page).toHaveURL(/#\/me\/card$/);
  const card = page.getByTestId("member-card");
  await expect(card.getByTestId("card-qr")).toBeVisible();
  await expect(card).toContainText("BXM-1A2B3C4D5E");
  await expect(card).toContainText("جدّدها مع الفريق");
  expect(errors).toEqual([]);
});

test("membership card at the door: staff scan a card, check the member into an event, and see when a membership has ended", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page, calls);
  const ev = {
    id: "e1",
    title: "Arduino workshop",
    title_ar: "ورشة Arduino",
    starts_at: new Date(Date.now() + 3600e3).toISOString(),
  };
  await page.route(/\/rest\/v1\/site_content/, (route) => route.fulfill({ json: [ev] }));
  let n = 0;
  await page.route(/\/rpc\/staff_member_scan$/, (route) => {
    calls.push({ fn: "staff_member_scan", body: route.request().postDataJSON() });
    n++;
    return route.fulfill({
      json:
        n === 1
          ? {
              result: "ok",
              student: { name: "Mona Adel", code: "S1", group: "G1", until: "2027-06-30", state: "active" },
              event: { checkedIn: true, already: false, count: 12 },
            }
          : {
              result: "expired",
              student: { name: "Ali Hassan", code: "S2", group: "G1", until: "2026-01-01", state: "expired" },
              event: null,
            },
    });
  });
  await page.goto("/app/#/staff/more");
  await page
    .getByRole("link", { name: /فحص كارنيه العضوية/ })
    .or(page.getByRole("button", { name: /فحص كارنيه العضوية/ }))
    .first()
    .click();
  await expect(page).toHaveURL(/#\/staff\/member-scan$/);
  await page.getByTestId("scan-event").selectOption("e1");
  await page.getByRole("button", { name: "قفل الكاميرا" }).click();
  await page.getByLabel("كود الكارنيه").fill("bxm-1a2b3c4d5e");
  await page.getByRole("button", { name: "افحص" }).click();
  const result = page.getByTestId("scan-result");
  await expect(result).toContainText("عضو، يدخل ✓");
  await expect(result).toContainText("Mona Adel");
  await expect(result).toContainText("جوه دلوقتي 12");
  expect(calls.find((c) => c.fn === "staff_member_scan")?.body).toEqual({
    p_raw: "bxm-1a2b3c4d5e",
    p_event: "e1",
  });
  await page.waitForTimeout(1300);
  await page.getByLabel("كود الكارنيه").fill("S2");
  await page.getByRole("button", { name: "افحص" }).click();
  await expect(result).toContainText("العضوية خلصت");
  await expect(result).toContainText("Ali Hassan");
  expect(errors).toEqual([]);
});

test("team cards for the print shop: each card fills itself in, codes are made up and kept, the PDF is CR80 with bleed, front and back", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const profile = (o: object) => ({
    id: "p1",
    slug: "mo",
    full_name: "Mohamed Tarek Alnjjar",
    full_name_ar: "محمد طارق النجار",
    headline: "Website manager",
    headline_ar: "إداري الموقع",
    bio: "",
    bio_ar: null,
    group_kind: "lead",
    track: null,
    photo_path: "p1/photo.w.webp",
    skills: [],
    links: {},
    external_url: null,
    published: true,
    sort_order: 1,
    faculty: null,
    card_code: null,
    ...o,
  });
  const patches: { url: string; body: Record<string, unknown> }[] = [];
  await page.route(/\/rest\/v1\/team_profiles/, (route) => {
    if (route.request().method() === "PATCH") {
      patches.push({ url: route.request().url(), body: route.request().postDataJSON() });
      return route.fulfill({ json: [] });
    }
    return route.fulfill({
      json: [
        profile({}),
        profile({
          id: "p2",
          slug: "sara",
          full_name: "Sara Ali",
          full_name_ar: null,
          headline: "Media designer",
          headline_ar: "ميديا",
          group_kind: "member",
          photo_path: null,
          published: false,
          sort_order: 2,
        }),
      ],
    });
  });
  // The photo, as the storage would answer it.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.route(/\/storage\/v1\/object\/public\/team\//, (route) =>
    route.fulfill({ body: png, contentType: "image/png", headers: { "access-control-allow-origin": "*" } }),
  );
  await page.goto("/app/#/staff/team-cards");
  const list = page.getByTestId("card-list");
  const year = new Date().getFullYear();
  await expect(list).toContainText(`BX-WEB-${year}`);
  await expect(list).toContainText(`BX-MED-${year}`);
  await expect(list).toContainText("صفحته مش منشورة");
  await expect(list).toContainText("من غير صورة");
  const preview = page.getByTestId("card-preview");
  await expect(preview.getByTestId("card-front")).toContainText("Mohamed Tarek Alnjjar");
  await expect(preview.getByTestId("card-front")).toContainText("محمد طارق النجار");
  await expect(preview.getByTestId("card-back")).toContainText("buildxhue.com/team/mo/");
  await expect(preview.getByTestId("card-back")).toContainText(
    "Faculty of Artificial Intelligence and Information",
  );
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /PDF للمطبعة \(2 كارت/ }).click(),
  ]);
  expect(file.suggestedFilename()).toBe("buildx-team-cards-2.pdf");
  const pdf = (await import("node:fs")).readFileSync(await file.path()).toString("latin1");
  expect(pdf).toContain("/Count 4");
  expect(pdf).toContain("/MediaBox [0 0 170.08 259.65]");
  if (process.env.SAVE_PDF) (await import("node:fs")).copyFileSync(await file.path(), process.env.SAVE_PDF);
  // The made-up codes are saved, so a reprint carries the same ones.
  expect(patches.map((p) => [new URL(p.url).searchParams.get("id"), p.body.card_code])).toEqual([
    ["eq.p1", `BX-WEB-${year}`],
    ["eq.p2", `BX-MED-${year}`],
  ]);
  expect(errors).toEqual([]);
});

test("staff home says what the website is missing, and a line can be put aside", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  await page.route(/\/rest\/v1\/team_profiles/, (route) =>
    route.fulfill({
      json: [{ full_name: "Amr", full_name_ar: null, headline: "", photo_path: null, published: false }],
    }),
  );
  await page.goto("/app/#/staff");
  const card = page.getByTestId("site-gaps");
  await card.getByRole("button").first().click();
  await expect(card).toContainText("من صفحات الفريق مش منشورة");
  await expect(card).toContainText("مفيش رعاة أو شركاء");
  await expect(card).toContainText("مفيش لينك قناة واتساب");
  await expect(card).toContainText("Leaked password protection");
  const before = await card.getByRole("listitem").count();
  await card.getByRole("listitem").first().getByRole("button", { name: "بعدين" }).click();
  await expect(card.getByRole("listitem")).toHaveCount(before - 1);
  expect(errors).toEqual([]);
});

test("form builder: a file question that takes video, and a background video that is compressed before it is uploaded", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const form = {
    id: "f1",
    slug: "with-media",
    title_ar: "فورم بميديا",
    title_en: null,
    intro_ar: null,
    intro_en: null,
    success_ar: null,
    success_en: null,
    team: null,
    open: false,
    opens_at: null,
    closes_at: null,
    max_responses: null,
    listed: true,
    archived: false,
    created_at: at(10),
    accepted_ar: null,
    accepted_url: null,
    capacity: null,
    delegation: null,
    background_path: null,
    background_kind: null,
    fields: [{ id: "name", type: "name", label_ar: "الاسم", required: true }],
  };
  const patches: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/forms/, (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().postDataJSON());
      return route.fulfill({ json: [{ ...form, ...(route.request().postDataJSON() as object) }] });
    }
    return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form] });
  });
  await page.route(/\/rest\/v1\/form_responses/, (route) => route.fulfill({ json: [], headers: { "content-range": "*/0" } }));
  const uploads: { url: string; type: string | undefined; size: number }[] = [];
  await page.route(/\/storage\/v1\/object\/form-media\//, (route) => {
    const req = route.request();
    uploads.push({ url: req.url(), type: req.headers()["content-type"], size: req.postDataBuffer()?.length ?? 0 });
    return route.fulfill({ json: { Key: "ok" } });
  });
  await page.goto("/app/#/staff/forms/f1");
  await expect(page.getByText("خلفية الفورم")).toBeVisible();
  // A 3-second 1080p clip (about 96 KB) stands in for a phone video; it is larger than the 720p-class size backgrounds are scaled to.
  await page.getByTestId("form-bg-input").setInputFiles({ name: "intro.webm", mimeType: "video/webm", buffer: readFileSync("e2e/fixtures/bg-1080p.webm") });
  await expect(page.getByTestId("form-bg-status")).toContainText("اترفع", { timeout: 30_000 });
  expect(uploads).toHaveLength(1);
  expect(uploads[0].type).toMatch(/^video\/webm/);
  expect(uploads[0].url).toMatch(/\/form-media\/b\/[0-9a-f-]{36}\/intro\.webm$/);
  // And a question that takes a video.
  await page.getByRole("button", { name: "ملف (صورة / PDF / فيديو)" }).click();
  await page.getByPlaceholder("السؤال بالعربي").last().fill("فيديو المشروع");
  await page.getByLabel("بيقبل إيه؟").selectOption("video");
  // A national ID asked as plain text: the editor suggests the national-ID type, which the site checks.
  await page.getByRole("button", { name: "نص قصير" }).click();
  await page.getByPlaceholder("السؤال بالعربي").last().fill("رقمك القومي");
  await expect(page.getByTestId("field-tip")).toContainText("ده شكله سؤال رقم قومي");
  await page.getByRole("button", { name: "خليه رقم قومي" }).click();
  await expect(page.getByTestId("field-tip")).toHaveCount(0);
  await page.getByRole("button", { name: "حفظ", exact: true }).first().click();
  await expect.poll(() => patches.at(-1)).toMatchObject({ background_kind: "video" });
  const saved = patches.at(-1) as { background_path: string; fields: { type: string; accept?: string }[] };
  expect(saved.background_path).toMatch(/^b\/[0-9a-f-]{36}\/intro\.webm$/);
  expect(saved.fields.at(-2)).toMatchObject({ type: "file", accept: "video", label_ar: "فيديو المشروع" });
  expect(saved.fields.at(-1)).toMatchObject({ type: "nid", label_ar: "رقمك القومي" });
  expect(errors).toEqual([]);
});

test("the join form editor: hide a question, rename one, add a question with choices; answers show on the application", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page, calls);
  await page.goto("/app/#/staff/applications/form");
  await expect(page.getByRole("heading", { name: "فورم الانضمام" })).toBeVisible();
  // On a phone the tab bar sits over the bottom of the screen: bring each card to the middle first.
  const card = async (id: string) => {
    const c = page.getByTestId(id).first();
    await c.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
    return c;
  };
  // Hide the faculty question.
  await (await card("af-faculty")).getByRole("checkbox").uncheck();
  // Rename the year question and change its choices.
  await (await card("af-academic_year")).getByRole("button", { name: "تعديل" }).click();
  await page.getByTestId("af-academic_year").getByPlaceholder("السنة الدراسية").fill("انت في سنة كام؟");
  await page.getByTestId("af-academic_year").getByRole("button", { name: "اختيار جديد" }).click();
  await page.getByTestId("af-academic_year").getByPlaceholder("بالعربي").last().fill("سنة تحضيرية");
  // Make the second choice required.
  await (await card("af-track_second")).getByRole("button", { name: "تعديل" }).click();
  await page.getByTestId("af-track_second").getByRole("switch").click();
  // A new question in step 2 with choices.
  await page.getByRole("button", { name: "سؤال جديد في الخطوة دي" }).nth(1).click();
  const q = await card("af-extra");
  await q.getByPlaceholder("السؤال بالعربي").fill("بتعرف تلحم؟");
  await q.locator("select").first().selectOption("select");
  await q.locator("textarea").fill("أيوه\nلأ\nشوية");
  await q.getByRole("switch").click();
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_apply_form_save")).toBeTruthy();
  const p = (calls.find((c) => c.fn === "staff_apply_form_save")!.body as { p: Record<string, any> }).p;
  expect(p.fields.faculty).toEqual({ hidden: true });
  expect(p.fields.academic_year.label_ar).toBe("انت في سنة كام؟");
  expect(p.fields.academic_year.options.at(-1)).toMatchObject({ ar: "سنة تحضيرية" });
  expect(p.fields.academic_year.options.at(-1).key).toMatch(/^o_[a-z0-9]{6,}$/);
  expect(p.fields.track_second).toEqual({ required: true });
  expect(p.extra).toEqual([
    { id: expect.stringMatching(/^q_[a-z0-9]{4,16}$/), step: 1, type: "select", label_ar: "بتعرف تلحم؟", required: true, options: [{ ar: "أيوه" }, { ar: "لأ" }, { ar: "شوية" }] },
  ]);
  // An application shows the answers to added questions, with the question as it was asked.
  await page.route(/\/rest\/v1\/applications/, (route) =>
    route.fulfill({
      json: {
        id: "a1", ref: "BX-AB12CD", created_at: at(60), locale: "ar", full_name: "Mona Adel", phone: "+201012345678", email: "m@example.com",
        national_id: "30601121100035", governorate: "دمياط", address: "دمياط الجديدة - الحي الخامس", repeats: 2, last_repeat_at: at(5),
        faculty: null, academic_year: "o_x", student_number: null, track_first: "ai-ml", track_second: null, team_roles: [], experience_level: "beginner",
        skills: null, experience: null, portfolio_url: null, motivation: null, goals: null, hours_per_week: null, days: [], heard_from: null,
        answers: [{ id: "q_weld01", q: "بتعرف تلحم؟", a: "شوية" }], status: "new", staff_notes: "", public_note: "", reviewed_at: null, student_id: null,
      },
    }),
  );
  await page.goto("/app/#/staff/applications/a1");
  // Applying again is counted here; the family-list data shows with the birth date read from the ID.
  await expect(page.getByTestId("application-repeats")).toContainText("قدّم تاني 2 مرات");
  await expect(page.getByText("30601121100035")).toBeVisible();
  await expect(page.getByText(/مواليد .*2006 · دمياط/)).toBeVisible();
  await expect(page.getByText("دمياط الجديدة - الحي الخامس")).toBeVisible();
  const box = page.getByTestId("application-answers");
  await expect(box.getByText("بتعرف تلحم؟")).toBeVisible();
  await expect(box.getByText("شوية")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the owner's activity log: who did what, grouped and filtered, old → new, and a deleted application put back", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const NOW = new Date("2026-10-15T10:00:00Z").getTime();
  const t = (min: number) => new Date(NOW - min * 60_000).toISOString();
  const deleted = {
    id: 10,
    at: t(5),
    actor: "u2",
    actor_email: "m@example.com",
    action: "delete",
    entity: "applications",
    entity_id: "a1",
    detail: { t: "محمد اسامه منصور", an: "محمد النجار" },
    has_row: true,
    restored: false,
  };
  const rows = [
    deleted,
    {
      id: 9,
      at: t(8),
      actor: "u2",
      actor_email: "m@example.com",
      action: "update",
      entity: "applications",
      entity_id: "a2",
      detail: { t: "منى عادل", an: "محمد النجار", ch: { status: ["new", "interview"], staff_notes: [null, "مقابلة يوم الأحد"] } },
    },
    ...[11, 11.5, 12].map((m, i) => ({
      id: 8 - i,
      at: t(m),
      actor: "u3",
      actor_email: "c@example.com",
      action: "insert",
      entity: "attendance",
      entity_id: null,
      detail: { an: "Coach Admin", st: `طالب ${i + 1}`, of: "جلسة الروبوتكس 1" },
    })),
    { id: 5, at: t(20), actor: null, actor_email: null, action: "insert", entity: "applications", entity_id: "a3", detail: { t: "زائر جديد", by: "visitor" } },
    { id: 4, at: t(30), actor: "u2", actor_email: "m@example.com", action: "login", entity: "staff", entity_id: "u2", detail: { t: "محمد النجار", an: "محمد النجار" } },
  ];
  const lists: Record<string, unknown>[] = [];
  const restores: unknown[] = [];
  let restored = false;
  await page.clock.setFixedTime(NOW);
  await signInAsOwner(page);
  await page.route(/\/rest\/v1\/rpc\/staff_audit_/, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    const body = route.request().postDataJSON() as { p?: Record<string, unknown>; p_id?: number };
    if (fn === "staff_audit_stats")
      return route.fulfill({
        json: {
          today: { insert: 4, update: 1, delete: 1, other: 1, total: 7 },
          week: { insert: 9, update: 3, delete: 2, other: 4, total: 18 },
          top: [{ actor: "u2", name: "محمد النجار", n: 3, deletes: 1 }],
          people: [
            { actor: "u3", name: "Coach Admin", n: 3 },
            { actor: "u2", name: "محمد النجار", n: 3 },
          ],
          entities: { applications: 3, attendance: 3, staff: 1 },
          total: 7,
          since: t(9999),
        },
      });
    if (fn === "staff_audit_list") {
      lists.push(body.p ?? {});
      const only = body.p?.kind === "delete" ? [{ ...deleted, restored }] : rows;
      return route.fulfill({ json: { rows: only, more: false } });
    }
    if (fn === "staff_audit_get") {
      const e = rows.find((r) => r.id === body.p_id)!;
      const row = { id: "a1", ref: "BX-C649FF", full_name: "محمد اسامه منصور", phone: "01000000000", status: "new", created_at: t(600) };
      return route.fulfill({
        json: {
          ...e,
          ip: "41.33.1.2",
          detail: e.action === "delete" ? { ...e.detail, row } : e.detail,
          restored: restored ? { at: t(1), by: "Owner Test" } : null,
          can_restore: e.action === "delete",
        },
      });
    }
    if (fn === "staff_audit_restore") {
      restores.push(body);
      restored = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: null });
  });

  await page.goto("/app/#/staff/more");
  await page.getByText("سجل الحركات (كل تعديل وحذف من كل الناس)").click();
  await expect(page.getByTestId("activity-stats")).toContainText("حذف النهارده");
  await expect(page.getByTestId("activity-stats")).toContainText("2 في آخر 7 أيام");
  // Who did what, in words.
  const first = page.getByTestId("activity-row").first();
  await expect(first).toContainText("محمد النجار");
  await expect(first).toContainText("حذف طلب انضمام «محمد اسامه منصور»");
  await expect(page.getByTestId("activity-row").nth(1)).toContainText("الحالة، ملاحظات الفريق");
  await expect(page.getByText("زائر", { exact: true })).toBeVisible();
  await expect(page.getByText("دخل التطبيق")).toBeVisible();
  // Three attendance marks a minute apart show as one line that opens up.
  const group = page.getByTestId("activity-group");
  await expect(group).toContainText("Coach Admin أضاف 3 في الحضور");
  await group.click();
  await expect(page.getByTestId("activity-row").filter({ hasText: "أضاف حضور في «جلسة الروبوتكس 1» للطالب طالب 1" })).toHaveCount(1);
  expect(lists[0]).toMatchObject({ limit: 80 });
  expect(typeof lists[0].from).toBe("string");

  // An edit: what it was and what it became.
  await page.getByTestId("activity-row").nth(1).click();
  const sheet = page.getByTestId("activity-details");
  await expect(sheet.getByTestId("activity-change").first()).toContainText("الحالة");
  await expect(sheet.getByTestId("activity-change").first()).toContainText("جديد");
  await expect(sheet.getByTestId("activity-change").first()).toContainText("مقابلة");
  await expect(sheet.getByTestId("activity-change").nth(1)).toContainText("فاضي");
  await expect(sheet).toContainText("41.33.1.2");
  await page.getByRole("button", { name: "إغلاق" }).last().click();

  // Only deletes, then put the deleted application back.
  await page.getByRole("button", { name: "حذف", exact: true }).click();
  await expect.poll(() => lists.at(-1)?.kind).toBe("delete");
  await expect(page.getByTestId("activity-row")).toHaveCount(1);
  await page.getByTestId("activity-row").click();
  await expect(sheet).toContainText("البيانات اللي اتحذفت");
  await expect(sheet).toContainText("BX-C649FF");
  await page.getByTestId("activity-restore").click();
  await page.getByRole("button", { name: "رجّعه", exact: true }).click();
  await expect(page.getByText("رجع زي ما كان.")).toBeVisible();
  expect(restores).toEqual([{ p_id: 10 }]);
  await expect(sheet).toContainText("اترجّع");
  await expect(page.getByTestId("activity-restore")).toHaveCount(0);
  await page.getByRole("button", { name: "إغلاق" }).last().click();

  // A person from the list of the most active, and the Excel of what's shown.
  await page.getByRole("button", { name: /محمد النجار/ }).first().click();
  await expect.poll(() => lists.at(-1)?.who).toBe("u2");
  const file = page.waitForEvent("download");
  await page.getByTestId("activity-xlsx").click();
  expect((await file).suggestedFilename()).toMatch(/^buildx-activity-\d{4}-\d{2}-\d{2}\.xlsx$/);
  expect(errors).toEqual([]);
});

test("the activity log is the owner's alone: a full admin sees neither the menu item nor the page", async ({ page }) => {
  await signInAsOwner(page);
  const me = { user_id: "u1", email: "admin@example.com", full_name: "Full Admin", role: "admin", active: true, created_at: at(9999), title: null, permissions: null };
  await page.route(/\/rest\/v1\/staff/, (route) =>
    route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? me : [me] }),
  );
  await page.goto("/app/#/staff/more");
  await expect(page.getByText("الأمان والهجمات")).toBeVisible();
  await expect(page.getByText("سجل الحركات (كل تعديل وحذف من كل الناس)")).toHaveCount(0);
  await page.goto("/app/#/staff/audit");
  await expect(page.getByText("الصفحة دي للقائد بس")).toBeVisible();
});

test("QR attendance from a form: turned on in the editor with a session for one group, then scanned by code, forced, marked by hand, absentees listed and exported", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const fields = [
    { id: "n", type: "name", label_ar: "الاسم", required: true },
    { id: "p", type: "phone", label_ar: "رقم الموبايل", required: true },
    { id: "g", type: "select", label_ar: "المجموعة", required: true, options: [{ ar: "A" }, { ar: "B" }] },
  ];
  const form: Record<string, unknown> = {
    id: "f1",
    slug: "ros-course",
    title_ar: "كورس ROS",
    title_en: null,
    intro_ar: null,
    intro_en: null,
    success_ar: null,
    success_en: null,
    fields,
    team: null,
    open: true,
    opens_at: null,
    closes_at: null,
    max_responses: null,
    listed: true,
    archived: false,
    accepted_ar: null,
    accepted_url: null,
    delegation: null,
    attendance: null,
    capacity: null,
    background_path: null,
    background_kind: null,
    created_at: at(600),
  };
  const patches: Record<string, unknown>[] = [];
  const marks: Record<string, unknown>[] = [];
  await signInAsOwner(page);
  await page.route(/\/rest\/v1\/forms(\?|$)/, async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patches.push(body);
      Object.assign(form, body);
      return route.fulfill({ json: [form] });
    }
    return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form] });
  });
  const people = [
    { id: "r1", ref: "F-AAAA0001", name: "أحمد سامي", phone: "01011111111", status: "new", answers: { n: "أحمد سامي", g: "A" }, pass: "AAAAAAAAAAAAAAA1" },
    { id: "r2", ref: "F-BBBB0002", name: "بسمة علي", phone: "01022222222", status: "new", answers: { n: "بسمة علي", g: "B" }, pass: "BBBBBBBBBBBBBBB2" },
    { id: "r3", ref: "F-CCCC0003", name: "كريم حسن", phone: "01033333333", status: "accepted", answers: { n: "كريم حسن", g: "A" }, pass: "CCCCCCCCCCCCCCC3" },
  ];
  await page.route(/\/rest\/v1\/form_responses\?select=id%2Cref/, (route) => route.fulfill({ json: people }));
  await page.route(/\/rest\/v1\/form_attendance/, (route) =>
    route.fulfill({ json: [{ response_id: "r3", session: (form.attendance as { sessions: { id: string }[] }).sessions[0].id, present: true, at: at(20), method: "qr" }] }),
  );
  await page.route(/\/rest\/v1\/rpc\/staff_form_mark/, (route) => {
    const b = route.request().postDataJSON() as { p_code: string | null; p_response: string | null; p_present: boolean; p_force: boolean; p_session: string };
    marks.push(b);
    const who = people.find((p) => p.id === b.p_response || (b.p_code && b.p_code.toUpperCase().includes(p.ref)));
    if (!who) return route.fulfill({ json: { ok: false, error: "not_found" } });
    const s2 = (form.attendance as { sessions: { id: string }[] }).sessions[1].id;
    if (who.id === "r2" && b.p_session === s2 && !b.p_force)
      return route.fulfill({ json: { ok: false, error: "not_this_session", id: "r2", name: who.name, ref: who.ref, answer: "B" } });
    return route.fulfill({ json: { ok: true, id: who.id, name: who.name, ref: who.ref, status: who.status, present: b.p_present, at: new Date().toISOString() } });
  });

  // The editor: QR on, split by «المجموعة», two lectures, the second only for group A.
  await page.goto("/app/#/staff/forms/f1");
  await page.getByRole("switch", { name: /كل اللي يسجّل ياخد QR للحضور/ }).click();
  await page.getByTestId("attendance-by").selectOption("g");
  await page.getByRole("button", { name: "موعد", exact: true }).click();
  await page.getByRole("button", { name: "موعد", exact: true }).click();
  const second = page.getByTestId("attendance-session").nth(1);
  await second.getByLabel("لمين").selectOption("A");
  await page.getByTestId("attendance-session").first().getByLabel("الميعاد").fill("2026-01-01T10:00");
  // The event's date for the WhatsApp acceptance message.
  await page.getByTestId("form-event-at").fill("2026-01-02T12:30");
  await page.getByRole("button", { name: "حفظ" }).first().click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].event_at).toBe(new Date("2026-01-02T12:30").toISOString());
  const att = patches[0].attendance as { on: boolean; by: string; sessions: { id: string; name: string; only: string | null }[] };
  expect(att).toMatchObject({ on: true, by: "g" });
  expect(att.sessions.map((x) => [x.name, x.only])).toEqual([
    ["محاضرة 1", null],
    ["محاضرة 2", "A"],
  ]);
  expect(att.sessions[0].id).toMatch(/^s_[a-z0-9]{1,8}$/);

  // The scan screen: the first lecture is for everyone; Karim was scanned already.
  await page.goto("/app/#/staff/forms/f1/attendance");
  await expect(page.getByTestId("attendance-stats")).toContainText("حضروا1");
  await expect(page.getByTestId("attendance-stats")).toContainText("المتوقعين3");
  await page.getByLabel("كود الطلب").fill("F-AAAA0001");
  await page.getByRole("button", { name: "سجّل", exact: true }).click();
  await expect(page.getByTestId("attendance-flash")).toContainText("✓ أحمد سامي حاضر");
  await expect(page.getByTestId("attendance-stats")).toContainText("حضروا2");
  await page.getByRole("button", { name: /^غايبين/ }).click();
  await expect(page.getByTestId("attendance-row")).toHaveCount(1);
  await expect(page.getByTestId("attendance-row")).toContainText("بسمة علي");
  await expect(page.getByRole("button", { name: "انسخ الغايبين وأرقامهم" })).toBeVisible();
  await expect(page.getByTestId("absent-whatsapp")).toBeVisible();

  // The second lecture is group A's: Basma (B) is flagged, and can still be let in.
  await page.getByTestId("attendance-sessions").getByRole("button", { name: /محاضرة 2/ }).click();
  await expect(page.getByTestId("attendance-stats")).toContainText("المتوقعين2");
  await page.getByLabel("كود الطلب").fill("f-bbbb0002");
  await page.getByRole("button", { name: "سجّل", exact: true }).click();
  await expect(page.getByTestId("attendance-flash")).toContainText("مش من «محاضرة 2» (اختار: B)");
  await page.getByRole("button", { name: "سجّله حاضر برضه" }).click();
  await expect(page.getByTestId("attendance-flash")).toContainText("✓ بسمة علي حاضر");
  expect(marks.at(-1)).toMatchObject({ p_force: true });
  // By hand from the list.
  await page.getByRole("button", { name: /^الكل/ }).click();
  await page.getByTestId("attendance-row").filter({ hasText: "كريم حسن" }).getByRole("button", { name: "غايب" }).click();
  await expect(page.getByTestId("attendance-row").filter({ hasText: "كريم حسن" }).getByRole("button", { name: "حاضر ✓" })).toBeVisible();
  expect(marks.at(-1)).toMatchObject({ p_response: "r3", p_present: true });

  const file = page.waitForEvent("download");
  await page.getByTestId("attendance-xlsx").click();
  expect((await file).suggestedFilename()).toMatch(/^buildx-attendance-ros-course-\d{4}-\d{2}-\d{2}\.xlsx$/);
  expect(errors).toEqual([]);
});

test("WhatsApp without a developer: one tap sends each accepted person their QR, a list carries each person's link to a button template, and templates are tried, fixed and written in the app", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  const ours = [
    { name: "bx_form_pass_v5", lang: "ar", category: "UTILITY", body: "مبروك 🎉 تم قبولك في «{{1}}».", moments: ["form_accepted"], example: ["Workshop"], button: "الـ QR بتاعي", button_kind: "pass", status: "APPROVED", error: null, submitted_at: at(60) },
    { name: "bx_certificate_ready_v5", lang: "ar", category: "UTILITY", body: "مبروك يا {{1}} 🎓 شهادتك جاهزة.", moments: ["certificate_issued"], example: ["أحمد"], button: null, button_kind: null, status: "REJECTED", error: "INCORRECT_CATEGORY", submitted_at: at(60) },
  ];
  await mockRpc(page, calls, {
    staff_whatsapp_status: {
      connected: true,
      status: "ok",
      phone_number_id: "123456789012345",
      business_id: "1214964801478471",
      display_phone: "+20 10 0000 0000",
      verified_name: "BuildX HUE",
      quality: "GREEN",
      error: null,
      checked_at: null,
      templates: [{ name: "bx_form_pass_v5", language: "ar", body: "مبروك 🎉 تم قبولك في «{{1}}».", button: "الـ QR بتاعي" }],
      has_token: true,
      sent_today: 0,
      failed_today: 0,
      can_send: true,
      can_connect: true,
    },
    staff_wa_auto_rules: [{ key: "certificate_issued", section: "students", label_ar: "شهادة جديدة", template: null, lang: "ar", enabled: false, ok: false, bulk: false }],
    staff_wa_templates: ours,
    staff_whatsapp_send: { queued: 1, skipped: 1 },
  });
  // Each saved template gets its own name (the fixed one first, then the new one).
  let saved = 0;
  await page.route(/\/rest\/v1\/rpc\/staff_wa_template_save$/, (route) => {
    calls.push({ fn: "staff_wa_template_save", body: route.request().postDataJSON() });
    return route.fulfill({ json: ++saved === 1 ? "bx_certificate_ready_261018150000" : "bx_custom_261018150100" });
  });
  await page.route(/\/rest\/v1\/rpc\/staff_form_send_passes$/, (route) => {
    const b = route.request().postDataJSON() as { p_form: string; p_dry: boolean };
    calls.push({ fn: "staff_form_send_passes", body: b });
    return route.fulfill({ json: { ready: 1, sent: b.p_dry ? 0 : 1, already: 1, no_phone: 0, no_template: 0 } });
  });
  const form = {
    id: "f1", slug: "ros-course", title_ar: "كورس ROS", title_en: null, intro_ar: null, intro_en: null, success_ar: null, success_en: null,
    fields: [{ id: "n", type: "name", label_ar: "الاسم", required: true }], team: null, open: true, opens_at: null, closes_at: null, max_responses: null,
    listed: true, archived: false, accepted_ar: null, accepted_url: null, delegation: null, attendance: { on: true, sessions: [{ id: "s_1", name: "محاضرة 1" }] },
    capacity: null, background_path: null, background_kind: null, created_at: at(600),
  };
  await page.route(/\/rest\/v1\/forms(\?|$)/, (route) => route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form] }));
  const resp = (id: string, name: string, phone: string | null, pass: string) => ({
    id, form_id: "f1", ref: `F-${id.toUpperCase()}0000`, answers: { n: name }, name, phone, email: null, locale: "ar", status: "accepted", note: null, created_at: at(30), pass,
  });
  await page.route(/\/rest\/v1\/form_responses\?select=\*/, (route) =>
    route.fulfill({ json: [resp("r1", "أحمد سامي", "01011111111", "AAAAAAAAAAAAAAA1"), resp("r2", "بسمة علي", null, "BBBBBBBBBBBBBBB2")] }),
  );

  // One tap: it says how many first (and who already has theirs), then sends.
  await page.goto("/app/#/staff/forms/f1/responses");
  await page.getByTestId("send-qr-form").click();
  await expect(page.getByRole("dialog")).toContainText("ابعت الـ QR لـ شخص واحد؟");
  await expect(page.getByRole("dialog")).toContainText("1 وصلهم قبل كده ومش هيتبعتلهم تاني");
  await page.getByRole("dialog").getByRole("button", { name: "ابعت" }).click();
  await expect(page.getByText("اتبعت لـ 1")).toBeVisible();
  expect(calls.filter((c) => c.fn === "staff_form_send_passes").map((c) => c.body)).toEqual([
    { p_form: "f1", p_dry: true },
    { p_form: "f1", p_dry: false },
  ]);

  // From the list: each person's own QR goes to the template's button.
  await page.getByRole("button", { name: "تحديد أكتر من واحد" }).click();
  await page.getByRole("button", { name: /حدد كل اللي ظاهرين/ }).click();
  await page.getByRole("button", { name: /واتساب للمختارين/ }).click();
  await expect(page).toHaveURL(/#\/staff\/whatsapp$/);
  const send = page.getByTestId("wa-send");
  await expect(send.getByTestId("wa-send-button")).toHaveValue("{pass}");
  await send.getByLabel("{{1}}").fill("كورس ROS — {link}");
  await send.getByRole("button", { name: "ابعت", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ابعت" }).click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_whatsapp_send")?.body)
    .toEqual({
      p_people: [
        { phone: "01011111111", name: "أحمد سامي", vars: { code: "F-R10000", link: "https://buildxhue.com/ar/form/?pass=aaaaaaaaaaaaaaa1", pass: "aaaaaaaaaaaaaaa1" }, button: "{pass}" },
      ],
      p_text: null,
      p_template: "bx_form_pass_v5",
      p_lang: "ar",
      p_params: ["كورس ROS — {link}"],
      p_context: "form:f1",
    });
  await expect(page.getByText("اتبعت لـ 1 · 1 اتخطّوا")).toBeVisible();

  // Templates: try an approved one on my phone, fix the refused one, write a new one.
  const card = page.getByTestId("wa-templates");
  await card.getByRole("button", { name: "اعرض القوالب (2)" }).click();
  await card.getByTestId("wa-template").filter({ hasText: "bx_form_pass_v5" }).getByTestId("wa-template-test").click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_wa_template_test")?.body).toEqual({ p_name: "bx_form_pass_v5" });
  await card.getByTestId("wa-template").filter({ hasText: "bx_certificate_ready_v5" }).getByTestId("wa-template-fix").click();
  const composer = page.getByTestId("wa-template-composer");
  await expect(composer.getByTestId("wa-template-body")).toHaveValue("مبروك يا {{1}} 🎓 شهادتك جاهزة.");
  await composer.getByTestId("wa-template-body").fill("مبروك يا {{1}} 🎓 شهادتك من BuildX HUE جاهزة، تقدر تحمّلها من التطبيق.");
  await composer.getByTestId("wa-template-save").click();
  await expect
    .poll(() => calls.find((c) => c.fn === "staff_wa_template_save")?.body)
    .toEqual({ p_body: "مبروك يا {{1}} 🎓 شهادتك من BuildX HUE جاهزة، تقدر تحمّلها من التطبيق.", p_category: "UTILITY", p_examples: ["أحمد"], p_button: "none", p_moment: null, p_replaces: "bx_certificate_ready_v5" });
  await expect(composer).toBeHidden();

  await card.getByTestId("wa-template-new").click();
  // A variable at the very start is what Meta refuses: said before sending.
  await composer.getByTestId("wa-template-body").fill("{{1}} شهادتك جاهزة");
  await expect(composer).toContainText("مش بتقبل قالب يبدأ أو يخلص بمتغير");
  await expect(composer.getByTestId("wa-template-save")).toBeDisabled();
  await composer.getByTestId("wa-template-body").fill("أهلًا {{1}}، شهادتك من BuildX HUE جاهزة ✅ افتحها من الزرار تحت.");
  await composer.getByTestId("wa-template-example").fill("منى");
  await expect(composer).toContainText("أهلًا منى، شهادتك");
  await composer.getByLabel("زرار تحت الرسالة").selectOption("pass");
  await composer.getByLabel("يتبعت لوحده في").selectOption("certificate_issued");
  await composer.getByTestId("wa-template-save").click();
  await expect
    .poll(() => calls.filter((c) => c.fn === "staff_wa_template_save").at(-1)?.body)
    .toEqual({ p_body: "أهلًا {{1}}، شهادتك من BuildX HUE جاهزة ✅ افتحها من الزرار تحت.", p_category: "UTILITY", p_examples: ["منى"], p_button: "pass", p_moment: "certificate_issued", p_replaces: null });
  await expect(page.getByText("اتبعت لميتا باسم bx_custom_261018150100")).toBeVisible();
  expect(errors).toEqual([]);
});

test("WhatsApp to people from any form: pick the form and who in it, each with their own link", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page);
  await mockRpc(page, calls, {
    staff_whatsapp_status: { connected: false, status: "none", templates: [], has_token: false, sent_today: 0, failed_today: 0, can_send: true, can_connect: true },
  });
  await page.route(/\/rest\/v1\/forms\?select=id%2Ctitle_ar/, (route) =>
    route.fulfill({ json: [{ id: "f1", title_ar: "ورشة 01", slug: "workshop", delegation: null, attendance: { on: true } }] }),
  );
  const asked: string[] = [];
  await page.route(/\/rest\/v1\/form_responses\?select=name%2Cphone%2Cemail%2Cref%2Cpass/, (route) => {
    asked.push(decodeURIComponent(route.request().url()));
    return route.fulfill({
      json: [
        { name: "أحمد سامي", phone: "01011111111", email: "a@example.com", ref: "F-AAAA0001", pass: "AAAAAAAAAAAAAAA1" },
        { name: "بسمة علي", phone: null, email: "b@example.com", ref: "F-BBBB0002", pass: "BBBBBBBBBBBBBBB2" },
      ],
    });
  });
  await page.goto("/app/#/staff/whatsapp");
  const box = page.getByTestId("wa-web");
  await box.getByLabel("لمين؟").selectOption("form");
  await box.getByTestId("pick-form").selectOption("f1");
  // The accepted first; only those with a number count, and each carries their own link and code.
  await expect(box).toContainText("1 شخص");
  await expect(box).toContainText("{link} = لينك كل واحد");
  expect(asked.at(-1)).toContain("status=eq.accepted");
  await box.getByTestId("pick-form-who").selectOption("all");
  await expect.poll(() => asked.at(-1)).toContain("status=neq.rejected");
  expect(errors).toEqual([]);
});

test("form payments: who paid and who didn't, the receipt photo shown in place, and the team edits or adds someone", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page, calls);
  const form = {
    id: "f1",
    slug: "drone-course",
    title_ar: "كورس الدرون",
    title_en: null,
    intro_ar: null,
    intro_en: null,
    success_ar: null,
    success_en: null,
    team: null,
    open: true,
    opens_at: null,
    closes_at: null,
    max_responses: null,
    listed: true,
    archived: false,
    created_at: at(100),
    accepted_ar: null,
    accepted_url: null,
    delegation: null,
    attendance: null,
    capacity: null,
    payment: { on: true, amount: 150, note_ar: "فودافون كاش" },
    fields: [
      { id: "n", type: "name", label_ar: "الاسم بالكامل", required: true },
      { id: "p", type: "phone", label_ar: "رقم الموبايل", required: true },
      { id: "r", type: "file", accept: "image", receipt: true, label_ar: "صورة إيصال الدفع", required: false },
    ],
  };
  const resp = (id: string, name: string, paid: boolean, receipt?: string) => ({
    id,
    form_id: "f1",
    ref: `F-${id.toUpperCase()}000000`,
    answers: { n: name, p: "+201012345678", ...(receipt ? { r: receipt } : {}) },
    name,
    phone: "+201012345678",
    email: null,
    locale: "ar",
    status: "accepted",
    note: null,
    external_done_at: null,
    member_no: null,
    accepted_at: null,
    checked_in_at: null,
    messaged_at: null,
    pass: null,
    paid_at: paid ? at(30) : null,
    paid_amount: paid ? 150 : null,
    paid_method: paid ? "vodafone_cash" : null,
    created_at: at(50),
  });
  const rows = [resp("r1", "منى عادل", true), resp("r2", "علي حسن", false, "f/f1/abc.jpg"), resp("r3", "سارة محمود", false)];
  const patches: Record<string, unknown>[] = [];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.route(/\/storage\/v1\/object\/sign\/form-files\//, (route) => route.fulfill({ json: { signedURL: "/object/sign/form-files/f/f1/abc.jpg?token=t" } }));
  await page.route(/\/storage\/v1\/object\/sign\/form-files\/.*token=t/, (route) => route.fulfill({ body: png, contentType: "image/png" }));
  await page.route(/\/rest\/v1\/forms/, (route) => route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form] }));
  await page.route(/\/rest\/v1\/form_responses/, (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patches.push(body);
      return route.fulfill({ json: { ...rows[1], ...body } });
    }
    return route.fulfill({ json: rows });
  });
  await page.route(/\/rest\/v1\/rpc\/staff_form_response_save/, (route) => {
    const body = route.request().postDataJSON() as { p_response: string | null; p_answers: Record<string, string> };
    calls.push({ fn: "staff_form_response_save", body });
    const base = body.p_response ? rows.find((r) => r.id === body.p_response)! : resp("r9", "", false);
    return route.fulfill({ json: { ok: true, response: { ...base, answers: body.p_answers, name: body.p_answers.n } } });
  });

  await page.goto("/app/#/staff/forms/f1/responses");
  const sum = page.getByTestId("payment-summary");
  await expect(sum).toContainText("1");
  await expect(sum).toContainText("دفعوا");
  await expect(sum).toContainText("فاضل");
  await page.getByRole("button", { name: /^لسه مدفعوش/ }).click();
  await expect(page.getByText("منى عادل")).toHaveCount(0);
  await expect(page.getByText("علي حسن")).toBeVisible();

  // The receipt photo shows right in the response.
  await page.getByText("علي حسن").click();
  await expect(page.getByTestId("file-image").locator("img")).toBeVisible();
  await expect.poll(() => page.getByTestId("file-image").locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1);

  // Mark it paid: cash, the form's amount.
  await page.getByTestId("paid-control").getByRole("switch").click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toMatchObject({ paid_method: "cash", paid_amount: 150 });
  expect(String(patches[0].paid_at)).toMatch(/^\d{4}-/);

  // Correct the name.
  await page.getByTestId("response-edit").click();
  await page.getByTestId("response-editor").getByLabel("الاسم بالكامل").fill("علي حسن محمد");
  await page.getByTestId("response-save").click();
  await expect.poll(() => calls.filter((c) => c.fn === "staff_form_response_save").length).toBe(1);
  expect(calls.find((c) => c.fn === "staff_form_response_save")!.body).toMatchObject({ p_form: "f1", p_response: "r2", p_answers: { n: "علي حسن محمد", r: "f/f1/abc.jpg" } });
  await expect(page.getByTestId("response-editor")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("علي حسن محمد");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Add someone who registered by phone.
  await page.getByTestId("response-add").click();
  const ed = page.getByTestId("response-editor");
  await ed.getByLabel("الاسم بالكامل").fill("يوسف خالد");
  await ed.getByLabel("رقم الموبايل").fill("01112223334");
  await page.getByTestId("response-save").click();
  await expect.poll(() => calls.filter((c) => c.fn === "staff_form_response_save").length).toBe(2);
  expect(calls.filter((c) => c.fn === "staff_form_response_save")[1].body).toMatchObject({ p_form: "f1", p_response: null, p_status: "accepted", p_answers: { n: "يوسف خالد", p: "01112223334" } });

  // One WhatsApp reminder to everyone who hasn't paid yet: the fee, how to pay and their code.
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === "bx-wa-handoff") (window as unknown as { handoff: string }).handoff = v;
      return set.call(this, k, v);
    };
  });
  await page.reload();
  await expect(page.getByTestId("remind-unpaid")).toContainText("(2)");
  await page.getByTestId("remind-unpaid").click();
  await expect(page).toHaveURL(/#\/staff\/whatsapp/);
  const handoff = JSON.parse(await page.evaluate(() => (window as unknown as { handoff: string }).handoff)) as { people: { name: string }[]; context: string; text: string };
  expect(handoff.people.map((p) => p.name).sort()).toEqual(["سارة محمود", "علي حسن"].sort());
  expect(handoff.context).toBe("form:f1:unpaid");
  for (const s of ["كورس الدرون", "150", "فودافون كاش", "{code}", "{link}"]) expect(handoff.text).toContain(s);
  expect(errors).toEqual([]);
});

test("forms on a phone: the list goes straight to each form's responses with what's new, and the long editor has jumps, copies and a save bar", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const base = {
    title_en: null,
    intro_ar: null,
    intro_en: null,
    success_ar: null,
    success_en: null,
    team: null,
    open: true,
    opens_at: null,
    closes_at: null,
    max_responses: null,
    listed: true,
    archived: false,
    accepted_ar: null,
    accepted_url: null,
    delegation: null,
    attendance: null,
    capacity: null,
    payment: { on: true, amount: 100, note_ar: null },
    fields: [
      { id: "n", type: "name", label_ar: "الاسم بالكامل", required: true },
      { id: "p", type: "phone", label_ar: "رقم الموبايل", required: true },
      { id: "y", type: "select", label_ar: "السنة الدراسية", required: true, options: [{ ar: "أولى" }, { ar: "تانية" }] },
    ],
  };
  const forms = [
    { ...base, id: "f1", slug: "summit", title_ar: "MENA ROBOTICS SUMMIT 2026 — Cairo Edition", created_at: at(100), form_responses: [{ count: 4 }] },
    { ...base, id: "f2", slug: "old", title_ar: "ورشة قديمة", payment: null, closes_at: at(60 * 24 * 3), created_at: at(200), form_responses: [{ count: 0 }] },
  ];
  const resp = (id: string, name: string, status: string, paid: boolean) => ({
    id,
    form_id: "f1",
    ref: `F-${id.toUpperCase()}000000`,
    answers: { n: name, p: "+201012345678" },
    name,
    phone: "+201012345678",
    email: null,
    locale: "ar",
    status,
    note: null,
    external_done_at: null,
    member_no: null,
    accepted_at: null,
    checked_in_at: null,
    messaged_at: null,
    pass: null,
    tags: [],
    paid_at: paid ? at(30) : null,
    paid_amount: paid ? 100 : null,
    paid_method: paid ? "cash" : null,
    created_at: at(50),
  });
  const rows = [resp("r1", "منى عادل", "accepted", true), resp("r2", "علي حسن", "accepted", false), resp("r3", "سارة محمود", "new", false), resp("r4", "هاجر سامي", "waiting", true)];
  const patches: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/forms/, (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().postDataJSON());
      return route.fulfill({ json: [{ ...forms[0], ...(route.request().postDataJSON() as object) }] });
    }
    return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? forms[0] : forms });
  });
  await page.route(/\/rest\/v1\/form_responses/, (route) => {
    const url = route.request().url();
    if (url.includes("status=eq.new")) return route.fulfill({ json: [{ form_id: "f1" }, { form_id: "f1" }] });
    return route.fulfill({ json: rows, headers: { "content-range": `0-3/${rows.length}` } });
  });

  // The list: an English name cuts off at its end, a closed date reads as past, and the count opens the responses.
  await page.goto("/app/#/staff/forms");
  const items = page.getByTestId("form-item");
  await expect(items).toHaveCount(2);
  await expect(items.first().locator("p[dir=auto]")).toHaveText(forms[0].title_ar);
  await expect(items.first().getByTestId("form-item-responses")).toContainText("4");
  await expect(items.first().getByTestId("form-item-responses")).toContainText("2 جديد");
  await expect(items.nth(1)).toContainText("قفل ");
  await expect(items.nth(1)).not.toContainText("بيقفل");
  await items.first().getByTestId("form-item-responses").click();
  await expect(page).toHaveURL(/#\/staff\/forms\/f1\/responses$/);

  // Responses: the name has the header to itself, the downloads sit in their own row, and "not paid" is only on the accepted.
  await expect(page.locator("header h1")).toContainText("MENA ROBOTICS SUMMIT");
  await expect(page.getByTestId("responses-tools").getByRole("button", { name: "Excel المقبولين" })).toBeVisible();
  const row = (name: string) => page.locator("button", { hasText: name });
  await expect(row("منى عادل")).toContainText("دفع");
  await expect(row("علي حسن")).toContainText("مدفعش");
  await expect(row("سارة محمود")).not.toContainText("مدفعش");
  await expect(row("هاجر سامي")).not.toContainText("مدفعش");
  // Someone on the waiting list who paid isn't counted: paid and collected are the accepted only.
  await expect(row("هاجر سامي")).not.toContainText("دفع");
  await expect(page.getByTestId("payment-summary").locator("p").first()).toHaveText("1");
  await expect(page.getByTestId("payment-summary")).toContainText("مقبولين دفعوا");
  await expect(page.getByRole("button", { name: /^دفعوا/ })).toContainText("1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The editor: questions come first, the parts row jumps, a question is copied, and a save bar follows the page.
  await page.goto("/app/#/staff/forms/f1");
  await expect(page.getByTestId("form-parts")).toBeVisible();
  await expect(page.getByTestId("form-unsaved")).toHaveCount(0);
  await page.getByTestId("form-parts").getByRole("button", { name: "الدفع" }).click();
  await expect(page.locator("#form-pay")).toBeInViewport();
  await page.getByTestId("field-duplicate").nth(2).click();
  await expect(page.getByPlaceholder("السؤال بالعربي")).toHaveCount(4);
  await expect(page.getByPlaceholder("السؤال بالعربي").nth(3)).toHaveValue("السنة الدراسية");
  const bar = page.getByTestId("form-unsaved");
  await expect(bar).toBeInViewport();
  // Closing before opening is caught before saving.
  await page.getByLabel("يفتح لوحده في").fill("2026-12-10T10:00");
  await page.getByLabel("يقفل لوحده في").fill("2026-12-01T10:00");
  await expect(page.getByText("ميعاد القفل لازم يكون بعد ميعاد الفتح").first()).toBeVisible();
  await bar.getByRole("button", { name: "حفظ التعديلات" }).click();
  expect(patches).toHaveLength(0);
  await page.getByLabel("يقفل لوحده في").fill("2026-12-20T10:00");
  await bar.getByRole("button", { name: "حفظ التعديلات" }).click();
  await expect.poll(() => patches.length).toBe(1);
  const saved = patches[0] as { fields: { id: string; label_ar: string; options?: { ar: string }[] }[] };
  expect(saved.fields).toHaveLength(4);
  expect(saved.fields[3]).toMatchObject({ type: "select", label_ar: "السنة الدراسية", options: [{ ar: "أولى" }, { ar: "تانية" }] });
  expect(new Set(saved.fields.map((x) => x.id)).size).toBe(4);
  await expect(page.getByTestId("form-unsaved")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("coming with a friend: the editor adds the question, and each person shows who they came with (and who came with them)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const form = {
    id: "f1",
    slug: "mena-trip",
    title_ar: "رحلة القمة",
    title_en: null,
    intro_ar: null,
    intro_en: null,
    success_ar: null,
    success_en: null,
    team: null,
    open: true,
    opens_at: null,
    closes_at: null,
    max_responses: null,
    listed: true,
    archived: false,
    created_at: at(100),
    accepted_ar: null,
    accepted_url: null,
    delegation: null,
    attendance: null,
    capacity: null,
    payment: null,
    fields: [
      { id: "n", type: "name", label_ar: "الاسم بالكامل", required: true },
      { id: "p", type: "phone", label_ar: "رقم الموبايل", required: true },
      { id: "w", type: "friend", label_ar: "جاي مع حد من صحابك؟", required: false },
    ],
  };
  const resp = (id: string, ref: string, name: string, friend?: string) => ({
    id,
    form_id: "f1",
    ref,
    answers: { n: name, p: "+201012345678", ...(friend ? { w: friend } : {}) },
    name,
    phone: "+201012345678",
    email: null,
    locale: "ar",
    status: "accepted",
    note: null,
    external_done_at: null,
    member_no: null,
    accepted_at: null,
    checked_in_at: null,
    messaged_at: null,
    pass: null,
    tags: [],
    paid_at: null,
    paid_amount: null,
    paid_method: null,
    created_at: at(50),
  });
  const rows = [resp("r1", "F-1A2B3C4D", "منى عادل"), resp("r2", "F-5E6F7A8B", "يوسف خالد", "F-1A2B3C4D")];
  const patches: Record<string, unknown>[] = [];
  await page.route(/\/rest\/v1\/forms/, (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().postDataJSON());
      return route.fulfill({ json: [{ ...form, ...(route.request().postDataJSON() as object) }] });
    }
    return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form] });
  });
  await page.route(/\/rest\/v1\/form_responses/, (route) => route.fulfill({ json: rows, headers: { "content-range": `0-1/${rows.length}` } }));

  await page.goto("/app/#/staff/forms/f1/responses");
  // The list shows the friend's name, not their code.
  await expect(page.locator("button", { hasText: "يوسف خالد" })).toContainText("منى عادل (F-1A2B3C4D)");
  await page.getByText("يوسف خالد").click();
  await expect(page.getByTestId("friend-answer")).toContainText("منى عادل");
  await page.getByTestId("friend-answer").click();
  await expect(page.getByRole("dialog")).toContainText("F-1A2B3C4D");
  await expect(page.getByTestId("came-with")).toContainText("يوسف خالد");
  await page.keyboard.press("Escape");

  // Editing by hand: the friend is picked from the people in the form.
  await page.getByText("منى عادل").first().click();
  await page.getByTestId("response-edit").click();
  const friendPick = page.getByTestId("response-editor").getByLabel("جاي مع حد من صحابك؟");
  await expect(friendPick.locator("option")).toHaveText(["— مش جاي مع حد —", "يوسف خالد (F-5E6F7A8B)"]);
  await page.keyboard.press("Escape");

  // The editor: a "with a friend" question in one tap, and a text question about friends gets the tip.
  await page.goto("/app/#/staff/forms/f1");
  await page.getByRole("button", { name: "نص قصير" }).click();
  await page.getByPlaceholder("السؤال بالعربي").last().fill("اسم صاحبك اللي جاي معاك");
  await expect(page.getByTestId("field-tip")).toContainText("جاي مع صاحبه");
  await page.getByRole("button", { name: "خليه «جاي مع صاحبه»" }).click();
  await page.getByRole("button", { name: "جاي مع صاحبه", exact: true }).click();
  await page.getByRole("button", { name: "حفظ", exact: true }).first().click();
  await expect.poll(() => patches.length).toBe(1);
  const saved = patches[0] as { fields: { type: string; label_ar: string; required?: boolean }[] };
  expect(saved.fields.slice(-2)).toMatchObject([
    { type: "friend", label_ar: "اسم صاحبك اللي جاي معاك" },
    { type: "friend", label_ar: "جاي مع حد من صحابك؟", required: false },
  ]);
  expect(errors).toEqual([]);
});

test("session ratings: the attendance screen shows each session's stars, how many rated out of who came, and the comments", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const form = {
    id: "f1",
    slug: "workshop",
    title_ar: "ورشة Embedded",
    fields: [{ id: "n", type: "name", label_ar: "الاسم", required: true }],
    attendance: { on: true, sessions: [{ id: "s1", name: "اليوم الأول" }, { id: "s2", name: "اليوم التاني" }] },
    payment: null,
  };
  await page.route(/\/rest\/v1\/forms(\?|$)/, (route) => route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form] }));
  const people = [1, 2, 3].map((i) => ({ id: `r${i}`, ref: `F-0000000${i}`, name: ["منى عادل", "علي حسن", "سارة محمود"][i - 1], phone: null, status: "accepted", answers: {}, pass: `P${i}`, tags: [] }));
  await page.route(/\/rest\/v1\/form_responses\?select=id%2Cref/, (route) => route.fulfill({ json: people }));
  await page.route(/\/rest\/v1\/form_attendance/, (route) => route.fulfill({ json: people.map((p) => ({ response_id: p.id, session: "s1", present: true, at: at(120), method: "qr" })) }));
  await page.route(/\/rest\/v1\/form_session_feedback/, (route) =>
    route.fulfill({
      json: [
        { response_id: "r1", session: "s1", rating: 5, comment: "الشرح كان ممتاز", updated_at: at(30), form_responses: { name: "منى عادل", ref: "F-00000001" } },
        { response_id: "r2", session: "s1", rating: 4, comment: null, updated_at: at(20), form_responses: { name: "علي حسن", ref: "F-00000002" } },
      ],
    }),
  );
  await page.goto("/app/#/staff/forms/f1/attendance");
  await page.getByTestId("attendance-sessions").getByRole("button", { name: /اليوم الأول/ }).click();
  const card = page.getByTestId("session-ratings");
  await expect(card).toContainText("4.5");
  await expect(card).toContainText("2 قيّموا من 3 حضروا");
  await card.getByTestId("session-comments-toggle").click();
  await expect(page.getByTestId("session-comments")).toContainText("الشرح كان ممتاز");
  await expect(page.getByTestId("session-comments")).not.toContainText("علي حسن");
  // A session nobody rated yet shows no card.
  await page.getByTestId("attendance-sessions").getByRole("button", { name: /اليوم التاني/ }).click();
  await expect(page.getByTestId("session-ratings")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("WhatsApp inbox: conversations with what's new, a thread with our messages' ticks, a reply within 24 hours, a template after, and the owner connects receiving", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page, calls);
  const convos = [
    { phone: "201011111111", name: "منى عادل", profile: "Mona", last_at: at(30), last: { kind: "text", body: "هو الباص بيتحرك إمتى؟" }, unread: 2, total: 3 },
    { phone: "201022222222", name: null, profile: "Ali", last_at: at(60 * 50), last: { kind: "image", body: null }, unread: 0, total: 1 },
  ];
  let setup = { url: "https://x.supabase.co/functions/v1/wa-webhook?k=abc", token: "abc", connecting: false, connected_at: null as string | null, error: null, last_hit_at: null, received: 0 };
  await page.route(/\/rest\/v1\/rpc\/staff_wa_inbox$/, (route) => route.fulfill({ json: convos }));
  await page.route(/\/rest\/v1\/rpc\/staff_wa_inbox_setup$/, (route) => route.fulfill({ json: setup }));
  await page.route(/\/rest\/v1\/rpc\/staff_wa_inbox_connect$/, (route) => {
    calls.push({ fn: "staff_wa_inbox_connect", body: null });
    setup = { ...setup, connected_at: new Date().toISOString() };
    return route.fulfill({ json: setup });
  });
  await page.route(/\/rest\/v1\/rpc\/staff_wa_thread$/, (route) => {
    const phone = (route.request().postDataJSON() as { p_phone: string }).p_phone;
    if (phone === "201011111111")
      return route.fulfill({
        json: {
          phone,
          last_in: at(30),
          items: [
            { dir: "out", id: 9, kind: "template", template: "bx_form_pass_date_v5", body: "MENA Robotics Summit · السبت", at: at(600), status: "sent", delivered: true, read: true },
            { dir: "in", id: 1, kind: "text", body: "شكرًا، استلمت", at: at(90) },
            { dir: "in", id: 2, kind: "text", body: "هو الباص بيتحرك إمتى؟", at: at(30) },
          ],
        },
      });
    return route.fulfill({ json: { phone, last_in: at(60 * 50), items: [{ dir: "in", id: 3, kind: "image", body: null, media: true, at: at(60 * 50) }] } });
  });
  await page.route(/\/rest\/v1\/rpc\/staff_whatsapp_send$/, (route) => {
    calls.push({ fn: "staff_whatsapp_send", body: route.request().postDataJSON() });
    return route.fulfill({ json: { queued: 1, skipped: 0 } });
  });

  await page.goto("/app/#/staff/wa-inbox");
  await expect(page.getByTestId("wa-convo")).toHaveCount(2);
  await expect(page.getByTestId("wa-convo").first()).toContainText("هو الباص بيتحرك إمتى؟");
  await expect(page.getByTestId("wa-convo").first()).toContainText("2");
  await expect(page.getByTestId("wa-convo").nth(1)).toContainText("+201022222222");
  await expect(page.getByTestId("wa-convo").nth(1)).toContainText("📷 صورة");

  // The owner points Meta at our webhook in one tap.
  await expect(page.getByTestId("wa-inbox-setup")).toContainText("مش متوصل");
  await page.getByTestId("wa-inbox-connect").click();
  await expect.poll(() => calls.some((c) => c.fn === "staff_wa_inbox_connect")).toBe(true);
  await expect(page.getByTestId("wa-inbox-setup")).toContainText("مستني أول رسالة");

  // A thread: their messages and ours (read), and a reply in plain words within 24 hours.
  await page.getByTestId("wa-convo").first().click();
  await expect(page).toHaveURL(/#\/staff\/wa-inbox\/201011111111$/);
  await expect(page.getByTestId("wa-in")).toHaveCount(2);
  await expect(page.getByTestId("wa-out")).toContainText("اتقرت ✓✓");
  await page.getByTestId("wa-reply").getByRole("textbox").fill("الباص بيتحرك 7 الصبح من قدام الكلية");
  await page.getByTestId("wa-reply-send").click();
  await expect.poll(() => calls.filter((c) => c.fn === "staff_whatsapp_send").length).toBe(1);
  expect(calls.find((c) => c.fn === "staff_whatsapp_send")!.body).toMatchObject({
    p_people: [{ phone: "201011111111", name: "منى عادل" }],
    p_text: "الباص بيتحرك 7 الصبح من قدام الكلية",
    p_context: "inbox:201011111111",
  });

  // After 24 hours only a template can go: the button hands them to the WhatsApp screen.
  await page.goto("/app/#/staff/wa-inbox/201022222222");
  await expect(page.getByTestId("wa-in")).toContainText("افتحها من واتساب على موبايل الفريق");
  await expect(page.getByTestId("wa-reply")).toHaveCount(0);
  await page.getByTestId("wa-reply-closed").getByRole("button", { name: "ابعتله قالب" }).click();
  await expect(page).toHaveURL(/#\/staff\/whatsapp$/);
  expect(errors).toEqual([]);
});

test("responses: an admin deletes an applicant, and a PDF with the picked columns and both logos downloads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const form = {
    id: "f1",
    slug: "ai-day",
    title_ar: "يوم الذكاء الاصطناعي",
    title_en: null,
    intro_ar: null,
    intro_en: null,
    success_ar: null,
    success_en: null,
    team: null,
    open: true,
    opens_at: null,
    closes_at: null,
    max_responses: null,
    listed: true,
    archived: false,
    created_at: at(100),
    accepted_ar: null,
    accepted_url: null,
    delegation: null,
    attendance: null,
    capacity: null,
    payment: null,
    fields: [
      { id: "n", type: "name", label_ar: "الاسم بالكامل", required: true },
      { id: "p", type: "phone", label_ar: "رقم الموبايل", required: true },
      { id: "y", type: "select", label_ar: "السنة الدراسية", required: true, options: [{ ar: "أولى" }, { ar: "تانية" }] },
      { id: "w", type: "textarea", label_ar: "ليه عايز تحضر؟", required: false },
    ],
  };
  const names = ["منى عادل", "علي حسن", "سارة محمود", "يوسف خالد", "مريم أحمد", "عمر طارق", "نور الدين", "هنا سمير", "كريم وائل", "ليلى مصطفى", "آدم شريف", "فرح ياسر", "زياد أشرف", "جنى عمرو", "مالك هاني", "رنا إبراهيم", "سيف محمد", "حبيبة علاء", "بلال ماجد", "تقى حسام", "أنس سامح", "دينا رامي", "حمزة عصام", "ملك وليد", "ياسين خالد"];
  const rows = names.map((name, i) => ({
    id: `r${i}`,
    form_id: "f1",
    ref: `F-${String(i).padStart(8, "0")}`,
    answers: { n: name, p: `+2010${String(10000000 + i)}`, y: i % 2 ? "تانية" : "أولى", w: "عايز أتعلم أبني نماذج وأشارك في المسابقات" },
    name,
    phone: `+2010${String(10000000 + i)}`,
    email: null,
    locale: "ar",
    status: i % 5 === 4 ? "new" : "accepted",
    note: null,
    external_done_at: null,
    member_no: null,
    accepted_at: null,
    checked_in_at: null,
    messaged_at: null,
    pass: null,
    paid_at: null,
    paid_amount: null,
    paid_method: null,
    created_at: at(500 - i),
  }));
  const deleted: string[] = [];
  await page.route(/\/rest\/v1\/forms/, (route) => route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form] }));
  await page.route(/\/rest\/v1\/form_responses/, (route) => {
    if (route.request().method() === "DELETE") {
      const ids = decodeURIComponent(new URL(route.request().url()).searchParams.get("id") ?? "").replace(/^in\.\(|\)$/g, "").split(",");
      deleted.push(...ids);
      return route.fulfill({ json: ids.map((id) => ({ id })) });
    }
    return route.fulfill({ json: rows });
  });
  await page.goto("/app/#/staff/forms/f1/responses");

  await page.getByText("علي حسن").click();
  await page.getByTestId("response-delete").click();
  await page.locator('[role="dialog"] button', { hasText: "احذف" }).last().click();
  await expect.poll(() => deleted).toEqual(["r1"]);
  await expect(page.getByText("علي حسن")).toHaveCount(0);

  await page.getByTestId("form-pdf-open").click();
  const sheet = page.getByTestId("form-pdf-sheet");
  await sheet.getByRole("button", { name: "ليه عايز تحضر؟", exact: true }).click();
  await sheet.locator("button", { hasText: "المقبولين" }).click();
  await expect(sheet).toContainText("19 شخص · 4 خانة · 2 صفحة بالعرض");
  const file = page.waitForEvent("download");
  await page.getByTestId("form-pdf-make").click();
  const pdf = await file;
  expect(pdf.suggestedFilename()).toMatch(/^buildx-.*\.pdf$/);
  const bytes = readFileSync((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  if (process.env.SAVE_PDF) copyFileSync((await pdf.path())!, process.env.SAVE_PDF);
  expect(errors).toEqual([]);
});

test("responses: who else a person is (other forms, member), groups set after the form, search, and a group's own PDF", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page, calls);
  const form = {
    id: "f1",
    slug: "ai-day",
    title_ar: "يوم الذكاء الاصطناعي",
    title_en: null,
    intro_ar: null,
    intro_en: null,
    success_ar: null,
    success_en: null,
    team: null,
    open: true,
    opens_at: null,
    closes_at: null,
    max_responses: null,
    listed: true,
    archived: false,
    created_at: at(100),
    accepted_ar: null,
    accepted_url: null,
    delegation: null,
    attendance: null,
    capacity: null,
    payment: null,
    fields: [
      { id: "n", type: "name", label_ar: "الاسم بالكامل", required: true },
      { id: "p", type: "phone", label_ar: "رقم الموبايل", required: true },
    ],
  };
  const row = (id: string, name: string, tags: string[] = []) => ({
    id,
    form_id: "f1",
    ref: `F-${id.toUpperCase()}000000`,
    answers: { n: name, p: "+201012345678" },
    name,
    phone: "+201012345678",
    email: null,
    locale: "ar",
    status: "accepted",
    note: null,
    external_done_at: null,
    member_no: null,
    accepted_at: null,
    checked_in_at: null,
    messaged_at: null,
    pass: null,
    paid_at: null,
    paid_amount: null,
    paid_method: null,
    tags,
    created_at: at(50),
  });
  const rows = [row("r1", "منى عادل", ["ورشة السبت"]), row("r2", "علي حسن"), row("r3", "سارة محمود")];
  const patches: { id: string; body: Record<string, unknown> }[] = [];
  await page.route(/\/rest\/v1\/forms/, (route) => route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form] }));
  await page.route(/\/rest\/v1\/form_responses/, (route) => {
    if (route.request().method() === "PATCH") {
      const id = (new URL(route.request().url()).searchParams.get("id") ?? "").replace(/^eq\./, "");
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patches.push({ id, body });
      return route.fulfill({ json: { ...rows.find((r) => r.id === id), ...body } });
    }
    return route.fulfill({ json: rows });
  });
  await page.route(/\/rest\/v1\/rpc\/staff_form_links/, (route) =>
    route.fulfill({ json: { r2: { forms: [{ title: "اختبارات فريق السومو", status: "accepted", at: at(900) }], member: { code: "BX123", active: true } } } }),
  );
  await page.goto("/app/#/staff/forms/f1/responses");

  // Ali is a member and applied to another form: shown on his row and inside.
  await expect(page.getByText("مقدّم على 1 فورم تاني")).toBeVisible();
  await expect(page.getByTestId("link-badges").getByText("عضو", { exact: true })).toBeVisible();
  await page.getByText("علي حسن").click();
  await expect(page.getByTestId("person-links")).toContainText("اختبارات فريق السومو");
  await expect(page.getByTestId("person-links")).toContainText("BX123");
  // Put him in the existing group from inside.
  await page.getByTestId("group-editor").locator("button", { hasText: "+ ورشة السبت" }).click();
  await expect.poll(() => patches.at(-1)).toEqual({ id: "r2", body: { tags: ["ورشة السبت"] } });
  await page.keyboard.press("Escape");

  // Tick Sara and put her in a new group.
  await page.getByRole("button", { name: "تحديد أكتر من واحد" }).click();
  await page.getByText("سارة محمود").click();
  await page.getByTestId("bulk-group").click();
  await page.getByTestId("group-sheet").getByRole("textbox").fill("الباص");
  await page.getByTestId("group-apply").click();
  await expect.poll(() => patches.at(-1)).toEqual({ id: "r3", body: { tags: ["الباص"] } });

  // Filter by a group, then search.
  await page.getByTestId("group-chips").getByRole("button", { name: /ورشة السبت/ }).click();
  await expect(page.getByText("سارة محمود")).toHaveCount(0);
  await expect(page.getByText("منى عادل")).toBeVisible();
  await page.getByTestId("group-chips").getByRole("button", { name: /ورشة السبت/ }).click();
  await page.getByTestId("responses-search").fill("سارة");
  await expect(page.getByText("منى عادل")).toHaveCount(0);
  await page.getByTestId("responses-search").fill("");

  // A PDF of one group only, titled with it.
  await page.getByTestId("form-pdf-open").click();
  const sheet = page.getByTestId("form-pdf-sheet");
  await sheet.locator("button", { hasText: "ورشة السبت" }).last().click();
  await expect(sheet.getByRole("textbox").first()).toHaveValue("يوم الذكاء الاصطناعي · ورشة السبت");
  await expect(sheet).toContainText("2 شخص");
  const file = page.waitForEvent("download");
  await page.getByTestId("form-pdf-make").click();
  expect(readFileSync((await (await file).path())!).subarray(0, 5).toString()).toBe("%PDF-");
  expect(errors).toEqual([]);
});

test("gallery upload: from an event, pick photos, drop one, and save them in one request under the event's album", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const base = { slug: null, title: "", summary: null, summary_ar: null, body: null, body_ar: null, result: null, result_ar: null, image_path: null, url: null, ends_at: null, location: null, location_ar: null, track: null, pinned: false, sort_order: 100, publish_at: null, created_by: "u1" };
  const rows = [
    { ...base, id: "e1", kind: "event", slug: "embedded-01", title: "Embedded Systems Workshop 01", title_ar: "ورشة Embedded Systems 01", starts_at: at(60 * 24 * 5), tags: [], published: true, created_at: at(60) },
    { ...base, id: "p1", kind: "photo", starts_at: null, tags: ["يوم التعريف"], published: true, created_at: at(120) },
  ];
  const uploads: string[] = [];
  const posts: unknown[] = [];
  await page.route(/\/storage\/v1\/object\/site\//, async (route) => {
    uploads.push(new URL(route.request().url()).pathname.split("/object/site/")[1]);
    await route.fulfill({ json: { Key: "ok" } });
  });
  await page.route(/\/rest\/v1\/site_content/, (route) => {
    if (route.request().method() === "POST") {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: [] });
    }
    return route.fulfill({ json: rows });
  });
  await page.goto("/app/#/staff/site");
  await page.getByText("ورشة Embedded Systems 01").click();
  await page.getByTestId("item-photos").click();
  await expect(page.getByLabel("الألبوم")).toHaveValue("ورشة Embedded Systems 01");
  // Albums already used are a tap away.
  await expect(page.locator("button", { hasText: "يوم التعريف" })).toBeVisible();
  const png = readFileSync("public/brand/icon-512.png");
  await page.getByTestId("bulk-photos-input").setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer: png },
    { name: "b.png", mimeType: "image/png", buffer: png },
    { name: "c.png", mimeType: "image/png", buffer: png },
  ]);
  const list = page.getByTestId("bulk-photos-list").locator("li");
  await expect(list).toHaveCount(3);
  await page.getByRole("button", { name: "شيل الصورة" }).first().click();
  await expect(list).toHaveCount(2);
  await page.getByRole("button", { name: "رفع 2", exact: true }).click();
  await expect(page.getByText("اترفع 2 صورة واتنشروا")).toBeVisible();
  // Two compressed photos (main + thumbnail each), and one database request for both rows.
  expect(uploads.map((u) => u.replace(/[0-9a-f-]{36}/, "ID")).sort()).toEqual(["u1/ID.t.webp", "u1/ID.t.webp", "u1/ID.w.webp", "u1/ID.w.webp"]);
  expect(posts).toHaveLength(1);
  expect(posts[0]).toEqual([
    expect.objectContaining({ kind: "photo", tags: ["ورشة Embedded Systems 01"], published: true }),
    expect.objectContaining({ kind: "photo", tags: ["ورشة Embedded Systems 01"], published: true }),
  ]);
  expect(errors).toEqual([]);
});

test("quick post: from the home screen, a news post with photos in one screen (cover first, the rest in its album)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signInAsOwner(page);
  const uploads: string[] = [];
  const posts: unknown[] = [];
  await page.route(/\/storage\/v1\/object\/site\//, async (route) => {
    uploads.push(new URL(route.request().url()).pathname.split("/object/site/")[1]);
    await route.fulfill({ json: { Key: "ok" } });
  });
  await page.route(/\/rest\/v1\/site_content/, (route) => {
    if (route.request().method() === "POST") {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: [] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/app/#/staff");
  await page.getByTestId("home-quick-post").click();
  const sheet = page.getByTestId("quick-post");
  await expect(sheet).toBeVisible();
  // Nothing written yet: it asks for the title.
  await page.getByTestId("quick-send").click();
  await expect(page.getByText("اكتب العنوان")).toBeVisible();
  const png = readFileSync("public/brand/icon-512.png");
  await page.getByTestId("quick-photos").setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer: png },
    { name: "b.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(sheet.getByText("الغلاف", { exact: true })).toBeVisible();
  await sheet.getByLabel("العنوان").fill("ورشة Arduino الأولى");
  await sheet.getByLabel("إيه اللي حصل؟").fill("اتعلمنا نوصّل حساسات ونبرمجها. شارك 40 طالب.");
  await expect(sheet.getByText("على كارت الموقع: «اتعلمنا نوصّل حساسات ونبرمجها.»")).toBeVisible();
  await page.getByTestId("quick-send").click();
  await expect(page.getByText("اتنشر على الموقع ✅")).toBeVisible();
  expect(uploads).toHaveLength(4);
  expect(posts).toHaveLength(1);
  const [post, photo] = posts[0] as Record<string, unknown>[];
  expect(post).toMatchObject({ kind: "post", title_ar: "ورشة Arduino الأولى", summary_ar: "اتعلمنا نوصّل حساسات ونبرمجها.", published: true });
  expect(String(post.slug)).toMatch(/^news-[0-9a-f]{8}$/);
  expect(String(post.image_path)).toMatch(/^u1\/[0-9a-f-]{36}\.w\.webp$/);
  expect(photo).toMatchObject({ kind: "photo", tags: ["ورشة Arduino الأولى"], published: true });
  expect(errors).toEqual([]);
});

test("responses: an English PDF for a conference, with every name in English and checked before it goes out", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  await signInAsOwner(page, calls);
  const form = {
    id: "f1",
    slug: "ai-day",
    title_ar: "يوم الذكاء الاصطناعي",
    title_en: "AI Day 2026",
    intro_ar: null,
    intro_en: null,
    success_ar: null,
    success_en: null,
    team: null,
    open: true,
    opens_at: null,
    closes_at: null,
    max_responses: null,
    listed: true,
    archived: false,
    created_at: at(100),
    accepted_ar: null,
    accepted_url: null,
    delegation: null,
    attendance: null,
    capacity: null,
    payment: null,
    fields: [
      { id: "n", type: "name", label_ar: "الاسم بالكامل", required: true },
      { id: "p", type: "phone", label_ar: "رقم الموبايل", required: true },
      { id: "y", type: "select", label_ar: "السنة الدراسية", label_en: "Year", required: true, options: [{ ar: "أولى", en: "First year" }, { ar: "تانية", en: "Second year" }] },
    ],
  };
  const base = { form_id: "f1", email: null, locale: "ar", status: "accepted", note: null, external_done_at: null, member_no: null, accepted_at: null, checked_in_at: null, messaged_at: null, pass: null, paid_at: null, paid_amount: null, paid_method: null, tags: [] };
  const rows = [
    { ...base, id: "r0", ref: "F-00000000", name: "محمد عبد الرحمن", name_en: null, phone: "+201001234567", answers: { n: "محمد عبد الرحمن", p: "+201001234567", y: "أولى" }, created_at: at(300) },
    { ...base, id: "r1", ref: "F-00000001", name: "حازم البرلسي", name_en: null, phone: "+201101234567", answers: { n: "حازم البرلسي", p: "+201101234567", y: "تانية" }, created_at: at(200) },
    { ...base, id: "r2", ref: "F-00000002", name: "منى عادل", name_en: "Mona Adel", phone: "+201201234567", answers: { n: "منى عادل", p: "+201201234567", y: "أولى" }, created_at: at(100) },
  ];
  await page.route(/\/rest\/v1\/forms/, (route) => route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form] }));
  await page.route(/\/rest\/v1\/form_responses/, (route) => route.fulfill({ json: rows }));
  await page.goto("/app/#/staff/forms/f1/responses");
  await page.getByTestId("form-pdf-open").click();
  const sheet = page.getByTestId("form-pdf-sheet");
  await sheet.locator("button", { hasText: "English" }).click();
  await expect(page.getByTestId("form-pdf-title-en")).toHaveValue("AI Day 2026");
  // The names: one from the dictionary, one spelled and marked for checking, one checked before.
  const list = page.getByTestId("form-pdf-names");
  await expect(list.locator("input")).toHaveCount(3);
  await expect(list.locator("input").nth(0)).toHaveValue("Mohamed Abdelrahman");
  await expect(list.locator("input").nth(1)).toHaveValue("Hazem El-Barlesy");
  await expect(list.locator("input").nth(2)).toHaveValue("Mona Adel");
  await expect(sheet).toContainText("1 اسم اتكتب حرف بحرف");
  await list.locator("input").nth(1).fill("Hazem El-Borollosy");
  await expect(sheet).toContainText("الأسامي جاهزة");
  // Catch the pages while they're drawn, to read what goes into the file.
  await page.evaluate(() => {
    const w = window as unknown as { pdfText: string[] };
    w.pdfText = [];
    new MutationObserver(() => document.querySelectorAll<HTMLElement>('[data-testid="form-pdf-page"]').forEach((p) => w.pdfText.push(p.innerText))).observe(document.body, { childList: true, subtree: true });
  });
  const file = page.waitForEvent("download");
  await page.getByTestId("form-pdf-make").click();
  const pdf = await file;
  expect(pdf.suggestedFilename()).toMatch(/^buildx-ai-day-en-.*\.pdf$/);
  if (process.env.SAVE_PDF_EN) copyFileSync((await pdf.path())!, process.env.SAVE_PDF_EN);
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe("%PDF-");
  // Only the names that changed are saved, in one request.
  expect(calls.filter((c) => c.fn === "staff_form_names_en")).toEqual([{ fn: "staff_form_names_en", body: { p_form: "f1", p_names: { r0: "Mohamed Abdelrahman", r1: "Hazem El-Borollosy" } } }]);
  const text = (await page.evaluate(() => (window as unknown as { pdfText: string[] }).pdfText.join("\n"))) as string;
  for (const s of ["AI Day 2026", "PARTICIPANTS", "Full name", "Mobile", "Year", "Mohamed Abdelrahman", "Hazem El-Borollosy", "Mona Adel", "+20 100 123 4567", "First year", "Page 1 of 1"]) expect(text).toContain(s);
  expect(text).not.toMatch(/[؀-ۿ]/);
  expect(errors).toEqual([]);
});

test("bus letter: from a form's people, the dean's letter with the count and buses, and the names list after it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_trip_letter = {
    settings: { to_name: "د. عميد الكلية", sign1_name: "أ.د/ عميد الكلية", sign2_name: "م/ مشرف", seats: 50 },
    letter: { event: "MENA ROBOTICS SUMMIT 2026", date: "2026-10-30", venue: "جامعة مصر اليابانية للعلوم والتكنولوجيا (E-JUST)", city: "الإسكندرية" },
  };
  await signInAsOwner(page, calls);
  const form = {
    id: "f1", slug: "summit", title_ar: "قمة", title_en: "MENA ROBOTICS SUMMIT 2026", intro_ar: null, intro_en: null, success_ar: null, success_en: null, team: null, open: true, opens_at: null, closes_at: null,
    max_responses: null, listed: true, archived: false, created_at: at(100), accepted_ar: null, accepted_url: null, delegation: null, attendance: null, capacity: null, payment: null,
    fields: [
      { id: "n", type: "name", label_ar: "الاسم بالكامل", required: true },
      { id: "p", type: "phone", label_ar: "رقم الموبايل", required: true },
      { id: "c", type: "text", label_ar: "الكلية", required: true },
    ],
  };
  const rows = Array.from({ length: 53 }, (_, i) => ({
    id: `r${i}`, form_id: "f1", ref: `F-${String(i).padStart(8, "0")}`, answers: { n: `طالب ${i + 1}`, p: `+2010${String(10000000 + i)}`, c: "الذكاء الاصطناعي" }, name: `طالب ${i + 1}`, phone: `+2010${String(10000000 + i)}`,
    email: null, locale: "ar", status: i === 52 ? "rejected" : "accepted", note: null, external_done_at: null, member_no: null, accepted_at: null, checked_in_at: null, messaged_at: null, pass: null,
    paid_at: null, paid_amount: null, paid_method: null, tags: [], created_at: at(500 - i),
  }));
  await page.route(/\/rest\/v1\/forms/, (route) => route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form] }));
  await page.route(/\/rest\/v1\/form_responses/, (route) => route.fulfill({ json: rows }));
  await page.goto("/app/#/staff/forms/f1/responses");
  await page.getByTestId("trip-letter-open").click();
  const sheet = page.getByTestId("trip-letter-sheet");
  await expect(page.getByTestId("trip-letter-event")).toHaveValue("MENA ROBOTICS SUMMIT 2026");
  await expect(page.getByTestId("trip-letter-date")).toHaveValue("2026-10-30");
  // 52 accepted + 2 supervisors = 54 → two buses of 50.
  await expect(page.getByTestId("trip-letter-count")).toContainText("52");
  await expect(page.getByTestId("trip-letter-count")).toContainText("أتوبيسين");
  await sheet.locator("button", { hasText: "الكل ماعدا المرفوضين" }).click();
  // The sheet fits the screen (on a phone too), and the page doesn't scroll sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  const box = (await page.getByTestId("trip-letter-make").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.evaluate(() => {
    const w = window as unknown as { letter: string[] };
    w.letter = [];
    new MutationObserver(() => document.querySelectorAll<HTMLElement>('[data-testid="trip-letter-page"]').forEach((p) => w.letter.push(p.innerText))).observe(document.body, { childList: true, subtree: true });
  });
  const file = page.waitForEvent("download");
  await page.getByTestId("trip-letter-make").click();
  const pdf = await file;
  expect(pdf.suggestedFilename()).toMatch(/^buildx-bus-request-summit-.*\.pdf$/);
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe("%PDF-");
  if (process.env.SAVE_LETTER) copyFileSync((await pdf.path())!, process.env.SAVE_LETTER);
  const saved = calls.find((c) => c.fn === "staff_trip_letter_save")?.body as { p_key: string; p_letter: Record<string, unknown>; p_settings: Record<string, unknown> };
  expect(saved.p_key).toBe("form:f1");
  expect(saved.p_letter).toMatchObject({ event: "MENA ROBOTICS SUMMIT 2026", date: "2026-10-30", supervisors: 2 });
  expect(saved.p_settings).toMatchObject({ to_name: "د. عميد الكلية", seats: 50 });
  const text = (await page.evaluate(() => (window as unknown as { letter: string[] }).letter.join("\n"))) as string;
  for (const s of ["طلب توفير أتوبيسات", "د. عميد الكلية", "MENA ROBOTICS SUMMIT 2026", "الجمعة", "30 أكتوبر 2026", "E-JUST", "الإسكندرية", "(52)", "(54)", "أتوبيسين", "كشف بأسماء الطلاب المشاركين", "طالب 52", "01010000051", "صفحة 2 من 3"]) expect(text).toContain(s);
  expect(text).not.toContain("طالب 53");
  delete RPC.staff_trip_letter;
  expect(errors).toEqual([]);
});

test("event file: split into buses with a list per bus, the lecture excuse letter, the report, the accounts and certificates for who came", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_trip_letter = { settings: { to_name: "د. عميد الكلية", sign1_name: "أ.د/ عميد الكلية", seats: 10 }, letter: { supervisors: 6 } };
  await signInAsOwner(page, calls);
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === "bx-wa-handoff") (window as unknown as { handoff: string }).handoff = v;
      return set.call(this, k, v);
    };
  });
  const form = {
    id: "f1", slug: "drone-day", title_ar: "يوم الدرون", title_en: "Drone Day", intro_ar: null, intro_en: null, success_ar: null, success_en: null, team: null, open: true, opens_at: null, closes_at: null,
    max_responses: null, listed: true, archived: false, created_at: at(100), accepted_ar: null, accepted_url: null, delegation: null, attendance: null, capacity: null,
    event_at: "2026-11-05T08:00:00Z", payment: { on: true, amount: 100 },
    fields: [
      { id: "n", type: "name", label_ar: "الاسم بالكامل", required: true },
      { id: "p", type: "phone", label_ar: "رقم الموبايل", required: true },
    ],
  };
  // Five accepted (four paid), and one refused who was on a bus before.
  const rows = Array.from({ length: 6 }, (_, i) => ({
    id: `r${i}`, form_id: "f1", ref: `F-0000000${i}`, answers: { n: `طالب ${i + 1}`, p: `+20101000000${i}` }, name: `طالب ${i + 1}`, phone: `+20101000000${i}`,
    email: null, locale: "ar", status: i === 5 ? "rejected" : "accepted", note: null, external_done_at: null, member_no: null, accepted_at: null, checked_in_at: null, messaged_at: null, pass: null,
    paid_at: i < 4 ? at(10) : null, paid_amount: i < 4 ? 100 : null, paid_method: i < 4 ? "cash" : null, tags: i === 5 ? ["أتوبيس 1"] : [], created_at: at(500 - i),
  }));
  const certPosts: { recipient_name: string; title: string; kind: string }[][] = [];
  await page.route(/\/rest\/v1\/forms/, (route) => route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? form : [form] }));
  await page.route(/\/rest\/v1\/form_responses/, (route) => route.fulfill({ json: rows }));
  // The first two were scanned at the door.
  await page.route(/\/rest\/v1\/form_attendance/, (route) => route.fulfill({ json: [{ response_id: "r0" }, { response_id: "r1" }] }));
  // The first one already has this event's certificate.
  await page.route(/\/rest\/v1\/certificates/, (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { recipient_name: string; title: string; kind: string }[];
      certPosts.push(body);
      return route.fulfill({ json: body.map((c, i) => ({ code: `BXC-0000000${i + 1}`, recipient_name: c.recipient_name })) });
    }
    return route.fulfill({ json: [{ code: "BXC-AAAAAAAA", recipient_name: "طالب 1" }] });
  });
  const pages = async () => {
    await page.evaluate(() => {
      const w = window as unknown as { letter: string[] };
      w.letter = [];
      new MutationObserver(() => document.querySelectorAll<HTMLElement>('[data-testid="trip-letter-page"]').forEach((p) => w.letter.push(p.innerText))).observe(document.body, { childList: true, subtree: true });
    });
    return async () => (await page.evaluate(() => (window as unknown as { letter: string[] }).letter.join("\n"))) as string;
  };

  await page.goto("/app/#/staff/forms/f1/responses");
  await page.getByTestId("trip-letter-open").click();
  const sheet = page.getByTestId("trip-letter-sheet");
  await expect(page.getByTestId("trip-letter-event")).toHaveValue("Drone Day");
  await expect(page.getByTestId("trip-letter-date")).toHaveValue("2026-11-05");

  // Buses: 5 + 6 supervisors on 10-seat buses → 2 buses, split evenly in the order they registered.
  await sheet.locator("button", { hasText: "المقبولين" }).click();
  await expect(page.getByTestId("trip-letter-count")).toContainText("5");
  await expect(page.getByTestId("trip-bus-counts")).toContainText("لسه متقسموش");
  await page.getByTestId("trip-split").click();
  await expect(page.getByTestId("trip-bus-counts")).toContainText("أتوبيس 1: 3 · أتوبيس 2: 2");
  expect(calls.find((c) => c.fn === "staff_form_set_buses")?.body).toEqual({ p_form: "f1", p_buses: { r0: 1, r1: 1, r2: 1, r3: 2, r4: 2, r5: 0 } });
  let text = await pages();
  let file = page.waitForEvent("download");
  await page.getByTestId("trip-letter-make").click();
  expect((await file).suggestedFilename()).toMatch(/^buildx-bus-request-drone-day-.*\.pdf$/);
  for (const s of ["طلب توفير أتوبيسات", "أتوبيس 1", "أتوبيس 2", "طالب 5"]) expect(await text()).toContain(s);
  expect(await text()).not.toContain("طالب 6");

  // The lecture excuse letter: only who was really there.
  await sheet.locator("button", { hasText: "اعتذار محاضرات" }).click();
  await expect(page.getByTestId("trip-excuse-count")).toContainText("2");
  text = await pages();
  file = page.waitForEvent("download");
  await page.getByTestId("trip-excuse-make").click();
  const excuse = await file;
  expect(excuse.suggestedFilename()).toMatch(/^buildx-lecture-excuse-drone-day-.*\.pdf$/);
  if (process.env.SAVE_TRIP) copyFileSync((await excuse.path())!, `${process.env.SAVE_TRIP}/excuse.pdf`);
  for (const s of ["طلب احتساب غياب بعذر", "Drone Day", "طالب 1", "طالب 2"]) expect(await text()).toContain(s);
  expect(await text()).not.toContain("طالب 3");

  // The report: what happened and the numbers.
  await sheet.locator("button", { hasText: "تقرير" }).click();
  await page.getByTestId("trip-report-summary").fill("ورشة عملية على تجميع وطيران الدرون.");
  text = await pages();
  file = page.waitForEvent("download");
  await page.getByTestId("trip-report-make").click();
  const report = await file;
  expect(report.suggestedFilename()).toMatch(/^buildx-event-report-drone-day-.*\.pdf$/);
  if (process.env.SAVE_TRIP) copyFileSync((await report.path())!, `${process.env.SAVE_TRIP}/report.pdf`);
  for (const s of ["ورشة عملية على تجميع وطيران الدرون.", "Drone Day"]) expect(await text()).toContain(s);

  // The accounts: fees collected (4 × 100) minus what was spent.
  await sheet.locator("button", { hasText: "حسابات" }).click();
  await expect(page.getByTestId("trip-money-balance")).toContainText("400 جنيه");
  await page.getByTestId("trip-add-expenses").click();
  await sheet.getByLabel("البند", { exact: true }).last().fill("أتوبيس");
  await sheet.getByLabel("المبلغ", { exact: true }).last().fill("250");
  await expect(page.getByTestId("trip-money-balance")).toContainText("150 جنيه");
  file = page.waitForEvent("download");
  await page.getByTestId("trip-money-xlsx").click();
  expect((await file).suggestedFilename()).toMatch(/^buildx-accounts-drone-day-.*\.xlsx$/);

  // Certificates for the two who came: only the one without one is issued, both get their link.
  await sheet.locator("button", { hasText: "شهادات" }).click();
  await expect(page.getByTestId("trip-certs-count")).toContainText("2");
  await page.getByTestId("trip-certs-issue").click();
  await expect(page).toHaveURL(/#\/staff\/whatsapp/);
  expect(certPosts).toHaveLength(1);
  expect(certPosts[0]).toMatchObject([{ recipient_name: "طالب 2", title: "Drone Day", kind: "participation" }]);
  const handoff = JSON.parse(await page.evaluate(() => (window as unknown as { handoff: string }).handoff)) as { people: { name: string; vars: { code: string; link: string } }[]; context: string };
  expect(handoff.context).toBe("form:f1:certs");
  expect(handoff.people.map((p) => [p.name, p.vars.code])).toEqual([["طالب 1", "BXC-AAAAAAAA"], ["طالب 2", "BXC-00000001"]]);
  expect(handoff.people[1].vars.link).toContain("BXC-00000001");
  delete RPC.staff_trip_letter;
  expect(errors).toEqual([]);
});

test("3D AI in the app: approve a top-up from its receipt (then WhatsApp them), and save prices and how to pay", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls: { fn: string; body: unknown }[] = [];
  RPC.staff_ai3d_overview = {
    settings: { enabled: false, key_set: true, ai_model: null, cost_text: 1, cost_image: 1, textured: true, packages: [{ credits: 1, price: 60 }, { credits: 5, price: 250 }], pay_ar: null, pay_en: null, free_credits: 0 },
    stats: { wallets: 1, done: 0, failed: 0, active: 0, income: 0, pending: 1 },
    topups: [{ id: "t1", wallet: "w1", code: "X3D-1A2B3C4D", name: "Mona Adel", phone: "+201012345678", credits: 5, amount: 250, method: "vodafone_cash", sender: "01099999999", receipt: "r/w1/x.jpg", status: "pending", note: null, created_at: at(30) }],
    jobs: [],
    wallets: [{ id: "w1", code: "X3D-1A2B3C4D", name: "Mona Adel", phone: "+201012345678", credits: 0, blocked: false, created_at: at(60), seen_at: at(10), models: 0 }],
  };
  RPC.staff_ai3d_topup_review = { ok: true, name: "Mona Adel", phone: "+201012345678", code: "X3D-1A2B3C4D", credits: 5 };
  await signInAsOwner(page, calls);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.route(/\/storage\/v1\/object\/sign\/ai3d\//, (route) => route.fulfill({ json: { signedURL: "/object/sign/ai3d/r/w1/x.jpg?token=t" } }));
  await page.route(/\/storage\/v1\/object\/sign\/ai3d\/.*token=t/, (route) => route.fulfill({ body: png, contentType: "image/png" }));
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === "bx-wa-handoff") (window as unknown as { handoff: string }).handoff = v;
      return set.call(this, k, v);
    };
  });
  await page.goto("/app/#/staff/ai3d");
  const card = page.getByTestId("ai3d-pending");
  await expect(card).toContainText("Mona Adel");
  await expect(card).toContainText("5 كريدت");
  await expect(page.getByTestId("ai3d-receipt-img")).toBeVisible();
  await page.getByTestId("ai3d-approve").click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_ai3d_topup_review")?.body).toEqual({ p_id: "t1", p_approve: true, p_note: null });
  await expect(page).toHaveURL(/#\/staff\/whatsapp/);
  const handoff = JSON.parse(await page.evaluate(() => (window as unknown as { handoff: string }).handoff)) as { people: { phone: string }[]; text: string };
  expect(handoff.people[0].phone).toBe("+201012345678");
  expect(handoff.text).toContain("اتضاف 5 كريدت");

  // Settings: how to pay and a new price.
  await page.goto("/app/#/staff/ai3d");
  await page.getByRole("button", { name: "الإعدادات" }).click();
  await page.getByLabel("طريقة الدفع (بالعربي)").fill("فودافون كاش: 01000000000");
  await page.getByLabel("السعر").first().fill("70");
  await page.getByTestId("ai3d-settings-save").click();
  await expect.poll(() => calls.find((c) => c.fn === "staff_ai3d_settings_save")?.body).toMatchObject({
    p: { pay_ar: "فودافون كاش: 01000000000", packages: [{ credits: 1, price: 70 }, { credits: 5, price: 250 }] },
  });
  delete RPC.staff_ai3d_overview;
  delete RPC.staff_ai3d_topup_review;
  expect(errors).toEqual([]);
});
