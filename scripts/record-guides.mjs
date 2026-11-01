#!/usr/bin/env node
/**
 * Records the app's how-to videos (shown on first sign-in and in Help): a real screen recording of
 * the BuildX App from out-static/, driven step by step with captions and a finger mark, on made-up
 * placeholder data (no real people). Output: public/guides/{student,team}.mp4 + .jpg poster, and the
 * chapter times in src/portal/guides.json.
 *
 *   node scripts/build-static.mjs && node scripts/record-guides.mjs
 *
 * Needs ffmpeg. Not run in CI: re-record when the screens change.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(root, "public/guides");
const VIEW = { width: 390, height: 844 };
const SIZE = { width: 720, height: 1558 };
const at = (min) => new Date(Date.now() - min * 60_000).toISOString();
const soon = (h) => new Date(Date.now() + h * 3600_000).toISOString();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "coach@example.com", role: "authenticated", exp: 4102444800 })}.sig`;

/** Caption bar + finger mark, put on every page (the app is one page: it survives navigation). */
const OVERLAY = () => {
  const make = () => {
    if (document.getElementById("bx-guide")) return;
    const s = document.createElement("style");
    s.textContent = `
      #bx-guide{position:fixed;inset-inline:14px;bottom:96px;z-index:2147483647;pointer-events:none;display:flex;justify-content:center}
      #bx-guide p{margin:0;max-width:100%;padding:12px 16px;border-radius:16px;background:rgba(6,12,30,.92);border:1px solid rgba(120,170,255,.35);
        color:#fff;font:600 16px/1.5 "IBM Plex Sans Arabic",system-ui,sans-serif;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.45);
        transition:opacity .25s,transform .25s;direction:rtl}
      #bx-guide p.hide{opacity:0;transform:translateY(8px)}
      #bx-guide b{display:block;font-size:11px;letter-spacing:.08em;color:#7fd8ff;font-weight:700;margin-bottom:2px}
      .bx-tap{position:fixed;z-index:2147483647;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;pointer-events:none;
        background:rgba(255,255,255,.35);border:2px solid #fff;box-shadow:0 0 0 6px rgba(56,220,255,.35);animation:bx-tap .7s ease-out forwards}
      @keyframes bx-tap{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.5);opacity:0}}`;
    document.head.appendChild(s);
    const d = document.createElement("div");
    d.id = "bx-guide";
    d.innerHTML = '<p class="hide"><b></b><span></span></p>';
    document.body.appendChild(d);
  };
  window.__cap = (chapter, text) => {
    make();
    const p = document.querySelector("#bx-guide p");
    p.classList.add("hide");
    setTimeout(() => {
      p.querySelector("b").textContent = chapter || "";
      p.querySelector("span").textContent = text;
      p.classList.toggle("hide", !text);
    }, 200);
  };
  window.__tap = (x, y) => {
    const t = document.createElement("div");
    t.className = "bx-tap";
    t.style.left = `${x}px`;
    t.style.top = `${y}px`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 800);
  };
};

function guide(page, t0, chapters) {
  const wait = (ms) => page.waitForTimeout(ms);
  return {
    wait,
    /** A caption; a title starts a new chapter at this moment of the video. */
    async cap(text, chapter) {
      if (chapter) chapters.push({ t: Math.max(0, Math.round((Date.now() - t0) / 100) / 10), title: chapter });
      await page.evaluate(([c, x]) => window.__cap(c, x), [chapter ?? chapters.at(-1)?.title ?? "", text]);
      await wait(500);
    },
    async tap(loc, after = 900) {
      await loc.scrollIntoViewIfNeeded();
      const box = await loc.boundingBox();
      if (box) await page.evaluate(([x, y]) => window.__tap(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
      await wait(350);
      try {
        await loc.click({ timeout: 4000 });
      } catch (e) {
        await page.screenshot({ path: path.join(tmpdir(), "bx-guide-fail.png") });
        throw e;
      }
      await wait(after);
    },
    async type(loc, text) {
      await loc.click();
      await loc.pressSequentially(text, { delay: 75 });
      await wait(300);
    },
    async scroll(dy, steps = 6) {
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, dy / steps);
        await wait(120);
      }
      await wait(500);
    },
  };
}

/* ─── made-up data ─────────────────────────────────────────────────────── */

const STUDENT = { name: "طالب تجريبي", code: "BX1001", group: "روبوتكس أ" };
const home = {
  now: new Date().toISOString(),
  student: STUDENT,
  materials: [
    { id: "m1", title: "المحاضرة ٣: الحساسات", description: "شرح الألتراسونيك والـ IR بالأمثلة", kind: "link", path: null, url: "https://example.com", fileName: null, mime: null, size: null, points: 5, pinned: true, at: at(300) },
    { id: "m2", title: "ملف الدايرة", description: "الدايرة اللي هنبنيها السيشن الجاية", kind: "link", path: null, url: "https://example.com", fileName: null, mime: null, size: null, points: 5, pinned: false, at: at(2000) },
  ],
  quizzes: [
    { id: "q1", title: "كويز الحساسات", description: "١٠ أسئلة سريعة", opensAt: at(60), closesAt: soon(48), timeLimit: 10, maxAttempts: 1, points: 20, questions: 10, maxScore: 10, used: 0, best: null, inProgress: null, state: "open" },
    { id: "q2", title: "كويز الأردوينو", description: "", opensAt: at(9000), closesAt: at(6000), timeLimit: 10, maxAttempts: 1, points: 20, questions: 8, maxScore: 8, used: 1, best: 7, inProgress: null, state: "done" },
  ],
  attendance: [
    { title: "سيشن ٣", at: at(1500), status: "present" },
    { title: "سيشن ٢", at: at(11500), status: "present" },
    { title: "سيشن ١", at: at(21500), status: "late" },
  ],
};
const task = { id: "t1", title: "صورة الدايرة بتاعتك", description: "صوّر الدايرة شغالة وارفعها، أو حط لينك.", dueAt: soon(30), maxPoints: 10, allowLate: true, submission: null };
const tracks = [
  ["attend", 3, 1, [1, 10, 25, 50]], ["streak", 3, 1, [3, 5, 10, 20]], ["quiz", 1, 1, [1, 5, 15, 30]], ["perfect", 0, 0, [1, 5, 10, 25]],
  ["tasks", 0, 0, [1, 5, 15, 30]], ["reader", 6, 1, [5, 20, 50, 100]], ["events", 1, 1, [1, 3, 6, 12]], ["certs", 0, 0, [1, 3, 5, 10]],
  ["lab", 0, 0, [1, 3, 8, 15]], ["maker", 0, 0, [1, 2, 4, 8]], ["star", 20, 1, [20, 50, 100, 200]], ["points", 117, 1, [100, 500, 1000, 2500]], ["course", 40, 0, [100]],
].map(([key, value, tier, th]) => ({ key, value, tier, th, next: th.find((x) => x > value) ?? null, earned: [] }));

async function studentRoutes(page) {
  let fresh = [{ key: "streak", tier: 1 }];
  await page.route(/supabase\.co/, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/rpc/")[1];
    const json = {
      app_status: { ready: true },
      student_login: { ok: true, token: "a".repeat(64), student: STUDENT },
      student_home: home,
      student_tasks: [task],
      student_points: { points: 117, rank: 2, of: 14, group: STUDENT.group, breakdown: { attended: 3, quizzes: 1, tasks: 0, events: 1 }, badges: [], streak: { current: 3, best: 3 }, top: [] },
      student_achievements: { items: tracks, fresh },
    }[fn];
    if (fn === "student_achievements_seen") fresh = [];
    if (fn === "student_submit") {
      task.submission = { submittedAt: new Date().toISOString(), late: false, body: "الدايرة شغالة", link: "", files: [], grade: null, feedback: "", gradedAt: null };
      return route.fulfill({ json: { ok: true, late: false } });
    }
    return route.fulfill({ json: fn ? (json ?? null) : [] });
  });
}

async function recordStudent(page, g) {
  await studentRoutes(page);
  await page.goto(`${BASE}/app/#/login`);
  await g.wait(1200);
  await g.cap("اكتب رقم الطالب (أو إيميلك) وكلمة السر اللي وصلتك", "تسجيل الدخول");
  await g.type(page.getByLabel("رقم الطالب أو البريد الإلكتروني"), "BX1001");
  await g.type(page.getByLabel("رمز الدخول (PIN)"), "482913");
  await g.tap(page.getByRole("button", { name: "دخول", exact: true }), 1500);

  await g.cap("كل ما تاخد شارة جديدة بتظهرلك كده 🎉", "الشارات");
  await g.wait(1600);
  await g.tap(page.getByTestId("badge-next"), 800);

  await g.cap("دي الرئيسية: حضورك، كويزاتك، تاسكاتك ونقاطك", "الرئيسية");
  await g.wait(800);
  await g.scroll(700);
  await g.scroll(-700);

  await g.cap("المحاضرات والملفات كلها هنا، وكل محاضرة تفتحها بتديك نقاط", "المحتوى");
  await g.tap(page.locator("nav").last().getByRole("link", { name: "المحتوى" }), 1800);

  await g.cap("الكويزات بتتصحح لوحدها، والنتيجة بتظهرلك على طول", "الكويزات");
  await g.tap(page.locator("nav").last().getByRole("link", { name: "الكويزات" }), 1800);

  await g.cap("التاسك: اكتب ردّك أو حط لينك وسلّم من الموبايل", "التاسكات");
  await g.tap(page.locator("nav").last().getByRole("link", { name: "التاسكات" }), 900);
  await g.tap(page.getByRole("button", { name: /صورة الدايرة/ }), 900);
  await g.type(page.getByLabel("ردّك (اختياري)"), "الدايرة شغالة");
  await g.tap(page.getByRole("button", { name: "سلّم", exact: true }), 1500);
  await g.cap("المدرّب بيصحح ويديك نقاط، وبيوصلك إشعار");
  await g.wait(1500);

  await g.cap("نقاطك وترتيبك وشاراتك: كل شارة ليها ٤ مستويات", "النقاط والشارات");
  await g.tap(page.locator("nav").last().getByRole("link", { name: "الرئيسية" }), 900);
  await g.tap(page.getByTestId("achievements-strip"), 1500);
  await g.scroll(600);
  await g.tap(page.getByTestId("medal-attend"), 1800);
  await page.keyboard.press("Escape");
  await g.wait(600);

  await g.cap("من «حسابي» غيّر كلمة السر، وشوف كارنيهك وشهاداتك", "حسابي");
  await page.evaluate(() => (location.hash = "#/me/account"));
  await g.wait(2200);
  await g.cap("كده إنت جاهز 💪 أي سؤال اسأل بقلوظ أو المدرّب", "خلاص");
  await g.wait(2500);
}

const STUDENTS = [
  { id: "s1", code: "BX1001", codeKey: "BX1001", barcode: null, barcodeKey: null, name: "طالب تجريبي", group: "روبوتكس أ", phone: null, email: null, notes: null, active: true, createdAt: at(9000), hasPin: false, locked: false, lastLogin: null },
  { id: "s2", code: "BX1002", codeKey: "BX1002", barcode: null, barcodeKey: null, name: "طالبة تجريبية", group: "روبوتكس أ", phone: null, email: null, notes: null, active: true, createdAt: at(9000), hasPin: true, locked: false, lastLogin: at(120) },
  { id: "s3", code: "BX1003", codeKey: "BX1003", barcode: null, barcodeKey: null, name: "طالب تاني", group: "روبوتكس ب", phone: null, email: null, notes: null, active: true, createdAt: at(9000), hasPin: true, locked: false, lastLogin: at(3000) },
];

async function teamRoutes(page) {
  await page.route(/supabase\.co/, (route) => {
    const url = new URL(route.request().url());
    const fn = url.pathname.split("/rpc/")[1];
    if (fn) {
      const json = {
        app_status: { ready: true },
        staff_whoami: "owner",
        staff_list_students: STUDENTS,
        staff_student_app_invite: { id: "s1", code: "BX1001", name: "طالب تجريبي", group: "روبوتكس أ", pin: "613507", email: "student@example.com", sent: { email: "sent", whatsapp: "no_phone" } },
      }[fn];
      return route.fulfill({ json: json ?? null });
    }
    if (url.pathname.endsWith("/auth/v1/token"))
      return route.fulfill({ json: { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: { id: "u1", email: "coach@example.com", aud: "authenticated", role: "authenticated" } } });
    if (url.pathname.endsWith("/staff")) {
      const row = { user_id: "u1", email: "coach@example.com", full_name: "مدرّب تجريبي", role: "owner", active: true, created_at: at(99999) };
      return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row] });
    }
    return route.fulfill({ json: [], headers: { "content-range": "0-0/0" } });
  });
}

async function recordTeam(page, g) {
  await teamRoutes(page);
  await page.goto(`${BASE}/app/#/login`);
  await g.wait(1200);
  await g.cap("فريق التدريب بيدخل بالإيميل وكلمة السر", "الدخول");
  await g.type(page.getByLabel("رقم الطالب أو البريد الإلكتروني"), "coach@example.com");
  await g.type(page.getByLabel("كلمة المرور"), "a-long-password");
  await g.tap(page.getByRole("button", { name: "دخول", exact: true }), 2000);

  await g.cap("دي لوحتك: كل اللي مستنيك النهارده في مكان واحد", "الرئيسية");
  await g.wait(1200);
  await g.scroll(800);
  await g.scroll(-800);

  await g.cap("الطلاب: دوّر بالاسم أو رقم الكارنيه، وافتح أي طالب", "الطلاب");
  await g.tap(page.locator("nav").last().getByRole("link", { name: "الطلاب" }), 1500);
  await g.tap(page.getByText("طالب تجريبي", { exact: true }), 1200);
  await g.cap("زرار واحد: يتضاف للتطبيق ويوصله الإيميل وكلمة السر", "إضافة طالب للتطبيق");
  await g.type(page.getByTestId("student-email"), "student@example.com");
  await g.tap(page.getByTestId("app-invite"), 2200);
  await g.cap("وتقدر تبعتله نفس البيانات واتساب من هنا");
  await g.wait(2000);
  await page.keyboard.press("Escape");
  await g.wait(500);
  await page.keyboard.press("Escape");
  await g.wait(600);

  await g.cap("افتح سيشن وامسح باركود الكارنيه: الحضور بيتسجل لوحده", "الحضور");
  await g.tap(page.locator("nav").last().getByRole("link", { name: "الحضور" }), 2200);

  await g.cap("ارفع محاضرة أو ملف، والطلاب يوصلهم إشعار", "المحتوى");
  await g.tap(page.locator("nav").last().getByRole("link", { name: "المحتوى" }), 2200);

  await g.cap("اعمل كويز: بيتصحح لوحده والنتايج قدامك", "الكويزات");
  await g.tap(page.locator("nav").last().getByRole("link", { name: "الكويزات" }), 2200);

  await g.cap("وكل الباقي (فعاليات، شهادات، واتساب، تقارير) من «المزيد» 👌", "خلاص");
  await g.wait(2800);
}

/* ─── run ──────────────────────────────────────────────────────────────── */

const server = spawn("node", ["scripts/serve-static.mjs", "out-static", String(PORT)], { cwd: root, stdio: "ignore", detached: true });
await new Promise((r) => setTimeout(r, 1500));
mkdirSync(OUT, { recursive: true });
const chapters = {};
const browser = await chromium.launch();
try {
  for (const [name, run] of [
    ["student", recordStudent],
    ["team", recordTeam],
  ]) {
    const dir = mkdtempSync(path.join(tmpdir(), "bx-guide-"));
    const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, locale: "ar-EG", recordVideo: { dir, size: SIZE } });
    await context.addInitScript(OVERLAY);
    await context.addInitScript(() => {
      try {
        localStorage.setItem("bx-app-lang", "ar");
        localStorage.setItem("bx-guide-seen-student", "1");
        localStorage.setItem("bx-guide-seen-team", "1");
      } catch {
        /* none */
      }
    });
    const page = await context.newPage();
    const t0 = Date.now();
    chapters[name] = [];
    await run(page, guide(page, t0, chapters[name]));
    await context.close();
    const webm = path.join(dir, readdirSync(dir).find((f) => f.endsWith(".webm")));
    const mp4 = path.join(OUT, `${name}.mp4`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-vf", "scale=720:-2,fps=24", "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", `${mp4}.tmp.mp4`]);
    renameSync(`${mp4}.tmp.mp4`, mp4);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(chapters[name][2]?.t ?? 3), "-i", mp4, "-frames:v", "1", "-q:v", "5", path.join(OUT, `${name}.jpg`)]);
    console.log(`[guides] ${name}: ${mp4}`);
  }
} finally {
  await browser.close();
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}
writeFileSync(path.join(root, "src/portal/guides.json"), `${JSON.stringify(chapters, null, 2)}\n`);
console.log("[guides] chapters → src/portal/guides.json");
