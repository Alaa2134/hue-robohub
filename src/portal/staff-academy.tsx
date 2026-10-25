"use client";
/**
 * Academy (BuildX Lab → الأكاديمية): courses made of lessons that point at lectures, quizzes, sessions
 * and Lab challenges, or a short reading. Students' progress comes from the real records; whoever
 * finished every required lesson can get the course's certificate from here.
 */
import { useEffect, useState } from "react";
import { BASE_PATH, can, fmt, rpc, type StaffRow } from "./core";
import { Badge, Bar, Button, Card, Chip, Empty, ErrorBox, Field, Icon, IconButton, Input, List, Loading, Row, Select, Textarea, Toggle, TopBar, confirmDialog, go, toast, useAsync, type IconKey } from "./ui";

type Kind = "read" | "material" | "quiz" | "session" | "lab";
type LessonDraft = {
  id?: string;
  kind: Kind;
  title: string;
  title_en?: string | null;
  body?: string;
  body_en?: string | null;
  material_id?: string | null;
  quiz_id?: string | null;
  session_id?: string | null;
  challenge?: string | null;
  pass_percent?: number;
  minutes?: number | null;
  required?: boolean;
};
type CourseRow = {
  id: string;
  slug: string;
  title: string;
  title_en: string | null;
  summary: string;
  summary_en: string | null;
  group: string;
  level: number;
  hours: number | null;
  published: boolean;
  position: number;
  updated_at: string;
  lessons: LessonDraft[];
  students: number;
  complete: number;
};
type Sources = {
  materials: { id: string; title: string; kind: string; group: string; published: boolean }[];
  quizzes: { id: string; title: string; group: string; published: boolean }[];
  sessions: { id: string; title: string; group: string; at: string }[];
  groups: string[];
};
type Learner = { id: string; name: string; code: string; group: string; done: number; total: number; percent: number; lessons: string[]; certificate: string | null };

const KINDS: { k: Kind; label: string; icon: IconKey }[] = [
  { k: "material", label: "محاضرة", icon: "book" },
  { k: "quiz", label: "كويز", icon: "quiz" },
  { k: "session", label: "سيشن", icon: "calendar" },
  { k: "lab", label: "تحدي في اللاب", icon: "layers" },
  { k: "read", label: "قراءة", icon: "file" },
];
const kindOf = (k: Kind) => KINDS.find((x) => x.k === k)!;
const LAB = `${BASE_PATH}/lab`;

/** The Lab's challenges (loaded only on this screen: the list lives with the simulator). */
function useChallenges() {
  const [list, setList] = useState<{ slug: string; title: string; level: number }[]>([]);
  useEffect(() => {
    void import("@/lab/academy/challenges").then((m) => setList(m.CHALLENGES.map((c) => ({ slug: c.slug, title: c.title.ar, level: c.level }))));
  }, []);
  return list;
}

export function AcademyScreen({ me, id, sub }: { me: StaffRow; id?: string; sub?: string }) {
  if (id) return <CourseScreen key={id} me={me} id={id} tab={sub === "students" ? "students" : "edit"} />;
  return <CourseList me={me} />;
}

function CourseList({ me }: { me: StaffRow }) {
  const { data, error, loading, reload } = useAsync(() => rpc<CourseRow[]>("staff_academy_courses"), []);
  return (
    <>
      <TopBar
        title="الأكاديمية"
        sub="كورسات من المحاضرات والكويزات والسيشنات وتحديات اللاب"
        actions={can(me, "training") && <Button variant="primary" icon="plus" size="sm" onClick={() => go("/staff/academy/new")}>كورس جديد</Button>}
      />
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <Empty
          icon="book"
          title="لسه مفيش كورسات"
          body="الكورس بيتكوّن من دروس بترتيب: محاضرة اترفعت، كويز، سيشن، تحدي في اللاب أو قراءة قصيرة. الطالب بيخلص الدرس من السجل الحقيقي (فتح المحاضرة، عدّى الكويز، حضر السيشن، عدّى التحدي)."
          action={can(me, "training") && <Button variant="primary" icon="plus" onClick={() => go("/staff/academy/new")}>كورس جديد</Button>}
        />
      ) : (
        <List>
          {data.map((c) => (
            <Row key={c.id} onClick={() => go(`/staff/academy/${c.id}`)}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold text-chalk">{c.title}</span>
                  {c.published ? <Badge tone="ok">منشور</Badge> : <Badge>مسودة</Badge>}
                </span>
                <span className="block text-xs text-fog">
                  {`${c.lessons.length} درس · ${c.group || "كل الطلاب"} · خلّصه ${c.complete} من ${c.students}`}
                </span>
              </span>
            </Row>
          ))}
        </List>
      )}
    </>
  );
}

const blank = (): CourseRow => ({ id: "", slug: "", title: "", title_en: null, summary: "", summary_en: null, group: "", level: 1, hours: null, published: false, position: 0, updated_at: "", lessons: [], students: 0, complete: 0 });

function CourseScreen({ me, id, tab }: { me: StaffRow; id: string; tab: "edit" | "students" }) {
  const isNew = id === "new";
  const { data, error, loading, reload } = useAsync(() => (isNew ? Promise.resolve([blank()]) : rpc<CourseRow[]>("staff_academy_courses")), [id]);
  const course = isNew ? data?.[0] : data?.find((c) => c.id === id);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (loading && !data) return <Loading />;
  if (!course) return <Empty icon="book" title="الكورس مش موجود" action={<Button onClick={() => go("/staff/academy")}>كل الكورسات</Button>} />;
  return (
    <>
      <TopBar
        title={isNew ? "كورس جديد" : course.title}
        back="/staff/academy"
        actions={
          !isNew && (
            <a href={`${LAB}/learn/${course.slug}/`} target="_blank" rel="noreferrer" className="text-sm text-cyan">
              معاينة في اللاب
            </a>
          )
        }
      />
      {!isNew && (
        <div className="mb-3 flex gap-2">
          <Chip active={tab === "edit"} onClick={() => go(`/staff/academy/${id}`, true)}>
            الدروس
          </Chip>
          <Chip active={tab === "students"} onClick={() => go(`/staff/academy/${id}/students`, true)} count={course.complete}>
            الطلاب والشهادات
          </Chip>
        </div>
      )}
      {tab === "students" && !isNew ? <Learners me={me} course={course} /> : <CourseEditor me={me} initial={course} onSaved={(nid) => (isNew ? go(`/staff/academy/${nid}`, true) : reload())} />}
    </>
  );
}

function CourseEditor({ me, initial, onSaved }: { me: StaffRow; initial: CourseRow; onSaved: (id: string) => void }) {
  const [c, setC] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const challenges = useChallenges();
  const src = useAsync(() => rpc<Sources>("staff_academy_sources", { p_group: c.group }), [c.group]);
  const editable = can(me, "training");
  const set = (p: Partial<CourseRow>) => setC((x) => ({ ...x, ...p }));
  const setLesson = (i: number, p: Partial<LessonDraft>) => setC((x) => ({ ...x, lessons: x.lessons.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const move = (i: number, d: number) =>
    setC((x) => {
      const ls = [...x.lessons];
      const j = i + d;
      if (j < 0 || j >= ls.length) return x;
      [ls[i], ls[j]] = [ls[j], ls[i]];
      return { ...x, lessons: ls };
    });
  const slugOk = /^[a-z0-9][a-z0-9-]{1,48}$/.test(c.slug);
  const save = async () => {
    if (c.title.trim().length < 2) return toast("اكتب اسم الكورس", "error");
    if (!slugOk) return toast("الرابط حروف إنجليزي صغيرة وأرقام وشَرطات بس (مثلاً arduino-basics)", "error");
    const missing = c.lessons.findIndex((l) => l.title.trim().length < 2 || (l.kind === "material" && !l.material_id) || (l.kind === "quiz" && !l.quiz_id) || (l.kind === "session" && !l.session_id) || (l.kind === "lab" && !l.challenge));
    if (missing >= 0) return toast(`الدرس ${missing + 1} ناقصه اسم أو المحتوى اللي بيشاور عليه`, "error");
    setSaving(true);
    try {
      const r = await rpc<{ ok: boolean; id?: string; error?: string }>("staff_academy_save", { p: { ...c, id: c.id || null } });
      if (!r.ok || !r.id) throw new Error(r.error ?? "save");
      toast("اتحفظ");
      onSaved(r.id);
    } catch (e) {
      const m = String((e as Error)?.message ?? e);
      toast(m.includes("academy_courses_slug_key") || m.includes("duplicate") ? "الرابط ده مستخدم في كورس تاني" : "محصلش حفظ", "error");
    }
    setSaving(false);
  };
  const s = src.data;
  return (
    <div className="grid gap-4">
      <Card className="grid gap-3">
        <Field label="اسم الكورس">
          <Input value={c.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} disabled={!editable} placeholder="أساسيات الأردوينو" />
        </Field>
        <Field label="الاسم بالإنجليزي (اختياري)">
          <Input value={c.title_en ?? ""} onChange={(e) => set({ title_en: e.target.value })} maxLength={120} disabled={!editable} dir="ltr" />
        </Field>
        <Field label="الرابط" hint={`في اللاب: /lab/learn/${c.slug || "…"}`} error={c.slug && !slugOk ? "حروف إنجليزي صغيرة وأرقام وشَرطات" : null}>
          <Input value={c.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} maxLength={49} disabled={!editable} dir="ltr" placeholder="arduino-basics" />
        </Field>
        <Field label="وصف قصير">
          <Textarea value={c.summary} onChange={(e) => set({ summary: e.target.value })} maxLength={600} rows={3} disabled={!editable} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="لمين">
            <Select value={c.group} onChange={(e) => set({ group: e.target.value })} disabled={!editable}>
              <option value="">كل الطلاب</option>
              {(s?.groups ?? (c.group ? [c.group] : [])).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المستوى">
            <Select value={c.level} onChange={(e) => set({ level: Number(e.target.value) })} disabled={!editable}>
              <option value={1}>مبتدئ</option>
              <option value={2}>متوسط</option>
              <option value={3}>متقدم</option>
            </Select>
          </Field>
          <Field label="عدد الساعات (للشهادة)">
            <Input type="number" min={1} max={500} value={c.hours ?? ""} onChange={(e) => set({ hours: e.target.value ? Number(e.target.value) : null })} disabled={!editable} />
          </Field>
        </div>
        <Toggle checked={c.published} onChange={(v) => set({ published: v })} label="منشور في اللاب" hint="المسودة بيشوفها الفريق بس." disabled={!editable} />
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-chalk">{`الدروس (${c.lessons.length})`}</h2>
        {editable && (
          <Button size="sm" icon="plus" onClick={() => setAdding((a) => !a)}>
            درس
          </Button>
        )}
      </div>
      {adding && (
        <Card className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <Button
              key={k.k}
              size="sm"
              icon={k.icon}
              onClick={() => {
                setC((x) => ({ ...x, lessons: [...x.lessons, { kind: k.k, title: "", required: true, pass_percent: 60 }] }));
                setAdding(false);
              }}
            >
              {k.label}
            </Button>
          ))}
        </Card>
      )}
      {!c.lessons.length && <p className="text-sm text-fog">ضيف أول درس: محاضرة رفعتها، كويز، سيشن، تحدي في اللاب أو قراءة.</p>}
      {c.lessons.map((l, i) => (
        <Card key={l.id ?? `n${i}`} className="grid gap-3" data-testid={`lesson-edit-${i + 1}`}>
          <div className="flex items-center gap-2">
            <Badge tone="info">{`${i + 1} · ${kindOf(l.kind).label}`}</Badge>
            <span className="flex-1" />
            {editable && (
              <>
                <IconButton icon="arrowUp" label="لفوق" onClick={() => move(i, -1)} disabled={i === 0} />
                <IconButton icon="arrowDown" label="لتحت" onClick={() => move(i, 1)} disabled={i === c.lessons.length - 1} />
                <IconButton
                  icon="trash"
                  label="شيل الدرس"
                  onClick={async () => {
                    if (l.id && !(await confirmDialog({ title: "شيل الدرس؟", body: "لو طلبة علّموه «قريته» هيتشال من تقدمهم بعد الحفظ.", ok: "شيل", danger: true }))) return;
                    setC((x) => ({ ...x, lessons: x.lessons.filter((_, j) => j !== i) }));
                  }}
                />
              </>
            )}
          </div>
          <Field label="اسم الدرس">
            <Input value={l.title} onChange={(e) => setLesson(i, { title: e.target.value })} maxLength={140} disabled={!editable} />
          </Field>
          {l.kind === "material" && (
            <Field label="المحاضرة" hint="من المحتوى اللي اترفع للطلاب.">
              <Select value={l.material_id ?? ""} onChange={(e) => setLesson(i, { material_id: e.target.value || null, title: l.title || s?.materials.find((m) => m.id === e.target.value)?.title || "" })} disabled={!editable}>
                <option value="">اختار…</option>
                {s?.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {`${m.title}${m.published ? "" : " (مش منشورة)"}`}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {l.kind === "quiz" && (
            <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
              <Field label="الكويز">
                <Select value={l.quiz_id ?? ""} onChange={(e) => setLesson(i, { quiz_id: e.target.value || null, title: l.title || s?.quizzes.find((q) => q.id === e.target.value)?.title || "" })} disabled={!editable}>
                  <option value="">اختار…</option>
                  {s?.quizzes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {`${q.title}${q.published ? "" : " (مش منشور)"}`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="يعدّي من (%)">
                <Input type="number" min={1} max={100} value={l.pass_percent ?? 60} onChange={(e) => setLesson(i, { pass_percent: Number(e.target.value) || 60 })} disabled={!editable} />
              </Field>
            </div>
          )}
          {l.kind === "session" && (
            <Field label="السيشن" hint="بيتحسب لما حضور الطالب يتسجّل فيها.">
              <Select value={l.session_id ?? ""} onChange={(e) => setLesson(i, { session_id: e.target.value || null, title: l.title || s?.sessions.find((x) => x.id === e.target.value)?.title || "" })} disabled={!editable}>
                <option value="">اختار…</option>
                {s?.sessions.map((x) => (
                  <option key={x.id} value={x.id}>
                    {`${x.title} · ${fmt.day(x.at)}`}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {l.kind === "lab" && (
            <Field label="التحدي" hint="بيتحسب لما الطالب يعدّي التصحيح في المحاكي.">
              <Select value={l.challenge ?? ""} onChange={(e) => setLesson(i, { challenge: e.target.value || null, title: l.title || challenges.find((x) => x.slug === e.target.value)?.title || "" })} disabled={!editable}>
                <option value="">اختار…</option>
                {challenges.map((x) => (
                  <option key={x.slug} value={x.slug}>
                    {`${x.title} (${"●".repeat(x.level)})`}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={l.kind === "read" ? "النص" : "ملاحظة للطالب (اختياري)"}>
            <Textarea value={l.body ?? ""} onChange={(e) => setLesson(i, { body: e.target.value })} maxLength={6000} rows={l.kind === "read" ? 6 : 2} disabled={!editable} />
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-mist">
              مدته (دقايق)
              <Input type="number" min={1} max={600} className="!w-24" value={l.minutes ?? ""} onChange={(e) => setLesson(i, { minutes: e.target.value ? Number(e.target.value) : null })} disabled={!editable} />
            </label>
            <Toggle checked={l.required !== false} onChange={(v) => setLesson(i, { required: v })} label="مطلوب للشهادة" disabled={!editable} />
          </div>
        </Card>
      ))}
      {editable && (
        <Button variant="primary" block loading={saving} onClick={save}>
          حفظ الكورس
        </Button>
      )}
    </div>
  );
}

function Learners({ me, course }: { me: StaffRow; course: CourseRow }) {
  const { data, error, loading, reload } = useAsync(() => rpc<Learner[]>("staff_academy_progress", { p_course: course.id }), [course.id]);
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (loading && !data) return <Loading />;
  if (!data?.length) return <Empty icon="users" title="مفيش طلاب في الكورس" body={course.group ? `مفيش طلاب نشطين في «${course.group}».` : "مفيش طلاب نشطين."} />;
  const ready = data.filter((x) => x.total > 0 && x.done === x.total && !x.certificate);
  const issue = async () => {
    if (!(await confirmDialog({ title: `إصدار ${ready.length} شهادة؟`, body: `شهادة إتمام «${course.title}» للي خلّصوا كل الدروس المطلوبة.`, ok: "إصدار" }))) return;
    setBusy(true);
    try {
      const r = await rpc<{ ok: boolean; issued: number }>("staff_academy_issue", { p_course: course.id, p_students: ready.map((x) => x.id) });
      toast(`اتصدرت ${r.issued} شهادة`);
      reload();
    } catch {
      toast("محصلش إصدار", "error");
    }
    setBusy(false);
  };
  return (
    <div className="grid gap-3">
      <Card className="flex flex-wrap items-center gap-3">
        <span className="flex-1 text-sm text-mist">{`${data.filter((x) => x.total && x.done === x.total).length} خلّصوا من ${data.length} · ${ready.length} مستنيين الشهادة`}</span>
        {can(me, "certificates") && ready.length > 0 && (
          <Button variant="primary" size="sm" icon="award" loading={busy} onClick={issue}>
            {`أصدر ${ready.length} شهادة`}
          </Button>
        )}
      </Card>
      <List>
        {data.map((x) => (
          <Row key={x.id} chevron={false} onClick={() => go(`/staff/students?q=${encodeURIComponent(x.code)}`)}>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-chalk">{x.name}</span>
                {x.certificate ? <Badge tone="ok">{x.certificate}</Badge> : x.total && x.done === x.total ? <Badge tone="warn">خلّص</Badge> : null}
              </span>
              <span className="mt-1 flex items-center gap-2 text-xs text-fog">
                <span className="w-24 shrink-0">{`${x.done} / ${x.total}`}</span>
                <span className="flex-1">
                  <Bar value={x.percent} tone={x.percent >= 100 ? "ok" : "volt"} />
                </span>
              </span>
            </span>
            <Icon name="chevron" size={16} className="text-fog" />
          </Row>
        ))}
      </List>
    </div>
  );
}
