"use client";
/**
 * Tasks (assignments): coaches post a task with a due date for a group; students hand in text, a
 * link and up to five files from the app; coaches grade with feedback and the grade counts towards
 * points. See 20261008120000_assignments.sql and the student-upload Edge Function.
 */
import { useMemo, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { errorText, fmt, fromLocalInput, must, prepareImage, rpc, sb, studentRpc, studentRpcOffline, studentStore, toLocalInput, type StaffRow } from "./core";
import { GroupSelect, groupsOf, useStudents } from "./staff-data";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Icon, IconButton, Input, List, Loading, Row, Section, Sheet, Textarea, Toggle, TopBar, confirmDialog, go, toast, useAsync } from "./ui";

const MAX_FILES = 5;
const MAX_BYTES = 20 * 1024 * 1024;

type MyFile = { name: string; size: number };
type MySubmission = { submittedAt: string; late: boolean; body: string; link: string | null; files: MyFile[]; grade: number | null; feedback: string; gradedAt: string | null };
export type StudentTask = { id: string; title: string; description: string; dueAt: string | null; maxPoints: number; allowLate: boolean; submission: MySubmission | null };

const overdue = (t: { dueAt: string | null }) => !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();

function taskState(t: StudentTask): { label: string; tone: "ok" | "warn" | "danger" | "info" | "muted" } {
  if (t.submission?.grade != null) return { label: `${+t.submission.grade}/${t.maxPoints}`, tone: "ok" };
  if (t.submission) return { label: t.submission.late ? "اتسلّم متأخر" : "اتسلّم", tone: "info" };
  if (overdue(t)) return t.allowLate ? { label: "متأخر", tone: "warn" } : { label: "انتهى", tone: "danger" };
  return { label: "مطلوب", tone: "muted" };
}

export function useStudentTasks() {
  return useAsync(() => studentRpcOffline<StudentTask[]>("student_tasks"), []);
}

/** Student home: the tasks still to hand in. */
export function TasksCard() {
  const { data } = useStudentTasks();
  const open = (data ?? []).filter((t) => !t.submission && (!overdue(t) || t.allowLate));
  if (!open.length) return null;
  const next = open.find((t) => t.dueAt) ?? open[0];
  return (
    <a href="#/me/tasks" className="mt-3 flex items-center gap-4 rounded-3xl border border-[var(--line-2)] bg-panel/70 p-5">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-cyan/15 text-cyan">
        <Icon name="upload" size={26} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-chalk">{open.length === 1 ? "تاسك مطلوب منك" : `${open.length} تاسكات مطلوبة منك`}</p>
        <p className="mt-0.5 truncate text-xs text-fog">
          {next.title}
          {next.dueAt ? ` · آخر ميعاد ${fmt.dateTime(next.dueAt)}` : ""}
        </p>
      </div>
      <Icon name="chevron" size={18} className="rotate-180 text-fog" />
    </a>
  );
}

/** /me/tasks and /me/tasks/<id> */
export function StudentTasks({ id }: { id?: string }) {
  const { data, error, loading, reload } = useStudentTasks();
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error ?? "مقدرناش نحمّل التاسكات"} retry={reload} />;
  if (id) {
    const t = data.find((x) => x.id === id);
    return t ? <StudentTaskDetail key={t.id} t={t} onDone={reload} /> : <Empty icon="file" title="التاسك ده مش موجود" />;
  }
  return (
    <>
      <TopBar title="التاسكات" sub="سلّم شغلك والمدرب هيصحّحه" />
      {!data.length ? (
        <Empty icon="upload" title="مفيش تاسكات لسه" body="لما المدرب ينزّل تاسك لمجموعتك هيظهر هنا." />
      ) : (
        <List>
          {data.map((t) => {
            const s = taskState(t);
            return (
              <Row key={t.id} onClick={() => go(`/me/tasks/${t.id}`)}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-chalk">{t.title}</p>
                    <p className="truncate text-xs text-fog">{t.dueAt ? `آخر ميعاد ${fmt.dateTime(t.dueAt)}` : "من غير ميعاد"} · {t.maxPoints} درجة</p>
                  </div>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </div>
              </Row>
            );
          })}
        </List>
      )}
    </>
  );
}

type Picked = { file: File; name: string };

async function uploadTaskFile(assignment: string, file: File): Promise<{ path: string; name: string; size: number; mime: string }> {
  let blob: Blob = file;
  let type = file.type || "application/octet-stream";
  let name = file.name || "file";
  let ext = name.includes(".") ? name.split(".").pop()! : "bin";
  // Photos are shrunk on the phone first, like everywhere else in the app.
  if (/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || /\.(heic|heif)$/i.test(name)) {
    const img = await prepareImage(file, { maxEdge: 2000 });
    blob = img.main;
    type = img.type;
    ext = img.ext;
    name = `${name.replace(/\.[^.]+$/, "")}.${ext}`;
  }
  if (blob.size > MAX_BYTES) throw new Error("too_big");
  const s = studentStore.get();
  if (!s) throw new Error("session_invalid");
  const { data, error } = await sb().functions.invoke<{ ok: boolean; path: string; token: string; error?: string }>("student-upload", {
    body: { token: s.token, assignment, ext, size: blob.size },
  });
  if (error) {
    let code = "";
    try {
      code = ((await (error as { context?: Response }).context?.json()) as { error?: string })?.error ?? "";
    } catch {
      /* not JSON */
    }
    throw new Error(code || error.message);
  }
  if (!data?.ok) throw new Error(data?.error ?? "upload_failed");
  const up = await sb().storage.from("submissions").uploadToSignedUrl(data.path, data.token, blob, { contentType: type });
  if (up.error) throw up.error;
  return { path: data.path, name, size: blob.size, mime: type };
}

const SUBMIT_ERRORS: Record<string, string> = {
  graded: "التاسك اتصحّح خلاص، مينفعش تغيّر التسليم.",
  closed: "ميعاد التسليم خلص.",
  empty: "اكتب حاجة أو حط لينك أو ارفع ملف.",
  too_big: "الملف أكبر من 20 ميجا.",
  rate_limited: "رفعت ملفات كتير. استنى شوية وجرّب تاني.",
  not_found: "التاسك ده مش متاح.",
  bad_file: "فيه ملف مرفعش صح. جرّب تاني.",
  invalid: "راجع اللينك: لازم يبدأ بـ https://",
};

function StudentTaskDetail({ t, onDone }: { t: StudentTask; onDone: () => void }) {
  const sub = t.submission;
  const graded = sub?.grade != null;
  const closed = overdue(t) && !t.allowLate;
  const [editing, setEditing] = useState(!sub && !closed);
  const [body, setBody] = useState(sub?.body ?? "");
  const [link, setLink] = useState(sub?.link ?? "");
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const pick = (list: FileList | null) => {
    const add = Array.from(list ?? []).map((file) => ({ file, name: file.name }));
    const next = [...files, ...add].slice(0, MAX_FILES);
    if (files.length + add.length > MAX_FILES) toast(`أقصى عدد ${MAX_FILES} ملفات`, "error");
    setFiles(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (link.trim() && !/^https?:\/\/\S+$/.test(link.trim())) return toast(SUBMIT_ERRORS.invalid, "error");
    try {
      const uploaded = [];
      for (const [i, p] of files.entries()) {
        setBusy(`بيرفع ${i + 1} من ${files.length}…`);
        uploaded.push(await uploadTaskFile(t.id, p.file));
      }
      setBusy("بيسلّم…");
      const r = await studentRpc<{ ok: boolean; error?: string; late?: boolean }>("student_submit", { p_assignment: t.id, p_body: body, p_link: link.trim(), p_files: uploaded });
      if (!r.ok) throw new Error(r.error ?? "failed");
      toast(r.late ? "اتسلّم (متأخر)" : "اتسلّم ✓");
      setFiles([]);
      setEditing(false);
      onDone();
    } catch (e2) {
      const code = (e2 as Error)?.message ?? "";
      toast(SUBMIT_ERRORS[code] ?? errorText(e2), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <TopBar title={t.title} sub={`${t.dueAt ? `آخر ميعاد ${fmt.dateTime(t.dueAt)}` : "من غير ميعاد"} · ${t.maxPoints} درجة`} back="/me/tasks" />
      {t.description && (
        <Card>
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-mist">{t.description}</p>
        </Card>
      )}

      {graded && (
        <Card className="mt-3 border-ok/30 bg-ok/[0.05]">
          <p className="flex items-center gap-2 font-semibold text-chalk">
            <Icon name="check" size={18} className="text-ok" />
            الدرجة: <span className="font-mono text-xl">{+sub!.grade!}</span> / {t.maxPoints}
          </p>
          {sub!.feedback && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-mist">{sub!.feedback}</p>}
        </Card>
      )}

      {sub && !editing && (
        <Section title="تسليمك">
          <Card className="grid gap-2">
            <p className="text-xs text-fog">
              اتسلّم {fmt.dateTime(sub.submittedAt)}
              {sub.late ? " · متأخر" : ""}
            </p>
            {sub.body && <p className="whitespace-pre-line text-sm text-mist">{sub.body}</p>}
            {sub.link && (
              <a href={sub.link} target="_blank" rel="noreferrer" className="truncate text-sm text-cyan underline" dir="ltr">
                {sub.link}
              </a>
            )}
            {sub.files.map((f, i) => (
              <p key={i} className="flex items-center gap-2 text-sm text-mist">
                <Icon name="file" size={16} className="text-fog" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-fog">{fmt.size(f.size)}</span>
              </p>
            ))}
            {!graded && !closed && (
              <Button className="mt-2" icon="edit" onClick={() => setEditing(true)}>
                عدّل التسليم
              </Button>
            )}
          </Card>
        </Section>
      )}

      {!sub && closed && <Card className="mt-3 border-danger/30 text-sm text-[#ff9aa5]">ميعاد التسليم خلص.</Card>}

      {editing && !graded && (
        <form onSubmit={submit} className="mt-3 grid gap-3">
          <Field label="ردّك (اختياري)">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} className="min-h-28" />
          </Field>
          <Field label="لينك (اختياري)" hint="GitHub أو Google Drive أو فيديو…">
            <Input value={link} onChange={(e) => setLink(e.target.value)} dir="ltr" placeholder="https://" inputMode="url" />
          </Field>
          <div className="grid gap-2">
            <span className="text-[13px] font-medium text-mist">ملفات وصور (لحد {MAX_FILES}، كل واحد لحد 20 ميجا)</span>
            {files.map((p, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm text-mist">
                <Icon name="file" size={16} className="text-fog" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="text-xs text-fog">{fmt.size(p.file.size)}</span>
                <IconButton icon="close" label="شيل" onClick={() => setFiles(files.filter((_, j) => j !== i))} />
              </div>
            ))}
            {sub && sub.files.length > 0 && !files.length && <p className="text-xs text-fog">لو رفعت ملفات جديدة هتحل محل القديمة ({sub.files.length}). لو مرفعتش، القديمة هتتشال من التسليم.</p>}
            {files.length < MAX_FILES && (
              <label className="inline-flex">
                <input type="file" multiple className="sr-only" onChange={(e) => pick(e.target.files)} />
                <span className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[var(--line-2)] px-4 text-sm font-semibold text-chalk">
                  <Icon name="upload" size={18} />
                  اختار ملفات أو صور
                </span>
              </label>
            )}
          </div>
          <Button type="submit" variant="primary" size="lg" block loading={!!busy}>
            {busy ?? (sub ? "سلّم التعديل" : "سلّم")}
          </Button>
          {sub && (
            <Button type="button" onClick={() => setEditing(false)} disabled={!!busy}>
              إلغاء
            </Button>
          )}
        </form>
      )}
    </>
  );
}

/* ─── Staff ────────────────────────────────────────────────────────────── */

type Assignment = { id: string; title: string; description: string; group_name: string; due_at: string | null; max_points: number; allow_late: boolean; published: boolean; created_at: string };
type AssignmentRow = Assignment & { assignment_submissions: { id: string; grade: number | null }[] };
type SubFile = { path: string; name: string; size: number; mime: string };
type Submission = { id: string; assignment_id: string; student_id: string; body: string; link: string | null; files: SubFile[]; submitted_at: string; late: boolean; grade: number | null; feedback: string; graded_at: string | null };

/** /staff/tasks */
export function TasksScreen({ me }: { me: StaffRow }) {
  const { data, error, loading, reload } = useAsync(async () => must(await sb().from("assignments").select("*, assignment_submissions(id, grade)").order("created_at", { ascending: false }).limit(200)) as AssignmentRow[], []);
  const [editing, setEditing] = useState<Assignment | "new" | null>(null);
  return (
    <>
      <TopBar
        title="التاسكات"
        sub="تاسك بميعاد، الطلاب يسلّموا من التطبيق، وانت تصحّح"
        back="/staff/more"
        actions={
          <Button size="sm" variant="primary" icon="plus" onClick={() => setEditing("new")}>
            تاسك
          </Button>
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty icon="upload" title="مفيش تاسكات" body="اعمل أول تاسك: مثلاً «صوّر الدايرة اللي عملتها في السيشن» بميعاد تسليم." action={<Button variant="primary" icon="plus" onClick={() => setEditing("new")}>تاسك جديد</Button>} />
      ) : (
        <List>
          {data.map((a) => {
            const subs = a.assignment_submissions ?? [];
            const toGrade = subs.filter((s) => s.grade == null).length;
            return (
              <Row key={a.id} onClick={() => go(`/staff/tasks/${a.id}`)}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-chalk">
                      {a.title}
                      {!a.published && <span className="ms-2 text-xs text-fog">(مخفي)</span>}
                    </p>
                    <p className="truncate text-xs text-fog">
                      {a.group_name || "كل المجموعات"} · {a.due_at ? `آخر ميعاد ${fmt.dateTime(a.due_at)}` : "من غير ميعاد"} · {subs.length} تسليم
                    </p>
                  </div>
                  {toGrade > 0 && <Badge tone="warn">{toGrade} مستني تصحيح</Badge>}
                </div>
              </Row>
            );
          })}
        </List>
      )}
      {editing && (
        <TaskSheet
          me={me}
          task={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            if (id) go(`/staff/tasks/${id}`);
            else reload();
          }}
        />
      )}
    </>
  );
}

function TaskSheet({ task, onClose, onSaved }: { me: StaffRow; task: Assignment | null; onClose: () => void; onSaved: (id?: string) => void }) {
  const students = useStudents();
  const groups = useMemo(() => groupsOf(students.list), [students.list]);
  const [f, setF] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    group_name: task?.group_name ?? "",
    due_at: toLocalInput(task?.due_at ?? null),
    max_points: String(task?.max_points ?? 10),
    allow_late: task?.allow_late ?? true,
    published: task?.published ?? true,
  });
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (f.title.trim().length < 2) return toast("اكتب عنوان التاسك", "error");
    const max = parseInt(f.max_points, 10);
    if (!(max >= 1 && max <= 1000)) return toast("الدرجة من 1 لـ 1000", "error");
    setBusy(true);
    try {
      const row = { title: f.title.trim(), description: f.description.trim(), group_name: f.group_name, due_at: fromLocalInput(f.due_at), max_points: max, allow_late: f.allow_late, published: f.published };
      if (task) {
        await sb().from("assignments").update(row).eq("id", task.id).then(must);
        toast("اتحفظ");
        onSaved();
      } else {
        const created = must(await sb().from("assignments").insert(row).select("id").single()) as { id: string };
        toast("اتعمل التاسك");
        onSaved(created.id);
      }
    } catch (e2) {
      toast(errorText(e2), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={task ? "تعديل التاسك" : "تاسك جديد"}>
      <form onSubmit={save} className="grid gap-3">
        <Field label="العنوان">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={140} placeholder="صوّر الدايرة اللي عملتها" />
        </Field>
        <Field label="المطلوب (اختياري)">
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={4000} className="min-h-24" />
        </Field>
        <Field label="المجموعة">
          <GroupSelect value={f.group_name} onChange={(v) => setF({ ...f, group_name: v })} groups={groups} allLabel="كل المجموعات" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="آخر ميعاد (اختياري)">
            <Input type="datetime-local" value={f.due_at} onChange={(e) => setF({ ...f, due_at: e.target.value })} />
          </Field>
          <Field label="الدرجة من">
            <Input type="number" inputMode="numeric" min={1} max={1000} value={f.max_points} onChange={(e) => setF({ ...f, max_points: e.target.value })} dir="ltr" />
          </Field>
        </div>
        <Toggle checked={f.allow_late} onChange={(v) => setF({ ...f, allow_late: v })} label="يقبل تسليم متأخر" hint="بيتعلّم عليه «متأخر»." />
        <Toggle checked={f.published} onChange={(v) => setF({ ...f, published: v })} label="ظاهر للطلاب" />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          حفظ
        </Button>
      </form>
    </Sheet>
  );
}

/** /staff/tasks/<id> — who handed in, and grading. */
export function TaskSubmissions({ id, me }: { id: string; me: StaffRow }) {
  const students = useStudents();
  const { data, error, loading, reload } = useAsync(async () => {
    const [a, subs] = await Promise.all([
      sb().from("assignments").select("*").eq("id", id).maybeSingle().then(must),
      sb().from("assignment_submissions").select("*").eq("assignment_id", id).then(must),
    ]);
    return { a: a as Assignment | null, subs: subs as Submission[] };
  }, [id]);
  const [filter, setFilter] = useState<"all" | "todo" | "missing">("all");
  const [open, setOpen] = useState<Submission | null>(null);
  const [editing, setEditing] = useState(false);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error ?? "مقدرناش نحمّل التاسك"} retry={reload} />;
  const a = data.a;
  if (!a) return <Empty icon="file" title="التاسك ده اتمسح" />;
  const byStudent = new Map(data.subs.map((s) => [s.student_id, s]));
  const roster = (students.list ?? []).filter((s) => s.active && (!a.group_name || s.group === a.group_name));
  const extra = data.subs.filter((s) => !roster.some((r) => r.id === s.student_id));
  const rows = [...roster.map((s) => ({ id: s.id, name: s.name, code: s.code, sub: byStudent.get(s.id) ?? null })), ...extra.map((s) => ({ id: s.student_id, name: "طالب", code: "", sub: s }))]
    .filter((r) => (filter === "todo" ? r.sub && r.sub.grade == null : filter === "missing" ? !r.sub : true))
    .sort((x, y) => Number(!!y.sub && y.sub.grade == null) - Number(!!x.sub && x.sub.grade == null) || x.name.localeCompare(y.name, "ar"));
  const remove = async () => {
    if (!(await confirmDialog({ title: "مسح التاسك؟", body: "هتتمسح كل التسليمات والدرجات بتاعته.", ok: "مسح", danger: true }))) return;
    try {
      await sb().from("assignments").delete().eq("id", a.id).then(must);
      toast("اتمسح");
      go("/staff/tasks");
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  return (
    <>
      <TopBar
        title={a.title}
        sub={`${a.group_name || "كل المجموعات"} · ${a.due_at ? `آخر ميعاد ${fmt.dateTime(a.due_at)}` : "من غير ميعاد"} · من ${a.max_points}`}
        back="/staff/tasks"
        actions={
          <>
            <IconButton icon="edit" label="تعديل" onClick={() => setEditing(true)} />
            <IconButton icon="trash" label="مسح" onClick={remove} />
          </>
        }
      />
      <div className="grid grid-cols-3 gap-2">
        <Card className="text-center">
          <p className="font-mono text-2xl font-bold text-chalk">{data.subs.length}</p>
          <p className="text-xs text-fog">سلّموا</p>
        </Card>
        <Card className="text-center">
          <p className="font-mono text-2xl font-bold text-warn">{data.subs.filter((s) => s.grade == null).length}</p>
          <p className="text-xs text-fog">مستني تصحيح</p>
        </Card>
        <Card className="text-center">
          <p className="font-mono text-2xl font-bold text-fog">{Math.max(0, roster.length - roster.filter((r) => byStudent.has(r.id)).length)}</p>
          <p className="text-xs text-fog">مسلّموش</p>
        </Card>
      </div>
      <div className="mt-3 flex gap-2">
        {(
          [
            ["all", "الكل"],
            ["todo", "مستني تصحيح"],
            ["missing", "مسلّموش"],
          ] as const
        ).map(([k, label]) => (
          <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
            {label}
          </Chip>
        ))}
      </div>
      <List className="mt-3">
        {rows.map((r) => (
          <Row key={r.id} onClick={r.sub ? () => setOpen(r.sub) : undefined} chevron={!!r.sub}>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-chalk">
                  <bdi>{r.name}</bdi>
                </p>
                <p className="truncate text-xs text-fog">{r.sub ? `${fmt.dateTime(r.sub.submitted_at)}${r.sub.late ? " · متأخر" : ""} · ${r.sub.files.length} ملف` : r.code}</p>
              </div>
              {r.sub ? (
                r.sub.grade != null ? (
                  <Badge tone="ok">
                    {+r.sub.grade}/{a.max_points}
                  </Badge>
                ) : (
                  <Badge tone="warn">صحّح</Badge>
                )
              ) : (
                <Badge>مسلّمش</Badge>
              )}
            </div>
          </Row>
        ))}
      </List>
      {open && (
        <GradeSheet
          sub={open}
          max={a.max_points}
          name={(students.list ?? []).find((s) => s.id === open.student_id)?.name ?? "طالب"}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            reload();
          }}
        />
      )}
      {editing && (
        <TaskSheet
          me={me}
          task={a}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function GradeSheet({ sub, max, name, onClose, onDone }: { sub: Submission; max: number; name: string; onClose: () => void; onDone: () => void }) {
  const [grade, setGrade] = useState(sub.grade == null ? "" : String(+sub.grade));
  const [feedback, setFeedback] = useState(sub.feedback);
  const [busy, setBusy] = useState(false);
  const openFile = async (f: SubFile) => {
    const { data, error } = await sb().storage.from("submissions").createSignedUrl(f.path, 600, { download: f.name });
    if (error || !data) return toast(errorText(error), "error");
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const save = async (clear = false) => {
    const g = clear ? null : Number(grade);
    if (!clear && (grade.trim() === "" || !(g! >= 0 && g! <= max))) return toast(`الدرجة من 0 لـ ${max}`, "error");
    setBusy(true);
    try {
      const r = await rpc<{ ok: boolean; error?: string }>("staff_grade_submission", { p_submission: sub.id, p_grade: g, p_feedback: feedback });
      if (!r.ok) throw new Error(r.error === "range" ? `الدرجة من 0 لـ ${max}` : "مقدرناش نحفظ");
      toast(clear ? "اتشالت الدرجة" : "اتحفظت الدرجة ✓");
      onDone();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`تسليم ${name}`}>
      <div className="grid gap-3">
        <p className="text-xs text-fog">
          {fmt.dateTime(sub.submitted_at)}
          {sub.late ? " · متأخر" : ""}
        </p>
        {sub.body && <p className="whitespace-pre-line rounded-xl bg-white/[0.04] p-3 text-sm text-mist">{sub.body}</p>}
        {sub.link && (
          <a href={sub.link} target="_blank" rel="noreferrer" className="truncate text-sm text-cyan underline" dir="ltr">
            {sub.link}
          </a>
        )}
        {sub.files.map((f, i) => (
          <button key={i} type="button" onClick={() => openFile(f)} className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-start text-sm text-mist hover:border-cyan/40">
            <Icon name={f.mime.startsWith("image/") ? "image" : "file"} size={16} className="text-cyan" />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="text-xs text-fog">{fmt.size(f.size)}</span>
          </button>
        ))}
        <Field label={`الدرجة (من ${max})`}>
          <Input type="number" inputMode="decimal" min={0} max={max} step="0.5" value={grade} onChange={(e) => setGrade(e.target.value)} dir="ltr" className="font-mono" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {[max, Math.round(max * 0.8), Math.round(max * 0.5)].filter((v, i, l) => l.indexOf(v) === i).map((v) => (
            <Chip key={v} active={grade === String(v)} onClick={() => setGrade(String(v))}>
              {v}
            </Chip>
          ))}
        </div>
        <Field label="ملاحظاتك للطالب (اختياري)">
          <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={2000} className="min-h-20" />
        </Field>
        <Button variant="primary" size="lg" block loading={busy} onClick={() => save()}>
          حفظ الدرجة
        </Button>
        {sub.grade != null && (
          <Button className={cn("text-fog")} disabled={busy} onClick={() => save(true)}>
            شيل الدرجة (يقدر يعدّل التسليم)
          </Button>
        )}
      </div>
    </Sheet>
  );
}
