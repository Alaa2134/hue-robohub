import { existsSync, readdirSync, readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * The website's live features on the static site, with Supabase answered by the test:
 * contact + sponsorship forms, the applications waitlist, forms built in the app (and team
 * tryouts), the next-event countdown, the hall of fame, event feedback, LinkedIn on verify,
 * share images, and Baqloz answering from live data.
 */
type Rpc = Record<string, (body: Record<string, unknown>) => unknown>;
type Mock = { rpc?: Rpc; rest?: (url: URL) => unknown; calls: { fn: string; body: Record<string, unknown> }[] };

async function mockSupabase(page: Page, m: Omit<Mock, "calls">) {
  const calls: Mock["calls"] = [];
  await page.route(/supabase\.co\//, async (route: Route) => {
    const url = new URL(route.request().url());
    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (rpc) {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      calls.push({ fn: rpc, body });
      const handler = m.rpc?.[rpc];
      return handler ? route.fulfill({ json: handler(body) }) : route.fulfill({ json: null });
    }
    if (url.pathname.startsWith("/rest/v1/")) return route.fulfill({ json: m.rest?.(url) ?? [] });
    return route.abort();
  });
  return calls;
}

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

test("Contact us sends the message to the team's inbox", async ({ page }) => {
  const calls = await mockSupabase(page, { rpc: { submit_message: () => ({ ok: true }) } });
  await page.goto("/ar/contact/");
  const form = page.locator("form").filter({ has: page.getByLabel("رسالتك") });
  await form.getByRole("button", { name: "ابعت" }).click();
  await expect(form.getByRole("alert").first()).toBeVisible();
  await form.getByLabel("الاسم").fill("سارة أحمد");
  await form.getByLabel("رقم الموبايل / واتساب").fill("01012345678");
  await form.getByLabel("رسالتك").fill("عايزين نعمل ورشة في الكلية عندنا الشهر الجاي");
  await form.getByRole("button", { name: "ابعت" }).click();
  await expect(page.getByText("وصلتنا رسالتك")).toBeVisible();
  const sent = calls.find((c) => c.fn === "submit_message")!.body.p as Record<string, string>;
  expect(sent).toMatchObject({ name: "سارة أحمد", phone: "01012345678", kind: "contact", locale: "ar", website: "" });
});

test("Sponsors page: companies send a sponsorship request (with the deck link)", async ({ page }) => {
  const calls = await mockSupabase(page, {
    rpc: { submit_message: () => ({ ok: true }) },
    rest: (u) => (u.searchParams.get("key") === "eq.sponsorship" ? [{ value: { deck_url: "https://example.com/deck.pdf" } }] : []),
  });
  await page.goto("/ar/sponsors/");
  const form = page.getByRole("form", { name: "طلب رعاية" });
  await form.scrollIntoViewIfNeeded();
  await expect(form.getByRole("link", { name: "حمّل ملف الرعاية (PDF)" })).toHaveAttribute("href", "https://example.com/deck.pdf");
  await form.getByLabel("الاسم").fill("محمد علي");
  await form.getByLabel("البريد الإلكتروني").fill("m@company.com");
  await form.getByLabel("احكيلنا عن الشركة وإزاي حابين تدعمونا").fill("شركة أنظمة مدمجة حابة ترعى فريق السومو");
  await form.getByRole("button", { name: "ابعت" }).click();
  // The company name is required for a sponsorship request.
  await expect(form.getByLabel("الجهة / الشركة")).toHaveAttribute("aria-invalid", "true");
  await form.getByLabel("الجهة / الشركة").fill("Acme Robotics");
  await form.getByLabel("الباقة اللي مهتمين بيها").selectOption("gold");
  await form.getByRole("button", { name: "ابعت" }).click();
  await expect(page.getByText("فريق الشراكات هيتواصل معاكم")).toBeVisible();
  expect(calls.find((c) => c.fn === "submit_message")!.body.p).toMatchObject({ kind: "sponsor", organization: "Acme Robotics", tier: "gold" });
});

test("Applications closed: visitors join the waitlist", async ({ page }) => {
  const calls = await mockSupabase(page, {
    rpc: { join_waitlist: () => ({ ok: true }) },
    rest: (u) => (u.searchParams.get("key") === "eq.applications" ? [{ value: { open: false, message_ar: "التقديم هيفتح في فبراير", message_en: "" } }] : []),
  });
  await page.goto("/ar/join/");
  await expect(page.getByText("التقديم هيفتح في فبراير")).toBeVisible();
  const wl = page.getByRole("form", { name: "بلّغني أول ما التقديم يفتح" });
  await wl.getByRole("button", { name: "بلّغني" }).click();
  await expect(wl.getByRole("alert")).toBeVisible();
  await wl.getByPlaceholder("01xxxxxxxxx أو الإيميل").fill("01098765432");
  await wl.getByRole("button", { name: "بلّغني" }).click();
  await expect(page.getByText("أول ما التقديم يفتح هتعرف")).toBeVisible();
  expect(calls.find((c) => c.fn === "join_waitlist")!.body.p).toMatchObject({ phone: "01098765432", email: "" });
});

const TRYOUT = {
  slug: "sumo-tryouts",
  title_ar: "اختبارات فريق السومو",
  title_en: "Sumo team tryouts",
  intro_ar: "عايز تبقى في فريق السومو؟",
  team: "sumo",
  listed: true,
  open: true,
  closes_at: inHours(72),
  fields: [
    { id: "n", type: "name", label_ar: "الاسم بالكامل", required: true },
    { id: "p", type: "phone", label_ar: "رقم الموبايل", required: true },
    { id: "y", type: "select", label_ar: "السنة الدراسية", required: true, options: [{ ar: "أولى" }, { ar: "تانية" }] },
    { id: "s", type: "multi", label_ar: "تقدر تساعد في إيه؟", required: true, options: [{ ar: "برمجة" }, { ar: "إلكترونيات" }] },
    { id: "c", type: "checkbox", label_ar: "موافق إن الفريق يتواصل معايا", required: true },
  ],
};

test("Forms built in the app: listed when open, filled in, checked, sent", async ({ page }) => {
  const calls = await mockSupabase(page, {
    rpc: {
      public_forms: () => [TRYOUT, { ...TRYOUT, slug: "renewal", title_ar: "تجديد العضوية", team: null, open: false, opens_at: inHours(48), closes_at: null }],
      public_form: () => TRYOUT,
      submit_form: () => ({ ok: true }),
    },
  });
  await page.goto("/ar/forms/");
  await expect(page.getByRole("heading", { name: "اختبارات فريق السومو" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "تجديد العضوية" })).toBeVisible();
  await expect(page.getByText("قريباً")).toBeVisible();
  await page.getByRole("link", { name: "املأ الفورم" }).click();
  await expect(page).toHaveURL(/\/form\/\?f=sumo-tryouts/);
  await expect(page.getByRole("heading", { name: "اختبارات فريق السومو" })).toBeVisible();
  await page.getByRole("button", { name: "ابعت" }).click();
  await expect(page.getByLabel("الاسم بالكامل")).toBeFocused();
  await page.getByLabel("الاسم بالكامل").fill("يوسف خالد");
  await page.getByLabel("رقم الموبايل", { exact: true }).fill("01112223334");
  await page.getByLabel("السنة الدراسية").selectOption("تانية");
  await page.getByRole("button", { name: "إلكترونيات" }).click();
  await page.getByLabel("موافق إن الفريق يتواصل معايا").check();
  await page.getByRole("button", { name: "ابعت" }).click();
  await expect(page.getByText("وصلنا ردك")).toBeVisible();
  const sent = calls.find((c) => c.fn === "submit_form")!.body;
  expect(sent).toMatchObject({ p_slug: "sumo-tryouts", p_locale: "ar", p_answers: { n: "يوسف خالد", p: "01112223334", y: "تانية", s: ["إلكترونيات"], c: true } });
});

test("a closed form says so instead of taking answers", async ({ page }) => {
  await mockSupabase(page, { rpc: { public_form: () => ({ ...TRYOUT, open: false, opens_at: inHours(24) }) } });
  await page.goto("/ar/form/?f=sumo-tryouts");
  await expect(page.getByText("الفورم ده مقفول دلوقتي")).toBeVisible();
  await expect(page.getByRole("button", { name: "ابعت" })).toHaveCount(0);
});

test("a competition team's page invites tryouts while its form is open", async ({ page }) => {
  await mockSupabase(page, { rpc: { public_forms: () => [TRYOUT] } });
  await page.goto("/ar/competitions/sumo/");
  await expect(page.getByText("التقديم على الفريق ده مفتوح دلوقتي!")).toBeVisible();
  await page.getByRole("link", { name: "قدّم على الفريق" }).click();
  await expect(page).toHaveURL(/\/form\/\?f=sumo-tryouts/);
});

const EVENT = { id: "11111111-1111-1111-1111-111111111111", kind: "event", slug: "arduino-night", title: "Arduino Night", title_ar: "سهرة أردوينو", summary: null, summary_ar: "ورشة عملية", starts_at: inHours(50), ends_at: inHours(53), location: "Lab 3", location_ar: "معمل 3", published: true, tags: [], image_path: null, url: null };

test("home: the next event with a live countdown and places left", async ({ page }) => {
  await mockSupabase(page, {
    rpc: { event_rsvp: () => ({ open: true, capacity: 30, going: 26 }) },
    rest: (u) => (u.pathname.endsWith("/site_content") && u.searchParams.get("kind") === "eq.event" ? [EVENT] : []),
  });
  await page.goto("/ar/");
  const next = page.locator("section[aria-labelledby='next-event-title']");
  await expect(next.getByRole("heading", { name: "سهرة أردوينو" })).toBeVisible();
  await expect(next.getByText("فاضل 4 أماكن بس!")).toBeVisible();
  await expect(next.getByRole("timer")).toBeVisible();
  const first = await next.getByRole("timer").innerText();
  await expect.poll(() => next.getByRole("timer").innerText(), { timeout: 4000 }).not.toBe(first);
  await expect(next.getByRole("link", { name: "Google Calendar" })).toHaveAttribute("href", /calendar\.google\.com/);
  await expect(next.getByRole("link", { name: "سجّل مكانك" })).toHaveAttribute("href", /\/events\/arduino-night\/$/);
});

test("home: hall of fame when the team turns it on", async ({ page }) => {
  await mockSupabase(page, { rpc: { hall_of_fame: () => ({ star: { name: "منى حسن", group: "G1", reason_ar: "حضرت كل الجلسات", reason_en: null, month: "2026-10", points: 240 }, board: [{ name: "منى ح.", points: 240, badges: 4 }, { name: "عمر س.", points: 200, badges: 2 }, { name: "ليلى ع.", points: 150, badges: 1 }] }) } });
  await page.goto("/ar/");
  const hof = page.locator("#hall-of-fame");
  await hof.scrollIntoViewIfNeeded();
  await expect(hof.getByText("نجم الشهر")).toBeVisible();
  await expect(hof.getByText("منى حسن")).toBeVisible();
  await expect(hof.getByText("حضرت كل الجلسات")).toBeVisible();
  await expect(hof.locator("ol li")).toHaveCount(3);
});

test("ticket page: after the event, rate it", async ({ page }) => {
  const calls = await mockSupabase(page, {
    rpc: {
      event_ticket: () => ({ ok: true, ticket: "BXT-1A2B3C4D", name: "سارة", status: "going", checked_in: true, event: { id: EVENT.id, slug: EVENT.slug, title: EVENT.title, title_ar: EVENT.title_ar, starts_at: inHours(-3), location: null, location_ar: null } }),
      event_feedback_of: () => null,
      submit_event_feedback: () => ({ ok: true }),
    },
  });
  await page.goto("/ar/ticket/?t=BXT-1A2B3C4D");
  const fb = page.getByRole("form", { name: "إيه رأيك في الإيفنت؟" });
  await expect(fb).toBeVisible();
  await fb.getByRole("radio", { name: /^5/ }).click();
  await fb.getByLabel("قول رأيك في سطرين (اختياري)").fill("الورشة كانت عملية جداً");
  await fb.getByLabel("ممكن ننشر رأيك على الموقع باسمك الأول").check();
  await fb.getByRole("button", { name: "ابعت التقييم" }).click();
  await expect(page.getByText("شكراً على رأيك")).toBeVisible();
  expect(calls.find((c) => c.fn === "submit_event_feedback")!.body).toMatchObject({ p_ticket: "BXT-1A2B3C4D", p_rating: 5, p_publish: true });
  // No cancelling once the event has started.
  await expect(page.getByText("مش هتقدر تيجي؟")).toHaveCount(0);
});

test("verify: a valid certificate can be added to LinkedIn", async ({ page }) => {
  await mockSupabase(page, { rpc: { verify_certificate: () => ({ ok: true, code: "BXC-1A2B3C4D", name: "Sara Ahmed", kind: "completion", title: "Robotics Bootcamp", title_ar: "بوتكامب الروبوتكس", details: null, details_ar: null, hours: 40, issued_on: "2026-09-20", revoked: false, revoked_on: null }) } });
  await page.goto("/verify/?c=BXC-1A2B3C4D");
  const add = page.getByRole("link", { name: "Add to LinkedIn profile" });
  await expect(add).toBeVisible();
  const href = new URL((await add.getAttribute("href"))!);
  expect(href.host).toBe("www.linkedin.com");
  expect(Object.fromEntries(href.searchParams)).toMatchObject({ startTask: "CERTIFICATION_NAME", organizationName: "BuildX HUE", issueYear: "2026", issueMonth: "9", certId: "BXC-1A2B3C4D", certUrl: "https://buildxhue.com/verify/?c=BXC-1A2B3C4D" });
});

test("pages that would share the generic picture get their own share image", async () => {
  const dir = "out-static/og";
  test.skip(!existsSync(dir), "built without Chromium");
  const files = readdirSync(dir);
  expect(files.length).toBeGreaterThan(10);
  const home = readFileSync("out-static/ar/index.html", "utf8");
  const og = home.match(/property="og:image" content="([^"]+)"/)?.[1] ?? "";
  expect(og).toMatch(/\/og\/[a-z0-9-]+\.jpg$/);
  expect(files).toContain(og.split("/og/")[1]);
});

test("Baqloz answers from live data: the next event and places left", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("bx-guide-test", "1");
    localStorage.setItem("bx-guide-mode", "poster");
  });
  await mockSupabase(page, {
    rpc: {
      guide_live_context: () => ({ now: new Date().toISOString(), applications_open: true, events: [{ slug: "arduino-night", title: "سهرة أردوينو", starts_at: inHours(50), ends_at: null, location: "معمل 3", rsvp_open: true, capacity: 30, going: 27 }], news: [], forms: [] }),
    },
  });
  await page.goto("/ar/about/");
  await page.mouse.move(500, 400);
  await page.getByRole("button", { name: "بقلظ، مرشد BuildX: افتح القائمة" }).click({ timeout: 15_000 });
  const menu = page.getByRole("dialog", { name: "بقلظ" });
  await menu.getByLabel("اسأل بقلظ أي حاجة…").fill("الإيفنت الجاي إمتى؟");
  await menu.getByRole("button", { name: "ابعت", exact: true }).click();
  await expect(menu).toContainText("سهرة أردوينو", { timeout: 10_000 });
  await expect(menu).toContainText("فاضل 3 أماكن بس");
});

const EXPO_FORM = {
  slug: "robotex-2026",
  title_ar: "زيارة معرض Robotex & NDTX 2026",
  intro_ar: "BuildX HUE رايح زيارة لمعرض Robotex 2026",
  success_ar: "وصلنا طلبك 🎉",
  team: null,
  listed: true,
  open: true,
  closes_at: inHours(200),
  fields: [
    { id: "name", type: "name", label_ar: "الاسم بالكامل (بالعربي)", required: true },
    { id: "name_en", type: "text", label_ar: "الاسم بالإنجليزي (زي ما هيتكتب على بادج المعرض)", required: true },
    { id: "phone", type: "phone", label_ar: "رقم الموبايل (واتساب)", required: true },
    { id: "email", type: "email", label_ar: "الإيميل", required: true },
    { id: "day", type: "select", label_ar: "اليوم اللي تقدر تيجي فيه", required: true, options: [{ ar: "السبت 14 نوفمبر" }, { ar: "أي يوم" }] },
    { id: "agree", type: "checkbox", label_ar: "موافق ألتزم بمواعيد وتعليمات الفريق يوم الزيارة", required: true },
  ],
};

test("Robotex expo visit page: apply, get a reference code, then check the status", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls = await mockSupabase(page, {
    rpc: {
      public_form: () => EXPO_FORM,
      submit_form: () => ({ ok: true, ref: "F-1A2B3C4D" }),
      form_status: (b) => (b.p_ref === "F-1A2B3C4D" && b.p_phone === "01012345678" ? { ok: true, status: "new", title_ar: EXPO_FORM.title_ar } : { ok: false, error: "not_found" }),
    },
  });
  await page.goto("/ar/robotex/");
  await expect(page.getByRole("heading", { level: 1, name: "Robotex & NDTX Expo 2026" })).toBeVisible();
  await expect(page.getByText("مركز مصر للمعارض الدولية").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "موقع المعرض الرسمي" })).toHaveAttribute("href", "https://expo.ndtcorner.com");
  // The form is right on the page.
  await page.getByLabel("الاسم بالكامل (بالعربي)").fill("منى عادل");
  await page.getByLabel("الاسم بالإنجليزي (زي ما هيتكتب على بادج المعرض)").fill("Mona Adel");
  await page.getByLabel("رقم الموبايل (واتساب)").fill("01012345678");
  await page.getByLabel("الإيميل").fill("mona@example.com");
  await page.getByLabel("اليوم اللي تقدر تيجي فيه").selectOption("أي يوم");
  await page.getByLabel("موافق ألتزم بمواعيد وتعليمات الفريق يوم الزيارة").check();
  await page.getByRole("button", { name: "ابعت" }).click();
  await expect(page.getByText("وصلنا طلبك 🎉")).toBeVisible();
  await expect(page.getByTestId("form-ref")).toHaveText("F-1A2B3C4D");
  expect(calls.find((c) => c.fn === "submit_form")!.body).toMatchObject({ p_slug: "robotex-2026", p_answers: { name: "منى عادل", name_en: "Mona Adel", email: "mona@example.com", day: "أي يوم", agree: true } });
  // The status link fills in the code; with the phone it shows the status.
  await page.getByRole("link", { name: "تابع حالة طلبك" }).click();
  await expect(page.getByLabel("كود الطلب")).toHaveValue("F-1A2B3C4D");
  await page.getByLabel("رقم الموبايل اللي قدّمت بيه").fill("01099999999");
  await page.getByRole("button", { name: "اعرف حالتي" }).click();
  await expect(page.getByText("مش لاقيين طلب بالكود والرقم دول")).toBeVisible();
  await page.getByLabel("رقم الموبايل اللي قدّمت بيه").fill("01012345678");
  await page.getByRole("button", { name: "اعرف حالتي" }).click();
  await expect(page.getByText("طلبك وصل وبيتراجع")).toBeVisible();
  expect(errors).toEqual([]);
});

test("accepted with a next step on another site: open it, then «I've registered»", async ({ page }) => {
  let done = false;
  const calls = await mockSupabase(page, {
    rpc: {
      public_form: () => EXPO_FORM,
      form_status: () => ({ ok: true, status: "accepted", title_ar: EXPO_FORM.title_ar, accepted_ar: "اتقبلت في زيارة المعرض 🎉 سجّل كزائر في موقع المعرض.", accepted_url: "https://expo.ndtcorner.com/visitor", external_done: done }),
      form_external_done: () => ((done = true), { ok: true }),
    },
  });
  await page.goto("/ar/robotex/?ref=F-1A2B3C4D#status");
  await page.getByLabel("رقم الموبايل اللي قدّمت بيه").fill("01012345678");
  await page.getByRole("button", { name: "اعرف حالتي" }).click();
  await expect(page.getByText("اتقبلت 🎉")).toBeVisible();
  await expect(page.getByText("سجّل كزائر في موقع المعرض.")).toBeVisible();
  await expect(page.getByRole("link", { name: "افتح موقع التسجيل" })).toHaveAttribute("href", "https://expo.ndtcorner.com/visitor");
  await page.getByRole("button", { name: "سجّلت في موقع المعرض" }).click();
  await expect(page.getByText("الفريق عرف إنك سجّلت")).toBeVisible();
  expect(calls.find((c) => c.fn === "form_external_done")!.body).toEqual({ p_ref: "F-1A2B3C4D", p_phone: "01012345678" });
});

test("Robotex: accepted means registered — the delegation pass with the number, the live count, the day plan and the album", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockSupabase(page, {
    rpc: {
      public_form: () => EXPO_FORM,
      form_delegation: () => ({ accepted: 12, capacity: 40, days: { "السبت 14 نوفمبر": 7, "أي يوم": 5 } }),
      form_status: () => ({
        ok: true, status: "accepted", title_ar: EXPO_FORM.title_ar, accepted_ar: "اتقبلت واتسجلت في وفد BuildX HUE 🎉", accepted_url: null, external_done: true,
        pass: { no: "BX-007", ref: "F-1A2B3C4D", name: "منى عادل", name_en: "Mona Adel", day: "السبت 14 نوفمبر", org: "Horus University", event: "Robotex & NDTX Expo 2026", dates: "14–16 November 2026", venue: "Egypt International Exhibition Center (EIEC), New Cairo", meet_ar: "التجمع 8:30 قدام بوابة الجامعة" },
      }),
    },
  });
  await page.goto("/ar/robotex/?ref=F-1A2B3C4D");
  // Live: how many are going, and the places left.
  const counter = page.getByTestId("delegation-counter");
  await expect(counter).toContainText("12");
  await expect(counter).toContainText("فاضل 28 مكان");
  await expect(counter).toContainText("السبت 14 نوفمبر: 7");
  // Real photos from the organisers' brochure, and the brochure itself.
  await expect(page.getByTestId("page-photos").locator("img")).toHaveCount(10);
  await expect(page.getByRole("link", { name: "حمّل بروشور المعرض (PDF)" })).toHaveAttribute("href", "/media/robotex/robotex-ndtx-2026-brochure-ar.pdf");
  // An English title reads left to right on the Arabic page.
  await expect(page.locator("h1 [aria-hidden]").first()).toHaveAttribute("dir", "ltr");
  // A countdown, a quick menu, and the areas in one row to swipe on phones.
  await expect(page.getByTestId("expo-countdown")).toContainText("فاضل على المعرض");
  await expect(page.getByTestId("page-nav").getByRole("link", { name: "قدّم" })).toHaveAttribute("href", "#apply");
  await expect(page.getByTestId("page-cards").nth(1).locator("li")).toHaveCount(6);
  // The day's plan and what to bring.
  await expect(page.getByRole("heading", { name: "اليوم هيمشي إزاي" })).toBeVisible();
  await expect(page.getByText("تصريح الوفد (سكرين شوت)")).toBeVisible();
  // No step on the expo's site any more: accepted = registered, with a pass.
  await expect(page.getByText("اتسجّلت علطول", { exact: true })).toBeVisible();
  await page.getByLabel("رقم الموبايل اللي قدّمت بيه").fill("01012345678");
  await page.getByRole("button", { name: "اعرف حالتي" }).click();
  const pass = page.getByTestId("delegation-pass");
  await expect(pass).toContainText("BX-007");
  await expect(pass).toContainText("منى عادل");
  await expect(pass).toContainText("Mona Adel");
  await expect(pass).toContainText("التجمع 8:30 قدام بوابة الجامعة");
  await expect(pass).toContainText("اتسجّلت في موقع المعرض");
  await expect(pass.locator("img")).toHaveAttribute("src", /^data:image\/png/);
  await expect(page.getByRole("link", { name: "افتح موقع التسجيل" })).toHaveCount(0);
  // The album waits for the visit's photos.
  await expect(page.getByText("صور الوفد من المعرض هتنزل هنا بعد الزيارة")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the expo form takes members only: a wrong membership number is refused, non-members get the interview link, a banned member is told why", async ({ page }) => {
  const form = { ...EXPO_FORM, fields: [EXPO_FORM.fields[0], EXPO_FORM.fields[2], { id: "code", type: "member", label_ar: "رقم عضويتك في كميونيتي BuildX HUE", required: true }, { id: "noshow", type: "checkbox", label_ar: "موافق إني لو اتقبلت ومحضرتش المعرض هاخد حظر من كميونيتي BuildX HUE وتتسحب مني العضوية", required: true }] };
  let answer: unknown = { ok: false, error: "fields", fields: { code: "member" } };
  await mockSupabase(page, { rpc: { public_form: () => form, submit_form: () => answer } });
  await page.goto("/ar/robotex/");
  await expect(page.getByTestId("ask-interview").getByRole("link", { name: "اطلب انترفيو مع منظم الموقع" })).toHaveAttribute("href", "/ar/form/?f=membership-interview");
  await page.getByLabel("الاسم بالكامل (بالعربي)").fill("منى عادل");
  await page.getByLabel("رقم الموبايل (واتساب)").fill("01012345678");
  await page.getByLabel("رقم عضويتك في كميونيتي BuildX HUE").fill("9999");
  await page.getByLabel(/هاخد حظر من كميونيتي/).check();
  await page.getByRole("button", { name: "ابعت" }).click();
  await expect(page.getByText("رقم العضوية ده مش موجود أو العضوية مش مفعّلة")).toBeVisible();
  answer = { ok: false, error: "banned" };
  await page.getByLabel("رقم عضويتك في كميونيتي BuildX HUE").fill("2024001");
  await page.getByRole("button", { name: "ابعت" }).click();
  await expect(page.getByText("عليك حظر من كميونيتي BuildX HUE")).toBeVisible();
});

test("a page built in the app: /p/<slug> opens it, with its parts in the team's order", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const built = {
    slug: "cairo-ict",
    title: { ar: "زيارة Cairo ICT" },
    description: { ar: "" },
    accent: "#2b6dff",
    settings: { nav: true },
    blocks: [
      { id: "h", type: "hero", eyebrow: { ar: "زيارة BuildX HUE" }, title: { ar: "زيارة Cairo ICT 2026" }, body: { ar: "معرض التكنولوجيا" }, image: { src: "expo:hero" }, buttons: [{ label: { ar: "قدّم" }, href: "#apply", primary: true }], facts: [] },
      { id: "q", type: "faq", anchor: "faq", nav: { ar: "أسئلة" }, eyebrow: { ar: "" }, title: { ar: "أسئلة الزيارة" }, items: [{ q: { ar: "الزيارة مجانية؟" }, a: { ar: "أيوه مجانية." } }] },
      { id: "s", type: "steps", anchor: "how", nav: { ar: "الخطوات" }, eyebrow: { ar: "" }, title: { ar: "ماشية إزاي" }, items: [{ title: { ar: "قدّم" }, body: { ar: "املأ الفورم" } }] },
      { id: "x", type: "text", hidden: true, eyebrow: { ar: "" }, title: { ar: "جزء مخفي" }, body: { ar: "مش ظاهر" } },
      { id: "bad", type: "script", title: { ar: "x" } },
    ],
  };
  const calls = await mockSupabase(page, { rpc: { site_page: (b) => (b.p_slug === "cairo-ict" ? built : null) } });
  await page.goto("/ar/p/cairo-ict/");
  await expect(page).toHaveURL(/\/ar\/p\/\?s=cairo-ict$/);
  await expect(page.getByRole("heading", { level: 1, name: "زيارة Cairo ICT 2026" })).toBeVisible();
  const titles = await page.locator("main h2, h2").allInnerTexts();
  expect(titles.findIndex((t) => t.includes("أسئلة الزيارة"))).toBeLessThan(titles.findIndex((t) => t.includes("ماشية إزاي")));
  await expect(page.getByTestId("page-nav").getByRole("link", { name: "أسئلة" })).toHaveAttribute("href", "#faq");
  await expect(page.getByText("جزء مخفي")).toHaveCount(0);
  await page.getByText("الزيارة مجانية؟").click();
  await expect(page.getByText("أيوه مجانية.")).toBeVisible();
  expect(calls.some((c) => c.fn === "site_page")).toBe(true);
  // A page that isn't published says so.
  await page.goto("/ar/p/?s=nothing-here");
  await expect(page.getByTestId("page-missing")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the Robotex page shows the team's own version once they save it in the app", async ({ page }) => {
  await mockSupabase(page, {
    rpc: {
      public_form: () => EXPO_FORM,
      site_page: (b) =>
        b.p_slug === "robotex"
          ? {
              slug: "robotex",
              title: { ar: "زيارة Robotex" },
              description: { ar: "" },
              accent: "#ff7a45",
              settings: { nav: false },
              blocks: [
                { id: "h", type: "hero", eyebrow: { ar: "زيارة" }, title: { ar: "Robotex مع BuildX" }, body: { ar: "" }, image: null, buttons: [], facts: [] },
                { id: "t", type: "text", eyebrow: { ar: "" }, title: { ar: "تنبيه مهم" }, body: { ar: "الزيارة للأعضاء بس." } },
              ],
            }
          : null,
    },
  });
  await page.goto("/ar/robotex/");
  await expect(page.getByRole("heading", { level: 1, name: "Robotex مع BuildX" })).toBeVisible();
  await expect(page.getByText("الزيارة للأعضاء بس.")).toBeVisible();
});
