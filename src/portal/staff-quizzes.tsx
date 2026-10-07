"use client";
/** Quizzes: editor (single/multiple choice, true-false, short answer), publishing and results. */
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  APP_PATH,
  downloadCsv,
  fileUrl,
  fmt,
  fromLocalInput,
  must,
  publicOrigin,
  rpc,
  sb,
  toJpeg,
  toLocalInput,
  uid,
  uploadObject,
  type Attempt,
  type Question,
  type QuestionKind,
  type Quiz,
  type StaffRow,
} from "./core";
import { GroupSelect, useGroups, useStudents } from "./staff-data";
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
  Row,
  Section,
  Select,
  Sheet,
  Stat,
  Textarea,
  Toggle,
  TopBar,
  confirmDialog,
  copyText,
  go,
  toast,
  useAsync,
} from "./ui";

type QuizListRow = Quiz & { quiz_questions: { count: number }[]; quiz_attempts: { count: number }[] };

export const KIND_LABEL: Record<QuestionKind, string> = { single: "اختيار من متعدد", multi: "أكثر من إجابة", truefalse: "صح أو خطأ", short: "إجابة قصيرة" };
const LETTERS = "abcdefghijkl".split("");

function quizState(q: Quiz): { label: string; tone: "ok" | "warn" | "muted" | "info" } {
  if (!q.published) return { label: "مسودة", tone: "muted" };
  const now = Date.now();
  if (q.opens_at && new Date(q.opens_at).getTime() > now) return { label: "لم يبدأ", tone: "info" };
  if (q.closes_at && new Date(q.closes_at).getTime() <= now) return { label: "انتهى", tone: "warn" };
  return { label: "متاح الآن", tone: "ok" };
}

export function QuizzesScreen() {
  const { data, error, loading, reload } = useAsync(
    async () => must(await sb().from("quizzes").select("*, quiz_questions(count), quiz_attempts(count)").order("created_at", { ascending: false })) as QuizListRow[],
    [],
  );
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const q = must(await sb().from("quizzes").insert({ title: "كويز جديد", show_answers: true, shuffle: true }).select().single()) as Quiz;
      go(`/staff/quizzes/${q.id}`);
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };
  return (
    <>
      <TopBar
        title="الكويزات"
        sub="اختبارات قصيرة تُصحَّح تلقائيًا"
        actions={
          <Button size="sm" variant="primary" icon="plus" loading={busy} onClick={create}>
            كويز جديد
          </Button>
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty
          icon="quiz"
          title="لا توجد كويزات بعد"
          body="اعمل كويز بأسئلة اختيار من متعدد، صح وخطأ، أو إجابة قصيرة. التصحيح تلقائي والنتائج بتوصلك فورًا."
          action={
            <Button variant="primary" icon="plus" loading={busy} onClick={create}>
              اعمل أول كويز
            </Button>
          }
        />
      ) : (
        <List>
          {data.map((q) => {
            const st = quizState(q);
            return (
              <Row key={q.id} onClick={() => go(`/staff/quizzes/${q.id}`)}>
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-volt/15 text-[#8fb5ff]">
                    <Icon name="quiz" size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-chalk">{q.title}</p>
                    <p className="truncate text-xs text-fog">
                      {q.quiz_questions?.[0]?.count ?? 0} سؤال · {q.quiz_attempts?.[0]?.count ?? 0} محاولة · {q.group_name || "كل الطلاب"}
                    </p>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
              </Row>
            );
          })}
        </List>
      )}
    </>
  );
}

/* ─── Editor ───────────────────────────────────────────────────────────── */

type Settings = { title: string; description: string; group: string; opens: string; closes: string; limit: string; attempts: string; shuffle: boolean; show: boolean; published: boolean };

function blankQuestion(quizId: string, kind: QuestionKind, position: number): Question {
  return {
    id: uid(),
    quiz_id: quizId,
    position,
    kind,
    prompt: "",
    image_path: null,
    options: kind === "single" || kind === "multi" ? LETTERS.slice(0, 3).map((id) => ({ id, text: "" })) : [],
    correct: kind === "truefalse" ? ["t"] : [],
    explanation: "",
    points: 1,
  };
}

function problems(q: Question): string | null {
  if (!q.prompt.trim()) return "اكتب نص السؤال";
  if (q.kind === "single" || q.kind === "multi") {
    const filled = q.options.filter((o) => o.text.trim());
    if (filled.length < 2) return "اكتب اختيارين على الأقل";
    const right = q.correct.filter((c) => filled.some((o) => o.id === c));
    if (!right.length) return "حدّد الإجابة الصحيحة";
    if (q.kind === "single" && right.length !== 1) return "اختر إجابة صحيحة واحدة";
  }
  if (q.kind === "short" && !q.correct.some((c) => c.trim())) return "اكتب إجابة مقبولة واحدة على الأقل";
  return null;
}

/** What gets stored: empty options dropped, correct ids that still exist. */
function cleaned(q: Question, position: number) {
  const options = q.kind === "single" || q.kind === "multi" ? q.options.filter((o) => o.text.trim()).map((o) => ({ id: o.id, text: o.text.trim() })) : [];
  const correct =
    q.kind === "short"
      ? q.correct.map((c) => c.trim()).filter(Boolean)
      : q.kind === "truefalse"
        ? q.correct.slice(0, 1)
        : q.correct.filter((c) => options.some((o) => o.id === c));
  return { id: q.id, quiz_id: q.quiz_id, position, kind: q.kind, prompt: q.prompt.trim(), image_path: q.image_path, options, correct, explanation: q.explanation.trim(), points: Number(q.points) || 0 };
}

export function QuizEditor({ id, me }: { id: string; me: StaffRow }) {
  const groups = useGroups();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [qs, setQs] = useState<Question[]>([]);
  const [serverIds, setServerIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [q, questions] = await Promise.all([
          sb().from("quizzes").select("*").eq("id", id).single().then(must),
          sb().from("quiz_questions").select("*").eq("quiz_id", id).order("position").then(must),
        ]);
        if (!alive) return;
        const quizRow = q as Quiz;
        setQuiz(quizRow);
        setSettings(toSettings(quizRow));
        setQs(questions as Question[]);
        setServerIds((questions as Question[]).map((x) => x.id));
        if (!(questions as Question[]).length) setSettingsOpen(true);
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (fn: (list: Question[]) => Question[]) => {
    setQs(fn);
    setDirty(true);
  };
  const editQ = (qid: string, patch: Partial<Question>) => edit((list) => list.map((q) => (q.id === qid ? { ...q, ...patch } : q)));

  const save = async (publish?: boolean) => {
    if (!quiz || !settings) return;
    const next = { ...settings, published: publish ?? settings.published };
    const emptyPrompt = qs.some((q) => !q.prompt.trim());
    const blocking = next.published ? qs.map(problems).filter(Boolean) : [];
    if (emptyPrompt || blocking.length || (next.published && !qs.length)) {
      setShowErrors(true);
      toast(next.published && !qs.length ? "أضف سؤالًا واحدًا على الأقل قبل النشر." : "راجع الأسئلة المعلَّمة بالأحمر.", "error");
      return;
    }
    const opens = fromLocalInput(next.opens);
    const closes = fromLocalInput(next.closes);
    if (opens && closes && closes <= opens) return toast("موعد الإغلاق لازم يكون بعد موعد الفتح.", "error");
    setBusy(true);
    try {
      const row = must(
        await sb()
          .from("quizzes")
          .update({
            title: next.title.trim() || "كويز",
            description: next.description.trim(),
            group_name: next.group,
            opens_at: opens,
            closes_at: closes,
            time_limit_min: next.limit ? Math.max(1, Math.min(600, Number(next.limit))) : null,
            max_attempts: Math.max(1, Math.min(20, Number(next.attempts) || 1)),
            shuffle: next.shuffle,
            show_answers: next.show,
            published: next.published,
          })
          .eq("id", id)
          .select()
          .single(),
      ) as Quiz;
      if (qs.length) must(await sb().from("quiz_questions").upsert(qs.map(cleaned), { onConflict: "id" }).select("id"));
      const removed = serverIds.filter((x) => !qs.some((q) => q.id === x));
      if (removed.length) must(await sb().from("quiz_questions").delete().in("id", removed).select("id"));
      setQuiz(row);
      setSettings(toSettings(row));
      setServerIds(qs.map((q) => q.id));
      setDirty(false);
      setShowErrors(false);
      toast(publish === true ? "تم نشر الكويز للطلاب" : publish === false ? "تم إيقاف النشر" : "تم الحفظ");
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: "حذف الكويز؟", body: "ستُحذف الأسئلة ونتائج الطلاب نهائيًا.", ok: "حذف", danger: true }))) return;
    try {
      const gone = must(await sb().from("quizzes").delete().eq("id", id).select("id")) as { id: string }[];
      if (!gone.length) throw new Error("forbidden");
      setDirty(false);
      toast("تم حذف الكويز");
      go("/staff/quizzes", true);
    } catch (e) {
      toast.error(e);
    }
  };

  if (error) return <ErrorBox error={error} />;
  if (!quiz || !settings) return <Loading />;
  const st = quizState(quiz);
  const total = qs.reduce((a, q) => a + (Number(q.points) || 0), 0);

  return (
    <>
      <TopBar
        title={settings.title.trim() || quiz.title}
        sub={`${qs.length} سؤال · ${fmt.num(total)} درجة · ${settings.group || "كل الطلاب"}`}
        back="/staff/quizzes"
        actions={
          <>
            <IconButton icon="chart" label="النتائج" onClick={() => go(`/staff/quizzes/${id}/results`)} />
            <IconButton icon="settings" label="إعدادات الكويز" onClick={() => setSettingsOpen(true)} />
          </>
        }
      />
      <Card className="flex flex-wrap items-center gap-3">
        <Badge tone={st.tone}>{st.label}</Badge>
        <p className="min-w-0 flex-1 text-xs text-fog">
          {settings.limit ? `${settings.limit} دقيقة · ` : "بدون وقت محدد · "}
          {settings.attempts === "1" ? "محاولة واحدة" : `${settings.attempts} محاولات`}
          {quiz.closes_at ? ` · يغلق ${fmt.dateTime(quiz.closes_at)}` : ""}
        </p>
        {quiz.published && (
          <Button size="sm" icon="link" onClick={() => copyText(`${publicOrigin()}${APP_PATH}#/me/quiz/${id}`, "تم نسخ رابط الكويز")}>
            رابط للطلاب
          </Button>
        )}
      </Card>

      <div className="mt-4 grid gap-3">
        {qs.map((q, i) => (
          <QuestionCard
            key={q.id}
            q={q}
            index={i}
            count={qs.length}
            error={showErrors ? problems(q) : null}
            onChange={(patch) => editQ(q.id, patch)}
            onMove={(d) =>
              edit((list) => {
                const n = [...list];
                const j = i + d;
                if (j < 0 || j >= n.length) return list;
                [n[i], n[j]] = [n[j]!, n[i]!];
                return n;
              })
            }
            onRemove={() => edit((list) => list.filter((x) => x.id !== q.id))}
            onDuplicate={() => edit((list) => [...list.slice(0, i + 1), { ...q, id: uid() }, ...list.slice(i + 1)])}
          />
        ))}
      </div>

      <Section title="إضافة سؤال">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(KIND_LABEL) as QuestionKind[]).map((k) => (
            <Button key={k} icon="plus" onClick={() => edit((list) => [...list, blankQuestion(id, k, list.length)])}>
              {KIND_LABEL[k]}
            </Button>
          ))}
        </div>
      </Section>

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 flex gap-2 border-t border-[var(--line)] bg-abyss/90 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border">
        <Button variant={dirty ? "primary" : "secondary"} icon="check" loading={busy} onClick={() => save()} className="flex-1">
          {dirty ? "حفظ التعديلات" : "محفوظ"}
        </Button>
        {quiz.published ? (
          <Button onClick={() => save(false)} disabled={busy}>
            إيقاف النشر
          </Button>
        ) : (
          <Button variant="ok" icon="rocket" onClick={() => save(true)} disabled={busy}>
            نشر
          </Button>
        )}
      </div>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="إعدادات الكويز">
        <div className="grid gap-4">
          <Field label="عنوان الكويز">
            <Input
              value={settings.title}
              onChange={(e) => {
                setSettings({ ...settings, title: e.target.value });
                setDirty(true);
              }}
              maxLength={160}
            />
          </Field>
          <Field label="تعليمات للطلاب (اختياري)">
            <Textarea
              value={settings.description}
              onChange={(e) => {
                setSettings({ ...settings, description: e.target.value });
                setDirty(true);
              }}
              rows={2}
              maxLength={2000}
            />
          </Field>
          <Field label="يظهر لـ">
            <GroupSelect
              value={settings.group}
              onChange={(group) => {
                setSettings({ ...settings, group });
                setDirty(true);
              }}
              groups={groups}
              allLabel="كل الطلاب"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="يفتح (اختياري)">
              <Input
                type="datetime-local"
                value={settings.opens}
                onChange={(e) => {
                  setSettings({ ...settings, opens: e.target.value });
                  setDirty(true);
                }}
              />
            </Field>
            <Field label="يغلق (اختياري)">
              <Input
                type="datetime-local"
                value={settings.closes}
                onChange={(e) => {
                  setSettings({ ...settings, closes: e.target.value });
                  setDirty(true);
                }}
              />
            </Field>
            <Field label="الوقت (دقائق)" hint="فارغ = بدون حد">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                dir="ltr"
                value={settings.limit}
                onChange={(e) => {
                  setSettings({ ...settings, limit: e.target.value });
                  setDirty(true);
                }}
              />
            </Field>
            <Field label="عدد المحاولات">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                dir="ltr"
                value={settings.attempts}
                onChange={(e) => {
                  setSettings({ ...settings, attempts: e.target.value });
                  setDirty(true);
                }}
              />
            </Field>
          </div>
          <Toggle
            checked={settings.shuffle}
            onChange={(shuffle) => {
              setSettings({ ...settings, shuffle });
              setDirty(true);
            }}
            label="ترتيب عشوائي للأسئلة والاختيارات"
          />
          <Toggle
            checked={settings.show}
            onChange={(show) => {
              setSettings({ ...settings, show });
              setDirty(true);
            }}
            label="إظهار الإجابات الصحيحة بعد الانتهاء"
            hint="تظهر بعد آخر محاولة للطالب أو بعد إغلاق الكويز."
          />
          <Button variant="primary" icon="check" onClick={() => setSettingsOpen(false)} block>
            تم
          </Button>
          {(me.role !== "lead" || quiz.created_by === me.user_id) && (
            <Button variant="danger" icon="trash" onClick={remove} block>
              حذف الكويز
            </Button>
          )}
        </div>
      </Sheet>
    </>
  );
}

function toSettings(q: Quiz): Settings {
  return {
    title: q.title,
    description: q.description,
    group: q.group_name,
    opens: toLocalInput(q.opens_at),
    closes: toLocalInput(q.closes_at),
    limit: q.time_limit_min ? String(q.time_limit_min) : "",
    attempts: String(q.max_attempts),
    shuffle: q.shuffle,
    show: q.show_answers,
    published: q.published,
  };
}

function QuestionCard({
  q,
  index,
  count,
  error,
  onChange,
  onMove,
  onRemove,
  onDuplicate,
}: {
  q: Question;
  index: number;
  count: number;
  error: string | null;
  onChange: (p: Partial<Question>) => void;
  onMove: (d: number) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const setKind = (kind: QuestionKind) => {
    if (kind === q.kind) return;
    const choice = kind === "single" || kind === "multi";
    const wasChoice = q.kind === "single" || q.kind === "multi";
    onChange({
      kind,
      options: choice ? (wasChoice ? q.options : LETTERS.slice(0, 3).map((id) => ({ id, text: "" }))) : [],
      correct: kind === "truefalse" ? ["t"] : choice && wasChoice ? (kind === "single" ? q.correct.slice(0, 1) : q.correct) : [],
    });
  };
  const toggleCorrect = (oid: string) => onChange({ correct: q.kind === "single" ? [oid] : q.correct.includes(oid) ? q.correct.filter((c) => c !== oid) : [...q.correct, oid] });
  const addOption = () => {
    const next = LETTERS.find((l) => !q.options.some((o) => o.id === l));
    if (next) onChange({ options: [...q.options, { id: next, text: "" }] });
  };
  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const jpeg = await toJpeg(file);
      const path = `q/${uid()}.jpg`;
      await uploadObject(path, jpeg, "image/jpeg");
      onChange({ image_path: path });
    } catch (e) {
      toast.error(e);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className={cn("grid gap-3", error && "border-danger/50")}>
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] font-mono text-sm font-bold text-chalk">{index + 1}</span>
        <Select value={q.kind} onChange={(e) => setKind(e.target.value as QuestionKind)} className="h-10 flex-1 text-sm">
          {(Object.keys(KIND_LABEL) as QuestionKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-fog">
          درجة
          <input
            type="number"
            min={0}
            max={1000}
            step="0.5"
            value={q.points}
            onChange={(e) => onChange({ points: Number(e.target.value) })}
            className="h-10 w-16 rounded-lg border border-[var(--line-2)] bg-deep/80 text-center font-mono text-sm text-chalk outline-none focus:border-cyan/60"
            dir="ltr"
          />
        </label>
      </div>
      <Textarea value={q.prompt} onChange={(e) => onChange({ prompt: e.target.value })} rows={2} placeholder="نص السؤال" maxLength={4000} aria-label={`نص السؤال ${index + 1}`} />
      {q.image_path ? (
        <div className="relative">
          <img src={fileUrl(q.image_path)} alt="" className="max-h-56 w-full rounded-xl border border-[var(--line)] bg-white object-contain" />
          <IconButton icon="trash" label="إزالة الصورة" onClick={() => onChange({ image_path: null })} className="absolute end-2 top-2 bg-black/60 text-white" />
        </div>
      ) : null}

      {(q.kind === "single" || q.kind === "multi") && (
        <div className="grid gap-2">
          {q.options.map((o) => {
            const on = q.correct.includes(o.id);
            return (
              <div key={o.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleCorrect(o.id)}
                  aria-pressed={on}
                  aria-label="إجابة صحيحة"
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center border-2 transition",
                    q.kind === "single" ? "rounded-full" : "rounded-lg",
                    on ? "border-ok bg-ok text-[#04241a]" : "border-[var(--line-2)] text-transparent hover:border-ok/60",
                  )}
                >
                  <Icon name="check" size={18} />
                </button>
                <Input value={o.text} onChange={(e) => onChange({ options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} placeholder={`اختيار ${LETTERS.indexOf(o.id) + 1}`} className="h-10" />
                {q.options.length > 2 && <IconButton icon="close" label="حذف الاختيار" className="size-9" onClick={() => onChange({ options: q.options.filter((x) => x.id !== o.id), correct: q.correct.filter((c) => c !== o.id) })} />}
              </div>
            );
          })}
          {q.options.length < LETTERS.length && (
            <Button size="sm" variant="ghost" icon="plus" onClick={addOption} className="justify-self-start">
              اختيار آخر
            </Button>
          )}
          <p className="text-xs text-fog">{q.kind === "single" ? "اضغط على الدائرة بجانب الإجابة الصحيحة." : "حدّد كل الإجابات الصحيحة (لازم الطالب يختارهم كلهم)."}</p>
        </div>
      )}

      {q.kind === "truefalse" && (
        <div className="grid grid-cols-2 gap-2">
          {[
            ["t", "صح"],
            ["f", "خطأ"],
          ].map(([v, l]) => (
            <Button key={v} variant={q.correct[0] === v ? "ok" : "secondary"} onClick={() => onChange({ correct: [v!] })}>
              {l}
            </Button>
          ))}
        </div>
      )}

      {q.kind === "short" && (
        <Field label="الإجابات المقبولة" hint="سطر لكل صيغة مقبولة. التصحيح يتجاهل الحروف الكبيرة والتشكيل والهمزات.">
          <Textarea value={q.correct.join("\n")} onChange={(e) => onChange({ correct: e.target.value.split("\n") })} rows={2} dir="auto" />
        </Field>
      )}

      <details className="group">
        <summary className="cursor-pointer list-none text-xs font-medium text-fog hover:text-mist">+ شرح يظهر بعد التصحيح (اختياري)</summary>
        <Textarea value={q.explanation} onChange={(e) => onChange({ explanation: e.target.value })} rows={2} maxLength={2000} className="mt-2" />
      </details>

      {error && <p className="text-sm text-[#ff9aa5]">{error}</p>}

      <div className="flex items-center gap-1 border-t border-[var(--line)] pt-2">
        <IconButton icon="arrowUp" label="لأعلى" disabled={index === 0} onClick={() => onMove(-1)} />
        <IconButton icon="arrowDown" label="لأسفل" disabled={index === count - 1} onClick={() => onMove(1)} />
        <IconButton icon="image" label="صورة" disabled={uploading} onClick={() => fileInput.current?.click()} />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            pickImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <IconButton icon="copy" label="تكرار" onClick={onDuplicate} />
        <span className="flex-1" />
        <IconButton icon="trash" label="حذف السؤال" onClick={onRemove} className="text-[#ff8794]" />
      </div>
    </Card>
  );
}

/* ─── Results ──────────────────────────────────────────────────────────── */

type AttemptRow = Attempt & { students: { code: string; full_name: string; group_name: string } | null };

export function QuizResults({ id }: { id: string }) {
  const students = useStudents();
  const { data, error, loading, reload } = useAsync(async () => {
    const [quiz, questions, attempts] = await Promise.all([
      sb().from("quizzes").select("*").eq("id", id).single().then(must),
      sb().from("quiz_questions").select("*").eq("quiz_id", id).order("position").then(must),
      sb().from("quiz_attempts").select("*, students(code, full_name, group_name)").eq("quiz_id", id).order("started_at", { ascending: false }).then(must),
    ]);
    return { quiz: quiz as Quiz, questions: questions as Question[], attempts: attempts as AttemptRow[] };
  }, [id]);
  const [open, setOpen] = useState<AttemptRow | null>(null);

  const summary = useMemo(() => {
    if (!data) return null;
    const done = data.attempts.filter((a) => a.submitted_at && a.max_score);
    const best = new Map<string, AttemptRow>();
    for (const a of done) {
      const b = best.get(a.student_id);
      if (!b || (a.score ?? 0) > (b.score ?? 0)) best.set(a.student_id, a);
    }
    const pcts = [...best.values()].map((a) => ((a.score ?? 0) / (a.max_score || 1)) * 100);
    const perQ = data.questions.map((q) => {
      const answered = done.filter((a) => q.id in (a.results ?? {}));
      const right = answered.filter((a) => a.results[q.id]).length;
      return { q, right, total: answered.length };
    });
    const takers = new Set(data.attempts.map((a) => a.student_id));
    const pool = (students.list ?? []).filter((s) => s.active && (!data.quiz.group_name || s.group === data.quiz.group_name));
    return {
      best,
      avg: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0,
      max: pcts.length ? Math.max(...pcts) : 0,
      min: pcts.length ? Math.min(...pcts) : 0,
      count: best.size,
      inProgress: data.attempts.filter((a) => !a.submitted_at).length,
      perQ,
      missing: pool.filter((s) => !takers.has(s.id)),
    };
  }, [data, students.list]);

  const regrade = async () => {
    try {
      const n = await rpc<number>("staff_regrade_quiz", { p_quiz: id });
      toast(`تمت إعادة تصحيح ${n} محاولة`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  const reset = async (a: AttemptRow) => {
    if (!(await confirmDialog({ title: "حذف المحاولة؟", body: `${a.students?.full_name ?? ""} سيقدر يحل الكويز من جديد.`, ok: "حذف المحاولة", danger: true }))) return;
    try {
      must(await sb().from("quiz_attempts").delete().eq("id", a.id).select("id"));
      setOpen(null);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(`quiz-${data.quiz.title}.csv`, [
      ["الاسم", "رقم الطالب", "المجموعة", "الدرجة", "من", "النسبة", "تسليم", "متأخر"],
      ...data.attempts
        .filter((a) => a.submitted_at)
        .map((a) => [
          a.students?.full_name ?? "",
          a.students?.code ?? "",
          a.students?.group_name ?? "",
          a.score ?? 0,
          a.max_score ?? 0,
          `${Math.round(((a.score ?? 0) / (a.max_score || 1)) * 100)}%`,
          a.submitted_at ? fmt.dateTime(a.submitted_at) : "",
          a.late ? "نعم" : "",
        ]),
    ]);
  };

  if (error) return <ErrorBox error={error} retry={reload} />;
  if (loading && !data) return <Loading />;
  if (!data || !summary) return null;

  return (
    <>
      <TopBar
        title="النتائج"
        sub={data.quiz.title}
        back={`/staff/quizzes/${id}`}
        actions={
          <>
            <IconButton icon="refresh" label="إعادة التصحيح" onClick={regrade} />
            <IconButton icon="download" label="تنزيل النتائج" onClick={exportCsv} />
          </>
        }
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="حلّوا" value={summary.count} icon="users" sub={summary.inProgress ? `${summary.inProgress} يحل الآن` : undefined} />
        <Stat label="المتوسط" value={fmt.pct(summary.avg)} tone="info" />
        <Stat label="أعلى" value={fmt.pct(summary.max)} tone="ok" />
        <Stat label="أقل" value={fmt.pct(summary.min)} tone="warn" />
      </div>

      <Section title="درجات الطلاب">
        {!data.attempts.length ? (
          <Empty icon="quiz" title="لم يحل أحد بعد" body={data.quiz.published ? "النتائج تظهر هنا أول ما الطلاب يسلّموا." : "انشر الكويز علشان يظهر للطلاب."} />
        ) : (
          <List>
            {data.attempts.map((a) => {
              const pct = a.max_score ? ((a.score ?? 0) / a.max_score) * 100 : 0;
              return (
                <Row key={a.id} onClick={() => setOpen(a)}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-chalk">{a.students?.full_name ?? "—"}</p>
                      <p className="truncate text-xs text-fog">
                        <span dir="ltr" className="font-mono">
                          {a.students?.code}
                        </span>
                        {a.submitted_at ? ` · ${fmt.rel(a.submitted_at)}` : " · يحل الآن"}
                      </p>
                    </div>
                    {a.late && <Badge tone="warn">متأخر</Badge>}
                    {summary.best.get(a.student_id)?.id === a.id && data.quiz.max_attempts > 1 && <Badge tone="info">الأفضل</Badge>}
                    <span dir="ltr" className={cn("w-20 text-start font-mono text-[15px] font-semibold", !a.submitted_at ? "text-fog" : pct >= 75 ? "text-ok" : pct >= 50 ? "text-warn" : "text-[#ff8794]")}>
                      {a.submitted_at ? `${fmt.num(a.score)}/${fmt.num(a.max_score)}` : "…"}
                    </span>
                  </div>
                </Row>
              );
            })}
          </List>
        )}
      </Section>

      {summary.perQ.length > 0 && data.attempts.some((a) => a.submitted_at) && (
        <Section title="الأسئلة">
          <List>
            {summary.perQ.map(({ q, right, total }, i) => (
              <div key={q.id} className="grid gap-2 px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className="font-mono text-xs text-fog">{i + 1}</span>
                  <p className="line-clamp-2 flex-1 text-sm text-chalk">{q.prompt}</p>
                  <span className="font-mono text-xs text-mist">{total ? fmt.pct((right / total) * 100) : "—"}</span>
                </div>
                <Bar value={total ? (right / total) * 100 : 0} tone={total && right / total < 0.5 ? "warn" : "ok"} />
              </div>
            ))}
          </List>
        </Section>
      )}

      {summary.missing.length > 0 && (
        <Section title={`لم يحلوا بعد (${summary.missing.length})`}>
          <Card className="text-sm leading-loose text-mist">{summary.missing.map((s) => s.name).join("، ")}</Card>
        </Section>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.students?.full_name ?? ""} wide>
        {open && (
          <div className="grid gap-3">
            <p className="text-sm text-fog">
              {open.submitted_at ? `سلّم ${fmt.dateTime(open.submitted_at)} · ${fmt.num(open.score)} من ${fmt.num(open.max_score)}` : `بدأ ${fmt.dateTime(open.started_at)} ولم يسلّم بعد`}
            </p>
            <List>
              {data.questions
                .filter((q) => open.question_ids.includes(q.id))
                .map((q, i) => {
                  const given = open.answers?.[q.id];
                  const ok = open.results?.[q.id];
                  const label = (v: string) => (q.kind === "truefalse" ? (v === "t" ? "صح" : "خطأ") : (q.options.find((o) => o.id === v)?.text ?? v));
                  return (
                    <div key={q.id} className="grid gap-1 px-4 py-3">
                      <div className="flex items-start gap-2">
                        <Icon name={ok ? "checkCircle" : "xCircle"} size={18} className={cn("mt-0.5 shrink-0", ok ? "text-ok" : "text-[#ff8794]")} />
                        <p className="flex-1 text-sm text-chalk">
                          {i + 1}. {q.prompt}
                        </p>
                      </div>
                      <p className="ps-6 text-xs text-fog">
                        إجابته: {given == null || given === "" ? "—" : Array.isArray(given) ? given.map(label).join("، ") : given}
                      </p>
                    </div>
                  );
                })}
            </List>
            <Button variant="danger" icon="refresh" onClick={() => reset(open)} block>
              حذف المحاولة (يسمح بالحل من جديد)
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}
