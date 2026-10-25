import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/** BuildX 3D AI: the page and the studio, with the database mocked. */

const TOKEN = "a".repeat(48);
const INFO = {
  enabled: true,
  packages: [
    { credits: 1, price: 60 },
    { credits: 5, price: 250 },
    { credits: 12, price: 500 },
  ],
  cost_text: 1,
  cost_image: 1,
  textured: true,
  pay_ar: "فودافون كاش: 01000000000",
  pay_en: "Vodafone Cash: 01000000000",
  free_credits: 0,
  made: 0,
  gallery: [],
};
const GLB = readFileSync("public/mascot/buildx-mascot.glb");

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("3D AI page: animated hero, prices from the database, and the way into the studio", async ({ page }) => {
  const errors = collectErrors(page);
  await page.route("**/rest/v1/rpc/ai3d_info", (route) => route.fulfill({ json: { ...INFO, packages: [{ credits: 2, price: 100 }, { credits: 10, price: 400 }] } }));
  await page.goto("/ar/3dai/");
  await expect(page.locator("h1")).toContainText("موديل 3D");
  await expect(page.getByText("عرض توضيحي").first()).toBeVisible();
  const pricing = page.getByTestId("ai3d-pricing");
  // The prices come from the database once the page has loaded (the 3D hero can make that slow on CI).
  await expect(pricing).toContainText("100 جنيه", { timeout: 15_000 });
  await expect(pricing).toContainText("400 جنيه");
  // The cheaper per model is marked.
  await expect(pricing).toContainText("الأوفر");
  await expect(pricing).toContainText("40 جنيه للموديل");
  // The page fits a phone (nothing scrolls sideways).
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByTestId("ai3d-start").click();
  await expect(page).toHaveURL(/\/ar\/3dai\/studio\/?$/);
  expect(errors).toEqual([]);
});

test("3D AI studio: make a wallet, top up with a receipt, make a model, watch it, open it and download STL", async ({ page }) => {
  const errors = collectErrors(page);
  // The whole flow plus a model drawn in software WebGL: more than the default 30 s on a slow runner.
  test.setTimeout(60_000);
  const calls: { fn: string; body: Record<string, unknown> }[] = [];
  let credits = 0;
  let jobs: Record<string, unknown>[] = [];
  let topups: Record<string, unknown>[] = [];
  let uploads = 0;
  await page.route("**/rest/v1/rpc/*", async (route) => {
    const fn = route.request().url().split("/rpc/")[1].split("?")[0];
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    calls.push({ fn, body });
    const reply: Record<string, () => unknown> = {
      ai3d_info: () => INFO,
      ai3d_wallet_create: () => ({ ok: true, token: TOKEN, code: "X3D-1A2B3C4D", credits: 0 }),
      ai3d_me: () => ({ wallet: { code: "X3D-1A2B3C4D", name: "Mona Adel", phone: "+201012345678", credits }, topups, jobs }),
      ai3d_receipt_slot: () => "r/w1/3f9a21c7-b4e8-4d01-9a2b-1c2d3e4f5a6b.jpg",
      ai3d_topup: () => {
        topups = [{ id: "t1", credits: 5, amount: 250, method: body.p_method, status: "pending", note: null, created_at: "2026-10-25T10:00:00Z" }];
        return { ok: true };
      },
      ai3d_generate: () => {
        credits -= 1;
        jobs = [{ id: "11111111-2222-3333-4444-555555555555", kind: "text", prompt: body.p_prompt, style: body.p_style, status: "shaping", progress: 30, glb: null, thumb: null, remote_glb: null, remote_thumb: null, error: null, credits: 1, refunded: false, public: false, created_at: "2026-10-25T10:05:00Z", finished_at: null }];
        return { ok: true, id: "11111111-2222-3333-4444-555555555555" };
      },
      ai3d_share: () => true,
    };
    await route.fulfill({ json: reply[fn]?.() ?? null });
  });
  await page.route("**/storage/v1/object/ai3d/**", (route) => {
    uploads++;
    return route.fulfill({ json: { Key: "ok" } });
  });
  await page.route("**/storage/v1/object/public/ai3d-models/**", (route) => route.fulfill({ body: GLB, contentType: "model/gltf-binary" }));

  await page.goto("/ar/3dai/studio/");
  await page.getByTestId("ai3d-name").fill("Mona Adel");
  await page.getByTestId("ai3d-phone").fill("01012345678");
  await page.getByTestId("ai3d-wallet-submit").click();
  await expect(page.getByTestId("ai3d-balance")).toContainText("X3D-1A2B3C4D");
  expect(calls.find((c) => c.fn === "ai3d_wallet_create")?.body).toEqual({ p_name: "Mona Adel", p_phone: "01012345678" });
  // No credits yet: the button waits.
  await page.getByTestId("ai3d-prompt").fill("a cute robot with big eyes");
  await expect(page.getByTestId("ai3d-generate")).toBeDisabled();

  // Top up: package, how to pay (from the settings), sender, receipt.
  await page.getByTestId("ai3d-topup-open").click();
  const sheet = page.getByTestId("ai3d-topup");
  await expect(sheet).toContainText("01000000000");
  await sheet.getByRole("button", { name: /250 جنيه/ }).click();
  await page.getByTestId("ai3d-sender").fill("01099999999");
  await page.getByTestId("ai3d-receipt").setInputFiles({ name: "r.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
  await page.getByTestId("ai3d-topup-send").click();
  await expect(page.getByTestId("ai3d-topup-sent")).toBeVisible();
  expect(uploads).toBe(1);
  expect(calls.find((c) => c.fn === "ai3d_topup")?.body).toMatchObject({ p_token: TOKEN, p_package: 1, p_method: "vodafone_cash", p_sender: "01099999999", p_receipt: "r/w1/3f9a21c7-b4e8-4d01-9a2b-1c2d3e4f5a6b.jpg" });
  await sheet.getByRole("button", { name: "قفل" }).click();
  await expect(page.getByText("مستني المراجعة")).toBeVisible();

  // The team approves: the balance shows on the next look.
  credits = 5;
  await page.reload();
  await expect(page.getByTestId("ai3d-balance")).toContainText("5");
  await page.getByTestId("ai3d-prompt").fill("a cute robot with big eyes");
  await page.getByRole("button", { name: "كرتون" }).click();
  await page.getByTestId("ai3d-generate").click();
  await expect(page.getByTestId("ai3d-job")).toHaveAttribute("data-status", "shaping");
  expect(calls.find((c) => c.fn === "ai3d_generate")?.body).toEqual({ p_token: TOKEN, p_kind: "text", p_prompt: "a cute robot with big eyes", p_style: "cartoon", p_image: null });

  // It finishes (the studio keeps asking while it runs).
  jobs = [{ ...jobs[0], status: "done", progress: 100, glb: "11111111-2222-3333-4444-555555555555/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.glb", finished_at: "2026-10-25T10:08:00Z" }];
  await expect(page.getByTestId("ai3d-job")).toHaveAttribute("data-status", "done", { timeout: 10_000 });
  await page.getByTestId("ai3d-open").click();
  await expect(page.getByTestId("ai3d-viewer")).toHaveAttribute("data-state", "ready", { timeout: 15_000 });
  const file = page.waitForEvent("download");
  await page.getByTestId("ai3d-dl-stl").click();
  const stl = await file;
  expect(stl.suggestedFilename()).toBe("buildx-3d-11111111.stl");
  expect(errors).toEqual([]);
});
