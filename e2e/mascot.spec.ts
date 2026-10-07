import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The BuildX guide (3D mascot) on the public site. Automated browsers only get it when a test asks
 * (localStorage "bx-guide-test"); most tests use the still version, which has the same behaviour and
 * doesn't depend on the CI machine's (software) WebGL. One test loads the real 3D model.
 */
async function withGuide(page: Page, mode: "3d" | "poster" = "poster") {
  await page.addInitScript((m) => {
    localStorage.setItem("bx-guide-test", "1");
    localStorage.setItem("bx-guide-mode", m);
  }, mode);
  await page.route(/supabase\.co/, (route) => route.abort());
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

const guideButton = (page: Page) => page.getByRole("button", { name: /BuildX guide: open the menu|مرشد BuildX: افتح القائمة/ });
const bubble = (page: Page) => page.locator(".mascot-bubble");

test("browsers driven by tests don't get the guide unless they ask", async ({ page }) => {
  await page.goto("/");
  await page.mouse.move(400, 300);
  await page.waitForTimeout(2500);
  await expect(page.locator("[data-mascot]")).toHaveCount(0);
});

test("the guide walks in on the home page, greets, and offers a tour", async ({ page }) => {
  const errors = collectErrors(page);
  await withGuide(page);
  await page.goto("/");
  await page.mouse.move(500, 400);
  await expect(bubble(page)).toContainText("Welcome to BuildX HUE", { timeout: 15_000 });
  await expect(bubble(page)).toContainText("Want me to show you around?", { timeout: 15_000 });
  await expect(bubble(page).getByRole("button", { name: "Show me around" })).toBeVisible();
  // The tour scrolls to the next section and explains it.
  await bubble(page).getByRole("button", { name: "Show me around" }).click();
  await expect(bubble(page)).toContainText("ideas become real projects", { timeout: 10_000 });
  await bubble(page).getByRole("button", { name: "End tour" }).click();
  await expect(bubble(page)).not.toContainText("ideas become real projects");
  expect(errors).toEqual([]);
});

test("the guide never blocks the page: links and buttons around it still work", async ({ page }) => {
  await withGuide(page);
  await page.goto("/");
  await page.mouse.move(500, 400);
  await expect(guideButton(page)).toBeVisible({ timeout: 15_000 });
  // Only the mascot's body takes clicks: the stage around it lets them through.
  const passThrough = await page.evaluate(() => getComputedStyle(document.querySelector("[data-mascot]")!).pointerEvents);
  expect(passThrough).toBe("none");
  await page.getByRole("link", { name: "Explore the tracks" }).first().click();
  await expect(page).toHaveURL(/\/tracks\/$/);
});

test("clicking the mascot opens the guide menu; it answers questions and takes you there", async ({ page }) => {
  const errors = collectErrors(page);
  await withGuide(page);
  await page.goto("/");
  await page.mouse.move(500, 400);
  await guideButton(page).click({ timeout: 15_000 });
  const menu = page.getByRole("dialog", { name: "BuildX guide" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Become a Member" })).toBeVisible();
  // Keyboard: the first option has focus, arrows move, Escape closes and returns focus.
  await expect(menu.getByRole("button", { name: "Explore BuildX" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("button", { name: "Our Tracks" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(guideButton(page)).toBeFocused();

  await guideButton(page).click();
  await menu.getByLabel("Ask me anything about BuildX").fill("When is the next workshop?");
  await menu.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(menu).toContainText("Here's what's coming up");
  await menu.getByRole("button", { name: "Upcoming events", exact: true }).click();
  await expect(page).toHaveURL(/\/events\/$/);
  expect(errors).toEqual([]);
});

test("menu items scroll to the section on the home page", async ({ page }) => {
  await withGuide(page);
  await page.goto("/");
  await page.mouse.move(500, 400);
  await guideButton(page).click({ timeout: 15_000 });
  await page.getByRole("dialog", { name: "BuildX guide" }).getByRole("button", { name: "Our Tracks" }).click();
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector("#tracks")!.getBoundingClientRect().top)), { timeout: 8000 }).toBeLessThan(200);
  await expect(page).toHaveURL(/\/$/);
});

test("the guide can be hidden and brought back, and it remembers", async ({ page }) => {
  await withGuide(page);
  await page.goto("/");
  await page.mouse.move(500, 400);
  await guideButton(page).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "Hide guide" }).click();
  await expect(guideButton(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Show guide" })).toBeVisible();
  await page.reload();
  await page.mouse.move(500, 400);
  await expect(page.getByRole("button", { name: "Show guide" })).toBeVisible({ timeout: 15_000 });
  await expect(guideButton(page)).toBeHidden();
  await page.getByRole("button", { name: "Show guide" }).click();
  await expect(guideButton(page)).toBeVisible();
});

test("clicking Join celebrates (confetti) and still goes to the form", async ({ page }) => {
  await withGuide(page);
  await page.goto("/");
  await page.mouse.move(500, 400);
  await expect(guideButton(page)).toBeVisible({ timeout: 15_000 });
  const confetti = page.waitForFunction(() => [...document.querySelectorAll("body > canvas")].some((c) => c.getAttribute("aria-hidden") === "true"));
  await page.getByRole("link", { name: /Join BuildX HUE/ }).first().click();
  await confetti;
  await expect(page).toHaveURL(/\/join\/$/);
  await expect(bubble(page)).toContainText(/See you inside|ready to build|three minutes/i);
});

test("the guide speaks Arabic on Arabic pages", async ({ page }) => {
  await withGuide(page);
  await page.goto("/ar/");
  await page.mouse.move(500, 400);
  await expect(bubble(page)).toContainText("BuildX HUE", { timeout: 15_000 });
  await expect(bubble(page).locator("[dir=rtl]")).toBeVisible();
  await guideButton(page).click();
  await expect(page.getByRole("dialog", { name: "مرشد BuildX" })).toContainText("قابل الفريق");
});

test("with the guide on, pages have no serious accessibility problems (reduced motion: still guide)", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("bx-guide-test", "1"));
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.goto("/");
  await page.mouse.move(500, 400);
  await expect(guideButton(page)).toBeVisible({ timeout: 15_000 });
  // Reduced motion gets the still image, never the 3D canvas.
  await expect(page.locator("[data-mascot] canvas")).toHaveCount(0);
  await expect(page.locator("[data-mascot] img.mascot-still")).toBeVisible();
  await guideButton(page).click();
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
  await ctx.close();
});

test("phones: the guide stays small, fits the screen and keeps the tab bar usable", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "phone layout");
  await withGuide(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.touchscreen.tap(160, 300).catch(() => undefined);
  await page.evaluate(() => window.scrollBy(0, 1));
  await expect(guideButton(page)).toBeVisible({ timeout: 15_000 });
  const r = await page.evaluate(() => {
    const st = document.querySelector("[data-mascot]")!.getBoundingClientRect();
    return { h: st.height, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(r.h).toBeLessThanOrEqual(170);
  expect(r.overflow).toBe(0);
  await page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Tracks" }).click();
  await expect(page).toHaveURL(/\/tracks\/$/);
});

test("the 3D guide loads its model and renders without errors", async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await withGuide(page, "3d");
  await page.goto("/");
  await page.mouse.move(500, 400);
  await expect(guideButton(page)).toBeVisible({ timeout: 20_000 });
  const webgl = await page.evaluate(() => !!(document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl")));
  if (webgl) {
    await expect(page.locator("[data-mascot] canvas")).toBeAttached();
    // The loader goes away once the model is in.
    await expect(page.locator("[data-mascot]")).not.toContainText("Building something awesome", { timeout: 30_000 });
  } else {
    // No WebGL in this browser: the still guide takes over.
    await expect(page.locator("[data-mascot] img.mascot-still")).toBeVisible({ timeout: 10_000 });
  }
  await expect(bubble(page)).toContainText("Welcome to BuildX HUE", { timeout: 15_000 });
  expect(errors).toEqual([]);
});
