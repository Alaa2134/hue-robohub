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

const guideButton = (page: Page) => page.getByRole("button", { name: "بقلظ، مرشد BuildX: افتح القائمة" });
const bubble = (page: Page) => page.locator(".mascot-bubble");
const exploreTab = (page: Page) => page.getByRole("dialog", { name: "بقلظ" }).getByRole("tab", { name: "روح على" });

test("browsers driven by tests don't get the guide unless they ask", async ({ page }) => {
  await page.goto("/");
  await page.mouse.move(400, 300);
  await page.waitForTimeout(2500);
  await expect(page.locator("[data-mascot]")).toHaveCount(0);
});

test("Baqloz walks in, introduces himself in Egyptian Arabic (on English pages too), and takes you on a tour of the site", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await withGuide(page);
  await page.goto("/");
  await page.mouse.move(500, 400);
  await expect(bubble(page)).toContainText("أنا بقلظ، مرشدك في BuildX HUE", { timeout: 15_000 });
  await expect(bubble(page).locator("[lang=ar][dir=rtl]")).toBeVisible();
  await expect(bubble(page)).toContainText("تيجي آخدك جولة جوه الموقع؟", { timeout: 15_000 });
  // The site tour: he says what the page is for, then scrolls down it explaining each section in
  // his own words, then walks on to the next page by himself. Next skips ahead; End tour stops.
  await bubble(page).getByRole("button", { name: "يلا بينا" }).click();
  await expect(bubble(page)).toContainText("دي الصفحة الرئيسية", { timeout: 15_000 });
  await expect(bubble(page).getByRole("button", { name: "اللي بعده" })).toBeVisible();
  // Moves on by himself: the second line comes without pressing anything.
  await expect(bubble(page)).toContainText("فوق في الهيدر", { timeout: 15_000 });
  await bubble(page).getByRole("button", { name: "اللي بعده" }).click();
  // Down the home page, section by section.
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeGreaterThan(300);
  await expect(bubble(page)).not.toContainText("فوق في الهيدر");
  const lines = new Set<string>();
  for (const end = Date.now() + 110_000; Date.now() < end && !/\/about\/$/.test(page.url()); ) {
    lines.add(await bubble(page).innerText().catch(() => ""));
    await bubble(page)
      .getByRole("button", { name: "اللي بعده" })
      .click({ timeout: 1500 })
      .catch(() => undefined);
  }
  // He explained the home page's sections on the way (several of them: it moves on by itself too).
  const explained = [...lines].filter((l) => /ليه BuildX مختلف|التراكات السبعة|أنشطتنا|جزء المسابقات|خطة السنة|أهدافنا للموسم|المؤسسين والفريق/.test(l));
  expect(explained.length).toBeGreaterThanOrEqual(3);
  await expect(page).toHaveURL(/\/about\/$/, { timeout: 15_000 });
  await expect(bubble(page)).toContainText("هنا تعرف إحنا مين", { timeout: 15_000 });
  await bubble(page).getByRole("button", { name: "كفاية كده" }).click({ timeout: 20_000 });
  await expect(bubble(page).getByRole("button", { name: "كفاية كده" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/about\/$/);
  expect(errors).toEqual([]);
});

test("on any first page of a visit he offers the site tour", async ({ page }) => {
  await withGuide(page);
  await page.goto("/bootcamp/");
  await page.mouse.move(500, 400);
  await expect(bubble(page)).toContainText("تيجي آخدك جولة جوه الموقع؟", { timeout: 20_000 });
  await bubble(page).getByRole("button", { name: "بعدين" }).click();
  await expect(bubble(page).getByRole("button", { name: "بعدين" })).toHaveCount(0);
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
  const menu = page.getByRole("dialog", { name: "بقلظ" });
  await expect(menu).toBeVisible();
  // It opens on the chat, ready to type; Escape closes and returns focus.
  await expect(menu.getByLabel("اسأل بقلظ أي حاجة…")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(guideButton(page)).toBeFocused();

  // The other tab: quick actions and every page; arrows move between them.
  await guideButton(page).click();
  await exploreTab(page).click();
  await expect(menu.getByRole("button", { name: "خليك عضو معانا" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "جولة في الموقع" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("button", { name: "لفّة في الصفحة دي" })).toBeFocused();

  // Questions in English or Arabic, answers in Egyptian Arabic from the site's own content.
  await menu.getByRole("tab", { name: "اتكلم معايا" }).click();
  await menu.getByLabel("اسأل بقلظ أي حاجة…").fill("When is the next workshop?");
  await menu.getByRole("button", { name: "ابعت", exact: true }).click();
  await expect(menu).toContainText("ورش تقنية (أكتوبر – نوفمبر 2026)", { timeout: 10_000 });
  // He remembers what you talked about: a follow-up chip, then the link to the page.
  await expect(menu.getByRole("button", { name: "أحجز في إيفنت إزاي؟" })).toBeVisible({ timeout: 10_000 });
  await menu.getByRole("button", { name: "الإيفنتات الجاية" }).click();
  await expect(page).toHaveURL(/\/events\/$/);
  expect(errors).toEqual([]);
});

test("menu items scroll to the section on the home page", async ({ page }) => {
  await withGuide(page);
  await page.goto("/");
  await page.mouse.move(500, 400);
  await guideButton(page).click({ timeout: 15_000 });
  await exploreTab(page).click();
  await page.getByRole("dialog", { name: "بقلظ" }).getByRole("button", { name: "التراكات", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector("#tracks")!.getBoundingClientRect().top)), { timeout: 8000 }).toBeLessThan(200);
  await expect(page).toHaveURL(/\/$/);
});

test("the guide can be hidden and brought back, and it remembers", async ({ page }) => {
  await withGuide(page);
  await page.goto("/");
  await page.mouse.move(500, 400);
  await guideButton(page).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "خبّي بقلظ" }).click();
  await expect(guideButton(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "رجّع بقلظ" })).toBeVisible();
  await page.reload();
  await page.mouse.move(500, 400);
  await expect(page.getByRole("button", { name: "رجّع بقلظ" })).toBeVisible({ timeout: 15_000 });
  await expect(guideButton(page)).toBeHidden();
  await page.getByRole("button", { name: "رجّع بقلظ" }).click();
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
  await expect(bubble(page)).toContainText(/هنستناك جوه|جاهز تبني معانا/);
});

test("the guide speaks Arabic on Arabic pages", async ({ page }) => {
  await withGuide(page);
  await page.goto("/ar/");
  await page.mouse.move(500, 400);
  await expect(bubble(page)).toContainText("BuildX HUE", { timeout: 15_000 });
  await expect(bubble(page).locator("[dir=rtl]")).toBeVisible();
  await guideButton(page).click();
  await exploreTab(page).click();
  await expect(page.getByRole("dialog", { name: "بقلظ" })).toContainText("اتعرّف على الفريق");
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
    await expect(page.locator("[data-mascot]")).not.toContainText("بنبني حاجة حلوة", { timeout: 30_000 });
  } else {
    // No WebGL in this browser: the still guide takes over.
    await expect(page.locator("[data-mascot] img.mascot-still")).toBeVisible({ timeout: 10_000 });
  }
  await expect(bubble(page)).toContainText(/أنا بقلظ|جولة جوه الموقع/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("Baqloz talks about the card under the cursor (tracks, teams, people)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "hover needs a mouse");
  await withGuide(page);
  await page.goto("/tracks/");
  await page.mouse.move(500, 400);
  await expect(guideButton(page)).toBeVisible({ timeout: 15_000 });
  // Let the arrival line finish, then rest the cursor on the Robotics card.
  await expect(bubble(page)).toContainText("سبع تراكات", { timeout: 15_000 });
  await bubble(page).getByRole("button", { name: "إغلاق" }).click();
  const card = page.locator("main a[href*='/tracks/robotics-embedded']").first();
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await expect(bubble(page)).toContainText("روبوتكس وإمبيدد", { timeout: 6000 });
});

test("Baqloz helps while filling in the application form", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "phones hide him while typing");
  await withGuide(page);
  await page.goto("/join/");
  await page.mouse.move(500, 400);
  await expect(guideButton(page)).toBeVisible({ timeout: 15_000 });
  await expect(bubble(page)).toContainText("جاهز تبني معانا", { timeout: 15_000 });
  await page.waitForTimeout(7000);
  await page.locator("#ap-full_name").focus();
  await expect(bubble(page)).toContainText("اسمك الرباعي", { timeout: 6000 });
});

test("every section gets a scene: sections Baqloz finds on the page by their heading", async ({ page }) => {
  await withGuide(page);
  await page.goto("/sponsors/");
  await page.mouse.move(500, 400);
  await expect(guideButton(page)).toBeVisible({ timeout: 15_000 });
  // The first page of a visit ends with the tour invite; say "not now".
  await bubble(page).getByRole("button", { name: "بعدين" }).click({ timeout: 20_000 });
  await page.getByRole("heading", { name: "Partnership tiers" }).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await expect(bubble(page)).toContainText("الشراكة معانا", { timeout: 10_000 });
});

test("his menu lists the page's sections and quick actions", async ({ page }) => {
  await withGuide(page);
  await page.goto("/about/");
  await page.mouse.move(500, 400);
  await guideButton(page).click({ timeout: 15_000 });
  const menu = page.getByRole("dialog", { name: "بقلظ" });
  await exploreTab(page).click();
  await expect(menu.getByText("في الصفحة دي", { exact: true })).toBeVisible();
  await menu.getByRole("button", { name: /From learning to real impact/ }).click();
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector("#why")!.getBoundingClientRect().top)), { timeout: 8000 }).toBeLessThan(250);
  await expect(bubble(page)).toContainText(/الأفكار|النظري|بنتعلم/, { timeout: 10_000 });
  // Quick action: the site search.
  await guideButton(page).click();
  await exploreTab(page).click();
  await page.getByRole("dialog", { name: "بقلظ" }).getByRole("button", { name: "البحث" }).click();
  await expect(page.getByRole("dialog").filter({ has: page.locator("input[type=search], input[role=combobox], input") }).first()).toBeVisible();
});

test("ask Baqloz who he is", async ({ page }) => {
  await withGuide(page);
  await page.goto("/");
  await page.mouse.move(500, 400);
  await guideButton(page).click({ timeout: 15_000 });
  const menu = page.getByRole("dialog", { name: "بقلظ" });
  await menu.getByRole("button", { name: "إنت مين؟" }).click();
  await expect(menu).toContainText("أنا بقلظ");
});

test("chatting with Baqloz: he remembers your name, recommends a track and compares them", async ({ page }) => {
  await withGuide(page);
  await page.goto("/");
  await page.mouse.move(500, 400);
  await guideButton(page).click({ timeout: 15_000 });
  const menu = page.getByRole("dialog", { name: "بقلظ" });
  const ask = async (q: string) => {
    await menu.getByLabel("اسأل بقلظ أي حاجة…").fill(q);
    await menu.getByRole("button", { name: "ابعت", exact: true }).click();
  };
  await ask("اسمي أحمد");
  // He answers by name, and his greeting now uses it too: the visitor's line plus at least two of his.
  await expect.poll(async () => (await menu.innerText()).split("أحمد").length - 1, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  await ask("أنا بحب البرمجة والذكاء الاصطناعي، أختار إيه؟");
  await expect(menu).toContainText("شكلك هتحب", { timeout: 10_000 });
  await ask("إيه الفرق بين الروبوتكس والـ IoT؟");
  await expect(menu).toContainText("الفرق ببساطة", { timeout: 10_000 });
  // The conversation is still there after closing and reopening.
  await page.keyboard.press("Escape");
  await guideButton(page).click();
  await expect(menu).toContainText("الفرق ببساطة");
});

test("tour of the page from his menu", async ({ page }) => {
  await withGuide(page);
  await page.goto("/");
  await page.mouse.move(500, 400);
  await guideButton(page).click({ timeout: 15_000 });
  await exploreTab(page).click();
  await page.getByRole("dialog", { name: "بقلظ" }).getByRole("button", { name: "لفّة في الصفحة دي" }).click();
  await expect(bubble(page).getByRole("button", { name: "اللي بعده" })).toBeVisible({ timeout: 10_000 });
  const first = await bubble(page).innerText();
  await bubble(page).getByRole("button", { name: "اللي بعده" }).click();
  await expect.poll(() => bubble(page).innerText(), { timeout: 10_000 }).not.toBe(first);
  await bubble(page).getByRole("button", { name: "كفاية كده" }).click();
  await expect(bubble(page).getByRole("button", { name: "كفاية كده" })).toHaveCount(0);
});

test("pick Baqloz up and throw him: he complains, lands on his belly and gets back up", async ({ page }) => {
  const errors = collectErrors(page);
  await withGuide(page);
  await page.goto("/bootcamp/");
  await page.mouse.move(500, 400);
  await expect(bubble(page).getByRole("button", { name: "بعدين" })).toBeVisible({ timeout: 15_000 });
  await bubble(page).getByRole("button", { name: "بعدين" }).click();
  const body = guideButton(page);
  const box = (await body.boundingBox())!;
  const vh = page.viewportSize()!.height;
  // Grab him and lift him up to the top of the screen.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 20, box.y + box.height / 2 - 40, { steps: 4 });
  await expect(bubble(page)).toContainText(/نزّلني|شنطة|المرتفعات|على فين/, { timeout: 5000 });
  await page.mouse.move(box.x + box.width / 2 - 60, vh * 0.12, { steps: 10 });
  await page.waitForTimeout(150);
  // Let go from up there: a long fall, flat on his belly.
  await page.mouse.up();
  const still = page.locator("[data-mascot] img.mascot-still");
  await expect(still).toHaveAttribute("style", /rotate\(-?82deg\)/, { timeout: 5000 });
  await expect(bubble(page)).toContainText(/حرام عليك|بطني|مرشدك|هفتكرهالك|مش هكلمك|تالت مرة|مستمتع/, { timeout: 5000 });
  // A drag isn't a click: the menu didn't open.
  await expect(page.getByRole("dialog", { name: "بقلظ" })).toHaveCount(0);
  // Back on his feet.
  await expect(still).not.toHaveAttribute("style", /82deg/, { timeout: 8000 });
  await expect(bubble(page)).toContainText(/أنا كويس|محدش شاف|متعوّد|نكمّل/, { timeout: 8000 });
  // He still opens his menu with a plain click.
  await guideButton(page).click({ timeout: 10_000 });
  await expect(page.getByRole("dialog", { name: "بقلظ" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("put him down gently and he thanks you", async ({ page }) => {
  await withGuide(page);
  await page.goto("/bootcamp/");
  await page.mouse.move(500, 400);
  await expect(bubble(page).getByRole("button", { name: "بعدين" })).toBeVisible({ timeout: 15_000 });
  await bubble(page).getByRole("button", { name: "بعدين" }).click();
  const box = (await guideButton(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Carried slowly down to the floor (no fall, no throw).
  const vh = page.viewportSize()!.height;
  for (let y = box.y + box.height / 2; y < vh - 4; y += 14) {
    await page.mouse.move(box.x + box.width / 2 - 10, y);
    await page.waitForTimeout(40);
  }
  await page.mouse.move(box.x + box.width / 2 - 10, vh - 4);
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect(bubble(page)).toContainText(/بالراحة|حلو المكان/, { timeout: 5000 });
  await expect(page.locator("[data-mascot] img.mascot-still")).not.toHaveAttribute("style", /82deg/);
});
