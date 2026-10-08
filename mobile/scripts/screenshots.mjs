#!/usr/bin/env node
/**
 * Store screenshots for the BuildX HUE app, taken from the real app bundle (mobile/app/www, see
 * scripts/build-native.mjs) with made-up demo data, so no real student shows up in a store. The app
 * serves students and the training team, so the set shows both (and the one sign-in screen).
 *
 *   node mobile/scripts/screenshots.mjs   →  mobile/store/{raw,play,appstore}/*.png
 *
 * raw:      the bare screen (1290×2796)
 * appstore: 6.9" iPhone, 1290×2796, headline + screen
 * play:     Google Play phone, 1080×1920, headline + screen
 */
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "../..");
const store = path.join(root, "mobile", "store");
const at = (min) => new Date(Date.now() - min * 60_000).toISOString();
const day = (d, h = 17) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  x.setHours(h, 0, 0, 0);
  return x.toISOString();
};

/* ─── Demo data (fictional people) ─────────────────────────────────────── */

const NAMES = ["يوسف أحمد", "مريم خالد", "عمر حسن", "سلمى محمود", "كريم عادل", "نور الهدى سامي", "آدم طارق", "ليلى مصطفى", "زياد إبراهيم", "فرح وليد", "مازن شريف", "هنا عمرو"];
const students = NAMES.map((name, i) => ({
  id: `s${i}`,
  code: String(2024100 + i * 7),
  codeKey: String(2024100 + i * 7),
  barcode: null,
  barcodeKey: null,
  name,
  group: i % 3 === 2 ? "الذكاء الاصطناعي" : "الروبوتات — المستوى 1",
  phone: null,
  notes: null,
  active: true,
  createdAt: at(60 * 24 * 40),
  hasPin: i !== 4,
  locked: false,
  lastLogin: i % 4 === 0 ? null : at(60 * (i + 2)),
}));

const material = (id, title, description, kind, extra, minAgo, pinned = false) => ({ id, title, description, kind, path: kind === "file" ? `m/${id}.pdf` : null, url: kind === "link" ? "https://youtube.com" : null, fileName: null, mime: null, size: null, pinned, at: at(minAgo), ...extra });
const HOME = {
  now: new Date().toISOString(),
  student: { name: "يوسف أحمد", code: "2024100", group: "الروبوتات — المستوى 1" },
  materials: [
    material("m1", "محاضرة 5: الحساسات والمحركات", "شرح حساس المسافة ودرايفر L298N مع أمثلة Arduino.", "file", { fileName: "lecture-05-sensors.pdf", mime: "application/pdf", size: 3_400_000 }, 90, true),
    material("m2", "فيديو: بناء روبوت متتبع الخط", "خطوة بخطوة من التوصيل للكود.", "link", {}, 60 * 26),
    material("m3", "كود المشروع النهائي", "ملفات الكود والمكتبات المطلوبة.", "file", { fileName: "line-follower.zip", mime: "application/zip", size: 820_000 }, 60 * 50),
    material("m4", "محاضرة 4: أساسيات Arduino", "", "file", { fileName: "lecture-04-arduino.pdf", mime: "application/pdf", size: 2_100_000 }, 60 * 24 * 7),
  ],
  quizzes: [
    { id: "q1", title: "كويز الحساسات", description: "10 أسئلة على محاضرة 5", opensAt: at(120), closesAt: day(2, 23), timeLimit: 15, maxAttempts: 2, questions: 10, maxScore: 10, used: 0, best: null, inProgress: null, state: "open" },
    { id: "q2", title: "كويز أساسيات Arduino", description: "", opensAt: at(60 * 24 * 6), closesAt: at(60 * 24 * 2), timeLimit: 10, maxAttempts: 1, questions: 8, maxScore: 8, used: 1, best: 8, inProgress: null, state: "done" },
    { id: "q3", title: "مراجعة الوحدة الأولى", description: "", opensAt: day(5, 10), closesAt: day(7, 23), timeLimit: 20, maxAttempts: 1, questions: 15, maxScore: 15, used: 0, best: null, inProgress: null, state: "upcoming" },
  ],
  attendance: [
    { title: "سيشن 6: مشروع متتبع الخط", at: at(60 * 3), status: "present" },
    { title: "سيشن 5: الحساسات", at: at(60 * 24 * 3), status: "present" },
    { title: "سيشن 4: المحركات", at: at(60 * 24 * 7), status: "late" },
    { title: "سيشن 3: Arduino", at: at(60 * 24 * 10), status: "present" },
    { title: "سيشن 2: الدوائر", at: at(60 * 24 * 14), status: "excused" },
    { title: "سيشن 1: التعارف", at: at(60 * 24 * 17), status: "present" },
  ],
};
const POINTS = {
  points: 186,
  rank: 2,
  of: 24,
  group: "الروبوتات — المستوى 1",
  breakdown: { attended: 5, quizzes: 3, perfect: 1, certs: 1, events: 1, bonus: 20 },
  badges: ["first_step", "full_marks", "certified", "quiz_runner"],
  top: [
    { name: "مريم خ.", points: 204, me: false },
    { name: "يوسف أ.", points: 186, me: true },
    { name: "عمر ح.", points: 171, me: false },
    { name: "سلمى م.", points: 158, me: false },
    { name: "كريم ع.", points: 140, me: false },
  ],
};
const CERTS = [{ id: "c1", code: "BX-7K2M-Q9", name: "يوسف أحمد", kind: "completion", title: "Robotics Bootcamp — Level 1", title_ar: "معسكر الروبوتات — المستوى الأول", details: null, details_ar: null, hours: 24, issued_on: new Date().toISOString().slice(0, 10) }];

const sessions = [
  { id: "a1", title: "سيشن 6: مشروع متتبع الخط", group_name: "الروبوتات — المستوى 1", starts_at: at(45), late_after_min: 15, closed_at: null, created_by: "u1", created_at: at(60), attendance: [{ count: 21 }] },
  { id: "a2", title: "ورشة الذكاء الاصطناعي 3", group_name: "الذكاء الاصطناعي", starts_at: at(60 * 24), late_after_min: 15, closed_at: at(60 * 22), created_by: "u1", created_at: at(60 * 25), attendance: [{ count: 17 }] },
  { id: "a3", title: "سيشن 5: الحساسات", group_name: "الروبوتات — المستوى 1", starts_at: at(60 * 24 * 3), late_after_min: 15, closed_at: at(60 * 24 * 3 - 120), created_by: "u1", created_at: at(60 * 24 * 3), attendance: [{ count: 23 }] },
  { id: "a4", title: "ورشة الذكاء الاصطناعي 2", group_name: "الذكاء الاصطناعي", starts_at: at(60 * 24 * 7), late_after_min: 15, closed_at: at(60 * 24 * 7 - 120), created_by: "u1", created_at: at(60 * 24 * 7), attendance: [{ count: 15 }] },
  { id: "a5", title: "سيشن 4: المحركات", group_name: "الروبوتات — المستوى 1", starts_at: at(60 * 24 * 7 + 30), late_after_min: 15, closed_at: at(60 * 24 * 7 - 90), created_by: "u1", created_at: at(60 * 24 * 7), attendance: [{ count: 22 }] },
];
const leaderboard = students
  .map((s, i) => ({ id: s.id, name: s.name, group: s.group, points: 210 - i * 13 - (i % 3) * 4, attended: 6 - (i % 3), quizzes: 3 - (i % 2), perfect: i % 4 === 0 ? 1 : 0, certs: i < 4 ? 1 : 0, events: i % 2, bonus: i === 1 ? 20 : 0, badges: ["first_step", ...(i < 4 ? ["certified"] : []), ...(i % 4 === 0 ? ["full_marks"] : []), ...(i < 2 ? ["quiz_runner"] : [])] }))
  .sort((a, b) => b.points - a.points);
const days = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10);
  const v = [62, 80, 71, 95, 120, 88, 76, 101, 140, 133, 97, 118, 160, 149][i];
  return { day: d, views: v, visitors: Math.round(v * 0.42) };
});
const STATS = {
  from: days[0].day,
  totals: { views: days.reduce((a, d) => a + d.views, 0), visitors: days.reduce((a, d) => a + d.visitors, 0) },
  daily: days,
  pages: [
    { path: "/ar/", views: 640 },
    { path: "/ar/join/", views: 310 },
    { path: "/ar/events/", views: 205 },
    { path: "/ar/bootcamp/", views: 160 },
  ],
  referrers: [
    { host: "facebook.com", views: 380 },
    { host: "instagram.com", views: 190 },
    { host: "google.com", views: 120 },
  ],
  countries: { EG: 1420, SA: 60, AE: 30 },
  devices: { mobile: 1290, desktop: 220 },
  locales: { ar: 1380, en: 130 },
};

const STUDENT_RPC = { student_home: HOME, student_points: POINTS, student_certificates: CERTS, app_status: { ready: true } };
const STAFF_RPC = { staff_list_students: students, staff_leaderboard: leaderboard, staff_site_stats: STATS, security_pulse: { level: "ok", last_hour: {}, at: at(0) }, app_status: { ready: true }, staff_new_applications: 6 };

/* ─── Shots ────────────────────────────────────────────────────────────── */

const SHOTS = [
  { as: null, hash: "#/login", title: "دخول واحد للكل", sub: "الطالب برقم الكارنيه، والفريق بالإيميل" },
  { as: "student", hash: "#/me", title: "كل حاجة في مكان واحد", sub: "المحتوى والكويزات وحضورك ونقاطك" },
  { as: "student", hash: "#/me/quizzes", title: "كويزات بتتصحح لوحدها", sub: "واعرف درجتك على طول" },
  { as: "student", hash: "#/me/points", title: "اجمع نقاط وأوسمة", sub: "وشوف ترتيبك في مجموعتك" },
  { as: "staff", hash: "#/staff", title: "لوحة فريق التدريب", sub: "كل اللي محتاجه في الجيب" },
  { as: "staff", hash: "#/staff/attendance", title: "الحضور بالباركود", sub: "افتح سيشن وامسح كارنيه الطالب" },
];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "coach@buildxhue.com", role: "authenticated", aal: "aal1", exp: 4102444800 })}.sig`;

function serve(dir) {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".wasm": "application/wasm", ".json": "application/json", ".webmanifest": "application/manifest+json" };
  const server = createServer((req, res) => {
    const file = path.join(dir, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

/** The framed store image: headline on top, the screen below with rounded corners. */
const frame = ({ w, h, png, title, sub, accent }) => `<!doctype html><html dir="rtl"><head><style>
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:radial-gradient(120% 70% at 50% 0%, ${accent} 0%, #0b1f4a 42%, #081634 100%)}
  .t{position:absolute;top:${h * 0.045}px;left:0;right:0;text-align:center;color:#fff;font:800 ${w * 0.066}px/1.25 "Noto Sans Arabic","Noto Kufi Arabic","DejaVu Sans",sans-serif}
  .s{position:absolute;top:${h * 0.045 + w * 0.095}px;left:0;right:0;text-align:center;color:#b9c7e3;font:500 ${w * 0.04}px/1.3 "Noto Sans Arabic","DejaVu Sans",sans-serif}
  img{position:absolute;left:50%;top:${h * 0.2}px;width:${w * 0.8}px;transform:translateX(-50%);border-radius:${w * 0.055}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgb(0 0 0/.55),0 0 0 ${w * 0.008}px rgb(255 255 255/.12)}
</style></head><body><div class="t">${title}</div><div class="s">${sub}</div><img src="data:image/png;base64,${png.toString("base64")}"></body></html>`;

const browser = await chromium.launch();
const www = path.join(root, "mobile", "app", "www");
if (!existsSync(path.join(www, "index.html"))) throw new Error(`${www} is missing: run scripts/build-native.mjs first`);
const server = await serve(www);
const base = `http://localhost:${server.address().port}`;
for (const d of ["raw", "appstore", "play"]) mkdirSync(path.join(store, d), { recursive: true });

for (const [i, s] of SHOTS.entries()) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "ar-EG", timezoneId: "Africa/Cairo" });
  await ctx.addInitScript(
    ([as, token]) => {
      window.CapacitorCustomPlatform = { name: "android", plugins: {} };
      if (as === "student") localStorage.setItem("rh-app-student", JSON.stringify({ token: "demo", name: "يوسف أحمد", code: "2024100", group: "الروبوتات — المستوى 1" }));
      if (as === "staff") localStorage.setItem("rh-app-staff", JSON.stringify({ access_token: token, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: 4102444800, user: { id: "u1", email: "coach@buildxhue.com", aud: "authenticated", role: "authenticated", factors: [] } }));
    },
    [s.as, jwt],
  );
  await ctx.route(/supabase\.co/, async (route) => {
    const url = new URL(route.request().url());
    const fn = url.pathname.split("/rpc/")[1];
    if (fn) return route.fulfill({ json: (s.as === "staff" ? STAFF_RPC : STUDENT_RPC)[fn] ?? null });
    if (url.pathname.endsWith("/auth/v1/user")) return route.fulfill({ json: { id: "u1", email: "coach@buildxhue.com", aud: "authenticated", role: "authenticated", factors: [] } });
    if (url.pathname.endsWith("/factors")) return route.fulfill({ json: [] });
    const table = url.pathname.split("/rest/v1/")[1];
    const head = route.request().method() === "HEAD";
    const counts = { attendance_sessions: 4, materials: 18, quizzes: 7, applications: 6 };
    if (table === "staff") {
      const row = { user_id: "u1", email: "coach@buildxhue.com", full_name: "أحمد سمير", role: "owner", active: true, created_at: at(99999) };
      return route.fulfill({ json: (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row] });
    }
    if (table === "attendance_sessions" && !head) {
      const open = url.searchParams.get("closed_at") === "is.null";
      return route.fulfill({ json: open ? sessions.filter((x) => !x.closed_at) : sessions });
    }
    const n = counts[table] ?? 0;
    // Counts come back in Content-Range, which a cross-origin page can only read when it is exposed.
    return route.fulfill({ json: head ? null : [], headers: { "content-range": n ? `0-${n - 1}/${n}` : "*/0", "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" } });
  });

  const page = await ctx.newPage();
  await page.goto(`${base}/app/index.html${s.hash}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  const name = `${String(i + 1).padStart(2, "0")}-${s.hash.split("/").pop() || "home"}.png`;
  const png = await page.screenshot({ path: path.join(store, "raw", name) });
  for (const [dir, w, h] of [["appstore", 1290, 2796], ["play", 1080, 1920]]) {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.setContent(frame({ w, h, png, title: s.title, sub: s.sub, accent: s.as === "staff" ? "#2f6dff" : "#1d3f8c" }));
    await p.screenshot({ path: path.join(store, dir, name) });
    await p.close();
  }
  console.log(`[shots] ${name}`);
  await ctx.close();
}
server.close();
await browser.close();
