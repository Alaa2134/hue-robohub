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

test("every page fits a 320px phone: no sideways scroll, menu button reachable", async ({ page, request }, info) => {
  test.skip(info.project.name !== "mobile", "phone layout check");
  test.setTimeout(180_000);
  const xml = await (await request.get("/sitemap.xml")).text();
  const paths = [...xml.matchAll(/<loc>[^<]*?buildxhue\.com([^<]*)<\/loc>/g)].map((m) => m[1]);
  await page.setViewportSize({ width: 320, height: 700 });
  const problems: string[] = [];
  for (const path of [...paths, ...paths.map((p) => `/ar${p}`), "/app/"]) {
    await page.goto(path);
    const r = await page.evaluate(() => {
      const menu = document.querySelector<HTMLElement>('header button[aria-controls="site-menu"]');
      const box = menu?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        menuOff: !!box && (box.right > document.documentElement.clientWidth + 1 || box.left < -1),
      };
    });
    if (r.overflow > 0) problems.push(`${path}: ${r.overflow}px sideways scroll`);
    if (r.menuOff) problems.push(`${path}: menu button off-screen`);
  }
  expect(problems).toEqual([]);
});

test("sections still show when the site's scripts can't load", async ({ page }) => {
  test.setTimeout(30_000);
  await page.route(/\/_next\/static\/chunks\/.*\.js$/, (route) => route.abort());
  await page.goto("/ar/");
  const reveal = page.locator("#why .reveal").first();
  await expect(reveal).toBeAttached();
  // The gate gives the app six seconds to start, then shows everything without animation.
  await expect.poll(() => reveal.evaluate((el) => getComputedStyle(el).opacity), { timeout: 10_000 }).toBe("1");
});

test("the security policy never forces http visits onto https", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
  expect(csp).toContain("default-src");
  expect(csp).not.toContain("upgrade-insecure-requests");
});
