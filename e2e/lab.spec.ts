import { expect, test, type Page } from "@playwright/test";

/**
 * BuildX Lab end to end, against the static export: the circuit is built by hand on the canvas, the
 * sketch is compiled by the real WebAssembly GCC and run on the simulated ATmega328P, then saved and
 * reopened. Supabase is mocked (guests keep projects on the device; signed-in saves are mocked RPCs).
 */

const BLINK = `void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("blink ready");
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}
`;

async function mockSupabase(page: Page, rpc: Record<string, (body: Record<string, unknown>) => unknown> = {}) {
  await page.route(/supabase\.co\//, async (route) => {
    const url = route.request().url();
    const fn = url.match(/\/rest\/v1\/rpc\/([a-z_]+)/)?.[1];
    if (fn && rpc[fn]) return route.fulfill({ json: rpc[fn](JSON.parse(route.request().postData() || "{}")) });
    if (fn === "lab_gallery") return route.fulfill({ json: [] });
    if (fn) return route.fulfill({ json: null });
    return route.fulfill({ json: {} });
  });
}

/** Canvas point (world units) → screen point, from the canvas's own transform. */
async function at(page: Page, wx: number, wy: number) {
  const canvas = page.getByTestId("circuit-canvas");
  const t = (await canvas.locator(":scope > g").getAttribute("transform"))!;
  const m = t.match(/scale\(([-\d.e]+)\) translate\(([-\d.e]+) ([-\d.e]+)\)/)!;
  const [z, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const box = (await canvas.boundingBox())!;
  return { x: box.x + (wx + x) * z, y: box.y + (wy + y) * z };
}
async function place(page: Page, type: string, wx: number, wy: number) {
  await page.getByTestId(`lib-${type}`).click();
  const p = await at(page, wx, wy);
  await page.mouse.click(p.x, p.y);
}
async function wire(page: Page, a: [number, number], b: [number, number]) {
  const p = await at(page, ...a);
  const q = await at(page, ...b);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 });
  await page.mouse.move(q.x, q.y, { steps: 4 });
  await page.mouse.up();
}
/** Breadboard hole position for a half breadboard placed at (0, -260). */
const ROW: Record<string, number> = { tp: 10, tn: 20, a: 50, b: 60, c: 70, d: 80, e: 90, f: 120, g: 130, h: 140, i: 150, j: 160, bn: 190, bp: 200 };
const hole = (name: string): [number, number] => {
  const m = name.match(/^(tp|tn|bp|bn|[a-j])(\d+)$/)!;
  return [10 + Number(m[2]) * 10, -260 + ROW[m[1]]];
};

test.describe("BuildX Lab", () => {
  test("dashboard: hero actions, examples and honest unfinished areas", async ({ page }) => {
    await mockSupabase(page);
    await page.goto("/lab/");
    await expect(page.getByTestId("create-circuit")).toBeVisible();
    await expect(page.getByTestId("example-blink")).toBeVisible();
    // No horizontal scrolling on any screen size.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    // An unfinished area says so instead of pretending.
    await page.goto("/lab/codeblocks/");
    await expect(page.getByText(/تحت الإنشاء|Being built/)).toBeVisible();
  });

  test("language switch flips the layout and is remembered", async ({ page, isMobile }) => {
    test.skip(isMobile, "the switch lives in the side menu");
    await mockSupabase(page);
    await page.goto("/lab/");
    const dir = await page.evaluate(() => document.documentElement.dir);
    await page.getByTestId("lang-toggle").click();
    const flipped = dir === "rtl" ? "ltr" : "rtl";
    await expect(page.locator("html")).toHaveAttribute("dir", flipped);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", flipped);
  });

  test("Blink built by hand: wire, compile with GCC, simulate, stop, save, reopen", async ({ page, isMobile }) => {
    test.skip(isMobile, "circuit editing is a desktop workflow");
    test.setTimeout(180_000);
    await mockSupabase(page);
    await page.addInitScript(() => localStorage.setItem("bx-lab-lang", "en"));
    await page.goto("/lab/circuits/new/");
    await expect(page.getByTestId("circuit-canvas")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/lab\/circuits\/local-[0-9a-f-]+/);

    // Uno with its top-left corner at 0,0 and a half breadboard above it.
    await place(page, "arduino-uno", 140, 105);
    await place(page, "breadboard-half", 165, -155);
    await page.getByRole("button", { name: "Fit to screen" }).click();
    // LED legs in f17/f18, a 220 Ω resistor from h13 to h17.
    await place(page, "led", 185, -155);
    await place(page, "resistor", 160, -120);
    await expect(page.locator("[data-part]")).toHaveCount(4);

    // Pin 13 → j13, i18 → GND rail, GND → GND rail.
    await wire(page, [140, 10], hole("j13"));
    await wire(page, hole("i18"), hole("bn18"));
    await wire(page, [130, 10], hole("bn12"));
    await expect(page.locator("[data-wire]")).toHaveCount(3);

    // Diagnostics: nothing unconnected.
    await page.getByRole("button", { name: "Diagnostics" }).click();
    await expect(page.getByTestId("diagnostics")).not.toContainText("isn't connected");

    // The sketch.
    await page.getByTestId("side-code").click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(BLINK);

    await page.getByTestId("compile").click();
    await expect(page.getByTestId("compile-status")).toContainText("Compiled", { timeout: 120_000 });

    await page.getByTestId("sim-start").click();
    await expect(page.getByTestId("sim-clock")).toBeVisible();
    await expect(page.getByTestId("serial-output")).toContainText("blink ready", { timeout: 10_000 });
    // The LED really blinks: lit at some moments, dark at others.
    const seen = new Set<boolean>();
    for (let i = 0; i < 30 && seen.size < 2; i++) {
      seen.add((await page.locator('[data-testid="part-led"] circle').count()) > 0);
      await page.waitForTimeout(120);
    }
    expect([...seen].sort()).toEqual([false, true]);

    await page.getByTestId("sim-stop").click();
    await expect(page.getByTestId("sim-clock")).toHaveCount(0);

    await page.getByTestId("save").click();
    await expect(page.getByTestId("save-state")).toHaveText(/^Saved on this device( · .+)?$/);

    // Reopen from its own URL (the static host serves it through the 404 page).
    await page.reload();
    await expect(page.getByTestId("circuit-canvas")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-part]")).toHaveCount(4);
    await expect(page.locator("[data-wire]")).toHaveCount(3);
    await expect(page.locator(".cm-content")).toContainText("digitalWrite(13, HIGH);");
  });

  test("3D view: the circuit as real-sized models (or a clear note where WebGL is off)", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop workflow");
    // Loads three.js and compiles shaders; CI runners render WebGL on the CPU.
    test.setTimeout(90_000);
    await mockSupabase(page);
    await page.goto("/lab/");
    await page.getByTestId("example-blink").click();
    await expect(page.getByTestId("circuit-canvas")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("view-3d").click();
    await expect(page.getByTestId("circuit-3d").or(page.getByTestId("no-webgl"))).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("view-2d").click();
    await expect(page.getByTestId("circuit-3d")).toHaveCount(0);
  });

  test("workspace: right-click menu, pinout, copy and paste, delete asks first", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop workflow");
    await mockSupabase(page);
    await page.addInitScript(() => localStorage.setItem("bx-lab-lang", "en"));
    await page.goto("/lab/");
    await page.getByTestId("example-button-led").click();
    await expect(page.getByTestId("circuit-canvas")).toBeVisible({ timeout: 30_000 });
    const led = page.getByTestId("part-led");
    await expect(led).toHaveCount(1);
    await led.click({ button: "right" });
    const menu = page.getByTestId("context-menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "View pinout" }).click();
    await expect(page.getByTestId("part-sheet-pinout")).toContainText("Anode");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("part-sheet-pinout")).toHaveCount(0);

    await led.click();
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await expect(led).toHaveCount(2);
    await page.keyboard.press("Control+z");
    await expect(led).toHaveCount(1);

    await page.getByTestId("circuit-canvas").click({ position: { x: 20, y: 300 } });
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await expect(page.getByTestId("confirm-delete")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(led).toHaveCount(1);
  });

  test("oscilloscope measures the real PWM on D9", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop workflow");
    test.setTimeout(120_000);
    await mockSupabase(page);
    await page.addInitScript(() => localStorage.setItem("bx-lab-lang", "en"));
    await page.goto("/lab/");
    await page.getByTestId("example-pwm-fade").click();
    await expect(page.getByTestId("circuit-canvas")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("bottom-scope").click();
    await page.getByTestId("scope-ch1").selectOption("D9");
    await page.getByTestId("scope-timebase").selectOption("0.005");
    await page.getByTestId("sim-start").click();
    await expect(page.getByTestId("sim-clock")).toBeVisible({ timeout: 90_000 });
    // Timer 1 PWM on an Uno is 16 MHz / 64 / 510 = 490.2 Hz (in simulated time, whatever the host speed);
    // the fade nudges edges as the duty changes, so allow 1 %.
    await expect(page.getByTestId("scope-measure")).toContainText(/D9: 4(8[5-9]|9[0-5])\.\d\d Hz/, { timeout: 30_000 });
    await page.getByTestId("bottom-pins").click();
    await expect(page.getByTestId("pin-monitor").locator('[data-pin="D9"]')).toContainText("OUTPUT");
  });

  test("3D Studio: a hole grouped with a box really cuts it, and the STL downloads", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop workflow");
    test.setTimeout(120_000);
    await mockSupabase(page);
    await page.addInitScript(() => localStorage.setItem("bx-lab-lang", "en"));
    await page.goto("/lab/3d/new");
    await expect(page.getByTestId("cad-studio")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("add-box")).toBeEnabled({ timeout: 60_000 });
    await page.getByTestId("add-box").click();
    await expect(page.getByTestId("cad-stats")).toContainText("8.00 cm³");
    await page.getByTestId("add-hole-cylinder").click();
    for (const [id, v] of [["param-dia", "10"], ["param-h", "30"], ["position-x", "0"], ["position-y", "0"]]) {
      await page.getByTestId(id).fill(v);
      await page.getByTestId(id).press("Enter");
    }
    await page.getByTestId("cad-palette").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+a");
    await page.getByTestId("cad-group").click();
    // 20 mm cube minus a 10 mm hole through it: 8 − π·5²·20 / 1000 = 6.43 cm³.
    await expect(page.getByTestId("cad-stats")).toContainText("6.43 cm³");
    // Reloading straight after an edit keeps it (the device copy is written as the page goes).
    await page.reload();
    await expect(page.getByTestId("cad-stats")).toContainText("6.43 cm³", { timeout: 60_000 });
    await page.getByTestId("cad-export").click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-stl").click()]);
    expect(dl.suggestedFilename()).toMatch(/\.stl$/);
  });

  test("compile errors point at the line", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop workflow");
    test.setTimeout(120_000);
    await mockSupabase(page);
    await page.addInitScript(() => localStorage.setItem("bx-lab-lang", "en"));
    await page.goto("/lab/");
    await page.getByTestId("example-serial-hello").click();
    await expect(page.getByTestId("circuit-canvas")).toBeVisible({ timeout: 30_000 });
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText("void setup() {\n  Serial.begin(9600)\n}\nvoid loop() {}\n");
    await page.getByTestId("compile").click();
    await expect(page.getByTestId("compile-status")).toContainText("Compile failed", { timeout: 120_000 });
    await expect(page.getByTestId("diagnostics")).toContainText("sketch.ino:");
    await expect(page.locator(".cm-lintRange-error")).toHaveCount(1);
  });

  test("a challenge is checked by running the sketch in the simulator", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop workflow");
    test.setTimeout(180_000);
    await mockSupabase(page, { academy_catalog: () => [] });
    await page.addInitScript(() => localStorage.setItem("bx-lab-lang", "en"));
    await page.goto("/lab/challenges/");
    await page.getByTestId("challenge-blink-2hz").getByRole("button", { name: "Start" }).click();
    await expect(page.getByTestId("challenge-bar")).toBeVisible({ timeout: 30_000 });
    // The starter sketch does nothing: the check says what the simulator saw.
    await page.getByTestId("challenge-check").click();
    await expect(page.getByTestId("challenge-result")).toContainText("Not yet", { timeout: 150_000 });
    await expect(page.getByTestId("challenge-result")).toContainText("The LED lights up");
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(BLINK.replace(/delay\(500\)/g, "delay(250)"));
    await page.getByTestId("challenge-check").click();
    await expect(page.getByTestId("challenge-result")).toContainText("Passed", { timeout: 150_000 });
    await expect(page.getByTestId("challenge-result")).toContainText("2 Hz");
  });

  test("academy with no courses says so and points to the challenges", async ({ page }) => {
    await mockSupabase(page, { academy_catalog: () => [] });
    await page.addInitScript(() => localStorage.setItem("bx-lab-lang", "en"));
    await page.goto("/lab/learn/");
    await expect(page.getByText("No courses yet")).toBeVisible();
    await expect(page.getByTestId("challenge-blink-2hz")).toBeVisible();
  });

  test("classroom: a student starts a Lab task and submits it with the simulator's check", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop workflow");
    test.setTimeout(180_000);
    const pid = "22222222-2222-4222-8222-222222222222";
    let created: { p_data: unknown; p_meta: { tags: string[] } } | null = null;
    const submits: Record<string, unknown>[] = [];
    const task = { id: "33333333-3333-4333-8333-333333333333", title: "Blink twice a second", description: "Use the LED on pin 13.", due: null, max_points: 10, allow_late: true, challenge: "blink-2hz", template: null, submission: null };
    await mockSupabase(page, {
      lab_me: () => ({ kind: "student", id: "s1", name: "Mona Adel", instructor: false, admin: false }),
      lab_assignments: () => [task],
      lab_project_create: (b) => ((created = b as typeof created), { ok: true, id: pid }),
      lab_project_get: () => ({
        ok: true,
        role: "owner",
        project: { id: pid, kind: "circuit", title: task.title, description: "", tags: created!.p_meta.tags, category: null, visibility: "private", thumbnail: null, revision: 1, created_at: "2026-10-26T10:00:00Z", updated_at: "2026-10-26T10:00:00Z", deleted_at: null, mine: true, owner: "Mona", favorite: false, favorites: 0, data: created!.p_data, share_token: null },
      }),
      lab_project_save: () => ({ ok: true, revision: 2 }),
      lab_assignment_submit: (b) => (submits.push(b), { ok: true, late: false }),
      lab_event: () => null,
    });
    await page.addInitScript(() => {
      localStorage.setItem("bx-lab-lang", "en");
      localStorage.setItem("rh-app-student", JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "2024001", group: "A" }));
    });
    await page.goto("/lab/classrooms/");
    await page.getByTestId(`lab-task-${task.id}`).getByRole("button", { name: "Start" }).click();
    await expect(page.getByTestId("assignment-bar")).toBeVisible({ timeout: 30_000 });
    expect(created!.p_meta.tags).toEqual(["assignment", `assignment:${task.id}`, "challenge:blink-2hz"]);
    await expect(page.getByTestId("challenge-bar")).toBeVisible();
    await page.getByTestId("assignment-submit").click();
    await expect.poll(() => submits.length, { timeout: 150_000 }).toBe(1);
    expect(submits[0]).toMatchObject({ p_assignment: task.id, p_project: pid, p_passed: false, p_token: "a".repeat(64) });
    expect(JSON.stringify(submits[0].p_checks)).toContain("Blinks 2 times a second");
  });

  test("signed-in save goes to the account, and someone else's newer save is never overwritten", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop workflow");
    test.setTimeout(120_000);
    const doc = { v: 1, parts: [{ id: "uno", type: "arduino-uno", x: 0, y: 0, rot: 0, props: {} }], wires: [], files: [{ name: "sketch.ino", text: "void setup(){}\nvoid loop(){}\n" }], main: "sketch.ino" };
    const project = { id: "11111111-1111-4111-8111-111111111111", kind: "circuit", title: "Mine", description: "", tags: [], category: null, visibility: "private", thumbnail: null, revision: 3, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", deleted_at: null, mine: true, owner: "Mona", favorite: false, favorites: 0, data: doc, share_token: null };
    const saves: Record<string, unknown>[] = [];
    await mockSupabase(page, {
      lab_me: () => ({ kind: "student", id: "s1", name: "Mona Adel", instructor: false, admin: false }),
      lab_project_get: () => ({ ok: true, role: "owner", project }),
      lab_project_save: (b) => {
        saves.push(b);
        return saves.length === 1 ? { ok: true, revision: 4 } : { ok: false, error: "conflict", revision: 5, by: "Omar", at: "2026-10-19T10:00:00Z" };
      },
      lab_event: () => null,
    });
    await page.addInitScript(() => {
      localStorage.setItem("bx-lab-lang", "en");
      localStorage.setItem("rh-app-student", JSON.stringify({ token: "a".repeat(64), name: "Mona Adel", code: "2024001", group: "A" }));
    });
    await page.goto(`/lab/circuits/${project.id}/`);
    await expect(page.getByTestId("project-title")).toHaveText("Mine", { timeout: 30_000 });
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("// edited\n");
    await expect(page.getByTestId("save-state")).toHaveText("Unsaved changes");
    await page.getByTestId("save").click();
    await expect(page.getByTestId("save-state")).toHaveText(/^Saved( · .+)?$/);
    expect(saves[0]).toMatchObject({ p_id: project.id, p_base: 3, p_token: "a".repeat(64) });
    expect(JSON.stringify(saves[0].p_data)).toContain("// edited");

    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("// again\n");
    await page.getByTestId("save").click();
    expect(saves[1]).toMatchObject({ p_base: 4 });
    await expect(page.getByRole("dialog")).toContainText("Someone else saved");
    await expect(page.getByRole("dialog")).toContainText("Omar");
  });
});
