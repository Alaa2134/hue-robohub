"use client";
/** Page builder: editing one block (its fields, buttons, countdown, icons and pictures). */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ICON_NAMES } from "@/components/brand/icons";
import photos from "@/content/expo-photos.json";
import { imageOf, type Block, type Btn, type Countdown, type Img, type T } from "@/lib/site-pages";
import { errorText, savedText, uploadImage } from "./core";
import { kindOf, type Ctx } from "./staff-pages-model";
import { Sortable, moved, type HandleProps } from "./sortable";
import { Button, Card, Field, Icon, Input, Select, Sheet, Textarea, Toggle, toast, type IconKey } from "./ui";

/* ─── One block ────────────────────────────────────────────────────────── */

export function BlockCard({ block: b, index, handle, dragging, open, onToggle, onChange, onDuplicate, onRemove, ctx }: { block: Block; index: number; handle: HandleProps; dragging: boolean; open: boolean; onToggle: () => void; onChange: (b: Block) => void; onDuplicate: () => void; onRemove: () => void; ctx: Ctx }) {
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
export function TIn({ label, value, onChange, en, area }: { label: string; value: T; onChange: (v: T) => void; en: boolean; area?: boolean }) {
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
