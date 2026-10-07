"use client";
/** Student side: home, content library, quizzes (timed, autosaved, graded on the server) and attendance. */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, asciiDigits, errorText, fileUrl, fmt, studentRpc, studentStore, type AttStatus, type StudentSession } from "./core";
import { CERT_KINDS, CertificatePrint, type Certificate } from "./certificate";
import { MyPoints, PointsCard } from "./points";
import { PushCard } from "./push";
import { AppShell, BrandLine, InstallCard, type Tab } from "./shell";
import { kindIcon } from "./staff-content";
import {
  Badge,
  Bar,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Icon,
  IconButton,
  Input,
  List,
  Loading,
  Ring,
  Row,
  STATUS_TONE,
  Section,
  Spinner,
  TopBar,
  confirmDialog,
  go,
  toast,
} from "./ui";

type HomeMaterial = { id: string; title: string; description: string; kind: "file" | "link"; path: string | null; url: string | null; fileName: string | null; mime: string | null; size: number | null; pinned: boolean; at: string };
type HomeQuiz = {
  id: string;
  title: string;
  description: string;
  opensAt: string | null;
  closesAt: string | null;
  timeLimit: number | null;
  maxAttempts: number;
  questions: number;
  maxScore: number;
  used: number;
  best: number | null;
  inProgress: string | null;
  state: "open" | "upcoming" | "closed" | "done";
};
type HomeData = {
  now: string;
  student: { name: string; code: string; group: string };
  materials: HomeMaterial[];
  quizzes: HomeQuiz[];
  attendance: { title: string; at: string; status: AttStatus | "pending" }[];
};

const HOME_CACHE = "rh-app-student-home";

const TABS: Tab[] = [
  { href: "/me", label: "الرئيسية", icon: "home", match: (p) => p.length === 0 },
  { href: "/me/content", label: "المحتوى", icon: "book", match: (p) => p[0] === "content" },
  { href: "/me/quizzes", label: "الكويزات", icon: "quiz", match: (p) => p[0] === "quizzes" },
  { href: "/me/attendance", label: "حضوري", icon: "calendar", match: (p) => p[0] === "attendance" },
];

function useHome() {
  const [data, setData] = useState<HomeData | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(HOME_CACHE) ?? "null") as HomeData | null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await studentRpc<HomeData>("student_home");
      setData(d);
      setError(null);
      try {
        localStorage.setItem(HOME_CACHE, JSON.stringify(d));
      } catch {
        /* cache is optional */
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload };
}

export function StudentApp({ session, path }: { session: StudentSession; path: string[] }) {
  const home = useHome();
  const [section, id] = path;
  if (section === "certificate" && id) return <MyCertificatePrint id={id} />;
  if (section === "quiz" && id) return <TakeQuiz key={id} id={id} info={home.data?.quizzes.find((q) => q.id === id)} onDone={home.reload} />;

  let screen: React.ReactNode;
  if (!home.data) screen = home.error ? <ErrorBox error={home.error} retry={home.reload} /> : <Loading />;
  else if (section === "content") screen = <Materials data={home.data} reload={home.reload} loading={home.loading} />;
  else if (section === "quizzes") screen = <Quizzes data={home.data} reload={home.reload} loading={home.loading} />;
  else if (section === "attendance") screen = <Attendance data={home.data} reload={home.reload} loading={home.loading} />;
  else if (section === "account") screen = <Account session={session} />;
  else if (section === "points") screen = <MyPoints />;
  else screen = <Home data={home.data} reload={home.reload} loading={home.loading} />;

  return (
    <AppShell tabs={TABS} path={path}>
      {home.data && home.error ? (
        <div className="sticky top-0 z-40 -mx-4 flex items-center justify-center gap-2 bg-warn/15 px-4 py-1.5 text-xs text-[#ffd08a] sm:-mx-6">
          <Icon name="wifiOff" size={14} />
          {errorText(home.error)}
        </div>
      ) : null}
      {screen}
    </AppShell>
  );
}

type ScreenProps = { data: HomeData; reload: () => void; loading: boolean };

function attendanceStats(list: HomeData["attendance"]) {
  const c = { present: 0, late: 0, excused: 0, absent: 0 };
  for (const a of list) if (a.status !== "pending") c[a.status]++;
  const total = c.present + c.late + c.excused + c.absent;
  return { ...c, total, rate: total ? ((c.present + c.late + c.excused) / total) * 100 : 100 };
}

function Home({ data, reload, loading }: ScreenProps) {
  const stats = attendanceStats(data.attendance);
  const openQuizzes = data.quizzes.filter((q) => q.state === "open");
  return (
    <>
      <header className="flex items-center justify-between pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        <BrandLine />
        <div className="flex">
          <IconButton icon="refresh" label="تحديث" onClick={reload} className={cn(loading && "animate-spin")} />
          <IconButton icon="user" label="حسابي" onClick={() => go("/me/account")} />
        </div>
      </header>
      <div className="mt-4">
        <p className="text-sm text-fog">أهلاً</p>
        <h1 className="text-2xl font-bold text-chalk">{data.student.name}</h1>
        <p className="mt-1 text-xs text-fog">
          <span dir="ltr" className="font-mono">
            {data.student.code}
          </span>
          {data.student.group ? ` · ${data.student.group}` : ""}
        </p>
      </div>

      <a href="#/me/attendance" className="mt-5 flex items-center gap-4 rounded-3xl border border-[var(--line-2)] bg-panel/70 p-5">
        <Ring value={stats.rate} size={72} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-chalk">نسبة حضورك</p>
          <p className="mt-1 text-xs leading-relaxed text-fog">
            حاضر {stats.present} · متأخر {stats.late} · بعذر {stats.excused} · غائب {stats.absent}
          </p>
        </div>
        <Icon name="chevron" size={18} className="rotate-180 text-fog" />
      </a>
      <PointsCard />
      <PushCard kind="student" />

      <Section title="كويزات متاحة" action={<a href="#/me/quizzes" className="text-sm text-cyan">الكل</a>}>
        {openQuizzes.length ? (
          <div className="grid gap-2">
            {openQuizzes.slice(0, 3).map((q) => (
              <QuizCard key={q.id} q={q} />
            ))}
          </div>
        ) : (
          <Card className="text-sm text-fog">لا توجد كويزات متاحة الآن.</Card>
        )}
      </Section>

      <Section title="أحدث المحتوى" action={<a href="#/me/content" className="text-sm text-cyan">الكل</a>}>
        {data.materials.length ? (
          <List>
            {data.materials.slice(0, 4).map((m) => (
              <MaterialRow key={m.id} m={m} />
            ))}
          </List>
        ) : (
          <Card className="text-sm text-fog">لم يُضَف محتوى بعد.</Card>
        )}
      </Section>
      <MyCertificates />
      <div className="mt-6">
        <InstallCard />
      </div>
    </>
  );
}

let certCache: Certificate[] | null = null;
function useMyCertificates() {
  const [list, setList] = useState<Certificate[] | null>(certCache);
  useEffect(() => {
    let alive = true;
    studentRpc<Certificate[]>("student_certificates")
      .then((r) => {
        certCache = r;
        if (alive) setList(r);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

/** The student's certificates (hidden until they have one). */
function MyCertificates() {
  const list = useMyCertificates();
  if (!list?.length) return null;
  return (
    <Section title="شهاداتي">
      <List>
        {list.map((c) => (
          <a key={c.id} href={`#/me/certificate/${c.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
              <Icon name="award" size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-chalk">{c.title_ar || c.title}</span>
              <span className="block truncate text-xs text-fog">
                {CERT_KINDS.find((k) => k.key === c.kind)?.ar} · {fmt.short(`${c.issued_on}T12:00:00`)}
              </span>
            </span>
            <Icon name="chevron" size={18} className="rotate-180 text-fog" />
          </a>
        ))}
      </List>
    </Section>
  );
}

function MyCertificatePrint({ id }: { id: string }) {
  const list = useMyCertificates();
  if (!list) return <Loading />;
  const c = list.find((x) => x.id === id);
  if (!c) return <ErrorBox error="الشهادة مش موجودة" />;
  return <CertificatePrint certs={[c]} onBack={() => go("/me")} />;
}

function MaterialRow({ m }: { m: HomeMaterial }) {
  const href = m.kind === "link" ? m.url! : fileUrl(m.path!);
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-volt/15 text-[#8fb5ff]">
        <Icon name={kindIcon(m)} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-chalk">{m.title}</span>
        <span className="block truncate text-xs text-fog">
          {m.kind === "link" ? "رابط" : <bdi dir="ltr">{fmt.size(m.size)}</bdi>} · {fmt.short(m.at)}
          {m.description ? ` · ${m.description}` : ""}
        </span>
      </span>
      {m.pinned && <Icon name="pin" size={16} className="text-cyan" />}
      {m.kind === "file" && m.path && (
        <span
          role="link"
          tabIndex={0}
          aria-label="تنزيل"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(fileUrl(m.path!, m.fileName ?? undefined), "_blank", "noopener");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") window.open(fileUrl(m.path!, m.fileName ?? undefined), "_blank", "noopener");
          }}
          className="flex size-10 items-center justify-center rounded-xl text-mist hover:bg-white/[0.07]"
        >
          <Icon name="download" size={19} />
        </span>
      )}
    </a>
  );
}

function Materials({ data, reload, loading }: ScreenProps) {
  const [q, setQ] = useState("");
  const shown = data.materials.filter((m) => !q.trim() || m.title.includes(q.trim()) || m.description.includes(q.trim()));
  return (
    <>
      <TopBar title="المحتوى" sub={`${data.materials.length} ملف ورابط`} actions={<IconButton icon="refresh" label="تحديث" onClick={reload} className={cn(loading && "animate-spin")} />} />
      {data.materials.length > 6 && <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث…" className="mb-3" />}
      {shown.length ? (
        <List>
          {shown.map((m) => (
            <MaterialRow key={m.id} m={m} />
          ))}
        </List>
      ) : (
        <Empty icon="book" title={data.materials.length ? "لا نتائج" : "لا يوجد محتوى بعد"} body={data.materials.length ? undefined : "المحاضرات والملفات اللي يرفعها المدرّب هتظهر هنا."} />
      )}
    </>
  );
}

const QUIZ_STATE: Record<HomeQuiz["state"], { label: string; tone: "ok" | "info" | "muted" | "warn" }> = {
  open: { label: "متاح", tone: "ok" },
  upcoming: { label: "قريبًا", tone: "info" },
  closed: { label: "انتهى", tone: "muted" },
  done: { label: "تم الحل", tone: "muted" },
};

function QuizCard({ q }: { q: HomeQuiz }) {
  const st = QUIZ_STATE[q.state];
  return (
    <a href={`#/me/quiz/${q.id}`} className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-panel/70 p-4 transition hover:border-cyan/40">
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", q.state === "open" ? "bg-ok/15 text-ok" : "bg-white/[0.05] text-fog")}>
        <Icon name="quiz" size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-chalk">{q.title}</p>
        <p className="truncate text-xs text-fog">
          {q.questions} سؤال
          {q.timeLimit ? ` · ${q.timeLimit} دقيقة` : ""}
          {q.state === "upcoming" && q.opensAt ? ` · يفتح ${fmt.dateTime(q.opensAt)}` : q.closesAt && q.state === "open" ? ` · حتى ${fmt.dateTime(q.closesAt)}` : ""}
        </p>
      </div>
      {q.best != null ? (
        <span className="font-mono text-sm font-semibold text-chalk" dir="ltr">
          {fmt.num(q.best)}/{fmt.num(q.maxScore)}
        </span>
      ) : q.inProgress ? (
        <Badge tone="warn">لم يُسلَّم</Badge>
      ) : (
        <Badge tone={st.tone}>{st.label}</Badge>
      )}
    </a>
  );
}

function Quizzes({ data, reload, loading }: ScreenProps) {
  return (
    <>
      <TopBar title="الكويزات" actions={<IconButton icon="refresh" label="تحديث" onClick={reload} className={cn(loading && "animate-spin")} />} />
      {data.quizzes.length ? (
        <div className="grid gap-2">
          {data.quizzes.map((q) => (
            <QuizCard key={q.id} q={q} />
          ))}
        </div>
      ) : (
        <Empty icon="quiz" title="لا توجد كويزات بعد" />
      )}
    </>
  );
}

function Attendance({ data, reload, loading }: ScreenProps) {
  const stats = attendanceStats(data.attendance);
  return (
    <>
      <TopBar title="حضوري" actions={<IconButton icon="refresh" label="تحديث" onClick={reload} className={cn(loading && "animate-spin")} />} />
      <Card className="flex items-center gap-5">
        <Ring value={stats.rate} size={84} stroke={8} />
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span className="text-fog">حاضر</span>
          <span className="font-mono text-ok">{stats.present}</span>
          <span className="text-fog">متأخر</span>
          <span className="font-mono text-warn">{stats.late}</span>
          <span className="text-fog">بعذر</span>
          <span className="font-mono text-cyan">{stats.excused}</span>
          <span className="text-fog">غائب</span>
          <span className="font-mono text-[#ff8794]">{stats.absent}</span>
        </div>
      </Card>
      <Section title="الجلسات">
        {data.attendance.length ? (
          <List>
            {data.attendance.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] text-chalk">{a.title}</p>
                  <p className="text-xs text-fog">{fmt.dateTime(a.at)}</p>
                </div>
                <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
              </div>
            ))}
          </List>
        ) : (
          <Empty icon="calendar" title="لا توجد جلسات بعد" />
        )}
      </Section>
    </>
  );
}

function Account({ session }: { session: StudentSession }) {
  const [form, setForm] = useState({ old: "", a: "", b: "" });
  const [busy, setBusy] = useState(false);
  const change = async (e: FormEvent) => {
    e.preventDefault();
    const next = asciiDigits(form.a);
    if (!/^\d{6}$/.test(next)) return toast("الرمز الجديد لازم يكون 6 أرقام.", "error");
    if (next !== asciiDigits(form.b)) return toast("الرمزان غير متطابقين.", "error");
    setBusy(true);
    try {
      const r = await studentRpc<{ ok: boolean; error?: string }>("student_change_pin", { p_old: asciiDigits(form.old), p_new: next });
      if (r.ok) {
        setForm({ old: "", a: "", b: "" });
        toast("تم تغيير رمز الدخول");
      } else toast(r.error === "weak" ? "اختر رمزًا أصعب (ليس 123456 أو أرقامًا مكررة)." : r.error === "rate_limited" ? "محاولات كتير. استنى ربع ساعة وجرّب تاني." : "الرمز الحالي غير صحيح.", "error");
    } catch (e2) {
      toast.error(e2);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    if (!(await confirmDialog({ title: "تسجيل الخروج؟", ok: "خروج" }))) return;
    studentRpc("student_logout").catch(() => undefined);
    try {
      localStorage.removeItem(HOME_CACHE);
    } catch {
      /* ignore */
    }
    studentStore.set(null);
  };
  const pinInput = (k: "old" | "a" | "b", label: string) => (
    <Field label={label}>
      <Input
        type="password"
        inputMode="numeric"
        pattern="[0-9٠-٩]*"
        maxLength={12}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value.replace(/[^\d٠-٩]/g, "") })}
        dir="ltr"
        className="text-center font-mono text-xl tracking-[0.4em]"
        autoComplete={k === "old" ? "current-password" : "new-password"}
      />
    </Field>
  );
  return (
    <>
      <TopBar title="حسابي" back="/me" />
      <Card className="grid gap-1">
        <p className="text-lg font-bold text-chalk">{session.name}</p>
        <p className="text-sm text-fog">
          <span dir="ltr" className="font-mono">
            {session.code}
          </span>
          {session.group ? ` · ${session.group}` : ""}
        </p>
      </Card>
      <Card className="mt-4">
        <form onSubmit={change} className="grid gap-3">
          <p className="font-semibold text-chalk">تغيير رمز الدخول</p>
          {pinInput("old", "الرمز الحالي")}
          {pinInput("a", "الرمز الجديد (6 أرقام)")}
          {pinInput("b", "تأكيد الرمز الجديد")}
          <Button type="submit" icon="key" loading={busy}>
            تغيير الرمز
          </Button>
        </form>
      </Card>
      <Button variant="danger" icon="logout" className="mt-6" block onClick={logout}>
        تسجيل الخروج
      </Button>
    </>
  );
}

/* ─── Taking a quiz ────────────────────────────────────────────────────── */

type QQ = { id: string; kind: "single" | "multi" | "truefalse" | "short"; prompt: string; image: string | null; points: number; options: { id: string; text: string }[] };
type StartResult = {
  ok: boolean;
  error?: string;
  attempt?: string;
  deadline?: string | null;
  now?: string;
  answers?: Record<string, string | string[]>;
  quiz?: { id: string; title: string; description: string };
  questions?: QQ[];
};
type ReviewItem = QQ & { correct: string[]; explanation: string; given: string | string[] | null; ok: boolean };
type Result = { ok: boolean; error?: string; score: number; max: number; late: boolean; attemptsLeft: number; quiz: { id: string; title: string }; review: ReviewItem[] | null };

const START_ERRORS: Record<string, string> = {
  not_found: "الكويز غير متاح.",
  not_open: "الكويز لم يبدأ بعد.",
  closed: "انتهى وقت الكويز.",
  empty: "الكويز لا يحتوي على أسئلة بعد.",
};

function TakeQuiz({ id, info, onDone }: { id: string; info?: HomeQuiz; onDone: () => void }) {
  const [phase, setPhase] = useState<"intro" | "loading" | "taking" | "result" | "error">(info && (info.state === "done" || info.state === "closed") && info.used > 0 ? "loading" : info?.inProgress ? "loading" : "intro");
  const [attempt, setAttempt] = useState<StartResult | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const showReview = useCallback(async () => {
    try {
      const r = await studentRpc<Result>("student_quiz_review", { p_quiz: id });
      if (r.ok) {
        setResult(r);
        setPhase("result");
      } else {
        setMessage("لا توجد نتيجة بعد.");
        setPhase("error");
      }
    } catch (e) {
      setMessage(errorText(e));
      setPhase("error");
    }
  }, [id]);

  const used = info?.used ?? 0;
  const start = useCallback(async () => {
    setPhase("loading");
    try {
      const r = await studentRpc<StartResult>("student_quiz_start", { p_quiz: id });
      if (r.ok) {
        setAttempt(r);
        setPhase("taking");
      } else if (r.error === "no_attempts" || (r.error === "closed" && used)) {
        await showReview();
      } else {
        setMessage(START_ERRORS[r.error ?? ""] ?? "تعذّر فتح الكويز.");
        setPhase("error");
      }
    } catch (e) {
      setMessage(errorText(e));
      setPhase("error");
    }
  }, [id, used, showReview]);

  useEffect(() => {
    if (phase !== "loading" || attempt || result) return;
    if (info && (info.state === "done" || info.state === "closed") && info.used > 0) showReview();
    else start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const frame = (body: React.ReactNode) => (
    <div className="min-h-dvh bg-abyss px-4 pb-10 sm:px-6">
      <div className="mx-auto max-w-2xl">{body}</div>
    </div>
  );

  if (phase === "intro")
    return frame(
      <>
        <TopBar title={info?.title ?? "كويز"} back="/me/quizzes" />
        <Card className="grid gap-3">
          {info?.description && <p className="whitespace-pre-line text-[15px] leading-relaxed text-mist">{info.description}</p>}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/[0.04] p-3">
              <p className="font-mono text-xl font-bold text-chalk">{info?.questions ?? "—"}</p>
              <p className="text-xs text-fog">سؤال</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3">
              <p className="font-mono text-xl font-bold text-chalk">{info?.timeLimit ?? "∞"}</p>
              <p className="text-xs text-fog">دقيقة</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] p-3">
              <p className="font-mono text-xl font-bold text-chalk">{info ? info.maxAttempts - info.used : "—"}</p>
              <p className="text-xs text-fog">محاولة متبقية</p>
            </div>
          </div>
          {info?.timeLimit ? <p className="text-sm text-[#ffd08a]">الوقت يبدأ أول ما تضغط «ابدأ»، والإجابات بتتسلّم تلقائيًا لما الوقت يخلص.</p> : null}
          <Button variant="primary" size="lg" icon="play" onClick={start} block>
            ابدأ الكويز
          </Button>
          {info && info.used > 0 && (
            <Button variant="ghost" onClick={showReview} block>
              نتيجتي السابقة
            </Button>
          )}
        </Card>
      </>,
    );
  if (phase === "loading") return frame(<Loading label="جارٍ فتح الكويز…" />);
  if (phase === "error")
    return frame(
      <>
        <TopBar title={info?.title ?? "كويز"} back="/me/quizzes" />
        <Empty icon="info" title={message ?? "تعذّر فتح الكويز."} action={<Button onClick={() => go("/me/quizzes")}>رجوع</Button>} />
      </>,
    );
  if (phase === "result" && result)
    return frame(
      <ResultView
        r={result}
        onAgain={
          result.attemptsLeft > 0 && info?.state !== "closed"
            ? () => {
                setResult(null);
                setAttempt(null);
                start();
              }
            : undefined
        }
      />,
    );
  if (phase === "taking" && attempt)
    return frame(
      <Runner
        start={attempt}
        onSubmitted={(r) => {
          setResult(r);
          setPhase("result");
          onDone();
        }}
      />,
    );
  return null;
}

function Runner({ start, onSubmitted }: { start: StartResult; onSubmitted: (r: Result) => void }) {
  const questions = start.questions ?? [];
  const storeKey = `rh-quiz-${start.attempt}`;
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(() => {
    let local: Record<string, string | string[]> = {};
    try {
      local = JSON.parse(localStorage.getItem(storeKey) ?? "{}");
    } catch {
      /* none saved */
    }
    return { ...(start.answers ?? {}), ...local };
  });
  const [i, setI] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const offset = useMemo(() => (start.now ? new Date(start.now).getTime() - Date.now() : 0), [start.now]);
  const [left, setLeft] = useState<number | null>(null);
  const dirty = useRef(false);
  const submitted = useRef(false);

  const answered = (qid: string) => {
    const v = answers[qid];
    return Array.isArray(v) ? v.length > 0 : !!v?.trim();
  };

  const submit = useCallback(
    async (auto = false) => {
      if (submitted.current) return;
      if (!auto) {
        const missing = questions.filter((q) => !answered(q.id)).length;
        if (!(await confirmDialog({ title: "تسليم الإجابات؟", body: missing ? `في ${missing} سؤال بدون إجابة.` : "مش هتقدر تعدّل بعد التسليم.", ok: "تسليم" }))) return;
      }
      submitted.current = true;
      setSubmitting(true);
      for (let tryNo = 0; tryNo < 4; tryNo++) {
        try {
          const r = await studentRpc<Result>("student_quiz_submit", { p_attempt: start.attempt, p_answers: answers });
          try {
            localStorage.removeItem(storeKey);
          } catch {
            /* ignore */
          }
          onSubmitted(r);
          return;
        } catch (e) {
          if (tryNo === 3) {
            submitted.current = false;
            setSubmitting(false);
            toast.error(e);
            return;
          }
          await new Promise((res) => setTimeout(res, 1500 * (tryNo + 1)));
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [answers, questions, start.attempt, onSubmitted, storeKey],
  );

  // Countdown against the server clock; auto-submit at zero.
  useEffect(() => {
    if (!start.deadline) return;
    const end = new Date(start.deadline).getTime();
    const tick = () => {
      const ms = end - (Date.now() + offset);
      setLeft(Math.max(0, ms));
      if (ms <= 0) submit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [start.deadline, offset, submit]);

  // Keep answers on the device at once and on the server every few seconds.
  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(answers));
    } catch {
      /* ignore */
    }
    if (!dirty.current) return;
    const t = setTimeout(() => {
      studentRpc("student_quiz_save", { p_attempt: start.attempt, p_answers: answers }).catch(() => undefined);
      dirty.current = false;
    }, 3000);
    return () => clearTimeout(t);
  }, [answers, storeKey, start.attempt]);

  const setAnswer = (qid: string, v: string | string[]) => {
    dirty.current = true;
    setAnswers((a) => ({ ...a, [qid]: v }));
  };

  const q = questions[i];
  if (!q) return null;
  const val = answers[q.id];
  const mm = left != null ? Math.floor(left / 60000) : 0;
  const ss = left != null ? Math.floor((left % 60000) / 1000) : 0;

  return (
    <>
      <header className="sticky top-0 z-30 -mx-4 mb-4 border-b border-[var(--line)] bg-abyss/90 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate font-semibold text-chalk">{start.quiz?.title}</p>
          {left != null && (
            <span className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-sm font-semibold", left < 60_000 ? "animate-pulse bg-danger/20 text-[#ff9aa5]" : "bg-white/[0.06] text-chalk")}>
              <Icon name="timer" size={16} />
              {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
            </span>
          )}
        </div>
        <div className="mt-3">
          <Bar value={((i + 1) / questions.length) * 100} />
        </div>
      </header>

      <p className="text-xs font-semibold text-fog">
        سؤال {i + 1} من {questions.length} · {fmt.num(q.points)} درجة
      </p>
      <h2 className="mt-2 whitespace-pre-line text-xl font-bold leading-relaxed text-chalk">{q.prompt}</h2>
      {q.image && <img src={fileUrl(q.image)} alt="" className="mt-3 max-h-72 w-full rounded-2xl border border-[var(--line)] bg-white object-contain" />}

      <div className="mt-5 grid gap-2.5">
        {(q.kind === "single" || q.kind === "multi") &&
          q.options.map((o) => {
            const list = Array.isArray(val) ? val : [];
            const on = list.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setAnswer(q.id, q.kind === "single" ? [o.id] : on ? list.filter((x) => x !== o.id) : [...list, o.id])}
                aria-pressed={on}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-start text-[16px] transition",
                  on ? "border-cyan bg-cyan/10 text-chalk" : "border-[var(--line-2)] bg-panel/60 text-mist hover:border-cyan/40",
                )}
              >
                <span className={cn("flex size-6 shrink-0 items-center justify-center border-2", q.kind === "single" ? "rounded-full" : "rounded-md", on ? "border-cyan bg-cyan text-abyss" : "border-fog")}>
                  {on && <Icon name="check" size={14} />}
                </span>
                {o.text}
              </button>
            );
          })}
        {q.kind === "truefalse" && (
          <div className="grid grid-cols-2 gap-3">
            {[
              ["t", "صح", "check"],
              ["f", "خطأ", "close"],
            ].map(([v, l, ic]) => {
              const on = Array.isArray(val) && val[0] === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAnswer(q.id, [v!])}
                  aria-pressed={on}
                  className={cn("flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 text-lg font-bold transition", on ? "border-cyan bg-cyan/10 text-chalk" : "border-[var(--line-2)] bg-panel/60 text-mist")}
                >
                  <Icon name={ic as "check"} size={26} />
                  {l}
                </button>
              );
            })}
          </div>
        )}
        {q.kind === "short" && <Input value={typeof val === "string" ? val : ""} onChange={(e) => setAnswer(q.id, e.target.value)} placeholder="اكتب إجابتك" maxLength={500} dir="auto" className="h-14 text-lg" />}
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-1.5" aria-label="الأسئلة">
        {questions.map((x, n) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setI(n)}
            aria-label={`سؤال ${n + 1}`}
            className={cn("size-9 rounded-lg font-mono text-sm transition", n === i ? "bg-cyan text-abyss" : answered(x.id) ? "bg-volt/30 text-chalk" : "bg-white/[0.06] text-fog")}
          >
            {n + 1}
          </button>
        ))}
      </div>

      <div className="sticky bottom-0 -mx-4 mt-6 flex gap-2 border-t border-[var(--line)] bg-abyss/90 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border">
        <Button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} icon="chevron">
          السابق
        </Button>
        {i < questions.length - 1 ? (
          <Button variant="primary" onClick={() => setI(i + 1)} className="flex-1">
            التالي
          </Button>
        ) : (
          <Button variant="ok" icon="check" loading={submitting} onClick={() => submit(false)} className="flex-1">
            تسليم
          </Button>
        )}
      </div>
      {submitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/80 backdrop-blur">
          <Spinner size={32} />
        </div>
      )}
    </>
  );
}

function ResultView({ r, onAgain }: { r: Result; onAgain?: () => void }) {
  const pct = r.max ? (Number(r.score) / Number(r.max)) * 100 : 0;
  const label = (q: ReviewItem, v: string) => (q.kind === "truefalse" ? (v === "t" ? "صح" : "خطأ") : (q.options.find((o) => o.id === v)?.text ?? v));
  return (
    <>
      <TopBar title={r.quiz.title} back="/me/quizzes" />
      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <Ring value={pct} size={120} stroke={10} label={<span className="text-2xl">{Math.round(pct)}%</span>} />
        <p className="font-mono text-2xl font-bold text-chalk" dir="ltr">
          {fmt.num(r.score)} / {fmt.num(r.max)}
        </p>
        <p className="text-[15px] text-mist">{pct >= 85 ? "ممتاز! 🎉" : pct >= 65 ? "شغل حلو 👏" : pct >= 50 ? "كويس، راجع الأخطاء" : "راجع المحتوى وحاول تاني"}</p>
        {r.late && <Badge tone="warn">سُلِّم بعد انتهاء الوقت</Badge>}
        <div className="flex flex-wrap justify-center gap-2">
          {onAgain && (
            <Button variant="primary" icon="refresh" onClick={onAgain}>
              محاولة أخرى ({r.attemptsLeft})
            </Button>
          )}
          <Button onClick={() => go("/me/quizzes")}>رجوع للكويزات</Button>
        </div>
      </Card>
      {r.review ? (
        <Section title="مراجعة الإجابات">
          <div className="grid gap-3">
            {r.review.map((q, n) => {
              const given = q.given == null ? [] : Array.isArray(q.given) ? q.given : [q.given];
              return (
                <Card key={q.id} className={cn("grid gap-2", q.ok ? "border-ok/30" : "border-danger/30")}>
                  <div className="flex items-start gap-2">
                    <Icon name={q.ok ? "checkCircle" : "xCircle"} size={20} className={cn("mt-0.5 shrink-0", q.ok ? "text-ok" : "text-[#ff8794]")} />
                    <p className="flex-1 whitespace-pre-line text-[15px] font-medium text-chalk">
                      {n + 1}. {q.prompt}
                    </p>
                  </div>
                  {q.image && <img src={fileUrl(q.image)} alt="" className="max-h-48 rounded-xl bg-white object-contain" />}
                  <p className="text-sm text-fog">إجابتك: {given.length ? given.map((v) => (q.kind === "short" ? v : label(q, v))).join("، ") : "—"}</p>
                  {!q.ok && <p className="text-sm text-ok">الصحيح: {q.correct.map((v) => (q.kind === "short" ? v : label(q, v))).join(q.kind === "short" ? " / " : "، ")}</p>}
                  {q.explanation && <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm leading-relaxed text-mist">{q.explanation}</p>}
                </Card>
              );
            })}
          </div>
        </Section>
      ) : (
        <p className="mt-4 text-center text-xs text-fog">الإجابات الصحيحة بتظهر بعد آخر محاولة ليك أو بعد قفل الكويز.</p>
      )}
    </>
  );
}
