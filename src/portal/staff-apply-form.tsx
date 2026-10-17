"use client";
/**
 * The join form's questions, set from the app: rename, hide or make optional the built-in ones,
 * change their choices, hide tracks, and add questions of your own to any step. The website reads it
 * on load; submit_application checks answers against the same setup.
 */
import { useState } from "react";
import { coreTracks } from "@/content/core-content";
import {
  BUILTIN,
  DEFAULT_CONSENT,
  DEFAULT_LISTS,
  DEFAULT_STEPS,
  metaOf,
  newId,
  parseApplyConfig,
  type ApplyConfig,
  type ApplyOption,
  type BuiltinCfg,
  type BuiltinKey,
  type ExtraQ,
  type ExtraType,
} from "@/content/apply-form";
import { must, rpc, sb } from "./core";
import { Badge, Button, Card, ErrorBox, Field, Icon, Input, Loading, Section, Select, Textarea, Toggle, TopBar, confirmDialog, toast, useAsync } from "./ui";

const SITE = "https://buildxhue.com";

let cache: ApplyConfig | null = null;
/** The current setup (read once per session, refreshed after saving). */
export async function loadApplyConfig(): Promise<ApplyConfig> {
  if (cache) return cache;
  const r = (await sb().from("site_settings").select("value").eq("key", "apply_form").maybeSingle().then(must)) as { value: unknown } | null;
  cache = parseApplyConfig(r?.value);
  return cache;
}
export function useApplyConfig() {
  return useAsync(loadApplyConfig, []).data ?? {};
}

const TYPES: { k: ExtraType; ar: string }[] = [
  { k: "text", ar: "إجابة قصيرة" },
  { k: "textarea", ar: "إجابة طويلة" },
  { k: "select", ar: "اختيار واحد" },
  { k: "multi", ar: "أكتر من اختيار" },
  { k: "yesno", ar: "أيوه / لأ" },
  { k: "number", ar: "رقم" },
  { k: "url", ar: "لينك" },
  { k: "date", ar: "تاريخ" },
];

/** Drops empty texts so the saved setup only holds what was changed. */
function clean(cfg: ApplyConfig): ApplyConfig {
  const t = (s?: string) => (s?.trim() ? s.trim() : undefined);
  const fields: ApplyConfig["fields"] = {};
  for (const [k, f] of Object.entries(cfg.fields ?? {}) as [BuiltinKey, BuiltinCfg][]) {
    const opts = f.options?.map((o) => ({ key: o.key, ar: o.ar.trim(), en: t(o.en), hint_ar: t(o.hint_ar), hint_en: t(o.hint_en) })).filter((o) => o.ar);
    const x: BuiltinCfg = { label_ar: t(f.label_ar), label_en: t(f.label_en), hint_ar: t(f.hint_ar), hint_en: t(f.hint_en), hidden: f.hidden || undefined, required: f.required, options: opts?.length ? opts : undefined };
    if (Object.values(x).some((v) => v !== undefined)) fields[k] = JSON.parse(JSON.stringify(x));
  }
  const steps = (a?: string[]) => (a?.some((s) => s.trim()) ? [0, 1, 2].map((i) => a[i]?.trim() ?? "") : undefined);
  return JSON.parse(
    JSON.stringify({
      steps_ar: steps(cfg.steps_ar),
      steps_en: steps(cfg.steps_en),
      fields,
      extra: (cfg.extra ?? []).map((q) => ({
        ...q,
        label_ar: q.label_ar.trim(),
        label_en: t(q.label_en),
        help_ar: t(q.help_ar),
        help_en: t(q.help_en),
        required: !!q.required,
        options: q.type === "select" || q.type === "multi" ? (q.options ?? []).map((o) => ({ ar: o.ar.trim(), en: t(o.en) })).filter((o) => o.ar) : undefined,
      })),
      tracks_hidden: cfg.tracks_hidden?.length ? cfg.tracks_hidden : undefined,
      consent_ar: t(cfg.consent_ar),
      consent_en: t(cfg.consent_en),
    }),
  ) as ApplyConfig;
}

export function ApplyFormEditor() {
  const { data, error, loading, reload, set } = useAsync(async () => {
    cache = null;
    return loadApplyConfig();
  }, []);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  const cfg = data;
  const edit = (next: ApplyConfig) => {
    set(next);
    setDirty(true);
  };
  const field = (k: BuiltinKey) => cfg.fields?.[k] ?? {};
  const setField = (k: BuiltinKey, p: Partial<BuiltinCfg>) => edit({ ...cfg, fields: { ...cfg.fields, [k]: { ...field(k), ...p } } });
  const extra = cfg.extra ?? [];
  const setExtra = (id: string, p: Partial<ExtraQ>) => edit({ ...cfg, extra: extra.map((q) => (q.id === id ? { ...q, ...p } : q)) });
  const moveExtra = (id: string, dir: number) => {
    const i = extra.findIndex((q) => q.id === id);
    const step = extra[i]!.step;
    // the next question in the same step
    let j = i + dir;
    while (j >= 0 && j < extra.length && extra[j]!.step !== step) j += dir;
    if (j < 0 || j >= extra.length) return;
    const next = [...extra];
    [next[i], next[j]] = [next[j]!, next[i]!];
    edit({ ...cfg, extra: next });
  };

  const save = async (next: ApplyConfig = cfg, msg = "اتحفظ — الموقع بيقرا الفورم الجديد على طول") => {
    const out = clean(next);
    for (const q of out.extra ?? []) {
      if (!q.label_ar) return toast("في سؤال من غير عنوان", "error");
      if ((q.type === "select" || q.type === "multi") && !q.options?.length) return toast(`السؤال «${q.label_ar}» محتاج اختيارات`, "error");
    }
    for (const m of BUILTIN) if (m.list && out.fields?.[m.key]?.options?.length === 0) return toast("كل قايمة لازم يبقى فيها اختيار واحد على الأقل", "error");
    if (coreTracks.every((t) => out.tracks_hidden?.includes(t.slug))) return toast("سيب مسار واحد على الأقل ظاهر", "error");
    setBusy(true);
    try {
      await rpc("staff_apply_form_save", { p: out });
      cache = out;
      set(out);
      setDirty(false);
      toast(msg);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const addExtra = (step: 0 | 1 | 2) => {
    const q: ExtraQ = { id: newId("q_"), step, type: "text", label_ar: "", required: false };
    edit({ ...cfg, extra: [...extra, q] });
    setOpen(q.id);
  };

  return (
    <>
      <TopBar
        title="فورم الانضمام"
        sub="الأسئلة اللي بتظهر في صفحة «انضم» على الموقع"
        back="/staff/applications"
        actions={
          <Button size="sm" variant="primary" loading={busy} disabled={!dirty} onClick={() => save()}>
            حفظ
          </Button>
        }
      />
      <Card className="grid gap-2 text-sm text-mist">
        <p>عدّل عنوان أي سؤال أو توضيحه، اخفي الأسئلة اللي مش محتاجها، خلّيها مطلوبة أو اختيارية، غيّر الاختيارات، وزوّد أسئلة جديدة في أي خطوة.</p>
        <p className="text-xs text-fog">الاسم والموبايل والإيميل والمسار الأول والموافقة ثابتين لأن القبول والواتساب والإيميل معتمدين عليهم. الإجابات القديمة مش بتتغيّر.</p>
        <div className="flex flex-wrap gap-2">
          <a href={`${SITE}/ar/join/`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line-2)] px-3 text-sm text-chalk">
            <Icon name="link" size={16} />
            افتح صفحة الانضمام
          </a>
        </div>
      </Card>

      {[0, 1, 2].map((s) => (
        <Section key={s} title={`الخطوة ${s + 1}: ${cfg.steps_ar?.[s]?.trim() || DEFAULT_STEPS.ar[s]}`}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
            <Card className="grid gap-2 sm:grid-cols-2">
              <Input placeholder={DEFAULT_STEPS.ar[s]} value={cfg.steps_ar?.[s] ?? ""} maxLength={60} aria-label="اسم الخطوة" onChange={(e) => edit({ ...cfg, steps_ar: [0, 1, 2].map((i) => (i === s ? e.target.value : (cfg.steps_ar?.[i] ?? ""))) })} />
              <Input dir="ltr" placeholder={DEFAULT_STEPS.en[s]} value={cfg.steps_en?.[s] ?? ""} maxLength={60} aria-label="Step name (English)" onChange={(e) => edit({ ...cfg, steps_en: [0, 1, 2].map((i) => (i === s ? e.target.value : (cfg.steps_en?.[i] ?? ""))) })} />
            </Card>
            {BUILTIN.filter((m) => m.step === s).map((m) => (
              <BuiltinCard
                key={m.key}
                k={m.key}
                f={field(m.key)}
                open={open === m.key}
                onOpen={() => setOpen(open === m.key ? null : m.key)}
                onChange={(p) => setField(m.key, p)}
                tracksHidden={cfg.tracks_hidden ?? []}
                onTracksHidden={(v) => edit({ ...cfg, tracks_hidden: v })}
              />
            ))}
            {extra
              .filter((q) => q.step === s)
              .map((q) => (
                <ExtraCard
                  key={q.id}
                  q={q}
                  open={open === q.id}
                  onOpen={() => setOpen(open === q.id ? null : q.id)}
                  onChange={(p) => setExtra(q.id, p)}
                  onMove={(d) => moveExtra(q.id, d)}
                  onRemove={async () => {
                    if (q.label_ar.trim() && !(await confirmDialog({ title: `تمسح سؤال «${q.label_ar}»؟`, body: "الإجابات اللي اتبعتت قبل كده بتفضل محفوظة مع الطلبات.", ok: "امسح", danger: true }))) return;
                    edit({ ...cfg, extra: extra.filter((x) => x.id !== q.id) });
                  }}
                />
              ))}
            <Button icon="plus" disabled={extra.length >= 25} onClick={() => addExtra(s as 0 | 1 | 2)}>
              سؤال جديد في الخطوة دي
            </Button>
          </div>
        </Section>
      ))}

      <Section title="الموافقة في آخر الفورم">
        <Card className="grid gap-2">
          <Textarea rows={2} maxLength={400} placeholder={DEFAULT_CONSENT.ar} value={cfg.consent_ar ?? ""} onChange={(e) => edit({ ...cfg, consent_ar: e.target.value })} />
          <Textarea dir="ltr" rows={2} maxLength={400} placeholder={DEFAULT_CONSENT.en} value={cfg.consent_en ?? ""} onChange={(e) => edit({ ...cfg, consent_en: e.target.value })} />
          <p className="text-xs text-fog">لو سبتها فاضية بيظهر النص الأصلي.</p>
        </Card>
      </Section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} disabled={!dirty} onClick={() => save()}>
          حفظ التعديلات
        </Button>
        <Button
          onClick={async () => {
            if (!(await confirmDialog({ title: "ترجّع الفورم الأصلي؟", body: "كل التعديلات والأسئلة الإضافية هتتشال من الموقع. الطلبات اللي اتبعتت مش هتتأثر.", ok: "رجّعه", danger: true }))) return;
            await save({}, "رجع الفورم الأصلي");
          }}
        >
          رجّع الفورم الأصلي
        </Button>
      </div>
    </>
  );
}

function BuiltinCard({ k, f, open, onOpen, onChange, tracksHidden, onTracksHidden }: { k: BuiltinKey; f: BuiltinCfg; open: boolean; onOpen: () => void; onChange: (p: Partial<BuiltinCfg>) => void; tracksHidden: string[]; onTracksHidden: (v: string[]) => void }) {
  const m = metaOf(k);
  const hidden = !m.lock && !!f.hidden;
  const required = m.lock ? true : (f.required ?? !!m.req);
  const label = f.label_ar?.trim() || m.label.ar;
  const options = m.list ? (f.options ?? DEFAULT_LISTS[m.list]) : null;
  return (
    <Card className={`grid min-w-0 gap-3 ${hidden ? "opacity-60" : ""}`} data-testid={`af-${k}`}>
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start" aria-expanded={open}>
          <p className="truncate font-semibold text-chalk">{label}</p>
          <p className="text-xs text-fog">{hidden ? "مخفي" : required ? "مطلوب" : "اختياري"}</p>
        </button>
        {m.lock ? (
          <Badge tone="muted">أساسي</Badge>
        ) : (
          <label className="flex items-center gap-1.5 text-sm text-mist">
            <input type="checkbox" className="size-4 accent-[#2b6dff]" checked={!hidden} onChange={(e) => onChange({ hidden: !e.target.checked })} />
            ظاهر
          </label>
        )}
        <button type="button" aria-label="تعديل" onClick={onOpen} className="rounded-lg p-1.5 text-fog hover:text-chalk">
          <Icon name={open ? "close" : "edit"} size={16} />
        </button>
      </div>
      {open && (
        <div className="grid gap-3 border-t border-[var(--line)] pt-3">
          {!m.lock && !hidden && <Toggle checked={required} onChange={(v) => onChange({ required: v })} label={required ? "مطلوب" : "اختياري"} hint={k === "motivation" ? "لو مطلوب، لازم 20 حرف على الأقل." : undefined} />}
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="السؤال">
              <Input placeholder={m.label.ar} value={f.label_ar ?? ""} maxLength={300} onChange={(e) => onChange({ label_ar: e.target.value })} />
            </Field>
            <Field label="Question (English)">
              <Input dir="ltr" placeholder={m.label.en} value={f.label_en ?? ""} maxLength={300} onChange={(e) => onChange({ label_en: e.target.value })} />
            </Field>
            <Field label="توضيح تحت السؤال">
              <Input placeholder={m.hint?.ar ?? "اختياري"} value={f.hint_ar ?? ""} maxLength={300} onChange={(e) => onChange({ hint_ar: e.target.value })} />
            </Field>
            <Field label="Hint (English)">
              <Input dir="ltr" placeholder={m.hint?.en ?? "Optional"} value={f.hint_en ?? ""} maxLength={300} onChange={(e) => onChange({ hint_en: e.target.value })} />
            </Field>
          </div>
          {k === "track_first" && (
            <Field label="المسارات اللي بتظهر في الفورم" hint="المسار المخفي بيختفي من الاختيار الأول والتاني.">
              <div className="flex flex-wrap gap-2">
                {coreTracks.map((t) => {
                  const on = !tracksHidden.includes(t.slug);
                  return (
                    <label key={t.slug} className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2 text-sm text-chalk">
                      <input type="checkbox" className="size-4 accent-[#2b6dff]" checked={on} onChange={() => onTracksHidden(on ? [...tracksHidden, t.slug] : tracksHidden.filter((x) => x !== t.slug))} />
                      {t.nameAr}
                    </label>
                  );
                })}
              </div>
            </Field>
          )}
          {options && m.list && <OptionsEditor list={m.list} options={options} withHint={m.list === "level"} changed={!!f.options} onChange={(o) => onChange({ options: o })} />}
        </div>
      )}
    </Card>
  );
}

function OptionsEditor({ list, options, withHint, changed, onChange }: { list: keyof typeof DEFAULT_LISTS; options: ApplyOption[]; withHint: boolean; changed: boolean; onChange: (o: ApplyOption[] | undefined) => void }) {
  const setAt = (i: number, p: Partial<ApplyOption>) => onChange(options.map((o, j) => (j === i ? { ...o, ...p } : o)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <Field label={list === "faculty" ? "الكليات المقترحة" : "الاختيارات"} hint={list === "faculty" ? "الطالب بيختار منها أو يكتب كليته." : "الطلبات القديمة بتفضل بالاختيار اللي اختاروه."}>
      <div className="grid gap-2">
        {options.map((o, i) => (
          <div key={o.key} className="grid gap-2 rounded-xl border border-[var(--line)] p-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input placeholder="بالعربي" value={o.ar} maxLength={120} onChange={(e) => setAt(i, { ar: e.target.value })} />
            <Input dir="ltr" placeholder="English" value={o.en ?? ""} maxLength={120} onChange={(e) => setAt(i, { en: e.target.value })} />
            <div className="flex items-center gap-1">
              <button type="button" aria-label="لفوق" onClick={() => move(i, -1)} className="rounded-lg p-1.5 text-fog hover:text-chalk">
                ↑
              </button>
              <button type="button" aria-label="لتحت" onClick={() => move(i, 1)} className="rounded-lg p-1.5 text-fog hover:text-chalk">
                ↓
              </button>
              <button type="button" aria-label="امسح الاختيار" disabled={options.length <= 1} onClick={() => onChange(options.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-[#ff9aa5] disabled:opacity-30">
                <Icon name="trash" size={16} />
              </button>
            </div>
            {withHint && <Input className="sm:col-span-2" placeholder="توضيح صغير تحت الاختيار" value={o.hint_ar ?? ""} maxLength={160} onChange={(e) => setAt(i, { hint_ar: e.target.value })} />}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon="plus" disabled={options.length >= 40} onClick={() => onChange([...options, { key: newId("o_"), ar: "" }])}>
            اختيار جديد
          </Button>
          {changed && (
            <Button size="sm" variant="ghost" onClick={() => onChange(undefined)}>
              رجّع الاختيارات الأصلية
            </Button>
          )}
        </div>
      </div>
    </Field>
  );
}

function ExtraCard({ q, open, onOpen, onChange, onMove, onRemove }: { q: ExtraQ; open: boolean; onOpen: () => void; onChange: (p: Partial<ExtraQ>) => void; onMove: (d: number) => void; onRemove: () => void }) {
  const typeAr = TYPES.find((t) => t.k === q.type)?.ar ?? q.type;
  return (
    <Card className="grid min-w-0 gap-3 border-cyan/25" data-testid="af-extra">
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start" aria-expanded={open}>
          <p className="truncate font-semibold text-chalk">{q.label_ar.trim() || "سؤال جديد"}</p>
          <p className="text-xs text-fog">
            {typeAr} · {q.required ? "مطلوب" : "اختياري"}
          </p>
        </button>
        <Badge tone="info">إضافي</Badge>
        <button type="button" aria-label="لفوق" onClick={() => onMove(-1)} className="rounded-lg p-1.5 text-fog hover:text-chalk">
          ↑
        </button>
        <button type="button" aria-label="لتحت" onClick={() => onMove(1)} className="rounded-lg p-1.5 text-fog hover:text-chalk">
          ↓
        </button>
        <button type="button" aria-label="امسح السؤال" onClick={onRemove} className="rounded-lg p-1.5 text-[#ff9aa5]">
          <Icon name="trash" size={16} />
        </button>
      </div>
      {open && (
        <div className="grid gap-3 border-t border-[var(--line)] pt-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="نوع الإجابة">
              <Select value={q.type} onChange={(e) => onChange({ type: e.target.value as ExtraType, ...(["select", "multi"].includes(e.target.value) && !q.options?.length ? { options: [{ ar: "اختيار 1" }, { ar: "اختيار 2" }] } : {}) })}>
                {TYPES.map((t) => (
                  <option key={t.k} value={t.k}>
                    {t.ar}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="في أنهي خطوة">
              <Select value={q.step} onChange={(e) => onChange({ step: Number(e.target.value) as 0 | 1 | 2 })}>
                {[0, 1, 2].map((s) => (
                  <option key={s} value={s}>
                    {`الخطوة ${s + 1}`}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <Toggle checked={!!q.required} onChange={(v) => onChange({ required: v })} label={q.required ? "مطلوب" : "اختياري"} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="السؤال بالعربي" value={q.label_ar} maxLength={300} onChange={(e) => onChange({ label_ar: e.target.value })} />
            <Input dir="ltr" placeholder="Question (English, optional)" value={q.label_en ?? ""} maxLength={300} onChange={(e) => onChange({ label_en: e.target.value })} />
            <Input placeholder="توضيح تحت السؤال (اختياري)" value={q.help_ar ?? ""} maxLength={300} onChange={(e) => onChange({ help_ar: e.target.value })} />
            <Input dir="ltr" placeholder="Hint (English, optional)" value={q.help_en ?? ""} maxLength={300} onChange={(e) => onChange({ help_en: e.target.value })} />
          </div>
          {(q.type === "select" || q.type === "multi") && (
            <Field label="الاختيارات" hint="كل اختيار في سطر">
              <Textarea
                rows={Math.min(8, Math.max(3, (q.options ?? []).length + 1))}
                value={(q.options ?? []).map((o) => o.ar).join("\n")}
                onChange={(e) => onChange({ options: e.target.value.split("\n").map((s) => s.trimStart()).filter((s, k, all) => s || k === all.length - 1).map((ar) => ({ ar: ar.slice(0, 120) })) })}
                onBlur={() => onChange({ options: (q.options ?? []).map((o) => ({ ar: o.ar.trim() })).filter((o) => o.ar) })}
              />
            </Field>
          )}
        </div>
      )}
    </Card>
  );
}
