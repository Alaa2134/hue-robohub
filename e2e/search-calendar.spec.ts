import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route(/plausible\.io|challenges\.cloudflare/, (r) => r.abort());
});

test("search forgives how people type: «روبت» finds the robot project", async ({ page }) => {
  const asked: unknown[] = [];
  await page.route(/supabase\.co/, (route) => {
    const url = route.request().url();
    if (url.includes("/rpc/search_site")) {
      asked.push(route.request().postDataJSON());
      return route.fulfill({
        json: [
          {
            type: "content",
            kind: "project",
            slug: "hexapod",
            title: "Hexapod robot",
            title_ar: "الروبوت السداسي",
            summary: "Six legs",
            summary_ar: "ست أرجل",
            starts_at: null,
            external_url: null,
            score: 1.6,
          },
        ],
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/ar/");
  await page.keyboard.press("/");
  const box = page.getByRole("dialog", { name: "بحث" });
  await box.getByPlaceholder(/ابحث في الصفحات/).fill("روبت");
  await expect(box.getByText("الروبوت السداسي")).toBeVisible();
  expect(asked.at(-1)).toMatchObject({ p_q: "روبت" });
  // The pages list is forgiving too: «اخبار» without the hamza still finds «الأخبار».
  await box.getByPlaceholder(/ابحث في الصفحات/).fill("اخبار");
  await expect(box.getByRole("option").first()).toBeVisible();
});

test("the events page offers the calendar feed for Google, Apple and Outlook", async ({ page }) => {
  await page.route(/supabase\.co/, (route) => route.fulfill({ json: [] }));
  await page.goto("/ar/events/");
  const card = page.getByTestId("calendar-subscribe");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("cal-webcal")).toHaveAttribute(
    "href",
    /^webcal:\/\/.+\/functions\/v1\/calendar\?lang=ar$/,
  );
  const google = await card.getByTestId("cal-google").getAttribute("href");
  expect(decodeURIComponent(google!)).toContain("cid=webcal://");
});

test("start here: the visitor says who they are and gets their pages, remembered next time", async ({
  page,
}) => {
  await page.route(/supabase\.co/, (route) => route.fulfill({ json: [] }));
  await page.goto("/ar/");
  const box = page.getByTestId("start-here");
  await expect(box.getByTestId("start-links")).toHaveCount(0);
  await box.getByTestId("who-sponsor").click();
  await expect(box.getByRole("link", { name: "الرعاية وملف الميديا" })).toHaveAttribute(
    "href",
    "/ar/sponsors/",
  );
  await page.reload();
  await expect(page.getByTestId("who-sponsor")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("who-member").click();
  await expect(page.getByTestId("start-links").getByRole("link", { name: "افتح التطبيق" })).toHaveAttribute(
    "href",
    "/app/",
  );
});

test("achievements in numbers from the records, and a map pin for every known place", async ({ page }) => {
  await page.route(/supabase\.co/, (route) =>
    route.request().url().includes("/rpc/achievements_stats")
      ? route.fulfill({
          json: {
            achievements: 10,
            podiums: 10,
            events: 2,
            attendees: 66,
            members: 14,
            projects: 0,
            certificates: 0,
            places: [
              { name: "جامعة حورس", name_en: "Horus University", n: 2 },
              {
                name: "جامعة القاهرة الجديدة التكنولوجية",
                name_en: "New Cairo Technological University",
                n: 1,
              },
              { name: "مكان مش معروف", name_en: null, n: 1 },
            ],
          },
        })
      : route.fulfill({ json: [] }),
  );
  await page.goto("/ar/achievements/");
  const box = page.getByTestId("achievements-impact");
  await expect(box).toContainText("حضروا فعالياتنا");
  await expect(box).toContainText("٦٦");
  // Zero counts are left out rather than shown as nothing.
  await expect(box).not.toContainText("شهادة اتصدرت");
  await expect(box.getByTestId("map-pin")).toHaveCount(2);
  await expect(box.getByTestId("places-map")).toContainText("دمياط الجديدة");
  await expect(box.getByTestId("places-list")).toContainText("مكان مش معروف");
});
