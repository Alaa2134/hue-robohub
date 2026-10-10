"use client";

/**
 * "صفحات الموقع": the team builds website pages from blocks (src/lib/site-pages.ts) and drags them
 * into order. The Robotex visit page is one of them (it shows the built-in version until it's saved
 * here once). A page's forms open and close right from its card and its editor, and their questions
 * are one tap away (the form editor). Publishing a page needs the "publish" permission.
 */
import dynamic from "next/dynamic";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ICON_NAMES } from "@/components/brand/icons";
import photos from "@/content/expo-photos.json";
import { BLOCK_KINDS, BUILT_IN, TEMPLATES, imageOf, newBlock, robotexPage, uidOf, type Block, type BlockType, type Btn, type Countdown, type Img, type PageSettings, type SitePage, type T } from "@/lib/site-pages";
import { fromZonedInput, toZonedInput } from "@/lib/zoned";
import { SITE_ORIGIN, can, errorText, fmt, must, rpc, sb, savedText, uploadImage, type StaffRow } from "./core";
import { Sortable, moved, type HandleProps } from "./sortable";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Icon, Input, Loading, Section, Select, Sheet, Stat, Textarea, Toggle, TopBar, confirmDialog, copyText, go, toast, useAsync, type IconKey } from "./ui";

const SitePageView = dynamic(() => import("@/components/pages/site-page").then((m) => m.SitePageView), { ssr: false, loading: () => <Loading /> });

type PageRow = {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  accent: string;
  blocks: Block[];
  settings: PageSettings;
  published: boolean;
  archived: boolean;
  updated_at: string;
  /** Goes up / comes down by itself (Cairo time in the editor). */
  publish_at?: string | null;
  unpublish_at?: string | null;
};
type Version = { id: number; title_ar: string; title_en: string | null; description_ar: string | null; description_en: string | null; accent: string; blocks: Block[]; settings: PageSettings; saved_by: string | null; saved_at: string };
const COLS = "id, slug, title_ar, title_en, description_ar, description_en, accent, blocks, settings, published, archived, updated_at, publish_at, unpublish_at";
type FormLite = { id: string; slug: string; title_ar: string; open: boolean; archived: boolean; opens_at: string | null; closes_at: string | null };

const formsOf = (blocks: Block[]) => [...new Set(blocks.flatMap((b) => (b.type === "form" && b.form ? [b.form] : [])))];
const siteLink = (slug: string) => `${SITE_ORIGIN}/ar${BUILT_IN[slug] ?? `/p/${slug}`}/`;
const kindOf = (t: BlockType) => BLOCK_KINDS.find((k) => k.type === t)!;
const asPage = (r: Pick<PageRow, "slug" | "title_ar" | "title_en" | "description_ar" | "description_en" | "accent" | "blocks" | "settings">): SitePage => ({
  slug: r.slug,
  title: { ar: r.title_ar, en: r.title_en ?? undefined },
  description: { ar: r.description_ar ?? "", en: r.description_en ?? undefined },
  accent: r.accent,
  blocks: r.blocks,
  settings: r.settings,
});
const fromPage = (p: SitePage): Omit<PageRow, "id" | "published" | "archived" | "updated_at" | "publish_at" | "unpublish_at"> => ({
  slug: p.slug,
  title_ar: p.title.ar,
  title_en: p.title.en || null,
  description_ar: p.description.ar || null,
  description_en: p.description.en || null,
  accent: p.accent,
  blocks: p.blocks,
  settings: p.settings,
});

/** Open or close a form from anywhere on this screen. */
function FormSwitch({ form, onChange }: { form: FormLite; onChange: (f: FormLite) => void }) {
  const [busy, setBusy] = useState(false);
  const flip = async (open: boolean) => {
    setBusy(true);
    try {
      await sb().from("forms").update({ open }).eq("id", form.id).then(must);
      onChange({ ...form, open });
      toast(open ? `«${form.title_ar}» اتفتح على الموقع` : `«${form.title_ar}» اتقفل`);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-2 rounded-xl border border-[var(--line-2)] bg-white/[0.02] p-3" data-testid="form-switch">
      <Toggle checked={form.open} disabled={busy} onChange={(v) => void flip(v)} label={`${form.open ? "الفورم مفتوح" : "الفورم مقفول"}: ${form.title_ar}`} hint={form.closes_at ? `بيقفل لوحده ${fmt.dateTime(form.closes_at)}` : undefined} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon="edit" onClick={() => go(`/staff/forms/${form.id}`)}>
          عدّل أسئلة الفورم
        </Button>
        <Button size="sm" icon="list" onClick={() => go(`/staff/forms/${form.id}/responses`)}>
          الردود
        </Button>
      </div>
    </div>
  );
}

export function PagesScreen({ me }: { me: StaffRow }) {
  const { data, error, loading, reload, set } = useAsync(async () => {
    const [pages, forms] = await Promise.all([
      sb().from("site_pages").select(COLS).order("updated_at", { ascending: false }).then(must) as Promise<PageRow[]>,
      sb().from("forms").select("id, slug, title_ar, open, archived, opens_at, closes_at").then(must) as Promise<FormLite[]>,
    ]);
    return { pages, forms };
  }, []);
  const [creating, setCreating] = useState(false);
  const [archived, setArchived] = useState(false);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  const expo = data.pages.find((p) => p.slug === "robotex");
  const list = data.pages.filter((p) => p.slug !== "robotex" && p.archived === archived);
  const setForm = (f: FormLite) => set({ ...data, forms: data.forms.map((x) => (x.id === f.id ? f : x)) });
  const card = (key: string, title: string, slug: string, blocks: Block[], badge: ReactNode, sub: string) => (
    <Card key={key} className="grid grid-cols-1 gap-3" data-testid="page-card">
      <button type="button" className="flex w-full min-w-0 items-center gap-3 text-start" onClick={() => go(`/staff/pages/${key}`)}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-volt/15 text-volt">
          <Icon name="layers" size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-chalk">{title}</span>
          <span className="block truncate text-xs text-fog" dir="ltr">
            {BUILT_IN[slug] ?? `/p/${slug}`}
          </span>
          <span className="block truncate text-xs text-fog">{sub}</span>
        </span>
        {badge}
        <Icon name="chevron" size={16} className="shrink-0 rotate-180 text-fog" />
      </button>
      {formsOf(blocks).map((s) => {
        const f = data.forms.find((x) => x.slug === s);
        return f ? <FormSwitch key={s} form={f} onChange={setForm} /> : null;
      })}
    </Card>
  );
  return (
    <>
      <TopBar title="صفحات الموقع" sub="صفحة المعرض وأي صفحة تعملها بالسحب والإفلات" back="/staff/more" actions={can(me, "pages") ? <Button size="sm" variant="primary" icon="plus" onClick={() => setCreating(true)}>صفحة جديدة</Button> : undefined} />
      <div className="grid grid-cols-1 gap-3">
        {expo
          ? card("robotex", expo.title_ar, "robotex", expo.blocks, <Badge tone={expo.published ? "ok" : "warn"}>{expo.published ? "منشورة" : "مسودة"}</Badge>, `${expo.blocks.length} جزء · اتعدّلت ${fmt.rel(expo.updated_at)}`)
          : card("robotex", robotexPage().title.ar, "robotex", robotexPage().blocks, <Badge tone="info">الأصلية</Badge>, "الصفحة الحالية على الموقع. افتحها ونظّمها زي ما انت عايز.")}
      </div>
      <div className="mt-5 flex gap-2">
        <Chip active={!archived} onClick={() => setArchived(false)}>
          صفحاتي
        </Chip>
        <Chip active={archived} onClick={() => setArchived(true)}>
          الأرشيف
        </Chip>
      </div>
      {!list.length ? (
        <Empty icon="layers" title={archived ? "مفيش صفحات في الأرشيف" : "مفيش صفحات تانية لسه"} body={archived ? undefined : "اعمل صفحة لفعالية أو زيارة جديدة: اختار قالب وضيف أجزاء ورتّبها بالسحب."} action={!archived && can(me, "pages") ? <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>صفحة جديدة</Button> : undefined} />
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3">{list.map((p) => card(p.id, p.title_ar, p.slug, p.blocks, <Badge tone={p.published ? "ok" : "warn"}>{p.published ? "منشورة" : "مسودة"}</Badge>, `${p.blocks.length} جزء · اتعدّلت ${fmt.rel(p.updated_at)}`))}</div>
      )}
      <NewPageSheet open={creating} onClose={() => setCreating(false)} taken={new Set(data.pages.map((p) => p.slug))} />
    </>
  );
}

function NewPageSheet({ open, onClose, taken }: { open: boolean; onClose: () => void; taken: Set<string> }) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [tpl, setTpl] = useState("visit");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    const s = slug.trim() || `page-${Date.now().toString(36).slice(-5)}`;
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(s)) return toast("رابط الصفحة: حروف إنجليزي صغيرة وأرقام و - بس", "error");
    if (taken.has(s) || BUILT_IN[s]) return toast("الرابط ده مستخدم", "error");
    if (title.trim().length < 2) return toast("اكتب اسم الصفحة", "error");
    setBusy(true);
    try {
      const made = TEMPLATES.find((x) => x.k === tpl)!.make();
      const blocks = made.blocks.map((b) => (b.type === "hero" ? { ...b, title: { ar: title.trim() } } : b));
      const row = (await sb().from("site_pages").insert({ slug: s, title_ar: title.trim(), accent: made.accent, blocks, settings: made.settings, published: false }).select("id").single().then(must)) as { id: string };
      onClose();
      go(`/staff/pages/${row.id}`);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="صفحة جديدة">
      <div className="grid gap-3">
        <Field label="اسم الصفحة">
          <Input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: زيارة معرض Cairo ICT" />
        </Field>
        <Field label="الرابط" hint={<span dir="ltr" className="break-all">buildxhue.com/p/{slug || "…"}</span>}>
          <Input dir="ltr" value={slug} maxLength={49} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="cairo-ict-2026" />
        </Field>
        <p className="text-sm font-semibold text-mist">ابدأ من</p>
        <div className="grid gap-2">
          {TEMPLATES.map((x) => (
            <button key={x.k} type="button" onClick={() => setTpl(x.k)} className={`w-full min-w-0 whitespace-normal rounded-2xl border p-3 text-start transition ${tpl === x.k ? "border-cyan bg-volt/10" : "border-[var(--line-2)]"}`}>
              <span className="block font-semibold text-chalk">{x.ar}</span>
              <span className="block text-xs text-fog">{x.hint}</span>
            </button>
          ))}
        </div>
        <Button variant="primary" loading={busy} onClick={() => void create()}>
          اعمل الصفحة
        </Button>
      </div>
    </Sheet>
  );
}

type Stats = {
  from: string;
  views: number;
  visitors: number;
  daily: { day: string; views: number }[];
  referrers: { host: string; views: number }[];
  devices: Record<string, number>;
  forms: { slug: string; title: string; total: number; period: number; accepted: number }[];
};

/** The page's numbers (loaded when opened): visits, where from, and how many applied through its forms. */
function PageStats({ slug, forms }: { slug: string; forms: string[] }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useAsync(async () => (open ? rpc<Stats>("staff_page_stats", { p_slug: slug, p_forms: forms.length ? forms : null, p_days: days }) : null), [open, slug, days, forms.join()]);
  const max = Math.max(1, ...(data?.daily ?? []).map((d) => d.views));
  const applied = (data?.forms ?? []).reduce((n, f) => n + f.period, 0);
  return (
    <details className="mt-4 rounded-2xl border border-[var(--line)] bg-panel/40 p-4" data-testid="page-stats" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-semibold text-chalk">أرقام الصفحة (زيارات وتقديمات)</summary>
      <div className="mt-3 grid gap-3">
        <div className="flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <Chip key={d} active={days === d} onClick={() => setDays(d)}>
              {d === 7 ? "أسبوع" : d === 30 ? "شهر" : "3 شهور"}
            </Chip>
          ))}
        </div>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorBox error={error} retry={reload} />
        ) : data ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="زيارة" value={data.views} />
              <Stat label="زائر" value={data.visitors} />
              <Stat label="قدّموا" value={applied} tone={applied ? "ok" : undefined} sub={data.visitors ? `${Math.round((applied / data.visitors) * 100)}% من الزوار` : undefined} />
            </div>
            {data.daily.length > 0 && (
              <div className="flex h-20 items-end gap-0.5" aria-label="الزيارات كل يوم">
                {data.daily.map((d) => (
                  <span key={d.day} title={`${fmt.day(d.day)}: ${d.views}`} className="min-w-[3px] flex-1 rounded-t bg-cyan/60" style={{ height: `${Math.max(4, (d.views / max) * 100)}%` }} />
                ))}
              </div>
            )}
            {data.forms.map((f) => (
              <p key={f.slug} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-mist">
                <span className="min-w-0 truncate">{f.title}</span>
                <span className="shrink-0 text-fog">
                  {f.period} في الفترة · {f.total} الكل · {f.accepted} اتقبلوا
                </span>
              </p>
            ))}
            {data.referrers.length > 0 && (
              <p className="text-xs text-fog">
                جايين منين: {data.referrers.map((r) => `${r.host || "مباشر"} (${r.views})`).join("، ")}
              </p>
            )}
            {!data.views && <p className="text-xs text-fog">مفيش زيارات في الفترة دي لسه.</p>}
          </>
        ) : null}
      </div>
    </details>
  );
}

/** Up and down by itself: two times in Cairo time (empty = no schedule). */
function Schedule({ row, busy, onSave }: { row: PageRow; busy: boolean; onSave: (p: Pick<PageRow, "publish_at" | "unpublish_at">) => void }) {
  const [from, setFrom] = useState(toZonedInput(row.publish_at ?? null));
  const [to, setTo] = useState(toZonedInput(row.unpublish_at ?? null));
  const changed = from !== toZonedInput(row.publish_at ?? null) || to !== toZonedInput(row.unpublish_at ?? null);
  const now = Date.now();
  const live = !row.archived && (row.published || (!!row.publish_at && new Date(row.publish_at).getTime() <= now)) && (!row.unpublish_at || new Date(row.unpublish_at).getTime() > now);
  return (
    <details className="rounded-xl border border-[var(--line-2)] p-3" data-testid="page-schedule" open={!!(row.publish_at || row.unpublish_at)}>
      <summary className="cursor-pointer text-sm font-semibold text-chalk">
        جدولة (تظهر وتختفي لوحدها) {(row.publish_at || row.unpublish_at) && <Badge tone={live ? "ok" : "info"}>{live ? "ظاهرة دلوقتي" : "مجدولة"}</Badge>}
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="تظهر على الموقع من" hint="بتوقيت القاهرة. فاضي = حسب «منشورة».">
          <Input type="datetime-local" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="وتختفي بعد" hint="مثلاً بعد ما المعرض يخلص.">
          <Input type="datetime-local" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={!changed || busy}
          onClick={() => {
            const a = fromZonedInput(from);
            const b = fromZonedInput(to);
            if (a && b && b <= a) return toast("ميعاد الاختفاء لازم يبقى بعد ميعاد الظهور", "error");
            onSave({ publish_at: a?.toISOString() ?? null, unpublish_at: b?.toISOString() ?? null });
          }}
        >
          احفظ الجدولة
        </Button>
        {(row.publish_at || row.unpublish_at) && (
          <Button size="sm" disabled={busy} onClick={() => (setFrom(""), setTo(""), onSave({ publish_at: null, unpublish_at: null }))}>
            شيل الجدولة
          </Button>
        )}
      </div>
    </details>
  );
}

/** Every save keeps the version before it: the last 30, each one can come back into the editor. */
function VersionsSheet({ open, pageId, onClose, onRestore }: { open: boolean; pageId: string; onClose: () => void; onRestore: (v: Version) => void }) {
  const { data, error, loading, reload } = useAsync(
    async () =>
      open
        ? ((await sb().from("site_page_versions").select("id, title_ar, title_en, description_ar, description_en, accent, blocks, settings, saved_by, saved_at").eq("page_id", pageId).order("saved_at", { ascending: false }).limit(30).then(must)) as Version[])
        : null,
    [open, pageId],
  );
  return (
    <Sheet open={open} onClose={onClose} title="النسخ القديمة">
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty icon="refresh" title="مفيش نسخ قديمة لسه" body="كل ما تحفظ، النسخة اللي قبلها بتتحفظ هنا." />
      ) : (
        <div className="grid gap-2" data-testid="page-versions">
          {data.map((v) => (
            <Card key={v.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-chalk">{v.title_ar}</p>
                <p className="text-xs text-fog">
                  {fmt.dateTime(v.saved_at)} · {v.blocks.length} جزء
                </p>
              </div>
              <Button size="sm" onClick={() => onRestore(v)}>
                رجّعها
              </Button>
            </Card>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** A copy of the page (as a draft) to start the next event from. */
function DuplicateButton({ row }: { row: PageRow }) {
  const [busy, setBusy] = useState(false);
  const copy = async () => {
    setBusy(true);
    try {
      const taken = new Set(((await sb().from("site_pages").select("slug").then(must)) as { slug: string }[]).map((x) => x.slug));
      const base = `${row.slug.replace(/-copy(-\d+)?$/, "").slice(0, 40)}-copy`;
      let slug = base;
      for (let n = 2; taken.has(slug) || BUILT_IN[slug]; n++) slug = `${base}-${n}`;
      const out = (await sb()
        .from("site_pages")
        .insert({ ...fromPage(asPage(row)), slug, title_ar: `${row.title_ar} (نسخة)`.slice(0, 160), published: false })
        .select("id")
        .single()
        .then(must)) as { id: string };
      toast("اتعملت نسخة (مسودة)");
      go(`/staff/pages/${out.id}`);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button icon="copy" loading={busy} onClick={() => void copy()}>
      اعمل نسخة من الصفحة
    </Button>
  );
}

/* ─── The editor ───────────────────────────────────────────────────────── */

type Ctx = { en: boolean; forms: FormLite[] };

export function PageEditor({ id, me }: { id: string; me: StaffRow }) {
  const { data, error, loading, reload, set } = useAsync(async () => {
    const q = sb().from("site_pages").select(COLS);
    const [rows, forms] = await Promise.all([
      (id === "robotex" ? q.eq("slug", "robotex") : q.eq("id", id)).then(must) as Promise<PageRow[]>,
      sb().from("forms").select("id, slug, title_ar, open, archived, opens_at, closes_at").order("created_at", { ascending: false }).then(must) as Promise<FormLite[]>,
    ]);
    const row = rows[0] ?? (id === "robotex" ? { id: "", ...fromPage(robotexPage()), published: true, archived: false, updated_at: "" } : null);
    return { row, forms, saved: !!rows[0] };
  }, [id]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [en, setEn] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState(false);
  const [versions, setVersions] = useState(false);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  if (!data.row) return <ErrorBox error={new Error("الصفحة دي مش موجودة")} />;
  const row = data.row;
  const canPublish = can(me, "publish");
  const edit = (p: Partial<PageRow>) => {
    set({ ...data, row: { ...row, ...p } });
    setDirty(true);
  };
  const setBlocks = (blocks: Block[]) => edit({ blocks });
  const setBlock = (b: Block) => setBlocks(row.blocks.map((x) => (x.id === b.id ? b : x)));
  const save = async (extra: Partial<PageRow> = {}, msg = "اتحفظت ✓") => {
    const next = { ...row, ...extra };
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(next.slug)) return toast("رابط الصفحة: حروف إنجليزي صغيرة وأرقام و - بس", "error");
    if (!next.title_ar.trim()) return toast("اكتب اسم الصفحة", "error");
    setBusy(extra.published !== undefined ? "publish" : "save");
    try {
      const body = {
        ...fromPage(asPage(next)),
        ...(extra.published !== undefined || !data.saved ? { published: next.published && canPublish } : {}),
        ...(extra.archived !== undefined ? { archived: next.archived } : {}),
        ...("publish_at" in extra || "unpublish_at" in extra ? { publish_at: next.publish_at ?? null, unpublish_at: next.unpublish_at ?? null } : {}),
      };
      const out = (data.saved
        ? await sb().from("site_pages").update(body).eq("id", row.id).select("*").single().then(must)
        : await sb().from("site_pages").insert(body).select("*").single().then(must)) as PageRow;
      set({ ...data, row: out, saved: true });
      setDirty(false);
      toast(msg);
    } catch (e) {
      toast(/publish_permission/.test(errorText(e)) ? "النشر محتاج صلاحية «النشر على الموقع»" : errorText(e), "error");
    } finally {
      setBusy("");
    }
  };
  const used = formsOf(row.blocks).map((s) => data.forms.find((f) => f.slug === s)).filter(Boolean) as FormLite[];
  const ctx: Ctx = { en, forms: data.forms };
  const builtIn = !!BUILT_IN[row.slug];

  return (
    <>
      <TopBar
        title={row.title_ar || "صفحة"}
        sub={<span dir="ltr">{BUILT_IN[row.slug] ?? `/p/${row.slug}`}</span>}
        back="/staff/pages"
        actions={
          <>
            <Button size="sm" icon="eye" onClick={() => setPreview(true)}>
              معاينة
            </Button>
            <Button size="sm" variant="primary" loading={busy === "save"} disabled={!dirty} onClick={() => void save()}>
              حفظ
            </Button>
          </>
        }
      />

      <Card className="grid gap-3">
        {!data.saved && <p className="rounded-xl bg-volt/10 p-3 text-sm text-mist">دي الصفحة الأصلية اللي على الموقع دلوقتي. أي تعديل تحفظه هيبقى هو اللي بيظهر بدلها.</p>}
        <Toggle
          checked={row.published}
          disabled={!canPublish || !!busy}
          onChange={(v) => void save({ published: v }, v ? "الصفحة اتنشرت على الموقع" : "الصفحة اتشالت من الموقع")}
          label={row.published ? "منشورة على الموقع" : "مسودة (مش ظاهرة على الموقع)"}
          hint={canPublish ? "التعديلات بتظهر على الموقع أول ما تحفظ." : "النشر محتاج صلاحية «النشر على الموقع»."}
        />
        {canPublish && data.saved && <Schedule row={row} busy={!!busy} onSave={(p) => void save(p, p.publish_at || p.unpublish_at ? "اتجدولت ✓" : "اتشالت الجدولة")} />}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon="copy" onClick={() => copyText(siteLink(row.slug), "اتنسخ لينك الصفحة")}>
            انسخ اللينك
          </Button>
          <a href={siteLink(row.slug)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line-2)] px-3 text-sm text-chalk">
            <Icon name="link" size={16} />
            افتحها على الموقع
          </a>
        </div>
      </Card>

      {!!used.length && (
        <Section title="فورمات الصفحة">
          <div className="grid gap-2">
            {used.map((f) => (
              <FormSwitch key={f.id} form={f} onChange={(x) => set({ ...data, forms: data.forms.map((y) => (y.id === x.id ? x : y)) })} />
            ))}
          </div>
        </Section>
      )}

      <Section
        title={`أجزاء الصفحة (${row.blocks.length})`}
        action={
          <label className="flex items-center gap-2 text-xs text-mist">
            <input type="checkbox" className="size-4 accent-[#2b6dff]" checked={en} onChange={(e) => setEn(e.target.checked)} />
            اكتب الإنجليزي كمان
          </label>
        }
      >
        <p className="mb-3 text-xs text-fog">اسحب من ⋮⋮ عشان ترتّب الأجزاء (أو دوس عليها واستخدم الأسهم). دوس على أي جزء عشان تعدّله.</p>
        <div data-testid="page-blocks">
          <Sortable
            items={row.blocks}
            keyOf={(b) => b.id}
            onMove={(from, to) => setBlocks(moved(row.blocks, from, to))}
            render={(b, i, handle, dragging) => (
              <BlockCard
                block={b}
                index={i}
                handle={handle}
                dragging={dragging}
                open={openId === b.id}
                onToggle={() => setOpenId(openId === b.id ? null : b.id)}
                onChange={setBlock}
                onDuplicate={() => {
                  const copy = { ...structuredClone(b), id: uidOf() } as Block;
                  setBlocks([...row.blocks.slice(0, i + 1), copy, ...row.blocks.slice(i + 1)]);
                }}
                onRemove={async () => {
                  if (await confirmDialog({ title: `تشيل «${kindOf(b.type).ar}»؟`, body: "هيتشال من الصفحة لما تحفظ.", ok: "شيله", danger: true })) setBlocks(row.blocks.filter((x) => x.id !== b.id));
                }}
                ctx={ctx}
              />
            )}
          />
        </div>
        <Button className="mt-3" block icon="plus" onClick={() => setAdding(true)}>
          ضيف جزء
        </Button>
      </Section>

      {data.saved && <PageStats slug={row.slug} forms={formsOf(row.blocks)} />}

      <Section title="إعدادات الصفحة">
        <Card className="grid gap-3">
          <TIn label="اسم الصفحة" value={{ ar: row.title_ar, en: row.title_en ?? "" }} en={en} onChange={(v) => edit({ title_ar: v.ar, title_en: v.en || null })} />
          <TIn label="وصف قصير (بيظهر لما حد يشارك اللينك)" area value={{ ar: row.description_ar ?? "", en: row.description_en ?? "" }} en={en} onChange={(v) => edit({ description_ar: v.ar || null, description_en: v.en || null })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الرابط" hint={builtIn ? "دي صفحة أساسية في الموقع، رابطها ثابت." : <span dir="ltr">/p/{row.slug}</span>}>
              <Input dir="ltr" value={row.slug} disabled={builtIn} maxLength={49} onChange={(e) => edit({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
            </Field>
            <Field label="اللون">
              <input type="color" value={row.accent} onChange={(e) => edit({ accent: e.target.value })} className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-transparent" aria-label="لون الصفحة" />
            </Field>
          </div>
          <Toggle checked={!!row.settings.nav} onChange={(v) => edit({ settings: { ...row.settings, nav: v } })} label="قايمة سريعة تحت الواجهة" hint="بتجمع الأجزاء اللي ليها «اسم في القايمة»." />
          <Toggle checked={!!row.settings.applyBar} onChange={(v) => edit({ settings: { ...row.settings, applyBar: v } })} label="زرار «قدّم» ثابت تحت على الموبايل" hint="بيظهر لو فيه فورم وعدّاد في الواجهة." />
        </Card>
      </Section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="primary" loading={busy === "save"} disabled={!dirty} onClick={() => void save()}>
          حفظ التعديلات
        </Button>
        {builtIn && data.saved && (
          <Button
            onClick={async () => {
              if (await confirmDialog({ title: "ترجّع الصفحة الأصلية؟", body: "كل الأجزاء هترجع زي ما كانت أول مرة. لازم تحفظ بعدها.", ok: "رجّعها" })) {
                const p = robotexPage();
                edit({ blocks: p.blocks, settings: p.settings, accent: p.accent });
              }
            }}
          >
            رجّع الأصلية
          </Button>
        )}
        {!builtIn && data.saved && (
          <Button onClick={() => void save({ archived: !row.archived, ...(row.archived ? {} : { published: false }) }, row.archived ? "رجعت من الأرشيف" : "اتنقلت للأرشيف")}>{row.archived ? "رجّعها من الأرشيف" : "أرشيف"}</Button>
        )}
        {data.saved && (
          <Button icon="refresh" onClick={() => setVersions(true)}>
            النسخ القديمة
          </Button>
        )}
        {data.saved && can(me, "pages") && <DuplicateButton row={row} />}
      </div>

      <VersionsSheet
        open={versions}
        pageId={row.id}
        onClose={() => setVersions(false)}
        onRestore={(v) => {
          edit({ title_ar: v.title_ar, title_en: v.title_en, description_ar: v.description_ar, description_en: v.description_en, accent: v.accent, blocks: v.blocks, settings: v.settings });
          setVersions(false);
          toast("رجعت النسخة دي في المحرر. احفظ عشان تظهر على الموقع.", "info");
        }}
      />

      <Sheet open={adding} onClose={() => setAdding(false)} title="ضيف جزء">
        <div className="grid gap-2 sm:grid-cols-2" data-testid="block-palette">
          {BLOCK_KINDS.map((k) => (
            <button
              key={k.type}
              type="button"
              onClick={() => {
                const b = newBlock(k.type);
                setBlocks([...row.blocks, b]);
                setOpenId(b.id);
                setAdding(false);
              }}
              className="flex w-full min-w-0 items-start gap-3 whitespace-normal rounded-2xl border border-[var(--line-2)] p-3 text-start transition hover:border-cyan/50"
            >
              <Icon name={k.icon as IconKey} size={20} className="mt-0.5 shrink-0 text-cyan" />
              <span>
                <span className="block font-semibold text-chalk">{k.ar}</span>
                <span className="block text-xs text-fog">{k.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={preview} onClose={() => setPreview(false)} title="معاينة" wide>
        <div dir="rtl" className="-mx-5 overflow-hidden bg-void" data-testid="page-preview">
          <SitePageView page={asPage(row)} locale="ar" preview />
        </div>
      </Sheet>
    </>
  );
}

/* ─── One block ────────────────────────────────────────────────────────── */

function BlockCard({ block: b, index, handle, dragging, open, onToggle, onChange, onDuplicate, onRemove, ctx }: { block: Block; index: number; handle: HandleProps; dragging: boolean; open: boolean; onToggle: () => void; onChange: (b: Block) => void; onDuplicate: () => void; onRemove: () => void; ctx: Ctx }) {
  const k = kindOf(b.type);
  const up = (p: Partial<Block>) => onChange({ ...b, ...p } as Block);
  return (
    <Card className={`grid grid-cols-1 gap-3 p-0 ${dragging ? "border-cyan" : ""} ${b.hidden ? "opacity-60" : ""}`} data-testid="block-card">
      <div className="flex items-center gap-1 p-2">
        <button type="button" {...handle} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-fog hover:bg-white/5 hover:text-chalk">
          <Icon name="dots" size={20} />
        </button>
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-start" aria-expanded={open}>
          <Icon name={k.icon as IconKey} size={18} className="shrink-0 text-cyan" />
          <span className="min-w-0">
            <span className="block text-xs text-fog">
              {index + 1}. {k.ar}
              {b.hidden ? " · مخفي" : ""}
            </span>
            <span className="block truncate text-sm font-semibold text-chalk">{b.title.ar || "—"}</span>
          </span>
        </button>
        <button type="button" aria-label={b.hidden ? "أظهره" : "اخفيه"} onClick={() => up({ hidden: !b.hidden })} className="rounded-lg p-2 text-fog hover:text-chalk">
          <Icon name={b.hidden ? "eyeOff" : "eye"} size={17} />
        </button>
        <button type="button" aria-label="كرّره" onClick={onDuplicate} className="rounded-lg p-2 text-fog hover:text-chalk">
          <Icon name="copy" size={17} />
        </button>
        <button type="button" aria-label="شيله" onClick={onRemove} className="rounded-lg p-2 text-[#ff9aa5]">
          <Icon name="trash" size={17} />
        </button>
      </div>
      {open && (
        <div className="grid gap-3 border-t border-[var(--line)] p-4">
          <BlockFields b={b} up={up} ctx={ctx} />
        </div>
      )}
    </Card>
  );
}

function BlockFields({ b, up, ctx }: { b: Block; up: (p: Partial<Block>) => void; ctx: Ctx }) {
  const en = ctx.en;
  const headFields = (
    <>
      <TIn label="كلمة فوق العنوان" value={b.eyebrow} en={en} onChange={(eyebrow) => up({ eyebrow })} />
      <TIn label="العنوان" value={b.title} en={en} onChange={(title) => up({ title })} />
      {b.type !== "hero" && b.type !== "buttons" && b.type !== "video" && (
        <TIn label={b.type === "text" ? "الكلام" : "سطر تحت العنوان (اختياري)"} area value={b.body ?? { ar: "" }} en={en} onChange={(body) => up({ body })} />
      )}
    </>
  );
  const navFields =
    b.type !== "hero" ? (
      <div className="grid gap-3 sm:grid-cols-2">
        <TIn label="اسم في القايمة السريعة (اختياري)" value={b.nav ?? { ar: "" }} en={en} onChange={(nav) => up({ nav })} />
        <Field label="اسم الجزء في اللينك (#)" hint="عشان لينك زي #apply يوصل للجزء ده">
          <Input dir="ltr" value={b.anchor ?? ""} maxLength={30} onChange={(e) => up({ anchor: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
        </Field>
      </div>
    ) : null;
  switch (b.type) {
    case "hero":
      return (
        <>
          {headFields}
          <TIn label="الكلام تحت العنوان" area value={b.body ?? { ar: "" }} en={en} onChange={(body) => up({ body })} />
          <ImgPick label="الصورة الكبيرة" value={b.image ?? null} onChange={(image) => up({ image })} />
          <BtnsEdit value={b.buttons} en={en} onChange={(buttons) => up({ buttons })} />
          <CountdownEdit value={b.countdown ?? null} en={en} onChange={(countdown) => up({ countdown })} />
          <ListEdit
            label="أرقام وحقائق"
            items={b.facts}
            onChange={(facts) => up({ facts })}
            make={() => ({ k: { ar: "+100" }, t: { ar: "طالب" }, d: { ar: "العنوان" } })}
            render={(f, set) => (
              <div className="grid gap-2 sm:grid-cols-3">
                <TIn label="الرقم" value={f.k} en={en} onChange={(k) => set({ ...f, k })} />
                <TIn label="بجانبه" value={f.t} en={en} onChange={(t) => set({ ...f, t })} />
                <TIn label="فوقه" value={f.d} en={en} onChange={(d) => set({ ...f, d })} />
              </div>
            )}
          />
        </>
      );
    case "text":
    case "status":
      return (
        <>
          {headFields}
          {navFields}
        </>
      );
    case "cards":
      return (
        <>
          {headFields}
          <Field label="شكل الكروت">
            <Select value={b.layout} onChange={(e) => up({ layout: e.target.value as typeof b.layout })}>
              <option value="two">اتنين جنب بعض (كبار)</option>
              <option value="three">تلاتة جنب بعض</option>
              <option value="swipe">بتتسحب بالعرض على الموبايل</option>
            </Select>
          </Field>
          <ListEdit
            label="الكروت"
            items={b.items}
            onChange={(items) => up({ items })}
            make={() => ({ title: { ar: "كارت جديد" }, body: { ar: "" }, icon: "bolt" })}
            render={(x, set) => (
              <div className="grid gap-2">
                <TIn label="عنوان الكارت" value={x.title} en={en} onChange={(title) => set({ ...x, title })} />
                <TIn label="الكلام" area value={x.body} en={en} onChange={(body) => set({ ...x, body })} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <TIn label="كلمة صغيرة فوقه (اختياري)" value={x.tag ?? { ar: "" }} en={en} onChange={(tag) => set({ ...x, tag })} />
                  <IconSelect value={x.icon ?? ""} onChange={(icon) => set({ ...x, icon: icon || undefined })} />
                </div>
                <ImgPick label="صورة (اختياري)" value={x.image ?? null} onChange={(image) => set({ ...x, image })} />
              </div>
            )}
          />
          <BtnsEdit label="لينكات تحت الكروت" value={b.links} en={en} onChange={(links) => up({ links })} />
          {navFields}
        </>
      );
    case "steps":
      return (
        <>
          {headFields}
          <ListEdit
            label="الخطوات"
            items={b.items}
            onChange={(items) => up({ items })}
            make={() => ({ title: { ar: "خطوة" }, body: { ar: "" } })}
            render={(x, set) => (
              <div className="grid gap-2">
                <TIn label="الخطوة" value={x.title} en={en} onChange={(title) => set({ ...x, title })} />
                <TIn label="شرح" area value={x.body} en={en} onChange={(body) => set({ ...x, body })} />
              </div>
            )}
          />
          {navFields}
        </>
      );
    case "form":
      return (
        <>
          {headFields}
          <Field label="الفورم" hint="الأسئلة والفتح والقفل من «الفورمات» أو من فوق في «فورمات الصفحة».">
            <Select value={b.form} onChange={(e) => up({ form: e.target.value })} aria-label="الفورم">
              <option value="">— اختار فورم —</option>
              {ctx.forms
                .filter((f) => !f.archived || f.slug === b.form)
                .map((f) => (
                  <option key={f.id} value={f.slug}>
                    {f.title_ar} {f.open ? "(مفتوح)" : "(مقفول)"}
                  </option>
                ))}
            </Select>
          </Field>
          <Toggle checked={b.counter} onChange={(counter) => up({ counter })} label="اعرض عدد الوفد فوق الفورم" hint="للفورمات اللي عليها «وفد»." />
          {navFields}
        </>
      );
    case "timeline":
      return (
        <>
          {headFields}
          <ListEdit
            label="فقرات اليوم"
            items={b.items}
            onChange={(items) => up({ items })}
            make={() => ({ title: { ar: "فقرة" }, body: { ar: "" }, icon: "clock" })}
            render={(x, set) => (
              <div className="grid gap-2">
                <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
                  <TIn label="الفقرة" value={x.title} en={en} onChange={(title) => set({ ...x, title })} />
                  <IconSelect value={x.icon ?? ""} onChange={(icon) => set({ ...x, icon: icon || undefined })} />
                </div>
                <TIn label="شرح" area value={x.body} en={en} onChange={(body) => set({ ...x, body })} />
              </div>
            )}
          />
          <TIn label="عنوان القايمة الجانبية" value={b.asideTitle} en={en} onChange={(asideTitle) => up({ asideTitle })} />
          <ListEdit label="القايمة الجانبية (مثلاً: خد معاك)" items={b.aside} onChange={(aside) => up({ aside })} make={() => ({ ar: "" })} render={(x, set) => <TIn label="بند" value={x} en={en} onChange={set} />} />
          {navFields}
        </>
      );
    case "photos":
      return (
        <>
          {headFields}
          <ListEdit label="الصور" items={b.items} onChange={(items) => up({ items })} make={() => ({ src: "" })} render={(x, set) => <ImgPick label="صورة" value={x.src ? x : null} onChange={(v) => set(v ?? { src: "" })} />} />
          <Field label="ألبوم من الجاليري (اختياري)" hint="الصور اللي في «محتوى الموقع» عليها نفس الوسم بتظهر هنا لوحدها (مثلاً robotex).">
            <Input dir="ltr" value={b.album ?? ""} maxLength={40} onChange={(e) => up({ album: e.target.value.trim() })} />
          </Field>
          {b.album && (
            <>
              <TIn label="عنوان الألبوم" value={b.albumTitle ?? { ar: "" }} en={en} onChange={(albumTitle) => up({ albumTitle })} />
              <TIn label="لما الألبوم يكون فاضي" value={b.albumEmpty ?? { ar: "" }} en={en} onChange={(albumEmpty) => up({ albumEmpty })} />
            </>
          )}
          {navFields}
        </>
      );
    case "faq":
      return (
        <>
          {headFields}
          <ListEdit
            label="الأسئلة"
            items={b.items}
            onChange={(items) => up({ items })}
            make={() => ({ q: { ar: "سؤال؟" }, a: { ar: "" } })}
            render={(x, set) => (
              <div className="grid gap-2">
                <TIn label="السؤال" value={x.q} en={en} onChange={(q) => set({ ...x, q })} />
                <TIn label="الإجابة" area value={x.a} en={en} onChange={(a) => set({ ...x, a })} />
              </div>
            )}
          />
          {navFields}
        </>
      );
    case "buttons":
      return (
        <>
          {headFields}
          <BtnsEdit value={b.buttons} en={en} onChange={(buttons) => up({ buttons })} />
          {navFields}
        </>
      );
    case "video":
      return (
        <>
          {headFields}
          <Field label="لينك الفيديو على يوتيوب">
            <Input dir="ltr" value={b.url} maxLength={300} placeholder="https://youtu.be/…" onChange={(e) => up({ url: e.target.value.trim() })} />
          </Field>
          {navFields}
        </>
      );
  }
}

/* ─── Small editors ────────────────────────────────────────────────────── */

/** Arabic text with its optional English version. */
function TIn({ label, value, onChange, en, area }: { label: string; value: T; onChange: (v: T) => void; en: boolean; area?: boolean }) {
  const A = area ? Textarea : Input;
  return (
    <Field label={label}>
      <div className="grid gap-1.5">
        <A value={value.ar} maxLength={area ? 3000 : 300} rows={area ? 3 : undefined} onChange={(e: { target: { value: string } }) => onChange({ ...value, ar: e.target.value })} />
        {en && <A dir="ltr" placeholder="English (optional)" value={value.en ?? ""} maxLength={area ? 3000 : 300} rows={area ? 2 : undefined} onChange={(e: { target: { value: string } }) => onChange({ ...value, en: e.target.value })} />}
      </div>
    </Field>
  );
}

function ListEdit<I>({ label, items, onChange, make, render }: { label: string; items: I[]; onChange: (v: I[]) => void; make: () => I; render: (item: I, set: (v: I) => void) => ReactNode }) {
  // By position: an item's editor keeps its focus while you type (each keystroke makes a new item).
  const indexed = items.map((x, i) => ({ x, i, k: `i${i}` }));
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold text-mist">
        {label} ({items.length})
      </p>
      <Sortable
        items={indexed}
        keyOf={(r) => r.k}
        gap={8}
        onMove={(from, to) => onChange(moved(items, from, to))}
        render={(r, i, handle) => (
          <div className="flex gap-2 rounded-xl border border-[var(--line-2)] bg-white/[0.02] p-2">
            <div className="flex flex-col items-center gap-1">
              <button type="button" {...handle} className="flex size-8 items-center justify-center rounded-lg text-fog hover:text-chalk">
                <Icon name="dots" size={16} />
              </button>
              <button type="button" aria-label="شيل" onClick={() => onChange(items.filter((_, j) => j !== i))} className="flex size-8 items-center justify-center rounded-lg text-[#ff9aa5]">
                <Icon name="trash" size={15} />
              </button>
            </div>
            <div className="min-w-0 flex-1">{render(r.x, (v) => onChange(items.map((y, j) => (j === i ? v : y))))}</div>
          </div>
        )}
      />
      <Button size="sm" icon="plus" onClick={() => onChange([...items, make()])} disabled={items.length >= 40}>
        ضيف
      </Button>
    </div>
  );
}

function BtnsEdit({ label = "الزراير", value, onChange, en }: { label?: string; value: Btn[]; onChange: (v: Btn[]) => void; en: boolean }) {
  return (
    <ListEdit
      label={label}
      items={value}
      onChange={onChange}
      make={(): Btn => ({ label: { ar: "زرار" }, href: "#apply" })}
      render={(x, set) => (
        <div className="grid gap-2">
          <TIn label="مكتوب عليه" value={x.label} en={en} onChange={(l) => set({ ...x, label: l })} />
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="بيودّي على" hint="#apply لجزء في الصفحة، أو لينك https://">
              <Input dir="ltr" value={x.href} maxLength={300} onChange={(e) => set({ ...x, href: e.target.value.trim() })} />
            </Field>
            <label className="flex h-11 items-center gap-2 text-sm text-mist">
              <input type="checkbox" className="size-4 accent-[#2b6dff]" checked={!!x.primary} onChange={(e) => set({ ...x, primary: e.target.checked })} />
              زرار أساسي
            </label>
          </div>
        </div>
      )}
    />
  );
}

const toLocal = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : "");

function CountdownEdit({ value, onChange, en }: { value: Countdown | null; onChange: (v: Countdown | null) => void; en: boolean }) {
  const def = (): Countdown => ({ start: new Date(Date.now() + 14 * 864e5).toISOString(), end: new Date(Date.now() + 15 * 864e5).toISOString(), title: { ar: "فاضل على الفعالية", en: "Until the event" }, live: { ar: "الفعالية شغالة دلوقتي 🎉", en: "It's on now 🎉" }, over: { ar: "الفعالية خلصت 📸", en: "It's over 📸" } });
  return (
    <div className="grid gap-2 rounded-xl border border-[var(--line-2)] p-3">
      <Toggle checked={!!value} onChange={(v) => onChange(v ? def() : null)} label="عدّاد تنازلي في الواجهة" />
      {value && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="بيبدأ">
              <Input type="datetime-local" value={toLocal(value.start)} onChange={(e) => onChange({ ...value, start: fromLocal(e.target.value) })} />
            </Field>
            <Field label="بيخلص">
              <Input type="datetime-local" value={toLocal(value.end)} onChange={(e) => onChange({ ...value, end: fromLocal(e.target.value) })} />
            </Field>
          </div>
          <TIn label="فوق العدّاد" value={value.title} en={en} onChange={(title) => onChange({ ...value, title })} />
          <TIn label="وهي شغالة" value={value.live} en={en} onChange={(live) => onChange({ ...value, live })} />
          <TIn label="بعد ما تخلص" value={value.over} en={en} onChange={(over) => onChange({ ...value, over })} />
        </>
      )}
    </div>
  );
}

function IconSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="أيقونة">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">بدون</option>
        {ICON_NAMES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
    </Field>
  );
}

const BUILT_PHOTOS = Object.keys(photos as Record<string, unknown>);

function ImgPick({ label, value, onChange }: { label: string; value: Img | null; onChange: (v: Img | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [lib, setLib] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const img = useMemo(() => imageOf(value, "ar"), [value]);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const r = await uploadImage("site", "pages", f, { maxEdge: 1920 });
      onChange({ src: `site:${r.path}`, alt: value?.alt });
      toast(`اترفعت (${savedText(r.before, r.after)})`);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-[var(--line-2)] bg-white/[0.03]">{img && <img src={(img.webp || img.src).split(" ")[0]} alt="" className="size-full object-cover" />}</div>
        <div className="flex flex-wrap gap-2">
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
          <Button size="sm" icon="upload" loading={busy} onClick={() => file.current?.click()}>
            ارفع
          </Button>
          <Button size="sm" icon="image" onClick={() => setLib(true)}>
            صور جاهزة
          </Button>
          {value && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
              شيلها
            </Button>
          )}
        </div>
      </div>
      <Sheet open={lib} onClose={() => setLib(false)} title="صور جاهزة" wide>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {BUILT_PHOTOS.map((k) => {
            const p = imageOf({ src: `expo:${k}` }, "ar");
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  onChange({ src: `expo:${k}` });
                  setLib(false);
                }}
                className="aspect-[4/3] overflow-hidden rounded-xl border border-[var(--line-2)] hover:border-cyan"
              >
                {p && <img src={p.webp.split(" ")[0]} alt={p.alt} className="size-full object-cover" />}
              </button>
            );
          })}
        </div>
      </Sheet>
    </Field>
  );
}
