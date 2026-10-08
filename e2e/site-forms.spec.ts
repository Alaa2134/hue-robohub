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
  await page.getByLabel("رقم الموبايل").fill("01112223334");
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
