import { expect, test } from "@playwright/test";

// The visitor's appearance: theme, main color and icon style, applied at once and remembered.
test.beforeEach(async ({ page }) => {
  await page.route(/supabase\.co|plausible\.io|challenges\.cloudflare/, (r) => r.abort());
});

const html = (page: import("@playwright/test").Page) => page.evaluate(() => ({ ...document.documentElement.dataset }));

test("pick a theme, a main color and an icon style; they stay after a reload and reset back", async ({ page, isMobile }) => {
  test.skip(isMobile, "the header button is checked on desktop; phones use the menu (next test)");
  await page.goto("/ar/");
  expect(await html(page)).not.toHaveProperty("theme");
  await page.getByTestId("appearance-open").click();
  const dlg = page.getByTestId("appearance");
  await expect(dlg.getByRole("heading", { name: "المظهر" })).toBeVisible();
  await expect(dlg.getByTestId("theme-navy")).toHaveAttribute("aria-checked", "true");

  await dlg.getByTestId("theme-light").click();
  await dlg.getByTestId("accent-violet").click();
  await dlg.getByTestId("icons-rounded").click();
  expect(await html(page)).toMatchObject({ theme: "light", accent: "violet", icons: "rounded" });
  // The page really changed: light paper behind, violet buttons, rounded icon strokes.
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(245, 247, 251)");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-volt").trim())).toBe("#7c5cff");
  await expect(page.locator("header .bx-icon").first()).toHaveCSS("stroke-linecap", "round");

  await page.keyboard.press("Escape");
  await expect(dlg).toHaveAttribute("aria-hidden", "true");
  await page.reload();
  expect(await html(page)).toMatchObject({ theme: "light", accent: "violet", icons: "rounded" });

  await page.getByTestId("appearance-open").click();
  await dlg.getByTestId("appearance-reset").click();
  expect(await html(page)).not.toHaveProperty("theme");
  expect(await page.evaluate(() => localStorage.getItem("bx-appearance"))).toBeNull();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(5, 14, 38)");
});

test("the saved look is on the page before it's drawn (no flash of the default)", async ({ page }) => {
  await page.addInitScript(() => {
    // Seeded once (this script runs again on every reload).
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("bx-appearance", JSON.stringify({ theme: "midnight", accent: "emerald", icons: "glow" }));
      sessionStorage.setItem("seeded", "1");
    }
    // What <html> carries the moment the body starts.
    document.addEventListener("readystatechange", () => {
      if (document.readyState === "interactive") (window as unknown as { early: unknown }).early = { ...document.documentElement.dataset };
    });
  });
  await page.goto("/ar/about/");
  expect(await page.evaluate(() => (window as unknown as { early: unknown }).early)).toMatchObject({ theme: "midnight", accent: "emerald", icons: "glow" });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  // Broken or unknown values are ignored.
  await page.evaluate(() => localStorage.setItem("bx-appearance", '{"theme":"pink","accent":"<x>"}'));
  await page.reload();
  expect(await html(page)).not.toHaveProperty("theme");
  expect(await html(page)).not.toHaveProperty("accent");
});

test("automatic follows the device's light or dark setting", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => localStorage.setItem("bx-appearance", JSON.stringify({ theme: "auto", accent: "blue", icons: "engineered" })));
  await page.goto("/en/");
  expect((await html(page)).theme).toBe("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  expect(await html(page)).not.toHaveProperty("theme");
});

test("on phones the menu opens the appearance picker", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phones only");
  await page.goto("/ar/");
  await page.getByLabel("فتح القائمة").click();
  await page.getByTestId("menu-appearance").click();
  const dlg = page.getByTestId("appearance");
  await expect(dlg).toHaveAttribute("aria-hidden", "false");
  await dlg.getByTestId("theme-light").click();
  await dlg.getByTestId("accent-orange").click();
  expect(await html(page)).toMatchObject({ theme: "light", accent: "orange" });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(245, 247, 251)");
});

test("more themes and icon styles: paper, emoji icons, icons in squares; bigger text and less motion", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop is enough for the styles");
  await page.goto("/ar/");
  await page.getByTestId("appearance-open").click();
  const dlg = page.getByTestId("appearance");
  await dlg.getByTestId("theme-paper").click();
  await dlg.getByTestId("icons-emoji").click();
  expect(await html(page)).toMatchObject({ theme: "paper", tone: "light", icons: "emoji" });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(248, 244, 236)");
  // Emoji icons: the emoji shows, the line drawing hides (controls without an emoji keep their lines).
  const search = page.locator('header [data-emoji="🔍"]').first();
  await expect(search.locator(".bx-emoji")).toBeVisible();
  await expect(search.locator(".bx-glyph")).toBeHidden();

  await dlg.getByTestId("icons-tile").click();
  const tile = page.locator("header .bx-icon").first();
  await expect(tile).toHaveCSS("border-radius", "28%");
  expect(await tile.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("gradient");
  // The tile stays the icon's own size (no padding growing it).
  const box = await tile.boundingBox();
  expect(box!.width).toBeLessThan(30);

  await dlg.getByTestId("text-xl").click();
  await expect(page.locator("html")).toHaveCSS("font-size", "20px");
  await dlg.getByTestId("motion").locator("input").check();
  expect((await html(page)).motion).toBe("reduced");
  // After a reload the page's scripts see "reduced motion" too.
  await page.reload();
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await expect(page.locator("html")).toHaveCSS("font-size", "20px");
});
