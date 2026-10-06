"use client";
/** BuildX App root: who is using the app (staff / student / nobody) and the hash route. */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { APP_PATH, BASE_PATH, asciiDigits, errorText, rpc, sb, studentStore, type StaffRow, type StudentSession } from "./core";
import { BrandLine, InstallCard } from "./shell";
import { StaffApp } from "./staff";
import { StudentApp } from "./student";
import { Button, Card, Field, Icon, Input, Overlays, Spinner, go, useRoute, type IconKey } from "./ui";

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
  const [student, setStudent] = useState<StudentSession | null>(null);

  useEffect(() => {
    setMounted(true);
    const sync = () => setStudent(studentStore.get());
    sync();
    window.addEventListener("rh-student", sync);
    window.addEventListener("storage", sync);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${APP_PATH}sw.js`, { scope: APP_PATH }).catch(() => undefined);
    }
    return () => {
      window.removeEventListener("rh-student", sync);
      window.removeEventListener("storage", sync);
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

  if (!mounted || staff === undefined) return <Splash />;

  const [head, ...rest] = route.path;
  let screen: ReactNode;
  if (head === "staff") screen = staff ? <StaffApp me={staff} path={rest} query={route.query} onProfile={setStaff} /> : <Redirect to="/login/staff" />;
  else if (head === "me") screen = student ? <StudentApp session={student} path={rest} /> : <Redirect to="/login/student" />;
  else if (head === "login" && rest[0] === "staff") screen = staff ? <Redirect to="/staff" /> : <StaffLogin noAccess={noAccess} />;
  else if (head === "login") screen = student ? <Redirect to="/me" /> : <StudentLogin initialCode={route.query.get("c") ?? ""} />;
  else if (head === "setup") screen = staff ? <Redirect to="/staff" /> : <Setup />;
  else screen = staff ? <Redirect to="/staff" /> : student ? <Redirect to="/me" /> : <Landing />;

  return (
    <>
      {screen}
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

function RoleCard({ href, icon, title, body, accent }: { href: string; icon: IconKey; title: string; body: string; accent?: boolean }) {
  return (
    <a
      href={`#${href}`}
      className={
        accent
          ? "group flex items-center gap-4 rounded-3xl border border-volt/40 bg-gradient-to-l from-volt/25 to-volt/5 p-5 transition hover:border-cyan/50"
          : "group flex items-center gap-4 rounded-3xl border border-[var(--line-2)] bg-panel/70 p-5 transition hover:border-cyan/40"
      }
    >
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-cyan">
        <Icon name={icon} size={28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold text-chalk">{title}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-fog">{body}</span>
      </span>
      <Icon name="chevron" size={18} className="rotate-180 text-fog transition group-hover:-translate-x-1" />
    </a>
  );
}

function Landing() {
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    rpc<{ ready: boolean }>("app_status").then(
      (r) => setReady(r.ready),
      () => setReady(null),
    );
  }, []);
  return (
    <AuthFrame>
      <h1 className="text-[28px] font-bold leading-tight text-chalk">أهلاً بك في تطبيق BuildX HUE</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-mist">المحتوى والكويزات وتسجيل الحضور بالباركود، في مكان واحد.</p>
      <div className="mt-8 grid gap-3">
        <RoleCard href="/login/student" icon="book" title="أنا طالب" body="المحتوى والملفات، الكويزات، وسجل حضورك." accent />
        <RoleCard href="/login/staff" icon="users" title="فريق التدريب" body="تسجيل الحضور بالباركود، الطلاب، رفع المحتوى والكويزات." />
      </div>
      {ready === false && (
        <Card className="mt-4 flex items-center gap-3 border-warn/30 bg-warn/[0.06]">
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
      <a href={`${BASE_PATH}/ar/`} className="mt-10 flex items-center justify-center gap-2 text-sm text-fog hover:text-mist">
        <Icon name="globe" size={16} />
        موقع BuildX HUE
      </a>
    </AuthFrame>
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

function StudentLogin({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await rpc<{ ok: boolean; error?: string; until?: string; token?: string; student?: { name: string; code: string; group: string } }>("student_login", {
        p_code: code,
        p_pin: asciiDigits(pin.trim()),
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
            : "رقم الطالب أو رمز الدخول غير صحيح.",
      );
      setPin("");
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame back>
      <h1 className="text-2xl font-bold text-chalk">دخول الطلاب</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-fog">اكتب رقمك الجامعي (رقم الكارنيه) ورمز الدخول المكوّن من 6 أرقام اللي أخدته من المدرّب.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <Field label="رقم الطالب">
          <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="text" autoComplete="username" dir="ltr" className="text-center font-mono text-lg tracking-wider" required />
        </Field>
        <Field label="رمز الدخول (PIN)">
          <Input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^\d٠-٩]/g, "").slice(0, 12))}
            inputMode="numeric"
            pattern="[0-9٠-٩]*"
            autoComplete="current-password"
            type="password"
            dir="ltr"
            className="text-center font-mono text-2xl tracking-[0.5em]"
            required
          />
        </Field>
        <FormError text={err} />
        <Button type="submit" variant="primary" size="lg" loading={busy} block>
          دخول
        </Button>
      </form>
    </AuthFrame>
  );
}

function StaffLogin({ noAccess }: { noAccess: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (noAccess !== null) setBusy(false);
  }, [noAccess]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await sb().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      setBusy(false);
      setErr(/invalid login credentials/i.test(error.message) ? "البريد الإلكتروني أو كلمة المرور غير صحيحة." : errorText(error));
    }
    // On success the root loads the staff profile and moves on.
  };

  if (noAccess !== null)
    return (
      <AuthFrame back>
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
    <AuthFrame back>
      <h1 className="text-2xl font-bold text-chalk">دخول فريق التدريب</h1>
      <p className="mt-1.5 text-sm text-fog">بالبريد الإلكتروني وكلمة المرور اللي أنشأها لك المالك.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <Field label="البريد الإلكتروني">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" dir="ltr" required />
        </Field>
        <Field label="كلمة المرور">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" dir="ltr" required />
        </Field>
        <FormError text={err} />
        <Button type="submit" variant="primary" size="lg" loading={busy} block>
          دخول
        </Button>
        <p className="text-center text-xs leading-relaxed text-fog">نسيت كلمة المرور؟ المالك أو المشرف يقدر يعمل لك كلمة مرور جديدة من شاشة «الفريق».</p>
      </form>
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
