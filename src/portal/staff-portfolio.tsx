"use client";
/**
 * Team portfolios: every staff member edits their own (photo, bio, skills, links, projects);
 * owners/admins create profiles for anyone, choose the group and order, and publish.
 */
import { useState } from "react";
import { coreTracks } from "@/content/core-content";
import { LINK_KEYS, LINK_LABEL, sortProfiles, teamImageUrl, type TeamGroup, type TeamProfile, type TeamProject } from "@/lib/team-public";
import { must, removeObjects, sb, uid, uploadImage, type StaffRow } from "./core";
import { Badge, Button, Card, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, Section, Select, Sheet, Textarea, Toggle, TopBar, confirmDialog, go, toast, useAsync } from "./ui";

const SITE = "https://buildxhue.com";
const GROUP_LABEL: Record<TeamGroup, string> = { founder: "مؤسس", lead: "قائد فريق", member: "عضو" };
const isAdmin = (me: StaffRow) => me.role === "owner" || me.role === "admin";

const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Portfolio photos go through the shared pipeline (WebP + thumbnail, no metadata). */
async function uploadTeamImage(me: StaffRow, file: File, maxEdge: number) {
  return (await uploadImage("team", me.user_id, file, { maxEdge })).path;
}

function ImagePick({ label, path, onPick, busy, round }: { label: string; path: string | null; onPick: (f: File) => void; busy?: boolean; round?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-4">
      <span className={`relative flex size-24 shrink-0 items-center justify-center overflow-hidden border border-[var(--line-2)] bg-deep ${round ? "rounded-full" : "rounded-2xl"}`}>
        {path ? <img src={teamImageUrl(path)} alt="" className="h-full w-full object-cover" /> : <Icon name="image" size={28} className="text-fog" />}
        {busy && <span className="absolute inset-0 flex items-center justify-center bg-void/70 text-xs text-chalk">جارٍ الرفع…</span>}
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-semibold text-chalk">{label}</span>
        <span className="text-xs text-fog">JPG أو PNG — هتتصغّر تلقائي</span>
      </span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPick(f);
        }}
      />
    </label>
  );
}

/* ─── My portfolio / edit one ───────────────────────────────────────────── */

export function PortfolioScreen({ me, id }: { me: StaffRow; id?: string }) {
  const admin = isAdmin(me);
  const { data, error, loading, reload, set } = useAsync(async () => {
    const q = sb().from("team_profiles").select("*");
    const rows = (await (id ? q.eq("id", id) : q.eq("user_id", me.user_id)).limit(1).then(must)) as TeamProfile[];
    const profile = rows[0] ?? null;
    const projects = profile ? ((await sb().from("team_projects").select("*").eq("profile_id", profile.id).order("sort_order").order("created_at", { ascending: false }).then(must)) as TeamProject[]) : [];
    return { profile, projects };
  }, [id, me.user_id]);
  const [creating, setCreating] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;

  if (!data?.profile) {
    const create = async () => {
      setCreating(true);
      try {
        const base = slugify(me.full_name || me.email.split("@")[0] || "member") || `member-${uid().slice(0, 6)}`;
        await sb()
          .from("team_profiles")
          .insert({ user_id: me.user_id, slug: base, full_name: me.full_name || me.email.split("@")[0], published: false })
          .then(must);
        reload();
      } catch (e) {
        toast.error(e);
      } finally {
        setCreating(false);
      }
    };
    return (
      <>
        <TopBar title="البورتفوليو بتاعي" back="/staff/more" />
        <Empty
          icon="user"
          title="لسه معملتش البورتفوليو بتاعك"
          body="صفحة ليك على موقع BuildX HUE فيها صورتك ونبذة عنك ومهاراتك وشغلك. محدش هيشوفها غير لما تنشرها."
          action={
            <Button variant="primary" loading={creating} onClick={create}>
              اعمل البورتفوليو
            </Button>
          }
        />
      </>
    );
  }

  return <Editor key={data.profile.id} me={me} admin={admin} profile={data.profile} projects={data.projects} onSaved={(p) => set((d) => ({ ...d!, profile: p }))} reload={reload} back={id ? "/staff/portfolios" : "/staff/more"} />;
}

function Editor({ me, admin, profile, projects, onSaved, reload, back }: { me: StaffRow; admin: boolean; profile: TeamProfile; projects: TeamProject[]; onSaved: (p: TeamProfile) => void; reload: () => void; back: string }) {
  const [f, setF] = useState(() => ({ ...profile, skillsText: profile.skills.join("، "), links: { ...profile.links } }));
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [editing, setEditing] = useState<TeamProject | "new" | null>(null);
  const put = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = async (patch?: Partial<TeamProfile>) => {
    const slug = slugify(f.slug);
    if (slug.length < 2) return toast("الرابط لازم يكون حروف إنجليزي وأرقام (حرفين على الأقل)", "error");
    if (f.full_name.trim().length < 2) return toast("اكتب الاسم بالإنجليزي", "error");
    if (f.external_url && !/^https:\/\/\S+$/.test(f.external_url.trim())) return toast("الموقع الخارجي لازم يبدأ بـ https://", "error");
    const links = Object.fromEntries(Object.entries(f.links).filter(([, v]) => v && /^https?:\/\/\S+$/.test(v.trim())).map(([k, v]) => [k, v!.trim()]));
    const row: Partial<TeamProfile> = {
      slug,
      full_name: f.full_name.trim(),
      full_name_ar: f.full_name_ar?.trim() || null,
      headline: f.headline.trim(),
      headline_ar: f.headline_ar?.trim() || null,
      bio: f.bio.trim(),
      bio_ar: f.bio_ar?.trim() || null,
      track: f.track || null,
      skills: f.skillsText
        .split(/[,،\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20),
      links,
      external_url: f.external_url?.trim() || null,
      published: f.published,
      ...(admin ? { group_kind: f.group_kind, sort_order: Number(f.sort_order) || 0 } : {}),
      ...patch,
    };
    setBusy(true);
    try {
      const saved = (await sb().from("team_profiles").update(row).eq("id", profile.id).select("*").single().then(must)) as TeamProfile;
      onSaved(saved);
      setF((p) => ({ ...p, ...saved, skillsText: saved.skills.join("، "), links: { ...saved.links } }));
      toast(saved.published ? "اتحفظ — والبورتفوليو منشور على الموقع" : "اتحفظ");
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? "");
      toast(/duplicate|unique/i.test(msg) ? "الرابط ده مستخدم قبل كده، اختار رابط تاني" : msg || "حصلت مشكلة", "error");
    } finally {
      setBusy(false);
    }
  };

  const changePhoto = async (file: File) => {
    setPhotoBusy(true);
    try {
      const path = await uploadTeamImage(me, file, 900);
      const old = profile.photo_path;
      const saved = (await sb().from("team_profiles").update({ photo_path: path }).eq("id", profile.id).select("*").single().then(must)) as TeamProfile;
      onSaved(saved);
      put("photo_path", path);
      if (old) removeObjects([old], "team").catch(() => undefined);
      toast("اتغيّرت الصورة");
    } catch (e) {
      toast.error(e);
    } finally {
      setPhotoBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: `حذف بورتفوليو ${profile.full_name}؟`, body: "الصفحة والمشاريع هيتمسحوا من الموقع نهائياً.", ok: "حذف نهائي", danger: true }))) return;
    try {
      await sb().from("team_profiles").delete().eq("id", profile.id).then(must);
      removeObjects([profile.photo_path ?? "", ...projects.map((p) => p.image_path ?? "")], "team").catch(() => undefined);
      toast("اتمسح");
      go("/staff/portfolios", true);
    } catch (e) {
      toast.error(e);
    }
  };

  const pageUrl = f.external_url || `${SITE}/ar/team/member/?u=${profile.slug}`;

  return (
    <>
      <TopBar
        title={profile.user_id === me.user_id ? "البورتفوليو بتاعي" : profile.full_name}
        sub={profile.published ? "منشور على الموقع" : "مسودة — مش ظاهر على الموقع"}
        back={back}
        actions={
          profile.published ? (
            <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line-2)] px-3 text-sm text-chalk">
              <Icon name="external" size={15} />
              شوف الصفحة
            </a>
          ) : undefined
        }
      />

      <Card>
        <ImagePick label="صورتك" path={f.photo_path} busy={photoBusy} onPick={changePhoto} round />
      </Card>

      <Section title="بياناتك">
        <div className="grid gap-4">
          <Field label="الاسم بالإنجليزي">
            <Input value={f.full_name} maxLength={80} dir="ltr" onChange={(e) => put("full_name", e.target.value)} />
          </Field>
          <Field label="الاسم بالعربي">
            <Input value={f.full_name_ar ?? ""} maxLength={80} onChange={(e) => put("full_name_ar", e.target.value)} />
          </Field>
          <Field label="المسمّى / الدور بالإنجليزي" hint="مثلاً: Robotics Lead · Embedded Engineer">
            <Input value={f.headline} maxLength={100} dir="ltr" onChange={(e) => put("headline", e.target.value)} />
          </Field>
          <Field label="المسمّى / الدور بالعربي">
            <Input value={f.headline_ar ?? ""} maxLength={100} onChange={(e) => put("headline_ar", e.target.value)} />
          </Field>
          <Field label="المسار">
            <Select value={f.track ?? ""} onChange={(e) => put("track", e.target.value || null)}>
              <option value="">—</option>
              {coreTracks.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.nameAr}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="رابط صفحتك" hint={`buildxhue.com/team/member/?u=${slugify(f.slug) || "…"}`}>
            <Input value={f.slug} maxLength={40} dir="ltr" onChange={(e) => put("slug", e.target.value.toLowerCase())} />
          </Field>
        </div>
      </Section>

      <Section title="نبذة عنك">
        <div className="grid gap-4">
          <Field label="بالعربي">
            <Textarea value={f.bio_ar ?? ""} maxLength={1500} className="min-h-28" onChange={(e) => put("bio_ar", e.target.value)} />
          </Field>
          <Field label="بالإنجليزي">
            <Textarea value={f.bio} maxLength={1500} dir="ltr" className="min-h-28" onChange={(e) => put("bio", e.target.value)} />
          </Field>
          <Field label="المهارات" hint="افصل بينهم بفاصلة — مثلاً: Arduino، Python، Fusion 360">
            <Input value={f.skillsText} onChange={(e) => put("skillsText", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="لينكاتك">
        <div className="grid gap-3">
          {LINK_KEYS.map((k) => (
            <Field key={k} label={LINK_LABEL[k]}>
              <Input value={f.links[k] ?? ""} dir="ltr" placeholder="https://" inputMode="url" onChange={(e) => put("links", { ...f.links, [k]: e.target.value })} />
            </Field>
          ))}
          <Field label="عندك موقع بورتفوليو خاص؟" hint="لو كتبته، الكارت بتاعك على الموقع هيودّي عليه مباشرة بدل صفحتك جوّه الموقع.">
            <Input value={f.external_url ?? ""} dir="ltr" placeholder="https://" inputMode="url" onChange={(e) => put("external_url", e.target.value)} />
          </Field>
        </div>
      </Section>

      {admin && (
        <Section title="للمشرفين">
          <div className="grid gap-4">
            <Field label="المجموعة">
              <Select value={f.group_kind} onChange={(e) => put("group_kind", e.target.value as TeamGroup)}>
                {(Object.keys(GROUP_LABEL) as TeamGroup[]).map((g) => (
                  <option key={g} value={g}>
                    {GROUP_LABEL[g]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="الترتيب" hint="الأصغر يظهر الأول">
              <Input type="number" value={f.sort_order} dir="ltr" onChange={(e) => put("sort_order", Number(e.target.value))} />
            </Field>
          </div>
        </Section>
      )}

      <Section title="مشاريعك وشغلك" action={<Button size="sm" icon="plus" onClick={() => setEditing("new")}>إضافة</Button>}>
        {projects.length ? (
          <List>
            {projects.map((p) => (
              <Row key={p.id} onClick={() => setEditing(p)}>
                <div className="flex items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--line)] bg-deep">
                    {p.image_path ? <img src={teamImageUrl(p.image_path)} alt="" className="h-full w-full object-cover" /> : <Icon name="layers" size={20} className="text-fog" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-chalk">{p.title}</p>
                    <p className="truncate text-xs text-fog">{[p.year, p.tags.join("، ")].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
              </Row>
            ))}
          </List>
        ) : (
          <Card className="text-center text-sm text-mist">ضيف مشاريعك: روبوت عملته، تطبيق، تصميم، مسابقة شاركت فيها…</Card>
        )}
      </Section>

      <Card className="mt-6">
        <Toggle checked={f.published} onChange={(v) => put("published", v)} label="انشر البورتفوليو على الموقع" hint="لو مقفول، الصفحة مش هتظهر لحد." />
      </Card>
      <Button variant="primary" size="lg" className="mt-4" block loading={busy} onClick={() => save()}>
        حفظ
      </Button>
      {admin && profile.user_id !== me.user_id && (
        <Button variant="danger" icon="trash" className="mt-6" block onClick={remove}>
          حذف البورتفوليو
        </Button>
      )}

      {editing && <ProjectSheet me={me} profileId={profile.id} project={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}

function ProjectSheet({ me, profileId, project, onClose, onSaved }: { me: StaffRow; profileId: string; project: TeamProject | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    title: project?.title ?? "",
    description: project?.description ?? "",
    url: project?.url ?? "",
    tags: project?.tags.join("، ") ?? "",
    year: project?.year ? String(project.year) : String(new Date().getFullYear()),
    image_path: project?.image_path ?? null,
    sort_order: project?.sort_order ?? 100,
  });
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);

  const pick = async (file: File) => {
    setImgBusy(true);
    try {
      const path = await uploadTeamImage(me, file, 1600);
      setF((p) => ({ ...p, image_path: path }));
    } catch (e) {
      toast.error(e);
    } finally {
      setImgBusy(false);
    }
  };

  const save = async () => {
    if (!f.title.trim()) return toast("اكتب اسم المشروع", "error");
    if (f.url.trim() && !/^https?:\/\/\S+$/.test(f.url.trim())) return toast("اللينك لازم يبدأ بـ https://", "error");
    const year = Number(f.year);
    const row = {
      profile_id: profileId,
      title: f.title.trim(),
      description: f.description.trim(),
      url: f.url.trim() || null,
      tags: f.tags
        .split(/[,،]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10),
      year: year >= 2000 && year <= 2100 ? year : null,
      image_path: f.image_path,
      sort_order: Number(f.sort_order) || 100,
    };
    setBusy(true);
    try {
      if (project) await sb().from("team_projects").update(row).eq("id", project.id).then(must);
      else await sb().from("team_projects").insert(row).then(must);
      if (project?.image_path && project.image_path !== f.image_path) removeObjects([project.image_path], "team").catch(() => undefined);
      toast("اتحفظ المشروع");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!project || !(await confirmDialog({ title: `حذف «${project.title}»؟`, ok: "حذف", danger: true }))) return;
    try {
      await sb().from("team_projects").delete().eq("id", project.id).then(must);
      if (project.image_path) removeObjects([project.image_path], "team").catch(() => undefined);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Sheet open onClose={onClose} title={project ? "تعديل المشروع" : "مشروع جديد"}>
      <div className="grid gap-4">
        <ImagePick label="صورة المشروع" path={f.image_path} busy={imgBusy} onPick={pick} />
        <Field label="اسم المشروع">
          <Input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="وصف قصير">
          <Textarea value={f.description} maxLength={1500} className="min-h-24" onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="لينك (GitHub، فيديو، Behance…)">
          <Input value={f.url} dir="ltr" placeholder="https://" inputMode="url" onChange={(e) => setF({ ...f, url: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="السنة">
            <Input value={f.year} dir="ltr" inputMode="numeric" onChange={(e) => setF({ ...f, year: e.target.value })} />
          </Field>
          <Field label="الترتيب">
            <Input type="number" value={f.sort_order} dir="ltr" onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="الكلمات المفتاحية" hint="مثلاً: ESP32، PID، Line Follower">
          <Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        </Field>
        <Button variant="primary" size="lg" block loading={busy} disabled={imgBusy} onClick={save}>
          حفظ المشروع
        </Button>
        {project && (
          <Button variant="danger" icon="trash" block onClick={del}>
            حذف المشروع
          </Button>
        )}
      </div>
    </Sheet>
  );
}

/* ─── Admin: every portfolio ────────────────────────────────────────────── */

export function PortfoliosAdmin({ me }: { me: StaffRow }) {
  const { data, error, loading, reload } = useAsync(async () => {
    const [profiles, staff] = await Promise.all([
      sb().from("team_profiles").select("*").then(must) as Promise<TeamProfile[]>,
      sb().from("staff").select("user_id, full_name, email").eq("active", true).then(must) as Promise<Pick<StaffRow, "user_id" | "full_name" | "email">[]>,
    ]);
    return { profiles: sortProfiles(profiles as TeamProfile[]), staff: staff as Pick<StaffRow, "user_id" | "full_name" | "email">[] };
  }, []);
  const [adding, setAdding] = useState(false);

  if (!isAdmin(me)) return <Empty icon="lock" title="الصفحة دي للمشرفين بس" />;
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;

  return (
    <>
      <TopBar
        title="بورتفوليو الفريق"
        sub={`${data.profiles.filter((p) => p.published).length} منشور من ${data.profiles.length}`}
        back="/staff/more"
        actions={
          <Button size="sm" variant="primary" icon="plus" onClick={() => setAdding(true)}>
            عضو
          </Button>
        }
      />
      {data.profiles.length ? (
        <List>
          {data.profiles.map((p) => (
            <Row key={p.id} onClick={() => go(`/staff/portfolios/${p.id}`)}>
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--line)] bg-deep text-sm font-bold text-chalk">
                  {p.photo_path ? <img src={teamImageUrl(p.photo_path)} alt="" className="h-full w-full object-cover" /> : (p.full_name_ar || p.full_name)[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-chalk">{p.full_name_ar || p.full_name}</p>
                  <p className="truncate text-xs text-fog">{p.headline_ar || p.headline || "—"}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={p.group_kind === "founder" ? "volt" : "muted"}>{GROUP_LABEL[p.group_kind]}</Badge>
                  {!p.published && <Badge tone="warn">مسودة</Badge>}
                  {p.external_url && <Badge tone="info">موقع خارجي</Badge>}
                </div>
              </div>
            </Row>
          ))}
        </List>
      ) : (
        <Empty icon="users" title="مفيش بورتفوليوهات لسه" />
      )}
      {adding && <AddProfileSheet staff={data.staff} taken={new Set(data.profiles.map((p) => p.user_id).filter(Boolean) as string[])} onClose={() => setAdding(false)} onDone={(id) => go(`/staff/portfolios/${id}`)} />}
    </>
  );
}

function AddProfileSheet({ staff, taken, onClose, onDone }: { staff: Pick<StaffRow, "user_id" | "full_name" | "email">[]; taken: Set<string>; onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState<TeamGroup>("founder");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const free = staff.filter((s) => !taken.has(s.user_id));

  const create = async () => {
    const full = name.trim();
    if (full.length < 2) return toast("اكتب الاسم بالإنجليزي", "error");
    setBusy(true);
    try {
      const row = (await sb()
        .from("team_profiles")
        .insert({ full_name: full, slug: slugify(full) || `member-${uid().slice(0, 6)}`, group_kind: group, user_id: account || null, published: false })
        .select("id")
        .single()
        .then(must)) as { id: string };
      onDone(row.id);
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? "");
      toast(/duplicate|unique/i.test(msg) ? "فيه حد بنفس الاسم/الرابط — غيّر الاسم شوية" : msg || "حصلت مشكلة", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="بورتفوليو لعضو جديد">
      <div className="grid gap-4">
        <Field label="الاسم بالإنجليزي">
          <Input value={name} dir="ltr" maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="المجموعة">
          <Select value={group} onChange={(e) => setGroup(e.target.value as TeamGroup)}>
            {(Object.keys(GROUP_LABEL) as TeamGroup[]).map((g) => (
              <option key={g} value={g}>
                {GROUP_LABEL[g]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="حسابه في التطبيق" hint="لو اخترت حسابه، هيقدر يعدّل البورتفوليو بتاعه بنفسه. تقدر تضيفه للفريق الأول من «الفريق والصلاحيات».">
          <Select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">من غير حساب (المشرف بيعدّل)</option>
            {free.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name || s.email}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" size="lg" block loading={busy} onClick={create}>
          إنشاء
        </Button>
      </div>
    </Sheet>
  );
}
