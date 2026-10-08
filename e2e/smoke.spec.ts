import { expect, test, type Page } from "@playwright/test";

/** No real Supabase calls from tests: everything the site reads or writes is mocked here. */
async function mockSupabase(page: Page, opts: { submit?: (body: unknown) => void } = {}) {
  await page.route("**/rest/v1/rpc/submit_application", async (route) => {
    opts.submit?.(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true, ref: "BX-TEST01" } });
  });
  await page.route("**/rest/v1/site_settings**", (route) => route.fulfill({ json: [{ value: { open: true } }] }));
  await page.route("**/rest/v1/team_profiles**", (route) =>
    route.fulfill({
      json: [
        { id: "a", slug: "alaa-saber", full_name: "Alaa Saber", full_name_ar: "علاء صابر", headline: "Founder", headline_ar: "المؤسس", bio: "", bio_ar: null, group_kind: "founder", track: null, photo_path: null, skills: [], links: {}, external_url: "https://3laa.site", published: true, sort_order: 0 },
      ],
    }),
  );
  await page.route("**/rest/v1/team_projects**", (route) => route.fulfill({ json: [] }));
  await page.route("**/rest/v1/site_content**", (route) => route.fulfill({ json: [] }));
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

for (const path of ["/", "/ar/"]) {
  test(`home ${path} renders`, async ({ page }) => {
    const errors = collectErrors(page);
    await mockSupabase(page);
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page).toHaveTitle(/BuildX HUE/);
    expect(errors).toEqual([]);
  });
}

test("application form validates and submits", async ({ page }) => {
  const errors = collectErrors(page);
  const sent: { p?: Record<string, unknown> }[] = [];
  await mockSupabase(page, { submit: (b) => sent.push(b as { p?: Record<string, unknown> }) });
  await page.goto("/ar/join/");
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByText("اكتب اسمك بالكامل (3 حروف على الأقل).")).toBeVisible();
  await page.fill("#ap-full_name", "طالب اختبار");
  await page.fill("#ap-phone", "01012345678");
  await page.fill("#ap-email", "test@example.com");
  await page.fill("#ap-faculty", "الذكاء الاصطناعي");
  await page.selectOption("#ap-academic_year", "1");
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("radio").first().click();
  await page.getByRole("radio", { name: /مبتدئ/ }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.fill("#ap-motivation", "عايز أتعلم وأبني مشاريع حقيقية مع الفريق.");
  await page.getByRole("radio", { name: "3 – 5 ساعات" }).click();
  await page.check("#ap-consent");
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "ابعت الطلب" }).click();
  await expect(page.getByText("BX-TEST01")).toBeVisible();
  expect(sent[0]?.p?.phone).toBe("01012345678");
  expect(sent[0]?.p?.consent).toBe(true);
  expect(errors).toEqual([]);
});

test("team page lists founders and links out to 3laa.site", async ({ page }) => {
  const errors = collectErrors(page);
  await mockSupabase(page);
  await page.goto("/ar/team/");
  const card = page.locator("a", { hasText: "علاء صابر" }).first();
  await expect(card).toHaveAttribute("href", "https://3laa.site");
  expect(errors).toEqual([]);
});

test("an applicant checks their application status with reference and phone", async ({ page }) => {
  const errors = collectErrors(page);
  await mockSupabase(page);
  const calls: { p_ref: string; p_phone: string }[] = [];
  await page.route("**/rest/v1/rpc/application_status", async (route) => {
    const body = route.request().postDataJSON() as { p_ref: string; p_phone: string };
    calls.push(body);
    await route.fulfill({
      json:
        body.p_phone === "01012345678"
          ? { ok: true, ref: "BX-TEST01", first_name: "Mona", track: "ai-ml", status: "interview", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-03T10:00:00Z", note: "Sunday 2pm, lab B" }
          : { ok: false, error: "not_found" },
    });
  });
  await page.goto("/ar/join/status/?ref=bx-test01");
  await expect(page.getByLabel("رقم الطلب")).toHaveValue("BX-TEST01");
  await page.getByLabel("رقم الموبايل اللي قدّمت بيه").fill("01099999999");
  await page.getByRole("button", { name: "اعرف حالة طلبك" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "مش لاقيين" })).toBeVisible();
  await page.getByLabel("رقم الموبايل اللي قدّمت بيه").fill("01012345678");
  await page.getByRole("button", { name: "اعرف حالة طلبك" }).click();
  await expect(page.getByText("أهلاً Mona!")).toBeVisible();
  await expect(page.getByText("Sunday 2pm, lab B")).toBeVisible();
  await expect(page.getByText("الذكاء الاصطناعي وتعلّم الآلة")).toBeVisible();
  expect(calls.at(-1)).toEqual({ p_ref: "BX-TEST01", p_phone: "01012345678" });
  expect(errors).toEqual([]);
});

test("a scanned certificate QR opens the verify page and shows it is genuine", async ({ page }) => {
  const errors = collectErrors(page);
  await mockSupabase(page);
  const asked: string[] = [];
  await page.route("**/rest/v1/rpc/verify_certificate", async (route) => {
    const { p_code } = route.request().postDataJSON() as { p_code: string };
    asked.push(p_code);
    await route.fulfill({
      json:
        p_code === "BXC-1A2B3C4D"
          ? { ok: true, code: "BXC-1A2B3C4D", name: "Mona Adel", kind: "completion", title: "Robotics Bootcamp 2026", title_ar: "بوتكامب الروبوتات 2026", details: null, details_ar: null, hours: 24, issued_on: "2026-10-07", revoked: false, revoked_on: null }
          : { ok: false, error: "not_found" },
    });
  });
  await page.goto("/verify/?c=BXC-1A2B3C4D");
  await expect(page.getByText("Valid certificate")).toBeVisible();
  await expect(page.getByText("Mona Adel")).toBeVisible();
  await expect(page.getByText("Certificate of Completion — Robotics Bootcamp 2026")).toBeVisible();
  await page.getByRole("button", { name: "Check another code" }).click();
  await page.getByLabel("Certificate code").fill("BXC-FFFFFFFF");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No certificate has this code" })).toBeVisible();
  expect(asked).toEqual(["BXC-1A2B3C4D", "BXC-FFFFFFFF"]);
  expect(errors).toEqual([]);
});

test("a student registers for an event and opens a QR ticket", async ({ page }) => {
  const errors = collectErrors(page);
  await mockSupabase(page);
  const event = { id: "e1", kind: "event", slug: "kickoff", title: "Kickoff meeting", title_ar: "اجتماع البداية", summary: null, summary_ar: null, body: null, body_ar: null, result: null, result_ar: null, image_path: null, url: null, starts_at: "2030-01-10T15:00:00Z", ends_at: null, location: "Hall B", location_ar: "قاعة ب", track: null, tags: [], pinned: false, published: true, sort_order: 0, created_at: "2026-10-01T00:00:00Z", rsvp_open: true, capacity: 40 };
  await page.route("**/rest/v1/site_content**", (route) => route.fulfill({ json: route.request().headers().accept?.includes("vnd.pgrst.object") ? event : [event] }));
  await page.route("**/rest/v1/rpc/event_rsvp", (route) => route.fulfill({ json: { open: true, capacity: 40, going: 37 } }));
  let sent: { p_event: string; p: Record<string, string> } | null = null;
  await page.route("**/rest/v1/rpc/register_event", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, ticket: "BXT-1A2B3C4D", status: "going" } });
  });
  await page.route("**/rest/v1/rpc/event_ticket", (route) =>
    route.fulfill({ json: { ok: true, ticket: "BXT-1A2B3C4D", name: "Mona Adel", status: "going", checked_in: false, waitlist_place: null, event: { id: "e1", slug: "kickoff", title: "Kickoff meeting", title_ar: "اجتماع البداية", starts_at: "2030-01-10T15:00:00Z", location: "Hall B", location_ar: "قاعة ب" } } }),
  );
  await page.goto("/ar/events/item/?s=kickoff");
  await expect(page.getByText("فاضل 3 مكان")).toBeVisible();
  await page.getByLabel("الاسم بالكامل").fill("Mona Adel");
  await page.getByLabel("الموبايل (واتساب)").fill("01012345678");
  await page.getByRole("button", { name: "سجّل", exact: true }).click();
  await expect(page.getByText("اتسجلت!")).toBeVisible();
  expect(sent).toMatchObject({ p_event: "e1", p: { full_name: "Mona Adel", phone: "01012345678", website: "" } });
  await page.getByRole("link", { name: "افتح تذكرتي" }).click();
  await expect(page).toHaveURL(/\/ar\/ticket\/\?t=BXT-1A2B3C4D$/);
  await expect(page.getByText("مؤكَّد")).toBeVisible();
  await expect(page.getByRole("img", { name: "BXT-1A2B3C4D" })).toBeVisible();
  // Sending it to yourself on WhatsApp (free share link with the ticket's address).
  await expect(page.getByRole("link", { name: "ابعتها لنفسي على واتساب" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=.*BXT-1A2B3C4D/);
  // Coming back to the event page shows the saved ticket instead of the form.
  await page.goto("/ar/events/item/?s=kickoff");
  await expect(page.getByText("انت متسجل في الفعالية دي")).toBeVisible();
  expect(errors).toEqual([]);
});

test("sign-in is visible in the header on a phone and the menu offers the one app sign-in", async ({ page }) => {
  await mockSupabase(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/ar/");
  const signIn = page.locator("header").getByRole("link", { name: "تسجيل الدخول" });
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute("href", "/app/");
  await page.locator('header button[aria-controls="site-menu"]').click();
  await expect(page.locator("#site-menu").getByRole("link", { name: /دخول BuildX App/ })).toHaveAttribute("href", "/app/#/login");
});

test("success stories page shows the team's stories, and the footer offers the app once it's in a store", async ({ page }) => {
  const errors = collectErrors(page);
  await mockSupabase(page);
  await page.route("**/rest/v1/site_settings**", (route) =>
    route.fulfill({ json: new URL(route.request().url()).searchParams.get("key") === "eq.apps" ? [{ value: { student_android: "https://play.google.com/store/apps/details?id=com.buildxhue.student" } }] : [{ value: { open: true } }] }),
  );
  await page.route("**/rest/v1/site_content**", (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.get("kind") === "eq.story"
        ? [{ id: "st1", kind: "story", slug: null, title: "Mona Adel", title_ar: "منى عادل", summary: null, summary_ar: "بدأت من صفر في الروبوتات", body: null, body_ar: "القصة كاملة هنا", result: null, result_ar: "مهندسة في Valeo", image_path: null, url: "https://linkedin.com/in/mona", starts_at: null, ends_at: null, location: null, location_ar: null, track: null, tags: [], published: true, pinned: false, sort_order: 0, created_at: new Date().toISOString() }]
        : [],
    }),
  );
  await page.goto("/ar/stories/");
  await expect(page.getByRole("heading", { name: "منى عادل" })).toBeVisible();
  await expect(page.getByText("دلوقتي: مهندسة في Valeo")).toBeVisible();
  await page.getByRole("button", { name: "القصة كاملة" }).click();
  await expect(page.getByText("القصة كاملة هنا")).toBeVisible();
  // Desktop shows every store that has a link; only Google Play is set here.
  await expect(page.locator("footer").getByRole("link", { name: /Google Play/ })).toHaveAttribute("href", /com\.buildxhue\.student/);
  await expect(page.locator("footer").getByRole("link", { name: /App Store/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
