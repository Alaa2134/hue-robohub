import { expect, test } from "@playwright/test";

/** The how-to video: shown once on the first sign-in on a device, and any time from «حسابي». */
test("a student sees the how-to video once, with chapters, and finds it again in their account", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.removeItem("bx-guide-seen-student");
      sessionStorage.setItem("seeded", "1");
    }
    localStorage.setItem(
      "rh-app-student",
      JSON.stringify({ token: "a".repeat(64), name: "Test Student", code: "S1", group: "G1" }),
    );
  });
  await page.route(/supabase\.co/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    if (fn === "student_home")
      return route.fulfill({
        json: {
          now: new Date().toISOString(),
          student: { name: "Test Student", code: "S1", group: "G1" },
          materials: [],
          quizzes: [],
          attendance: [],
        },
      });
    return route.fulfill({ json: fn ? null : [] });
  });
  await page.goto("/app/#/me");
  const first = page.getByTestId("first-guide");
  await expect(first).toBeVisible();
  // The poster and the video are real files.
  const poster = await first.locator("img").getAttribute("src");
  expect((await page.request.get(poster!)).status()).toBe(200);
  await first.getByTestId("first-guide-play").click();
  const video = first.locator("video");
  await expect(video).toHaveAttribute("src", /\/guides\/student\.mp4$/);
  expect((await page.request.get((await video.getAttribute("src"))!)).headers()["content-type"]).toContain(
    "video/mp4",
  );
  // A chapter jumps the video there.
  const chapter = first.getByRole("listitem").filter({ hasText: "التاسكات" });
  await chapter.click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(5);
  await first.getByTestId("first-guide-done").click();
  await expect(first).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("نسبة حضورك")).toBeVisible();
  await expect(page.getByTestId("first-guide")).toHaveCount(0);
  await page.goto("/app/#/me/account");
  await page.getByTestId("guide-row").click();
  await expect(page.getByTestId("guide-student").locator("video")).toBeVisible();
  expect(errors).toEqual([]);
});
