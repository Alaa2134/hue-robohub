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
  // Four names, as on the ID card. No national ID, governorate or address before acceptance.
  await page.fill("#ap-full_name", "طالب اختبار");
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByText("اكتب اسمك رباعي زي البطاقة.")).toBeVisible();
  await expect(page.locator("#ap-national_id")).toHaveCount(0);
  await expect(page.locator("#ap-governorate")).toHaveCount(0);
  await expect(page.locator("#ap-address")).toHaveCount(0);
  await page.fill("#ap-full_name", "طالب اختبار محمد علي");
  await page.fill("#ap-phone", "01012345678");
  await page.fill("#ap-email", "test@example.com");
  await page.fill("#ap-faculty", "الذكاء الاصطناعي");
  await page.selectOption("#ap-academic_year", "1");
  await page.getByRole("button", { name: "التالي" }).click();
  // The university ID is required too.
  await expect(page.locator("#ap-student_number-error")).toBeVisible();
  await page.fill("#ap-student_number", "8240001");
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("radio").first().click();
  await page.getByRole("radio", { name: /مبتدئ/ }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.fill("#ap-motivation", "عايز أتعلم وأبني مشاريع حقيقية مع الفريق.");
  await page.getByRole("radio", { name: "3 – 5 ساعات" }).click();
  await page.check("#ap-consent");
  await page.getByRole("button", { name: "التالي" }).click();
  // On a phone the buttons stay on screen under the long review (no bottom tab bar on this page).
  if (test.info().project.name === "mobile") {
    await expect(page.getByRole("button", { name: "ابعت الطلب" })).toBeInViewport();
    await expect(page.getByRole("link", { name: "الرئيسية" })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "ابعت الطلب" }).click();
  await expect(page.getByText("BX-TEST01")).toBeVisible();
  expect(sent[0]?.p?.phone).toBe("01012345678");
  expect(sent[0]?.p?.consent).toBe(true);
  expect(sent[0]?.p).toMatchObject({ national_id: "", governorate: "", address: "", student_number: "8240001" });
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

test("the join form doesn't ask for a national ID or address; an accepted applicant gives them once, from the status page", async ({ page }) => {
  const errors = collectErrors(page);
  await mockSupabase(page);
  const sent: Record<string, string>[] = [];
  await page.route("**/rest/v1/rpc/application_status", (route) =>
    route.fulfill({ json: { ok: true, ref: "BX-TEST02", first_name: "Omar", track: "ai-ml", status: "accepted", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-03T10:00:00Z", note: "", family_needed: true } }),
  );
  await page.route("**/rest/v1/rpc/application_family_complete", async (route) => {
    const body = route.request().postDataJSON() as Record<string, string>;
    sent.push(body);
    await route.fulfill({ json: body.p_national_id === "30501011100012" ? { ok: true } : { ok: false, error: "nid" } });
  });
  await page.goto("/ar/join/");
  await expect(page.getByLabel("الاسم رباعي (زي البطاقة)").first()).toBeVisible();
  await expect(page.getByLabel("الرقم القومي")).toHaveCount(0);
  await expect(page.getByLabel("العنوان بالتفصيل")).toHaveCount(0);

  await page.goto("/ar/join/status/?ref=BX-TEST02");
  await page.getByLabel("رقم الموبايل اللي قدّمت بيه").fill("01012345678");
  await page.getByRole("button", { name: "اعرف حالة طلبك" }).click();
  const step = page.getByTestId("family-step");
  await expect(step).toBeVisible();
  await step.getByLabel("الرقم القومي (14 رقم)").fill("30501011100099");
  await step.getByLabel("المحافظة").selectOption({ index: 1 });
  await step.getByLabel("العنوان بالتفصيل").fill("دمياط الجديدة - الحي الخامس");
  await step.getByRole("button", { name: "ابعت" }).click();
  await expect(step.getByRole("alert")).toContainText("الرقم ده مش شبه الرقم القومي");
  await step.getByLabel("الرقم القومي (14 رقم)").fill("30501011100012");
  await step.getByRole("button", { name: "ابعت" }).click();
  await expect(page.getByTestId("family-done")).toBeVisible();
  expect(sent.at(-1)).toMatchObject({ p_ref: "BX-TEST02", p_phone: "01012345678", p_national_id: "30501011100012", p_address: "دمياط الجديدة - الحي الخامس" });
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

test("events: someone with a warning sees it on their ticket screen, and someone blocked is told they can't register", async ({ page }) => {
  await mockSupabase(page);
  const event = { id: "e1", kind: "event", slug: "kickoff", title: "Kickoff meeting", title_ar: "اجتماع البداية", summary: null, summary_ar: null, body: null, body_ar: null, result: null, result_ar: null, image_path: null, url: null, starts_at: "2030-01-10T15:00:00Z", ends_at: null, location: "Hall B", location_ar: "قاعة ب", track: null, tags: [], pinned: false, published: true, sort_order: 0, created_at: "2026-10-01T00:00:00Z", rsvp_open: true, capacity: 40 };
  await page.route("**/rest/v1/site_content**", (route) => route.fulfill({ json: route.request().headers().accept?.includes("vnd.pgrst.object") ? event : [event] }));
  await page.route("**/rest/v1/rpc/event_rsvp", (route) => route.fulfill({ json: { open: true, capacity: 40, going: 37 } }));
  let blocked = true;
  await page.route("**/rest/v1/rpc/register_event", (route) =>
    route.fulfill({ json: blocked ? { ok: false, error: "banned" } : { ok: true, ticket: "BXT-1A2B3C4D", status: "going", warned: true } }),
  );
  await page.goto("/ar/events/item/?s=kickoff");
  await page.getByLabel("الاسم بالكامل").fill("Mona Adel");
  await page.getByLabel("الموبايل (واتساب)").fill("01012345678");
  await page.getByRole("button", { name: "سجّل", exact: true }).click();
  await expect(page.getByText("عليك حظر من التسجيل في فعاليات BuildX HUE")).toBeVisible();
  blocked = false;
  await page.getByRole("button", { name: "سجّل", exact: true }).click();
  await expect(page.getByText("اتسجلت!")).toBeVisible();
  await expect(page.getByTestId("no-show-warned")).toContainText("عليك إنذار");
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
    route.fulfill({ json: new URL(route.request().url()).searchParams.get("key") === "eq.apps" ? [{ value: { student_android: "https://play.google.com/store/apps/details?id=buildx.hue.app" } }] : [{ value: { open: true } }] }),
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
  await expect(page.locator("footer").getByRole("link", { name: /Google Play/ })).toHaveAttribute("href", /buildx\.hue\.app/);
  await expect(page.locator("footer").getByRole("link", { name: /App Store/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the join form follows the setup the team saved in the app", async ({ page }) => {
  const errors = collectErrors(page);
  const sent: { p?: Record<string, unknown> }[] = [];
  await mockSupabase(page, { submit: (b) => sent.push(b as { p?: Record<string, unknown> }) });
  const setup = {
    steps_ar: ["عنك", "", ""],
    fields: {
      full_name: { label_ar: "اسمك الرباعي" },
      faculty: { hidden: true },
      // The team can still ask for the family-list data up front.
      national_id: { hidden: false, required: true },
      governorate: { hidden: false, required: true },
      address: { hidden: false, required: true },
      academic_year: { options: [{ key: "o_first1", ar: "أولى" }, { key: "o_other1", ar: "سنة تانية أو أكتر" }] },
      motivation: { required: false },
      hours_per_week: { hidden: true },
    },
    extra: [
      { id: "q_like01", step: 0, type: "select", label_ar: "بتحب إيه أكتر؟", required: true, options: [{ ar: "روبوتات" }, { ar: "برمجة" }] },
      { id: "q_laptop", step: 2, type: "yesno", label_ar: "عندك لابتوب؟", required: true },
    ],
    tracks_hidden: ["business"],
    consent_ar: "موافق على شروط الأسرة.",
  };
  await page.route("**/rest/v1/site_settings**", (route) =>
    route.fulfill({ json: new URL(route.request().url()).searchParams.get("key") === "eq.apply_form" ? [{ value: setup }] : [{ value: { open: true } }] }),
  );
  await page.goto("/ar/join/");
  await expect(page.getByText("اسمك الرباعي")).toBeVisible();
  await expect(page.locator("legend", { hasText: "عنك" })).toBeVisible();
  await expect(page.locator("#ap-faculty")).toHaveCount(0);
  await page.fill("#ap-full_name", "طالب اختبار محمد علي");
  await page.fill("#ap-national_id", "30613451100035");
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByText("الرقم ده مش شبه الرقم القومي — راجع الـ14 رقم.")).toBeVisible();
  await page.fill("#ap-national_id", "٣٠٦٠١١٢١١٠٠٠٣٥");
  await expect(page.locator("#ap-national_id")).toHaveValue("30601121100035");
  await expect(page.getByTestId("ap-nid-read")).toContainText("دمياط");
  await page.fill("#ap-phone", "01012345678");
  await page.fill("#ap-email", "test@example.com");
  await page.selectOption("#ap-governorate", "الدقهلية");
  await page.fill("#ap-address", "المنصورة - شارع الجمهورية");
  await page.selectOption("#ap-academic_year", "o_first1");
  await page.fill("#ap-student_number", "8251234");
  // The added question is required.
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "الخانة دي مطلوبة." })).toBeVisible();
  await page.getByRole("radio", { name: "برمجة" }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  // A hidden track isn't offered.
  await expect(page.getByRole("radio", { name: /الأعمال/ })).toHaveCount(0);
  await page.getByRole("radio").first().click();
  await page.getByRole("radio", { name: /مبتدئ/ }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  // «Why» is optional now and the hours question is gone; the added yes/no is required.
  await expect(page.locator("#ap-hours_per_week")).toHaveCount(0);
  await page.check("#ap-consent");
  await expect(page.getByText("موافق على شروط الأسرة.")).toBeVisible();
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "الخانة دي مطلوبة." })).toBeVisible();
  await page.getByRole("radio", { name: "أيوه" }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  // The review shows the added answers.
  await expect(page.getByText("بتحب إيه أكتر؟")).toBeVisible();
  await expect(page.getByText("أولى")).toBeVisible();
  await page.getByRole("button", { name: "ابعت الطلب" }).click();
  await expect(page.getByText("BX-TEST01")).toBeVisible();
  expect(sent[0]?.p).toMatchObject({ faculty: "", hours_per_week: "", academic_year: "o_first1", national_id: "30601121100035", governorate: "الدقهلية", answers: { q_like01: "برمجة", q_laptop: "yes" } });
  // The national ID is never kept in the saved draft.
  expect(await page.evaluate(() => localStorage.getItem("buildx_apply_draft_v1") ?? "")).not.toContain("30601121100035");
  expect(errors).toEqual([]);
});

test("an empty section points to what's there instead of a dead end", async ({ page }) => {
  const errors = collectErrors(page);
  await mockSupabase(page);
  await page.goto("/ar/news/");
  const empty = page.getByTestId("empty-next");
  await expect(empty).toContainText("لسه بنجهّز المحتوى ده");
  await expect(empty.getByRole("link", { name: "الفعاليات" })).toHaveAttribute("href", /^\/ar\/events\/?$/);
  await expect(empty.getByRole("link", { name: "الفورمات المفتوحة" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the season plan follows the date: finished quarters say so, the one running now is marked, past planned events drop", async ({ page }) => {
  const errors = collectErrors(page);
  await mockSupabase(page);
  await page.clock.setFixedTime(new Date("2026-12-15T10:00:00+02:00"));
  await page.goto("/ar/events/");
  const roadmap = page.locator("#roadmap");
  await expect(roadmap.locator("li", { hasText: "Q1" }).getByText("خلص ✓")).toBeVisible();
  await expect(roadmap.locator("li", { hasText: "Q2" }).getByText("دلوقتي")).toBeVisible();
  await expect(roadmap.getByText("يوم التعريف")).toHaveCount(0);
  await expect(roadmap.getByRole("heading", { name: "ورش تقنية" })).toBeHidden();
  await expect(roadmap.getByRole("heading", { name: "معسكرات التحضير للمسابقات" })).toBeVisible();
  expect(errors).toEqual([]);
});
