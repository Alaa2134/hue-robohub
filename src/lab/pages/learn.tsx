"use client";
/**
 * The Academy: courses the team builds from what already exists (lectures, quizzes, sessions, Lab
 * challenges, short readings), each lesson marked done from the real record; and the challenges,
 * checked by running the learner's own program in the simulator.
 */
import { useEffect, useState } from "react";
import { APP_PATH, fileUrl } from "@/portal/core";
import { academy, meStore, type Board, type Course, type CourseCard, type Lesson } from "../api";
import { createAndOpen } from "../circuit/editor";
import { CircuitThumb } from "../circuit/render";
import { CHALLENGES, challengeBySlug, starterDoc } from "../academy/challenges";
import { CHALLENGE_POINTS } from "../academy/points";
import { TRACKS } from "../robot/tracks";
import { fmtNum, useLang } from "../i18n";
import { BASE, href, navigate } from "../router";
import { Badge, Button, Card, Empty, Icon, Spinner, cn, toast, type IconName } from "../ui";

const KIND: Record<Lesson["kind"], { icon: IconName; en: string; ar: string }> = {
  read: { icon: "file", en: "Reading", ar: "قراءة" },
  material: { icon: "download", en: "Lecture", ar: "محاضرة" },
  quiz: { icon: "check", en: "Quiz", ar: "كويز" },
  session: { icon: "users", en: "Session", ar: "سيشن" },
  lab: { icon: "circuit", en: "Lab challenge", ar: "تحدي في اللاب" },
};
const LEVEL = (n: number) => "●".repeat(n);

/* ─── Courses ──────────────────────────────────────────────────────────── */

export function Academy() {
  const { l } = useLang();
  const me = meStore.use();
  const [list, setList] = useState<CourseCard[] | null>(null);
  useEffect(() => {
    let live = true;
    academy.catalog().then(
      (r) => live && setList(r),
      () => live && setList([]),
    );
    return () => {
      live = false;
    };
  }, [me]);
  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className="font-display text-2xl font-bold">{l({ en: "Academy", ar: "الأكاديمية" })}</h1>
        <p className="max-w-2xl text-sm text-fog">
          {l({
            en: "Courses from the team: lectures, quizzes, sessions and Lab challenges in order. Each lesson counts as done from what you actually did.",
            ar: "كورسات من الفريق: محاضرات وكويزات وسيشنات وتحديات في اللاب بالترتيب. كل درس بيتحسب خلص من اللي عملته فعلًا.",
          })}
        </p>
        {!me && <p className="text-sm text-warn">{l({ en: "Sign in with your student code to track your progress.", ar: "سجّل دخول بكود الطالب عشان تقدمك يتحسب." })}</p>}
      </header>
      {list === null ? (
        <Spinner />
      ) : list.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <a
              key={c.id}
              href={href(`learn/${c.slug}`)}
              onClick={(e) => (e.preventDefault(), navigate(`learn/${c.slug}`))}
              data-testid={`course-${c.slug}`}
              className="grid gap-3 rounded-2xl border border-[var(--line)] bg-deep/80 p-5 transition hover:border-volt/60"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{l({ en: c.title_en || c.title, ar: c.title })}</p>
                <Badge tone={c.level === 1 ? "ok" : c.level === 2 ? "volt" : "warn"}>{LEVEL(c.level)}</Badge>
              </div>
              {(c.summary || c.summary_en) && <p className="line-clamp-3 text-sm text-fog">{l({ en: c.summary_en || c.summary, ar: c.summary })}</p>}
              <div className="flex flex-wrap gap-1.5 text-xs text-mist">
                {(Object.keys(c.kinds) as Lesson["kind"][]).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-md bg-panel px-2 py-0.5">
                    <Icon name={KIND[k].icon} size={13} /> {fmtNum(c.kinds[k] ?? 0)} {l(KIND[k])}
                  </span>
                ))}
                {c.hours ? <span className="rounded-md bg-panel px-2 py-0.5">{l({ en: `${c.hours} h`, ar: `${c.hours} ساعة` })}</span> : null}
              </div>
              {c.percent !== null && c.mine && <Progress value={c.percent} />}
              {c.group && !c.mine && <p className="text-xs text-fog">{l({ en: `For ${c.group}`, ar: `لمجموعة ${c.group}` })}</p>}
            </a>
          ))}
        </div>
      ) : (
        <Empty icon="learn" title={l({ en: "No courses yet", ar: "لسه مفيش كورسات" })}>
          {l({ en: "The team publishes courses from the BuildX App. Meanwhile, try the challenges.", ar: "الفريق بينشر الكورسات من تطبيق BuildX. لحد ما ده يحصل، جرّب التحديات." })}
        </Empty>
      )}
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{l({ en: "Challenges", ar: "التحديات" })}</h2>
          <Button size="sm" variant="ghost" icon="trophy" onClick={() => navigate("challenges")}>
            {l({ en: "All challenges", ar: "كل التحديات" })}
          </Button>
        </div>
        <ChallengeGrid limit={3} />
      </section>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn("h-full rounded-full", value >= 100 ? "bg-ok" : "bg-volt")} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="font-mono text-xs text-mist">{value}%</span>
    </div>
  );
}

export function CoursePage({ slug }: { slug: string }) {
  const { l, lang } = useLang();
  const me = meStore.use();
  const [course, setCourse] = useState<Course | null | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const load = () =>
    academy.course(slug).then(
      (c) => setCourse(c),
      () => setCourse(null),
    );
  useEffect(() => {
    void load();
    // Coming back from a quiz or the editor: refresh what's done.
    const on = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, me]);
  if (course === undefined) return <Spinner />;
  if (!course)
    return (
      <Empty icon="learn" title={l({ en: "Course not found", ar: "الكورس مش موجود" })}>
        <Button onClick={() => navigate("learn")}>{l({ en: "All courses", ar: "كل الكورسات" })}</Button>
      </Empty>
    );
  const req = course.lessons.filter((x) => x.required);
  const done = req.filter((x) => x.done).length;
  const percent = req.length ? Math.round((100 * done) / req.length) : 0;
  return (
    <div className="grid max-w-3xl gap-6">
      <button type="button" onClick={() => navigate("learn")} className="flex w-fit items-center gap-1 text-sm text-fog hover:text-frost">
        <Icon name="back" size={15} /> {l({ en: "Academy", ar: "الأكاديمية" })}
      </button>
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold">{l({ en: course.title_en || course.title, ar: course.title })}</h1>
          {!course.published && <Badge tone="warn">{l({ en: "Draft (team preview)", ar: "مسودة (معاينة للفريق)" })}</Badge>}
        </div>
        {(course.summary || course.summary_en) && <p className="text-sm text-mist">{l({ en: course.summary_en || course.summary, ar: course.summary })}</p>}
        {course.enrolled ? (
          <Card className="grid gap-2">
            <p className="text-sm">{l({ en: `${done} of ${req.length} required lessons done`, ar: `خلصت ${done} من ${req.length} درس مطلوب` })}</p>
            <Progress value={percent} />
            {course.certificate ? (
              <a href={`${BASE}${lang === "ar" ? "/ar" : ""}/verify/?c=${course.certificate.code}`} className="text-sm text-ok underline">
                {l({ en: `Certificate issued: ${course.certificate.code}`, ar: `الشهادة اتصدرت: ${course.certificate.code}` })}
              </a>
            ) : percent >= 100 ? (
              <p className="text-sm text-ok">{l({ en: "You completed the course. The team issues the certificate.", ar: "خلّصت الكورس. الفريق هيصدر الشهادة." })}</p>
            ) : null}
          </Card>
        ) : me?.kind === "student" ? (
          <p className="text-sm text-warn">{l({ en: "This course is for another group; you can look, but it isn't tracked for you.", ar: "الكورس ده لمجموعة تانية؛ تقدر تتفرج بس مش هيتحسبلك." })}</p>
        ) : !me ? (
          <p className="text-sm text-warn">{l({ en: "Sign in with your student code to track your progress.", ar: "سجّل دخول بكود الطالب عشان تقدمك يتحسب." })}</p>
        ) : null}
      </header>
      <ol className="grid gap-2">
        {course.lessons.map((x, i) => (
          <li key={x.id}>
            <LessonRow n={i + 1} lesson={x} open={open === x.id} enrolled={course.enrolled} onToggle={() => setOpen(open === x.id ? null : x.id)} onChange={load} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function LessonRow({ n, lesson: x, open, enrolled, onToggle, onChange }: { n: number; lesson: Lesson; open: boolean; enrolled: boolean; onToggle: () => void; onChange: () => void }) {
  const { l } = useLang();
  const [busy, setBusy] = useState(false);
  const body = l({ en: x.body_en || x.body, ar: x.body });
  const k = KIND[x.kind];
  return (
    <div className={cn("rounded-2xl border bg-deep/80", x.done ? "border-ok/40" : "border-[var(--line)]")} data-testid={`lesson-${n}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-start">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", x.done ? "bg-ok/20 text-ok" : "bg-panel text-cyan")}>{x.done ? <Icon name="check" /> : <Icon name={k.icon} />}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{`${n}. ${l({ en: x.title_en || x.title, ar: x.title })}`}</span>
          <span className="block text-xs text-fog">
            {l(k)}
            {x.minutes ? ` · ${l({ en: `${x.minutes} min`, ar: `${x.minutes} دقيقة` })}` : ""}
            {!x.required ? ` · ${l({ en: "optional", ar: "اختياري" })}` : ""}
          </span>
        </span>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-[var(--line)] p-4 text-sm">
          {body && <p className="whitespace-pre-line text-mist">{body}</p>}
          {x.kind === "read" && enrolled && !x.done && (
            <Button
              variant="primary"
              icon="check"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await academy.read(x.id).catch(() => toast(l({ en: "Couldn't save", ar: "محصلش حفظ" }), "danger"));
                setBusy(false);
                onChange();
              }}
            >
              {l({ en: "I read it", ar: "قريته" })}
            </Button>
          )}
          {x.kind === "material" &&
            (x.material ? (
              x.material.url || x.material.path ? (
                <a
                  href={x.material.url || fileUrl(x.material.path!)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    if (enrolled) void academy.materialSeen(x.material!.id).then(() => setTimeout(onChange, 400));
                  }}
                  className="inline-flex w-fit items-center gap-2 rounded-lg bg-volt px-4 py-2 font-medium text-white"
                >
                  <Icon name={x.material.kind === "link" ? "link" : "download"} size={16} /> {x.material.title}
                </a>
              ) : (
                <p className="text-fog">{l({ en: "Open it after signing in as a student of this course.", ar: "افتحها بعد ما تسجّل دخول كطالب في الكورس." })}</p>
              )
            ) : (
              <p className="text-fog">{l({ en: "This lecture isn't published right now.", ar: "المحاضرة دي مش منشورة دلوقتي." })}</p>
            ))}
          {x.kind === "quiz" &&
            (x.quiz ? (
              <div className="grid gap-2">
                <p className="text-mist">
                  {l({ en: `Passes at ${x.pass}%.`, ar: `بيعدّي من ${x.pass}%.` })}
                  {x.quiz.best !== null ? ` ${l({ en: `Your best: ${x.quiz.best}%`, ar: `أحسن درجة ليك: ${x.quiz.best}%` })}` : ""}
                </p>
                <a href={`${APP_PATH}#/me/quiz/${x.quiz.id}`} className="inline-flex w-fit items-center gap-2 rounded-lg bg-volt px-4 py-2 font-medium text-white">
                  <Icon name="check" size={16} /> {l({ en: "Take it in the BuildX App", ar: "حلّه في تطبيق BuildX" })}
                </a>
              </div>
            ) : (
              <p className="text-fog">{l({ en: "This quiz isn't published right now.", ar: "الكويز ده مش منشور دلوقتي." })}</p>
            ))}
          {x.kind === "session" &&
            (x.session ? (
              <p className="text-mist">
                {`${x.session.title} · ${new Date(x.session.at).toLocaleString(l({ en: "en-GB", ar: "ar-EG" }), { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}`}
                <br />
                <span className="text-fog">{l({ en: "Counts once your attendance is recorded at the session.", ar: "بيتحسب لما حضورك يتسجّل في السيشن." })}</span>
              </p>
            ) : (
              <p className="text-fog">{l({ en: "The session was removed.", ar: "السيشن اتشالت." })}</p>
            ))}
          {x.kind === "lab" && x.challenge && <ChallengeStart slug={x.challenge} done={!!x.done} />}
        </div>
      )}
    </div>
  );
}

/* ─── Challenges ───────────────────────────────────────────────────────── */

export function ChallengesPage() {
  const { l } = useLang();
  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <h1 className="font-display text-2xl font-bold">{l({ en: "Challenges", ar: "التحديات" })}</h1>
        <p className="max-w-2xl text-sm text-fog">
          {l({
            en: "Each challenge starts with the circuit wired and the code to write. “Check” compiles your sketch and runs it in the simulator, then looks at what it actually does.",
            ar: "كل تحدي بيبدأ والدايرة متوصّلة والكود عليك. «اتأكد» بيعمل كومبايل للكود ويشغّله في المحاكي، وبعدين يشوف بيعمل إيه فعلًا.",
          })}
        </p>
      </header>
      <Leaderboard />
      <ChallengeGrid />
      <RobotChallenges />
    </div>
  );
}

/** Points from passed challenges, the learner's rank, and the top of their group and of everyone. */
function Leaderboard() {
  const { l } = useLang();
  const me = meStore.use();
  const [board, setBoard] = useState<Board | null>(null);
  useEffect(() => {
    let live = true;
    void academy.board().then((b) => live && setBoard(b));
    return () => {
      live = false;
    };
  }, [me]);
  if (me?.kind !== "student")
    return (
      <p className="text-sm text-fog">
        {l({ en: "Each challenge is worth points (10, 20 or 30 by level). Sign in with your student code to collect them and join the leaderboard.", ar: "كل تحدي ليه نقط (10 أو 20 أو 30 حسب المستوى). سجّل دخول بكود الطالب عشان تجمعها وتدخل لوحة الترتيب." })}
      </p>
    );
  if (!board) return <Spinner />;
  const list = (title: string, rows: Board["top"], id: string) => (
    <Card className="grid content-start gap-2" data-testid={id}>
      <p className="text-sm font-semibold">{title}</p>
      {rows.length ? (
        <ol className="grid gap-1 text-sm">
          {rows.map((r, i) => (
            <li key={i} className={cn("flex items-center justify-between gap-2 rounded-md px-2 py-1", r.me && "bg-volt/15 ring-1 ring-volt/40")}>
              <span>
                <span className="inline-block w-6 text-fog">{fmtNum(i + 1)}</span>
                {r.name}
              </span>
              <span className="text-mist">
                {fmtNum(r.points)} {l({ en: "pts", ar: "نقطة" })}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-fog">{l({ en: "No one yet — be the first.", ar: "لسه محدش — خليك الأول." })}</p>
      )}
    </Card>
  );
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="grid content-start gap-1" data-testid="my-points">
        <p className="text-sm text-fog">{l({ en: "Your challenge points", ar: "نقطك في التحديات" })}</p>
        <p className="font-display text-3xl font-bold">{fmtNum(board.me?.points ?? 0)}</p>
        <p className="text-sm text-mist">
          {board.me
            ? l({
                en: `${board.me.passed} passed · #${board.me.group_rank} in your group · #${board.me.rank} overall`,
                ar: `${board.me.passed} تحدي · رقم ${board.me.group_rank} في مجموعتك · رقم ${board.me.rank} على الكل`,
              })
            : l({ en: "Pass a challenge to get on the board.", ar: "عدّي تحدي عشان تظهر في الترتيب." })}
        </p>
      </Card>
      {board.group && list(l({ en: `Top of ${board.group}`, ar: `الأوائل في ${board.group}` }), board.group_top, "board-group")}
      {list(l({ en: "Top of the Lab", ar: "الأوائل في اللاب" }), board.top, "board-top")}
    </div>
  );
}

/** The robot's lap challenges (one per track), run in the Robot Arena. */
function RobotChallenges() {
  const { l } = useLang();
  const me = meStore.use();
  const [passed, setPassed] = useState<Record<string, string>>({});
  useEffect(() => {
    void academy.passed().then(setPassed);
  }, [me]);
  return (
    <section className="grid gap-3">
      <h2 className="font-display text-lg font-bold">{l({ en: "Robot laps", ar: "لفّات الروبوت" })}</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {TRACKS.map((t) => (
          <Card key={t.id} className="grid gap-2" data-testid={`challenge-robot-${t.id}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{l(t.name)}</p>
              <span className="flex items-center gap-1.5">
                {passed[`robot-${t.id}`] && <Badge tone="ok">{l({ en: "Passed", ar: "عدّيت" })}</Badge>}
                <Badge tone="volt">+{fmtNum(CHALLENGE_POINTS[`robot-${t.id}`] ?? 0)}</Badge>
              </span>
            </div>
            <p className="text-sm text-fog">
              {l({ en: "Program the line follower to finish one lap, never more than half a second off the line, within 60 s.", ar: "برمج الروبوت يكمّل لفة كاملة، من غير ما يخرج من الخط أكتر من نص ثانية، في أقل من 60 ثانية." })}
            </p>
            <div>
              <Button size="sm" icon="play" onClick={() => navigate("robot", { query: { track: t.id } })}>
                {l({ en: "Open the arena", ar: "افتح الحلبة" })}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ChallengeGrid({ limit }: { limit?: number }) {
  const { l } = useLang();
  const me = meStore.use();
  const [passed, setPassed] = useState<Record<string, string>>({});
  useEffect(() => {
    void academy.passed().then(setPassed);
  }, [me]);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {CHALLENGES.slice(0, limit).map((c) => (
        <Card key={c.slug} className="grid gap-3 !p-0 overflow-hidden" data-testid={`challenge-${c.slug}`}>
          <CircuitThumb doc={starterDoc(c)} className="aspect-[16/9] w-full bg-[#0a1430] p-2" />
          <div className="grid gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{l(c.title)}</p>
              <span className="flex items-center gap-1.5">
                {passed[c.slug] && <Badge tone="ok">{l({ en: "Passed", ar: "عدّيت" })}</Badge>}
                <Badge tone={c.level === 1 ? "ok" : c.level === 2 ? "volt" : "warn"}>{LEVEL(c.level)}</Badge>
                <Badge tone="volt">+{fmtNum(CHALLENGE_POINTS[c.slug] ?? 0)}</Badge>
              </span>
            </div>
            <p className="text-sm text-fog">{l(c.goal)}</p>
            <ChallengeStart slug={c.slug} done={!!passed[c.slug]} />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Open the learner's own copy of the challenge (a new project tagged with it). */
function ChallengeStart({ slug, done }: { slug: string; done: boolean }) {
  const { l } = useLang();
  const c = challengeBySlug(slug);
  if (!c) return <p className="text-fog">{l({ en: "This challenge is no longer available.", ar: "التحدي ده مبقاش موجود." })}</p>;
  return (
    <div>
      <Button
        size="sm"
        variant={done ? "soft" : "primary"}
        icon="play"
        onClick={() =>
          createAndOpen("circuit", l(c.title), starterDoc(c), { description: l(c.goal), tags: ["challenge", `challenge:${c.slug}`] }).catch(() =>
            toast(l({ en: "Couldn't create the project", ar: "معرفتش أعمل المشروع" }), "danger"),
          )
        }
      >
        {done ? l({ en: "Try again", ar: "جرّب تاني" }) : l({ en: "Start", ar: "ابدأ" })}
      </Button>
    </div>
  );
}
