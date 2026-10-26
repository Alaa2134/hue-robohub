"use client";
/**
 * Classrooms: the Lab tasks the team gave this student's group. A task starts from a challenge or
 * from a circuit the trainer built; Start makes the student's own copy, and they submit it from the
 * editor. The grade and the trainer's feedback come back here.
 */
import { useEffect, useState } from "react";
import { classroom, meStore, type LabTask } from "../api";
import { challengeBySlug, starterDoc } from "../academy/challenges";
import { createAndOpen } from "../circuit/editor";
import type { CircuitDoc } from "../circuit/model";
import { useLang } from "../i18n";
import { navigate } from "../router";
import { Badge, Button, Card, Empty, Icon, Spinner, toast } from "../ui";

const fmtDate = (iso: string, lang: string) => new Date(iso).toLocaleString(lang === "ar" ? "ar-EG" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function ClassroomsPage() {
  const { l, lang } = useLang();
  const me = meStore.use();
  const [tasks, setTasks] = useState<LabTask[] | null>(null);
  useEffect(() => {
    if (me?.kind !== "student") return;
    let live = true;
    classroom.tasks().then(
      (r) => live && setTasks(r),
      () => live && setTasks([]),
    );
    return () => {
      live = false;
    };
  }, [me]);

  if (!me)
    return (
      <Empty icon="users" title={l({ en: "Classrooms", ar: "الفصول" })}>
        <p className="mb-3">{l({ en: "Sign in with your student code to see the tasks your trainer gave your group.", ar: "سجّل دخول بكود الطالب عشان تشوف المهام اللي المدرب نزّلها لمجموعتك." })}</p>
        <Button variant="primary" onClick={() => navigate("profile")}>
          {l({ en: "Sign in", ar: "تسجيل الدخول" })}
        </Button>
      </Empty>
    );
  if (me.kind === "staff")
    return (
      <Empty icon="users" title={l({ en: "Classrooms", ar: "الفصول" })}>
        {l({
          en: "Trainers create Lab tasks in the BuildX App → Tasks: pick a challenge or one of your Lab circuits as the starting point. Submissions and their check results show there for grading.",
          ar: "المدربين بيعملوا مهام اللاب من تطبيق BuildX ← التاسكات: اختار تحدي أو دايرة من مشاريعك في اللاب كنقطة بداية. التسليمات ونتيجة التصحيح بتظهر هناك للتقييم.",
        })}
      </Empty>
    );

  const start = async (t: LabTask) => {
    const ch = t.challenge ? challengeBySlug(t.challenge) : null;
    const doc = ch ? starterDoc(ch) : (structuredClone(t.template?.data) as CircuitDoc | undefined);
    if (!doc) return toast(l({ en: "The task's starting circuit is no longer available", ar: "دايرة البداية بتاعة المهمة مبقتش موجودة" }), "danger");
    try {
      await createAndOpen(t.template?.kind === "code" ? "code" : "circuit", t.title, doc, {
        description: t.description,
        tags: ["assignment", `assignment:${t.id}`, ...(ch ? [`challenge:${ch.slug}`] : [])],
      });
    } catch {
      toast(l({ en: "Couldn't create the project", ar: "معرفتش أعمل المشروع" }), "danger");
    }
  };

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-2">
        <h1 className="font-display text-2xl font-bold">{l({ en: "Classrooms", ar: "الفصول" })}</h1>
        <p className="text-sm text-fog">{l({ en: "Tasks from your trainer: open one, build it in the editor, then Submit from the editor.", ar: "مهام من المدرب: افتح واحدة، اعملها في المحرر، وبعدين «سلّم» من المحرر." })}</p>
      </header>
      {tasks === null ? (
        <Spinner />
      ) : !tasks.length ? (
        <Empty icon="users" title={l({ en: "No Lab tasks yet", ar: "لسه مفيش مهام في اللاب" })}>
          {l({ en: "When your trainer posts one for your group, it shows here.", ar: "لما المدرب ينزّل مهمة لمجموعتك هتظهر هنا." })}
        </Empty>
      ) : (
        <ul className="grid gap-3">
          {tasks.map((t) => {
            const s = t.submission;
            const late = !!t.due && new Date(t.due).getTime() < Date.now();
            const ch = t.challenge ? challengeBySlug(t.challenge) : null;
            return (
              <li key={t.id}>
                <Card className="grid gap-3" data-testid={`lab-task-${t.id}`}>
                  <div className="flex flex-wrap items-start gap-2">
                    <p className="min-w-0 flex-1 font-semibold">{t.title}</p>
                    {s?.grade != null ? (
                      <Badge tone="ok">{`${+s.grade}/${t.max_points}`}</Badge>
                    ) : s ? (
                      <Badge tone="volt">{l({ en: "Submitted", ar: "اتسلّم" })}</Badge>
                    ) : late ? (
                      <Badge tone={t.allow_late ? "warn" : "danger"}>{t.allow_late ? l({ en: "Late", ar: "متأخر" }) : l({ en: "Closed", ar: "انتهى" })}</Badge>
                    ) : (
                      <Badge>{l({ en: "To do", ar: "مطلوب" })}</Badge>
                    )}
                  </div>
                  {t.description && <p className="whitespace-pre-line text-sm text-mist">{t.description}</p>}
                  <p className="flex flex-wrap gap-3 text-xs text-fog">
                    {ch && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="trophy" size={13} /> {l(ch.title)} · {l({ en: "checked in the simulator", ar: "بيتصحح في المحاكي" })}
                      </span>
                    )}
                    {t.template && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="circuit" size={13} /> {l({ en: "Starts from the trainer's circuit", ar: "بيبدأ من دايرة المدرب" })}
                      </span>
                    )}
                    {t.due && <span>{`${l({ en: "Due", ar: "آخر ميعاد" })} ${fmtDate(t.due, lang)}`}</span>}
                    <span>{l({ en: `${t.max_points} points`, ar: `${t.max_points} درجة` })}</span>
                  </p>
                  {s && (
                    <div className="grid gap-1 rounded-xl bg-panel p-3 text-sm">
                      <p className="text-mist">
                        {l({ en: "Submitted", ar: "اتسلّم" })} {fmtDate(s.at, lang)}
                        {s.late ? ` · ${l({ en: "late", ar: "متأخر" })}` : ""}
                        {s.passed != null ? ` · ${s.passed ? l({ en: "passed the check", ar: "عدّى التصحيح" }) : l({ en: "didn't pass the check", ar: "معدّاش التصحيح" })}` : ""}
                      </p>
                      {s.feedback && <p className="whitespace-pre-line text-frost">{s.feedback}</p>}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {s?.project && (
                      <Button size="sm" icon="circuit" onClick={() => navigate(`circuits/${s.project}`)}>
                        {l({ en: "Open my submission", ar: "افتح تسليمي" })}
                      </Button>
                    )}
                    {s?.grade == null && (!late || t.allow_late) && (
                      <Button size="sm" variant={s ? "soft" : "primary"} icon="play" onClick={() => void start(t)}>
                        {s ? l({ en: "Start over", ar: "ابدأ من جديد" }) : l({ en: "Start", ar: "ابدأ" })}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
