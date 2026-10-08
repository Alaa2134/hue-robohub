"use client";
/**
 * Website content from the app: events, news, projects, gallery photos and achievements.
 * Anyone with "content" writes drafts; owners, admins and whoever has "publish" publish (enforced in
 * the database too).
 */
import { useState } from "react";
import { coreTracks } from "@/content/core-content";
import { siteImageUrl, type ContentKind, type SiteItem } from "@/lib/site-content";
import { can, errorText, fmt, fromLocalInput, must, removeObjects, sb, toLocalInput, uid, uploadImage, type StaffRow } from "./core";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, Select, Sheet, Textarea, Toggle, TopBar, confirmDialog, toast, useAsync } from "./ui";

const SITE = "https://buildxhue.com";
type F = "title" | "summary" | "body" | "image" | "starts" | "ends" | "location" | "url" | "track" | "tags" | "result" | "slug" | "pinned" | "sort" | "schedule" | "rsvp";
const KINDS: { key: ContentKind; label: string; one: string; fields: F[]; titleLabel: string; urlLabel?: string; startsLabel?: string; resultLabel?: string; path?: string }[] = [
  { key: "event", label: "الفعاليات", one: "فعالية", fields: ["title", "starts", "ends", "location", "summary", "rsvp", "url", "image", "body", "slug", "schedule"], titleLabel: "اسم الفعالية", urlLabel: "لينك تسجيل خارجي (لو مش هتستخدم التسجيل من الموقع)", startsLabel: "بتبدأ", path: "/events/" },
  { key: "post", label: "الأخبار", one: "خبر", fields: ["title", "summary", "body", "image", "slug", "pinned", "schedule"], titleLabel: "العنوان", path: "/news/" },
  { key: "project", label: "المشاريع", one: "مشروع", fields: ["title", "summary", "track", "result", "image", "url", "tags", "body", "slug", "pinned", "schedule"], titleLabel: "اسم المشروع", urlLabel: "لينك (GitHub، فيديو…)", resultLabel: "النتيجة / الإنجاز", path: "/projects/" },
  { key: "photo", label: "الجاليري", one: "صورة", fields: ["image", "title", "starts", "tags"], titleLabel: "وصف الصورة", startsLabel: "اتصوّرت يوم" },
  { key: "achievement", label: "الإنجازات", one: "إنجاز", fields: ["title", "result", "starts", "summary", "image", "url", "schedule"], titleLabel: "اسم المسابقة / الإنجاز", urlLabel: "لينك", startsLabel: "التاريخ", resultLabel: "المركز / النتيجة" },
  { key: "faq", label: "الأسئلة الشائعة", one: "سؤال", fields: ["title", "body", "sort"], titleLabel: "السؤال" },
  { key: "testimonial", label: "آراء الطلاب", one: "رأي", fields: ["title", "result", "summary", "image", "pinned", "sort"], titleLabel: "الاسم", resultLabel: "الصفة (مثلاً: طالب فرقة تانية · روبوتات)" },
  { key: "partner", label: "الشركاء والرعاة", one: "شريك", fields: ["title", "image", "url", "result", "sort"], titleLabel: "اسم الشريك", urlLabel: "موقع الشريك", resultLabel: "نوع الشراكة (راعي، شريك تعليمي…)" },
];
const kindOf = (k: ContentKind) => KINDS.find((x) => x.key === k)!;
const isAdmin = (me: StaffRow) => can(me, "publish");
const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Every website photo is compressed (WebP + thumbnail, no metadata) before it is uploaded. */
async function uploadSiteImage(me: StaffRow, file: Blob, maxEdge = 1800) {
  const r = await uploadImage("site", me.user_id, file, { maxEdge });
  return r.path;
}

export function SiteContentScreen({ me, query }: { me: StaffRow; query: URLSearchParams }) {
  const [kind, setKind] = useState<ContentKind>((KINDS.find((k) => k.key === query.get("k"))?.key ?? "event") as ContentKind);
  const { data, error, loading, reload } = useAsync(async () => (await sb().from("site_content").select("*").order("created_at", { ascending: false }).limit(2000).then(must)) as SiteItem[], []);
  const [editing, setEditing] = useState<SiteItem | "new" | null>(null);
  const [bulk, setBulk] = useState(false);
  const k = kindOf(kind);
  const list = (data ?? []).filter((i) => i.kind === kind);

  return (
    <>
      <TopBar
        title="محتوى الموقع"
        sub={isAdmin(me) ? "انت تقدر تنشر على الموقع" : "اكتب مسودة — اللي عندهم صلاحية النشر بينشروها"}
        actions={
          <Button size="sm" variant="primary" icon="plus" onClick={() => (kind === "photo" ? setBulk(true) : setEditing("new"))}>
            {kind === "photo" ? "صور" : k.one}
          </Button>
        }
      />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {KINDS.map((x) => (
          <Chip key={x.key} active={kind === x.key} onClick={() => setKind(x.key)} count={(data ?? []).filter((i) => i.kind === x.key).length}>
            {x.label}
          </Chip>
        ))}
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !list.length ? (
        <Empty icon="layers" title={`مفيش ${k.label} لسه`} body="أي حاجة تضيفها هنا وتتنشر، هتظهر على الموقع على طول." action={<Button variant="primary" icon="plus" onClick={() => (kind === "photo" ? setBulk(true) : setEditing("new"))}>إضافة</Button>} />
      ) : kind === "photo" ? (
        <div className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {list.map((i) => (
            <button key={i.id} type="button" onClick={() => setEditing(i)} className="relative aspect-square overflow-hidden rounded-xl border border-[var(--line)] bg-deep">
              {i.image_path && <img src={siteImageUrl(i.image_path)} alt="" loading="lazy" className="h-full w-full object-cover" />}
              {!i.published && <span className="absolute inset-x-0 bottom-0 bg-warn/85 py-0.5 text-center text-[11px] font-semibold text-void">مسودة</span>}
            </button>
          ))}
        </div>
      ) : (
        <List className="mt-4">
          {list.map((i) => (
            <Row key={i.id} onClick={() => setEditing(i)}>
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--line)] bg-deep">
                  {i.image_path ? <img src={siteImageUrl(i.image_path)} alt="" className="h-full w-full object-cover" /> : <Icon name="layers" size={20} className="text-fog" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-chalk">{i.title_ar || i.title || "—"}</p>
                  <p className="truncate text-xs text-fog">{i.starts_at ? fmt.dateTime(i.starts_at) : fmt.rel(i.created_at)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {i.published ? <Badge tone="ok">منشور</Badge> : <Badge tone="warn">مسودة</Badge>}
                  {i.pinned && <Badge tone="volt">مثبّت</Badge>}
                  {i.published && i.publish_at && new Date(i.publish_at) > new Date() && <Badge tone="info">مجدول {fmt.dateTime(i.publish_at)}</Badge>}
                </div>
              </div>
            </Row>
          ))}
        </List>
      )}
      {editing && <ItemSheet me={me} kind={kind} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {bulk && <BulkPhotos me={me} onClose={() => setBulk(false)} onDone={reload} />}
    </>
  );
}

function ItemSheet({ me, kind, item, onClose, onSaved }: { me: StaffRow; kind: ContentKind; item: SiteItem | null; onClose: () => void; onSaved: () => void }) {
  const k = kindOf(kind);
  const admin = isAdmin(me);
  const locked = !!item?.published && !admin;
  const has = (f: F) => k.fields.includes(f);
  const [f, setF] = useState({
    title: item?.title ?? "",
    title_ar: item?.title_ar ?? "",
    summary: item?.summary ?? "",
    summary_ar: item?.summary_ar ?? "",
    body: item?.body ?? "",
    body_ar: item?.body_ar ?? "",
    result: item?.result ?? "",
    result_ar: item?.result_ar ?? "",
    image_path: item?.image_path ?? null,
    url: item?.url ?? "",
    starts: toLocalInput(item?.starts_at),
    ends: toLocalInput(item?.ends_at),
    location: item?.location ?? "",
    location_ar: item?.location_ar ?? "",
    track: item?.track ?? "",
    tags: item?.tags.join("، ") ?? "",
    slug: item?.slug ?? "",
    pinned: item?.pinned ?? false,
    published: item?.published ?? false,
    sort: String(item?.sort_order ?? 100),
    schedule: toLocalInput(item?.publish_at),
    rsvp: item?.rsvp_open ?? false,
    capacity: item?.capacity ? String(item.capacity) : "",
  });
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const put = <K extends keyof typeof f>(key: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [key]: v }));

  const pick = async (file: File) => {
    setImgBusy(true);
    try {
      put("image_path", await uploadSiteImage(me, file));
    } catch (e) {
      toast.error(e);
    } finally {
      setImgBusy(false);
    }
  };

  const save = async () => {
    if (kind === "photo" ? !f.image_path : !(f.title.trim() || f.title_ar.trim())) return toast(kind === "photo" ? "اختار صورة" : `اكتب ${k.titleLabel}`, "error");
    if (f.url.trim() && !/^https?:\/\/\S+$/.test(f.url.trim())) return toast("اللينك لازم يبدأ بـ https://", "error");
    if (has("starts") && kind === "event" && !f.starts) return toast("حدد ميعاد الفعالية", "error");
    const slug = has("slug") ? slugify(f.slug || f.title) || `${kind}-${uid().slice(0, 6)}` : null;
    const row = {
      kind,
      slug,
      title: f.title.trim(),
      title_ar: f.title_ar.trim() || null,
      summary: f.summary.trim() || null,
      summary_ar: f.summary_ar.trim() || null,
      body: f.body.trim() || null,
      body_ar: f.body_ar.trim() || null,
      result: f.result.trim() || null,
      result_ar: f.result_ar.trim() || null,
      image_path: f.image_path,
      url: f.url.trim() || null,
      starts_at: has("starts") ? fromLocalInput(f.starts) : null,
      ends_at: has("ends") ? fromLocalInput(f.ends) : null,
      location: f.location.trim() || null,
      location_ar: f.location_ar.trim() || null,
      track: f.track || null,
      tags: f.tags
        .split(/[,،]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12),
      ...(has("sort") ? { sort_order: Math.max(0, Math.min(9999, Math.round(Number(f.sort)) || 100)) } : {}),
      ...(has("schedule") ? { publish_at: f.schedule ? fromLocalInput(f.schedule) : null } : {}),
      ...(has("rsvp") ? { rsvp_open: f.rsvp, capacity: f.capacity.trim() ? Math.max(1, Math.min(5000, Math.round(Number(f.capacity)) || 1)) : null } : {}),
      ...(admin ? { published: f.published, pinned: f.pinned } : {}),
    };
    setBusy(true);
    try {
      if (item) await sb().from("site_content").update(row).eq("id", item.id).then(must);
      else await sb().from("site_content").insert(row).then(must);
      if (item?.image_path && item.image_path !== f.image_path) removeObjects([item.image_path], "site").catch(() => undefined);
      toast(admin && f.published ? "اتحفظ واتنشر على الموقع" : "اتحفظ كمسودة");
      onSaved();
      onClose();
    } catch (e) {
      const msg = errorText(e);
      toast(/duplicate|unique/i.test(msg) ? "الرابط ده مستخدم — غيّره" : /published_locked/.test(msg) ? "ده منشور — المشرفين بس يعدّلوه" : msg, "error");
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!item || !(await confirmDialog({ title: "حذف نهائي؟", body: "هيتشال من الموقع ومن التطبيق.", ok: "حذف", danger: true }))) return;
    try {
      await sb().from("site_content").delete().eq("id", item.id).then(must);
      if (item.image_path) removeObjects([item.image_path], "site").catch(() => undefined);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };

  const pair = (key: "title" | "summary" | "body" | "result" | "location", label: string, area?: boolean) => (
    <>
      <Field label={`${label} (عربي)`}>
        {area ? (
          <Textarea value={f[`${key}_ar`]} disabled={locked} className={key === "body" ? "min-h-40" : "min-h-20"} onChange={(e) => put(`${key}_ar`, e.target.value)} />
        ) : (
          <Input value={f[`${key}_ar`]} disabled={locked} onChange={(e) => put(`${key}_ar`, e.target.value)} />
        )}
      </Field>
      <Field label={`${label} (English)`}>
        {area ? (
          <Textarea value={f[key]} dir="ltr" disabled={locked} className={key === "body" ? "min-h-40" : "min-h-20"} onChange={(e) => put(key, e.target.value)} />
        ) : (
          <Input value={f[key]} dir="ltr" disabled={locked} onChange={(e) => put(key, e.target.value)} />
        )}
      </Field>
    </>
  );

  return (
    <Sheet open onClose={onClose} title={item ? `تعديل ${k.one}` : `${k.one} جديد`} wide>
      <div className="grid gap-4">
        {locked && <Card className="border-warn/30 bg-warn/[0.06] text-sm text-[#ffd08a]">ده منشور على الموقع — المشرفين بس يقدروا يعدّلوه.</Card>}
        {has("image") && (
          <label className="flex cursor-pointer flex-col gap-2">
            <span className="font-semibold text-chalk">{kind === "partner" ? "اللوجو" : kind === "testimonial" ? "صورة الطالب (اختياري)" : "الصورة"}</span>
            <span className={`relative flex items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[var(--line-2)] bg-deep ${kind === "partner" || kind === "testimonial" ? "aspect-[2/1]" : "aspect-video"}`}>
              {f.image_path ? <img src={siteImageUrl(f.image_path, "thumb")} alt="" className={`h-full w-full ${kind === "partner" ? "object-contain p-4" : "object-cover"}`} /> : <Icon name="image" size={30} className="text-fog" />}
              {imgBusy && <span className="absolute inset-0 flex items-center justify-center bg-void/70 text-sm text-chalk">جارٍ الرفع…</span>}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={imgBusy || locked}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) pick(file);
              }}
            />
          </label>
        )}
        {has("title") && pair("title", k.titleLabel)}
        {has("starts") && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={k.startsLabel ?? "التاريخ"}>
              <Input type="datetime-local" value={f.starts} dir="ltr" disabled={locked} onChange={(e) => put("starts", e.target.value)} />
            </Field>
            {has("ends") && (
              <Field label="بتخلص (اختياري)">
                <Input type="datetime-local" value={f.ends} dir="ltr" disabled={locked} onChange={(e) => put("ends", e.target.value)} />
              </Field>
            )}
          </div>
        )}
        {has("location") && pair("location", "المكان")}
        {has("result") && pair("result", k.resultLabel ?? "النتيجة")}
        {has("summary") && pair("summary", kind === "testimonial" ? "الرأي (كلام الطالب)" : "وصف قصير", true)}
        {has("track") && (
          <Field label="المسار">
            <Select value={f.track} disabled={locked} onChange={(e) => put("track", e.target.value)}>
              <option value="">—</option>
              {coreTracks.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.nameAr}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {has("rsvp") && (
          <Card className="grid gap-3">
            <Toggle checked={f.rsvp} disabled={locked} onChange={(v) => put("rsvp", v)} label="التسجيل من الموقع" hint="فورم على صفحة الفعالية، وكل واحد بياخد تذكرة QR تتمسح على الباب من التطبيق." />
            {f.rsvp && (
              <Field label="عدد الأماكن (اختياري)" hint="لما تتملي، اللي بعدهم بيدخلوا قائمة انتظار وبيطلعوا لوحدهم لو حد لغى.">
                <Input value={f.capacity} disabled={locked} onChange={(e) => put("capacity", e.target.value.replace(/\D/g, ""))} inputMode="numeric" dir="ltr" className="w-32" placeholder="∞" />
              </Field>
            )}
          </Card>
        )}
        {has("url") && (
          <Field label={k.urlLabel ?? "لينك"}>
            <Input value={f.url} dir="ltr" placeholder="https://" inputMode="url" disabled={locked} onChange={(e) => put("url", e.target.value)} />
          </Field>
        )}
        {has("tags") && (
          <Field label={kind === "photo" ? "الألبوم / الكلمات" : "الكلمات المفتاحية"} hint="افصل بفاصلة">
            <Input value={f.tags} disabled={locked} onChange={(e) => put("tags", e.target.value)} />
          </Field>
        )}
        {has("body") && pair("body", kind === "faq" ? "الإجابة" : "التفاصيل", true)}
        {has("sort") && (
          <Field label="الترتيب" hint="الرقم الأصغر بيظهر الأول">
            <Input type="number" inputMode="numeric" value={f.sort} disabled={locked} onChange={(e) => put("sort", e.target.value)} className="w-32" />
          </Field>
        )}
        {has("slug") && (
          <Field label="الرابط" hint={k.path ? `${SITE}/ar${k.path}${slugify(f.slug || f.title) || "…"}` : undefined}>
            <Input value={f.slug} dir="ltr" placeholder={slugify(f.title) || "auto"} disabled={locked} onChange={(e) => put("slug", e.target.value.toLowerCase())} />
          </Field>
        )}
        {admin ? (
          <Card className="grid gap-3">
            <Toggle checked={f.published} onChange={(v) => put("published", v)} label="منشور على الموقع" />
            {has("pinned") && <Toggle checked={f.pinned} onChange={(v) => put("pinned", v)} label="تثبيت في الأول" />}
            {has("schedule") && f.published && (
              <Field label="انشر في ميعاد (اختياري)" hint="لو حددت ميعاد، هيظهر على الموقع لوحده في الوقت ده. سيبه فاضي عشان يظهر دلوقتي.">
                <Input type="datetime-local" value={f.schedule} onChange={(e) => put("schedule", e.target.value)} />
              </Field>
            )}
          </Card>
        ) : (
          !locked && <p className="text-sm text-fog">هيتحفظ كمسودة، والمشرف هيراجعه وينشره.</p>
        )}
        {!locked && (
          <Button variant="primary" size="lg" block loading={busy} disabled={imgBusy} onClick={save}>
            حفظ
          </Button>
        )}
        {item && (admin || (!item.published && item.created_by === me.user_id)) && (
          <Button variant="danger" icon="trash" block onClick={del}>
            حذف
          </Button>
        )}
      </div>
    </Sheet>
  );
}

/** Gallery: pick many photos from the phone and upload them in one go. */
function BulkPhotos({ me, onClose, onDone }: { me: StaffRow; onClose: () => void; onDone: () => void }) {
  const admin = isAdmin(me);
  const [files, setFiles] = useState<File[]>([]);
  const [album, setAlbum] = useState("");
  const [publish, setPublish] = useState(admin);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setDone(0);
    const tags = album
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);
    let failed = 0;
    for (const file of files) {
      try {
        const path = await uploadSiteImage(me, file);
        const taken = file.lastModified ? new Date(file.lastModified).toISOString() : null;
        await sb()
          .from("site_content")
          .insert({ kind: "photo", title: "", image_path: path, tags, starts_at: taken, ...(admin ? { published: publish } : {}) })
          .then(must);
      } catch {
        failed++;
      }
      setDone((n) => n + 1);
    }
    setBusy(false);
    toast(failed ? `اترفع ${files.length - failed} — و${failed} فشلوا` : `اترفع ${files.length} صورة`, failed ? "error" : "ok");
    onDone();
    onClose();
  };

  return (
    <Sheet open onClose={() => !busy && onClose()} title="رفع صور للجاليري">
      <div className="grid gap-4">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--line-2)] bg-deep p-8 text-center">
          <Icon name="upload" size={30} className="text-cyan" />
          <span className="font-semibold text-chalk">{files.length ? `${files.length} صورة متختارة` : "اختار صور من الموبايل"}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []).slice(0, 60));
              e.target.value = "";
            }}
          />
        </label>
        <Field label="الألبوم" hint="مثلاً: يوم التعريف 2026">
          <Input value={album} onChange={(e) => setAlbum(e.target.value)} />
        </Field>
        {admin && <Toggle checked={publish} onChange={setPublish} label="انشرهم على طول" />}
        <Button variant="primary" size="lg" block loading={busy} disabled={!files.length} onClick={run}>
          {busy ? `${done} / ${files.length}` : "رفع"}
        </Button>
      </div>
    </Sheet>
  );
}
