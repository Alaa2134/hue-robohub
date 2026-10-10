"use client";

/**
 * "صفحات الموقع": the team builds website pages from blocks (src/lib/site-pages.ts) and drags them
 * into order. The Robotex visit page is one of them (it shows the built-in version until it's saved
 * here once). A page's forms open and close right from its card and its editor, and their questions
 * are one tap away (the form editor). Publishing a page needs the "publish" permission.
 */
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { BLOCK_KINDS, BUILT_IN, TEMPLATES, newBlock, robotexPage, uidOf, type Block } from "@/lib/site-pages";
import { can, errorText, fmt, must, sb, type StaffRow } from "./core";
import { BlockCard, TIn } from "./staff-page-blocks";
import { DuplicateButton, PageStats, Schedule, VersionsSheet } from "./staff-page-tools";
import { COLS, asPage, formsOf, fromPage, kindOf, siteLink, type Ctx, type FormLite, type PageRow } from "./staff-pages-model";
import { Sortable, moved } from "./sortable";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Icon, Input, Loading, Section, Sheet, Toggle, TopBar, confirmDialog, copyText, go, toast, useAsync, type IconKey } from "./ui";

const SitePageView = dynamic(() => import("@/components/pages/site-page").then((m) => m.SitePageView), { ssr: false, loading: () => <Loading /> });

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

/* ─── The editor ───────────────────────────────────────────────────────── */


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
