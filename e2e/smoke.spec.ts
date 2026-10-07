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
