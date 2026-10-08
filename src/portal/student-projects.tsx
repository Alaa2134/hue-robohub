"use client";
/**
 * Students' projects on the website, and joining competition teams.
 *   /me/projects     the student sends a project (title, what it does, a link, a photo) and sees what
 *                    happened to the ones they sent; open team tryouts and forms are listed too.
 *   /staff/projects  whoever handles website content publishes a project on the site's projects page
 *                    (the photo is copied to the public site bucket) or declines it with a note.
 * See supabase/migrations/20261009140000_student_projects.sql.
 */
import { useState, type FormEvent } from "react";
import { BASE_PATH, can, errorText, fmt, isNative, must, prepareImage, publicOrigin, rpc, sb, studentRpc, studentStore, uploadImage, type StaffRow } from "./core";
import { Badge, Button, Card, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, Section, Textarea, TopBar, toast, useAsync } from "./ui";

type Mine = { id: string; title: string; status: "pending" | "published" | "declined"; note: string | null; at: string; slug: string | null };
type OpenForm = { slug: string; title_ar: string; intro_ar: string | null; team: string | null; open: boolean };

const STATUS: Record<Mine["status"], { label: string; tone: "info" | "ok" | "muted" }> = {
  pending: { label: "مستني المراجعة", tone: "info" },
  published: { label: "اتنشر على الموقع ✓", tone: "ok" },
  declined: { label: "متنشرش", tone: "muted" },
};

const ERRORS: Record<string, string> = {
  too_many: "عندك 3 مشاريع مستنية المراجعة. استنى لما يتراجعوا.",
  rate_limited: "بعت كتير النهارده. جرّب بكرة.",
  photo: "الصورة مترفعتش صح. جرّب تاني.",
  invalid: "اكتب اسم المشروع (3 حروف على الأقل) ولينك يبدأ بـ https.",
  type: "الصورة لازم تكون JPG أو PNG أو WebP.",
  too_big: "الصورة كبيرة أوي.",
};

async function uploadPhoto(file: File) {
  const img = await prepareImage(file, { maxEdge: 1800 });
  const s = studentStore.get();
  if (!s) throw new Error("session_invalid");
  const { data, error } = await sb().functions.invoke<{ ok: boolean; path: string; token: string; error?: string }>("student-upload", {
    body: { token: s.token, kind: "project", ext: img.ext, size: img.main.size },
  });
  if (error || !data?.ok) {
    let code = data?.error ?? "";
    try {
      code ||= ((await (error as { context?: Response } | null)?.context?.json()) as { error?: string })?.error ?? "";
    } catch {
      /* not JSON */
    }
    throw new Error(code || "upload_failed");
  }
  const up = await sb().storage.from("submissions").uploadToSignedUrl(data.path, data.token, img.main, { contentType: img.type });
  if (up.error) throw up.error;
  return data.path;
}

/** Site page for a form (the store app opens it in the phone's browser). */
const formUrl = (slug: string) => `${isNative() ? publicOrigin() : BASE_PATH}/ar/form/?f=${encodeURIComponent(slug)}`;

/** /me/projects */
export function StudentProjects() {
  const mine = useAsync(() => studentRpc<Mine[]>("student_projects_mine"), []);
  const forms = useAsync(async () => ((await rpc<OpenForm[]>("public_forms")) ?? []).filter((f) => f.open), []);
  const [f, setF] = useState({ title: "", description: "", url: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (f.title.trim().length < 3) return toast(ERRORS.invalid!, "error");
    setBusy(true);
    try {
      const path = photo ? await uploadPhoto(photo) : null;
      const r = await studentRpc<{ ok: boolean; error?: string }>("student_project_submit", {
        p_title: f.title.trim(),
        p_description: f.description.trim(),
        p_url: f.url.trim() || null,
        p_photo: path,
      });
      if (!r.ok) throw new Error(r.error);
      toast("اتبعت ✓ الفريق هيراجعه وينشره على الموقع");
      setF({ title: "", description: "", url: "" });
      setPhoto(null);
      mine.reload();
    } catch (e2) {
      toast(ERRORS[(e2 as Error).message] ?? errorText(e2), "error");
    } finally {
      setBusy(false);
    }
  };

  const teams = (forms.data ?? []).filter((x) => x.team);
  const other = (forms.data ?? []).filter((x) => !x.team);
  return (
    <>
      <TopBar title="مشاريعي والفرق" back="/me/account" />
      <Card>
        <form onSubmit={send} className="grid gap-3">
          <p className="font-semibold text-chalk">اعرض مشروعك على موقع BuildX HUE</p>
          <p className="text-xs leading-relaxed text-fog">روبوت عملته، كود، فيديو… ابعته والفريق يراجعه وينشره في صفحة المشاريع باسمك.</p>
          <Field label="اسم المشروع">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} required />
          </Field>
          <Field label="بيعمل إيه؟">
            <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} className="min-h-24" />
          </Field>
          <Field label="لينك (GitHub، فيديو، Drive…) — اختياري">
            <Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} dir="ltr" inputMode="url" placeholder="https://" />
          </Field>
          <Field label="صورة المشروع — اختياري">
            <Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </Field>
          <Button type="submit" variant="primary" icon="upload" loading={busy}>
            ابعت المشروع
          </Button>
        </form>
      </Card>

      {!!mine.data?.length && (
        <Section title="اللي بعته">
          <List>
            {mine.data.map((p) => (
              <Row key={p.id} chevron={false}>
                <div className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-semibold text-chalk">{p.title}</p>
                    <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                  </div>
                  <p className="text-xs text-fog">{fmt.rel(p.at)}</p>
                  {p.note && <p className="text-sm text-mist">{p.note}</p>}
                  {p.slug && (
                    <a href={`${isNative() ? publicOrigin() : BASE_PATH}/ar/projects/${p.slug}/`} target="_blank" rel="noreferrer" className="text-sm text-cyan">
                      شوفه على الموقع
                    </a>
                  )}
                </div>
              </Row>
            ))}
          </List>
        </Section>
      )}

      <Section title="فرق المسابقات">
        {forms.loading && !forms.data ? (
          <Loading />
        ) : !teams.length ? (
          <Empty icon="users" title="مفيش اختبارات فرق مفتوحة دلوقتي" body="لما فريق مسابقة يفتح باب الانضمام هيظهر هنا." />
        ) : (
          <List>
            {teams.map((x) => (
              <a key={x.slug} href={formUrl(x.slug)} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                <Icon name="star" size={20} className="shrink-0 text-gold" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-chalk">{x.title_ar}</span>
                  {x.intro_ar && <span className="block truncate text-xs text-fog">{x.intro_ar}</span>}
                </span>
                <span className="text-sm font-semibold text-cyan">قدّم</span>
              </a>
            ))}
          </List>
        )}
      </Section>
      {!!other.length && (
        <Section title="فورمات مفتوحة">
          <List>
            {other.map((x) => (
              <a key={x.slug} href={formUrl(x.slug)} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                <Icon name="list" size={20} className="shrink-0 text-cyan" />
                <span className="min-w-0 flex-1 truncate text-chalk">{x.title_ar}</span>
                <Icon name="chevron" size={16} className="rotate-180 text-fog" />
              </a>
            ))}
          </List>
        </Section>
      )}
    </>
  );
}

type Pending = { id: string; title: string; description: string; url: string | null; photo: string | null; at: string; student: string; group: string };

export const pendingStudentProjects = async () => (await rpc<Pending[]>("staff_student_projects")).length;

/** Copies a student's photo from the private bucket into the website's (compressed, with a thumbnail). */
async function publishPhoto(me: StaffRow, path: string) {
  const { data, error } = await sb().storage.from("submissions").download(path);
  if (error || !data) throw error ?? new Error("photo");
  return (await uploadImage("site", me.user_id, data, { maxEdge: 1800 })).path;
}

const slugOf = (s: string) =>
  `student-${s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "project"}-${Math.random().toString(36).slice(2, 6)}`;

/** /staff/projects */
export function StudentProjectsReview({ me }: { me: StaffRow }) {
  const list = useAsync(() => rpc<Pending[]>("staff_student_projects"), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const publisher = can(me, "publish");

  const publish = async (p: Pending) => {
    setBusy(p.id);
    try {
      const image_path = p.photo ? await publishPhoto(me, p.photo) : null;
      const row = must(
        await sb()
          .from("site_content")
          .insert({
            kind: "project",
            slug: slugOf(p.title),
            title: p.title,
            title_ar: p.title,
            summary_ar: `${p.description.slice(0, 560)}${p.description.length > 560 ? "…" : ""}`.trim() || null,
            body_ar: [p.description, `مشروع الطالب: ${p.student}${p.group ? ` (${p.group})` : ""}`].filter(Boolean).join("\n\n").slice(0, 8000),
            url: p.url,
            image_path,
            tags: ["students"],
            published: publisher,
          })
          .select("id")
          .single(),
      ) as { id: string };
      await rpc("staff_review_project", { p_id: p.id, p_status: "published", p_note: null, p_site: row.id });
      toast(publisher ? "اتنشر على الموقع ✓" : "اتعمل مسودة ✓ اللي عنده صلاحية النشر هينشرها");
      list.reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };
  const decline = async (p: Pending) => {
    setBusy(p.id);
    try {
      await rpc("staff_review_project", { p_id: p.id, p_status: "declined", p_note: notes[p.id] ?? null, p_site: null });
      list.reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <TopBar title="مشاريع الطلاب" sub="بتتنشر في صفحة المشاريع على الموقع" back="/staff/more" />
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox error={list.error} retry={list.reload} />
      ) : !list.data?.length ? (
        <Empty icon="star" title="مفيش مشاريع مستنية" body="الطلاب بيبعتوا مشاريعهم من «مشاريعي» في التطبيق، وبيوصلك إشعار." />
      ) : (
        <div className="grid gap-3">
          {list.data.map((p) => (
            <Card key={p.id} className="grid gap-2">
              <ProjectPhoto path={p.photo} />
              <p className="font-bold text-chalk">{p.title}</p>
              <p className="text-xs text-fog">
                {p.student}
                {p.group ? ` · ${p.group}` : ""} · {fmt.rel(p.at)}
              </p>
              {p.description && <p className="whitespace-pre-line text-sm leading-relaxed text-mist">{p.description}</p>}
              {p.url && (
                <a href={p.url} target="_blank" rel="noreferrer" dir="ltr" className="truncate text-sm text-cyan">
                  {p.url}
                </a>
              )}
              <Input value={notes[p.id] ?? ""} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} placeholder="ملاحظة للطالب لو مش هينتشر (اختياري)" maxLength={300} />
              <div className="flex gap-2">
                <Button size="sm" variant="primary" icon="globe" loading={busy === p.id} onClick={() => publish(p)}>
                  {publisher ? "انشر على الموقع" : "اعمل مسودة"}
                </Button>
                <Button size="sm" onClick={() => decline(p)} disabled={busy === p.id}>
                  مش هينتشر
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function ProjectPhoto({ path }: { path: string | null }) {
  const { data } = useAsync(async () => (path ? (await sb().storage.from("submissions").createSignedUrl(path, 600)).data?.signedUrl ?? null : null), [path]);
  if (!data) return null;
  return <img src={data} alt="" className="max-h-64 w-full rounded-xl object-cover" />;
}
