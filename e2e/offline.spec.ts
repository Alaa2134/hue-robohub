import { expect, test } from "@playwright/test";

/**
 * The website's service worker (public/sw.js): after the first visit the site's files come from the
 * device (less data, faster), pages still come from the network, and a page seen before opens offline.
 */
test.use({ serviceWorkers: "allow" });

test("after the first visit the site's files are kept on the device, and a seen page opens offline", async ({ page, context }) => {
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.goto("/ar/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // Second visit: now controlled by the worker, which caches what the page loads.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect
    .poll(async () => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("bx-site-"))), { timeout: 10_000 })
    .toEqual(expect.arrayContaining([expect.stringMatching(/-static$/), expect.stringMatching(/-pages$/)]));
  const statics = await page.evaluate(async () => {
    const name = (await caches.keys()).find((k) => k.endsWith("-static"))!;
    return (await (await caches.open(name)).keys()).length;
  });
  expect(statics).toBeGreaterThan(3);
  // Offline: the page seen before still opens.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
  await context.setOffline(false);
});

test("the BuildX App keeps its own worker (the website's never answers for /app/)", async ({ page }) => {
  const sw = await (await page.request.get("/sw.js")).text();
  expect(sw).toContain("app/");
  expect(sw).not.toContain("__BUILD_ID__");
  expect(sw).toMatch(/const VERSION = "bx-site-[a-z0-9]+"/);
});
