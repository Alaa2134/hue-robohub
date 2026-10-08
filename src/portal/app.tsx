"use client";
/** BuildX App root: who is using the app (staff / student / nobody) and the hash route. */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { APP_PATH, asciiDigits, isNative, errorText, rpc, sb, studentStore, type StaffRow, type StudentSession } from "./core";
import { BrandLine, InstallCard } from "./shell";
import { StaffApp } from "./staff";
import { MfaGate, mfaNeeded, type MfaGateMode } from "./staff-2fa";
import { StudentApp } from "./student";
import { UpdateGate } from "./app-update";
import { enableNativePush, listenForNotificationTaps } from "./native-push";
import { Onboarding, needsOnboarding } from "./onboarding";
import { ForgotForm } from "./access-requests";
import { BiometricGate } from "./biometric";
import { Button, Card, Field, Icon, Input, Overlays, Spinner, go, useRoute } from "./ui";
import { isNoise } from "@/lib/error-noise";

const AppPlugin = registerPlugin<{ addListener(e: "appUrlOpen", cb: (d: { url: string }) => void): Promise<PluginListenerHandle> }>("App");
const STAFF_CACHE = "rh-app-staff-row";

function readStaffCache(): StaffRow | null {
  try {
    return JSON.parse(localStorage.getItem(STAFF_CACHE) ?? "null") as StaffRow | null;
  } catch {
    return null;
  }
}
function writeStaffCache(row: StaffRow | null) {
  try {
    if (row) localStorage.setItem(STAFF_CACHE, JSON.stringify(row));
    else localStorage.removeItem(STAFF_CACHE);
  } catch {
    /* storage may be unavailable */
  }
}

export default function PortalApp() {
  const route = useRoute();
  const [mounted, setMounted] = useState(false);
  const [staff, setStaff] = useState<StaffRow | null | undefined>(undefined);
  const [noAccess, setNoAccess] = useState<string | null>(null);
  const [gate, setGate] = useState<MfaGateMode | null>(null);
  const [student, setStudent] = useState<StudentSession | null>(null);
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOnboarding(needsOnboarding());
    const sync = () => setStudent(studentStore.get());
    sync();
    window.addEventListener("rh-student", sync);
    window.addEventListener("storage", sync);
    // A buildxhue.com/app/#/… link that opened the store app (App Links / Universal Links) goes to that screen.
    let linkHandle: PluginListenerHandle | undefined;
    if (isNative())
      AppPlugin.addListener("appUrlOpen", ({ url }) => {
        const i = url.indexOf("#");
        if (i >= 0) window.location.hash = url.slice(i + 1);
      })
        .then((h) => (linkHandle = h))
        .catch(() => undefined);
    listenForNotificationTaps();
    // The store apps carry their own files, so they skip the offline worker.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator && !isNative()) {
      navigator.serviceWorker.register(`${APP_PATH}sw.js`, { scope: APP_PATH }).catch(() => undefined);
    }
    // Uncaught errors reach the dashboard's error list (production domain and the store apps, five per load).
    let sent = 0;
    const report = (message: string, source?: string) => {
      if (!message || isNoise(message, source) || sent++ >= 5 || !(isNative() || /^(www\.)?buildxhue\.com$/.test(location.hostname))) return;
      rpc("log_client_error", { p: { message: message.slice(0, 500), source: source?.slice(0, 300), path: `${location.pathname}${location.hash.split("?")[0]}` } }).catch(() => undefined);
    };
    const onError = (e: ErrorEvent) => report(e.message, e.filename ? `${e.filename.replace(location.origin, "")}:${e.lineno}:${e.colno}` : undefined);
    const onRejection = (e: PromiseRejectionEvent) => report(e.reason instanceof Error ? e.reason.message : String(e.reason), "unhandledrejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("rh-student", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      linkHandle?.remove();
    };
  }, []);

  const loadStaff = useCallback(async (userId: string | null, email?: string | null) => {
    if (!userId) {
      setStaff(null);
      setNoAccess(null);
      writeStaffCache(null);
      return;
    }
    try {
      const { data, error } = await sb().from("staff").select("*").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (data?.active) {
        setGate(await mfaNeeded().catch(() => null));
        setStaff(data as StaffRow);
        setNoAccess(null);
        writeStaffCache(data as StaffRow);
      } else {
        setStaff(null);
        setNoAccess(email ?? "");
        writeStaffCache(null);
      }
    } catch {
      // Offline: keep working with the last known staff profile (attendance scans queue up).
      const cached = readStaffCache();
      setStaff(cached?.user_id === userId ? cached : null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    sb()
      .auth.getSession()
      .then(({ data }) => {
        if (alive) loadStaff(data.session?.user.id ?? null, data.session?.user.email);
      })
      .catch(() => {
        if (alive) setStaff(readStaffCache());
      });
    const { data } = sb().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setGate(null);
        setStaff(null);
        setNoAccess(null);
        writeStaffCache(null);
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        // Never await Supabase calls inside this callback.
        setTimeout(() => loadStaff(session?.user.id ?? null, session?.user.email), 0);
      }
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [loadStaff]);

  // In the store app, register this phone for notifications for whoever is signed in (if allowed).
  const who = staff ? "staff" : student ? "student" : null;
  useEffect(() => {
    if (who && isNative()) enableNativePush(who, false).catch(() => undefined);
  }, [who]);

  if (!mounted || staff === undefined) return <Splash />;
  if (onboarding && !staff && !student) return <Onboarding onDone={() => setOnboarding(false)} />;

  const [head, ...rest] = route.path;
  // One sign-in for everyone: students land on their dashboard (/me), the team on theirs (/staff).
  let screen: ReactNode;
  if (head === "staff" && staff && gate) screen = <MfaGate mode={gate} email={staff.email} onDone={() => setGate(null)} />;
  else if (head === "staff") screen = staff ? <StaffApp me={staff} path={rest} query={route.query} onProfile={setStaff} /> : <Redirect to="/login" />;
  else if (head === "me") screen = student ? <StudentApp session={student} path={rest} query={route.query} /> : <Redirect to="/login" />;
  else if (head === "setup") screen = staff ? <Redirect to="/staff" /> : <Setup />;
  else if (staff) screen = <Redirect to="/staff" />;
  else if (student) screen = <Redirect to="/me" />;
  // /login, and the old /login/student and /login/staff links.
  else if (head === "login") screen = <Login initialCode={route.query.get("c") ?? ""} noAccess={noAccess} />;
  else screen = <Redirect to="/login" />;

  return (
    <>
      <UpdateGate>
        <BiometricGate active={!!staff}>{screen}</BiometricGate>
      </UpdateGate>
      <Overlays />
    </>
  );
}

function Redirect({ to }: { to: string }) {
  useEffect(() => go(to, true), [to]);
  return <Splash />;
}

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-abyss">
      <BrandLine />
      <Spinner />
    </div>
  );
}

function AuthFrame({ children, back }: { children: ReactNode; back?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-abyss bg-[radial-gradient(100%_55%_at_50%_0%,rgb(43_109_255/0.18),transparent_65%)] px-4 pb-10 pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-md items-center justify-between">
        <BrandLine />
        {back && (
          <a href="#/" className="flex items-center gap-1 text-sm text-mist hover:text-chalk">
            رجوع
            <Icon name="chevron" size={16} className="rotate-180" />
          </a>
        )}
      </div>
      <div className="mx-auto mt-8 w-full max-w-md flex-1">{children}</div>
    </div>
  );
}

function FormError({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-[#ffb3bb]">
      <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
      {text}
    </p>
  );
}

/** Students sign in with their student number and PIN, the team with email and password: one form, told apart by the "@". */
function Login({ initialCode, noAccess }: { initialCode: string; noAccess: string | null }) {
  const [id, setId] = useState(initialCode);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [forgot, setForgot] = useState(false);
  const team = id.includes("@");
  const student = !team && /\S/.test(id);

  useEffect(() => {
    rpc<{ ready: boolean }>("app_status").then(
      (r) => setReady(r.ready),
      () => setReady(null),
    );
  }, []);
  useEffect(() => {
    if (noAccess !== null) setBusy(false);
  }, [noAccess]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    if (team) {
      const { error } = await sb().auth.signInWithPassword({ email: id.trim().toLowerCase(), password: secret });
      if (error) {
        setBusy(false);
        setErr(/invalid login credentials/i.test(error.message) ? "البريد الإلكتروني أو كلمة المرور غير صحيحة." : errorText(error));
      }
      // On success the root loads the staff profile and moves on.
      return;
    }
    try {
      const r = await rpc<{ ok: boolean; error?: string; until?: string; token?: string; student?: { name: string; code: string; group: string } }>("student_login", {
        p_code: id.trim(),
        p_pin: asciiDigits(secret.trim()),
      });
      if (r.ok && r.token && r.student) {
        studentStore.set({ token: r.token, ...r.student });
        go("/me", true);
        return;
      }
      setErr(
        r.error === "no_pin"
          ? "لم يُصدَر لك رمز دخول بعد. اطلبه من المدرّب."
          : r.error === "locked"
            ? `توقف الدخول مؤقتًا بسبب محاولات خاطئة كثيرة. حاول بعد ${r.until ? new Date(r.until).toLocaleTimeString("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit" }) : "قليل"}.`
            : r.error === "rate_limited"
              ? "محاولات دخول كتير من نفس الشبكة. استنى ربع ساعة وجرّب تاني."
              : "رقم الطالب أو رمز الدخول غير صحيح.",
      );
      setSecret("");
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  if (noAccess !== null)
    return (
      <AuthFrame>
        <Card className="grid gap-4 text-center">
          <Icon name="lock" size={30} className="mx-auto text-warn" />
          <p className="text-[15px] leading-relaxed text-mist">
            الحساب <span dir="ltr" className="font-mono text-chalk">{noAccess}</span> ليس عضوًا نشطًا في فريق التدريب. اطلب من المالك إضافتك.
          </p>
          <Button onClick={() => sb().auth.signOut()}>تسجيل الخروج</Button>
        </Card>
      </AuthFrame>
    );

  return (
    <AuthFrame>
      <h1 className="text-2xl font-bold text-chalk">تسجيل الدخول</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-fog">الطلاب: رقم الكارنيه ورمز الدخول اللي أخدته من المدرّب. فريق التدريب: الإيميل وكلمة المرور.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <Field label="رقم الطالب أو البريد الإلكتروني">
          <Input value={id} onChange={(e) => setId(e.target.value)} inputMode={team ? "email" : "text"} autoComplete="username" autoCapitalize="off" spellCheck={false} dir="ltr" className="text-center font-mono text-lg" required />
        </Field>
        <Field label={team ? "كلمة المرور" : student ? "رمز الدخول (PIN)" : "رمز الدخول أو كلمة المرور"}>
          <Input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            inputMode={student ? "numeric" : "text"}
            autoComplete="current-password"
            type="password"
            dir="ltr"
            className="text-center font-mono text-lg"
            required
          />
        </Field>
        <FormError text={err} />
        <Button type="submit" variant="primary" size="lg" loading={busy} block>
          دخول
        </Button>
        {!forgot && (
          <button type="button" onClick={() => setForgot(true)} className="text-center text-sm text-cyan hover:underline">
            نسيت رمز الدخول أو كلمة المرور؟
          </button>
        )}
      </form>
      {forgot && <ForgotForm initial={id} onClose={() => setForgot(false)} />}
      {ready === false && (
        <Card className="mt-6 flex items-center gap-3 border-warn/30 bg-warn/[0.06]">
          <Icon name="key" size={22} className="shrink-0 text-warn" />
          <p className="flex-1 text-sm text-mist">التطبيق لم يُجهَّز بعد. صاحب الحساب يبدأ من هنا مرة واحدة فقط.</p>
          <Button size="sm" onClick={() => go("/setup")}>
            إعداد أول مرة
          </Button>
        </Card>
      )}
      <div className="mt-4">
        <InstallCard />
      </div>
    </AuthFrame>
  );
}

function Setup() {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (form.password.length < 10) return setErr("كلمة المرور يجب ألا تقل عن 10 حروف.");
    if (form.password !== form.confirm) return setErr("كلمتا المرور غير متطابقتين.");
    setBusy(true);
    try {
      const { error } = await sb().functions.invoke("staff-admin", {
        body: { action: "bootstrap", code: form.code, email: form.email.trim().toLowerCase(), password: form.password, name: form.name.trim() },
      });
      if (error) {
        let code = "";
        try {
          code = ((await (error as { context?: Response }).context?.json()) as { error?: string })?.error ?? "";
        } catch {
          /* no JSON body */
        }
        setErr(code === "bad_code" ? "كود الإعداد غير صحيح أو التطبيق مُعَدّ بالفعل." : code === "invalid" ? "راجع البيانات: بريد صحيح وكلمة مرور 10 حروف على الأقل." : errorText(error));
        setBusy(false);
        return;
      }
      const { error: signInError } = await sb().auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password });
      if (signInError) throw signInError;
      go("/staff", true);
    } catch (e2) {
      setErr(errorText(e2));
      setBusy(false);
    }
  };

  return (
    <AuthFrame back>
      <h1 className="text-2xl font-bold text-chalk">إعداد أول مرة</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-fog">أنشئ حساب المالك. كود الإعداد يُستخدم مرة واحدة فقط.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <Field label="اسمك">
          <Input value={form.name} onChange={set("name")} autoComplete="name" required />
        </Field>
        <Field label="البريد الإلكتروني">
          <Input type="email" value={form.email} onChange={set("email")} autoComplete="email" dir="ltr" required />
        </Field>
        <Field label="كلمة المرور" hint="10 حروف على الأقل. احفظها في مكان آمن.">
          <Input type="password" value={form.password} onChange={set("password")} autoComplete="new-password" dir="ltr" minLength={10} required />
        </Field>
        <Field label="تأكيد كلمة المرور">
          <Input type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" dir="ltr" required />
        </Field>
        <Field label="كود الإعداد">
          <Input value={form.code} onChange={set("code")} dir="ltr" autoComplete="off" className="font-mono uppercase tracking-widest" required />
        </Field>
        <FormError text={err} />
        <Button type="submit" variant="primary" size="lg" loading={busy} block>
          إنشاء حساب المالك
        </Button>
      </form>
    </AuthFrame>
  );
}
