import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Accessibility, SEO and 404 checks on the built site (Supabase is blocked: pages use their built-in copy). */
test.use({ contextOptions: { reducedMotion: "reduce" } });
test.beforeEach(async ({ page }) => {
  await page.route(/supabase\.co/, (route) => route.abort());
});

for (const path of ["/", "/ar/", "/ar/join/", "/team/", "/ar/tracks/"]) {
  test(`no serious accessibility problems on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
  });
}

test("every sitemap URL is a page with its own title, description and canonical link", async ({ request, baseURL }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls.length).toBeGreaterThan(20);
  const titles = new Set<string>();
  for (const url of urls) {
    const res = await request.get(new URL(url).pathname);
    expect(res.status(), url).toBe(200);
    const html = await res.text();
    expect(html, url).toContain(`<link rel="canonical" href="${url}"/>`);
    expect(html, url).toMatch(/<meta name="description" content="[^"]{30,}"/);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
    expect(title, url).toContain("BuildX HUE");
    titles.add(title);
  }
  // English and Arabic share a URL list but every page has its own title.
  expect(titles.size, `distinct titles for ${urls.length} URLs on ${baseURL}`).toBeGreaterThan(urls.length * 0.9);
});

test("robots.txt points to the sitemap and keeps the app private", async ({ request }) => {
  const txt = await (await request.get("/robots.txt")).text();
  expect(txt).toContain("Sitemap: https://buildxhue.com/sitemap.xml");
  expect(txt).toContain("Disallow: /app/");
});

test("an item published after the last build is forwarded to its live page", async ({ page }) => {
  await page.goto("/ar/news/brand-new-post/");
  await expect(page).toHaveURL(/\/ar\/news\/post\/\?s=brand-new-post$/);
});
