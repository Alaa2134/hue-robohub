"use client";
/**
 * Print Hub. Students (/me/print) send a 3D file, see a rough estimate measured from the file itself,
 * and accept the price once the team has sliced it. The team (/staff/print) sets materials and rates,
 * downloads each file, enters what its slicer reported (grams and time) — the price follows from the
 * rates — and moves the job along. The estimate is never the price.
 */
import { useMemo, useState } from "react";
import { roughEstimate, measureFile, type Mesh } from "./print-estimate";
import { fmt, rpc, sb, studentRpc, studentStore } from "./core";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Select, Sheet, Textarea, Toggle, TopBar, toast, useAsync } from "./ui";

type Material = { key: string; name: string; name_en?: string; colors: string[]; density: number; price_per_gram: number | null };
type Info = { open: boolean; materials: Material[]; price_per_hour: number | null; min_fee: number | null; note: string; priced: boolean };
type Status = "submitted" | "quoted" | "accepted" | "printing" | "ready" | "delivered" | "declined" | "cancelled" | "rejected";
type MyJob = { id: string; code: string; file_name: string; material: string; color: string; quality: string; infill: number; quantity: number; est_volume: number | null; status: Status; slicer: string | null; grams: number | null; minutes: number | null; price: number | null; quote_note: string | null; reason: string | null; paid: boolean; created_at: string };

export const PRINT_STATUS: Record<Status, { label: string; tone: "ok" | "warn" | "danger" | "info" | "muted" | "volt" }> = {
  submitted: { label: "مستني الفريق يعمل Slice", tone: "info" },
  quoted: { label: "السعر جاهز — مستني موافقتك", tone: "warn" },
  accepted: { label: "وافقت — في الطابور", tone: "volt" },
  printing: { label: "بيتطبع", tone: "volt" },
  ready: { label: "جاهز للاستلام", tone: "ok" },
  delivered: { label: "اتسلّم", tone: "muted" },
  declined: { label: "رفضت السعر", tone: "muted" },
  cancelled: { label: "اتلغى", tone: "muted" },
  rejected: { label: "الفريق رفضه", tone: "danger" },
};
const QUALITY = { draft: "سريعة (طبقات أتخن)", normal: "عادية", fine: "دقيقة (أبطأ)" } as const;
const ERR: Record<string, string> = {
  closed: "الطباعة مقفولة دلوقتي",
  type: "الملف لازم يكون STL أو 3MF أو OBJ",
  too_big: "الملف أكبر من 20 ميجا",
  too_many: "عندك 3 طلبات مفتوحة — استنى واحد يخلص",
  rate_limited: "محاولات كتير النهارده، جرّب بكرة",
  material: "اختار خامة",
};
const failed = (e: unknown) => toast(ERR[(e as Error)?.message ?? ""] ?? "حصلت مشكلة، جرّب تاني", "error");
const hours = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} س ${min % 60} د` : `${min} د`);

async function uploadPrintFile(file: File) {
  const s = studentStore.get();
  if (!s) throw new Error("session_invalid");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const { data, error } = await sb().functions.invoke<{ ok: boolean; path: string; token: string; error?: string }>("student-upload", {
    body: { token: s.token, kind: "print", ext, size: file.size },
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
  const up = await sb().storage.from("submissions").uploadToSignedUrl(data.path, data.token, file, { contentType: "application/octet-stream" });
  if (up.error) throw up.error;
  return data.path;
}

/* ─── Student ──────────────────────────────────────────────────────────── */

function NewPrint({ info, onDone }: { info: Info; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [mesh, setMesh] = useState<Mesh | null>(null);
  const [unread, setUnread] = useState(false);
  const [material, setMaterial] = useState(info.materials[0]?.key ?? "");
  const mat = info.materials.find((m) => m.key === material);
  const [color, setColor] = useState(mat?.colors[0] ?? "");
  const [quality, setQuality] = useState<keyof typeof QUALITY>("normal");
  const [infill, setInfill] = useState(20);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const est = useMemo(() => (mesh && mat ? roughEstimate(mesh, { density: mat.density, infill, quality, quantity }) : null), [mesh, mat, infill, quality, quantity]);

  const pick = async (f: File | null) => {
    setFile(f);
    setMesh(null);
    setUnread(false);
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return toast(ERR.too_big, "error");
    try {
      const m = await measureFile(f);
      setMesh(m);
      setUnread(!m);
    } catch {
      setUnread(true);
    }
  };
  const send = async () => {
    if (!file) return toast("اختار ملف الموديل", "error");
    setBusy(true);
    try {
      const path = await uploadPrintFile(file);
      const r = await studentRpc<{ ok: boolean; error?: string; code?: string }>("student_print_submit", {
        p_path: path,
        p_name: file.name,
        p_size: file.size,
        p_volume: mesh ? Math.round(mesh.volume / 10) / 100 : null,
        p_bbox: mesh ? mesh.bbox.map((x) => Math.round(x * 10) / 10) : null,
        p_material: material,
        p_color: color,
        p_quality: quality,
        p_infill: infill,
        p_quantity: quantity,
        p_notes: notes,
      });
      if (!r.ok) throw new Error(r.error);
      toast(`الطلب اتبعت: ${r.code}`);
      onDone();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="grid gap-3" data-testid="print-new">
      <p className="font-semibold text-chalk">طلب طباعة جديد</p>
      <Field label="ملف الموديل (STL أو 3MF أو OBJ، لحد 20 ميجا)">
        <Input type="file" accept=".stl,.3mf,.obj" onChange={(e) => void pick(e.target.files?.[0] ?? null)} data-testid="print-file" />
      </Field>
      {mesh && (
        <p className="text-sm text-mist" dir="ltr" data-testid="print-size">
          {`${mesh.bbox.map((x) => x.toFixed(1)).join(" × ")} mm · ${(mesh.volume / 1000).toFixed(2)} cm³`}
        </p>
      )}
      {unread && <p className="text-sm text-fog">مقدرناش نقيس الملف ده هنا — الفريق هيقيسه في الـSlicer.</p>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="الخامة">
          <Select
            value={material}
            onChange={(e) => {
              setMaterial(e.target.value);
              setColor(info.materials.find((m) => m.key === e.target.value)?.colors[0] ?? "");
            }}
          >
            {info.materials.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="اللون">
          <Select value={color} onChange={(e) => setColor(e.target.value)}>
            {(mat?.colors ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="الجودة">
          <Select value={quality} onChange={(e) => setQuality(e.target.value as keyof typeof QUALITY)}>
            {(Object.keys(QUALITY) as (keyof typeof QUALITY)[]).map((q) => (
              <option key={q} value={q}>
                {QUALITY[q]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="العدد">
          <Input type="number" min={1} max={20} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
        </Field>
      </div>
      <Field label={`الحشو (Infill): ${infill}%`} hint="أعلى = أقوى وأتقل وأغلى">
        <input type="range" min={5} max={100} step={5} value={infill} onChange={(e) => setInfill(Number(e.target.value))} className="w-full" />
      </Field>
      <Field label="ملاحظات (اختياري)">
        <Textarea value={notes} maxLength={600} rows={2} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {est && (
        <div className="rounded-xl border border-warn/40 bg-warn/5 p-3 text-sm" data-testid="print-estimate">
          <p className="font-semibold text-chalk">تقدير مبدئي — مش السعر</p>
          <p className="mt-1 text-mist">{`خامة حوالي ${Math.round(est.grams[0])}–${Math.round(est.grams[1])} جرام، ووقت حوالي ${hours(Math.round(est.hours[0] * 60))} – ${hours(Math.round(est.hours[1] * 60))}.`}</p>
          {info.priced && mat?.price_per_gram != null && info.price_per_hour != null && (
            <p className="mt-1 text-mist">{`يعني تقريبًا ${Math.ceil(Math.max(info.min_fee ?? 0, est.grams[0] * mat.price_per_gram + est.hours[0] * info.price_per_hour))}–${Math.ceil(Math.max(info.min_fee ?? 0, est.grams[1] * mat.price_per_gram + est.hours[1] * info.price_per_hour))} ج.`}</p>
          )}
          <p className="mt-1 text-xs text-fog">السعر النهائي بيتحسب بعد ما الفريق يعمل Slice للملف بإعدادات الطابعة الحقيقية، وإنت بتوافق عليه قبل ما نطبع.</p>
        </div>
      )}
      <Button loading={busy} disabled={!file} onClick={() => void send()}>
        ابعت للطباعة
      </Button>
    </Card>
  );
}

export function StudentPrint() {
  const info = useAsync(() => rpc<Info>("print_hub_info"), []);
  const jobs = useAsync(() => studentRpc<MyJob[]>("student_print_jobs"), []);
  const [busy, setBusy] = useState<string | null>(null);
  const answer = async (j: MyJob, a: "accept" | "decline" | "cancel") => {
    setBusy(j.id + a);
    try {
      const r = await studentRpc<{ ok: boolean; error?: string }>("student_print_answer", { p_job: j.id, p_answer: a });
      if (!r.ok) throw new Error(r.error);
      toast(a === "accept" ? "وافقت على السعر — هنبدأ نطبع" : a === "decline" ? "رفضت السعر" : "الطلب اتلغى");
      jobs.reload();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(null);
    }
  };
  const matName = (k: string) => info.data?.materials.find((m) => m.key === k)?.name ?? k;
  return (
    <>
      <TopBar title="طباعة 3D" sub="ابعت موديلك والفريق يطبعهولك" back="/me/account" />
      {info.error ? (
        <ErrorBox error={info.error} retry={info.reload} />
      ) : !info.data ? (
        <Loading />
      ) : (
        <div className="grid gap-4" data-testid="print">
          {info.data.note && <Card className="text-sm text-mist">{info.data.note}</Card>}
          {info.data.open ? <NewPrint info={info.data} onDone={jobs.reload} /> : <Card className="text-sm text-fog">الطباعة مقفولة دلوقتي. هتفتح تاني قريب.</Card>}
          <p className="font-semibold text-chalk">طلباتك</p>
          {jobs.error ? (
            <ErrorBox error={jobs.error} retry={jobs.reload} />
          ) : !jobs.data ? (
            <Loading />
          ) : jobs.data.length ? (
            jobs.data.map((j) => (
              <Card key={j.id} className="grid gap-2" data-testid={`print-job-${j.code}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-chalk" dir="auto">
                      {j.file_name}
                    </p>
                    <p className="text-xs text-fog">{`${j.code} · ${matName(j.material)}${j.color ? ` ${j.color}` : ""} · ${j.infill}% · ×${j.quantity}`}</p>
                  </div>
                  <Badge tone={PRINT_STATUS[j.status].tone}>{PRINT_STATUS[j.status].label}</Badge>
                </div>
                {j.price != null && (
                  <div className="rounded-xl border border-[var(--line)] p-3 text-sm">
                    <p className="text-lg font-bold text-chalk">{`${j.price} ج`}</p>
                    <p className="text-xs text-fog">{`من ${j.slicer}: ${j.grams} جرام · ${hours(j.minutes ?? 0)}`}</p>
                    {j.quote_note && <p className="mt-1 text-mist">{j.quote_note}</p>}
                    {j.paid && <Badge tone="ok">اتدفع</Badge>}
                  </div>
                )}
                {j.reason && <p className="text-sm text-danger">{j.reason}</p>}
                <div className="flex flex-wrap gap-2">
                  {j.status === "quoted" && (
                    <>
                      <Button loading={busy === j.id + "accept"} onClick={() => void answer(j, "accept")}>
                        موافق على السعر
                      </Button>
                      <Button variant="ghost" loading={busy === j.id + "decline"} onClick={() => void answer(j, "decline")}>
                        مش موافق
                      </Button>
                    </>
                  )}
                  {j.status === "submitted" && (
                    <Button variant="ghost" loading={busy === j.id + "cancel"} onClick={() => confirm("تلغي الطلب؟") && void answer(j, "cancel")}>
                      إلغاء الطلب
                    </Button>
                  )}
                </div>
              </Card>
            ))
          ) : (
            <Empty icon="box" title="لسه مبعتّش حاجة للطباعة" />
          )}
        </div>
      )}
    </>
  );
}

/* ─── Team ─────────────────────────────────────────────────────────────── */

type Settings = Omit<Info, "priced">;
type StaffJob = MyJob & { file_path: string; file_size: number; bbox: number[] | null; notes: string; student: string; student_code: string; group: string; slicer_grams: number | null; slicer_minutes: number | null };
const SLICERS = ["OrcaSlicer", "Ultimaker Cura", "PrusaSlicer", "Bambu Studio", "Creality Print"];

function SettingsSheet({ s, onClose, onSaved }: { s: Settings; onClose: () => void; onSaved: () => void }) {
  const [open, setOpen] = useState(s.open);
  const [mats, setMats] = useState<Material[]>(s.materials);
  const [pph, setPph] = useState(s.price_per_hour?.toString() ?? "");
  const [min, setMin] = useState(s.min_fee?.toString() ?? "");
  const [note, setNote] = useState(s.note);
  const [busy, setBusy] = useState(false);
  const set = (i: number, p: Partial<Material>) => setMats(mats.map((m, k) => (k === i ? { ...m, ...p } : m)));
  const save = async () => {
    setBusy(true);
    try {
      const r = await rpc<{ ok: boolean; error?: string }>("staff_print_settings_save", { p: { open, materials: mats, price_per_hour: pph, min_fee: min, note } });
      if (!r.ok) return toast("راجع الخامات: الكود حروف إنجليزي صغيرة، والكثافة بين 0.5 و 3", "error");
      toast("اتحفظ");
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="إعدادات الطباعة" wide>
      <div className="grid gap-3" data-testid="print-settings">
        <Toggle checked={open} onChange={setOpen} label="الطباعة مفتوحة للطلبة" />
        {mats.map((m, i) => (
          <Card key={i} className="grid grid-cols-2 gap-2">
            <Field label="الاسم">
              <Input value={m.name} onChange={(e) => set(i, { name: e.target.value })} />
            </Field>
            <Field label="الكود">
              <Input value={m.key} dir="ltr" onChange={(e) => set(i, { key: e.target.value.toLowerCase() })} />
            </Field>
            <Field label="الألوان (بينهم فاصلة)">
              <Input value={m.colors.join("، ")} onChange={(e) => set(i, { colors: e.target.value.split(/[،,]/).map((x) => x.trim()).filter(Boolean) })} />
            </Field>
            <Field label="الكثافة g/cm³">
              <Input type="number" step="0.01" value={m.density} onChange={(e) => set(i, { density: Number(e.target.value) })} />
            </Field>
            <Field label="سعر الجرام (ج)">
              <Input type="number" step="0.01" value={m.price_per_gram ?? ""} onChange={(e) => set(i, { price_per_gram: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <div className="flex items-end">
              <Button variant="ghost" disabled={mats.length < 2} onClick={() => setMats(mats.filter((_, k) => k !== i))}>
                شيل الخامة
              </Button>
            </div>
          </Card>
        ))}
        <Button variant="secondary" icon="plus" onClick={() => setMats([...mats, { key: "", name: "", colors: [], density: 1.24, price_per_gram: null }])}>
          خامة جديدة
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Field label="سعر ساعة الطابعة (ج)">
            <Input type="number" step="0.5" value={pph} onChange={(e) => setPph(e.target.value)} />
          </Field>
          <Field label="أقل سعر للطلب (ج)">
            <Input type="number" step="1" value={min} onChange={(e) => setMin(e.target.value)} />
          </Field>
        </div>
        <Field label="ملاحظة للطلبة (اختياري)">
          <Textarea value={note} maxLength={600} rows={2} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button loading={busy} onClick={() => void save()}>
          حفظ
        </Button>
      </div>
    </Sheet>
  );
}

function QuoteSheet({ job, s, onClose, onSaved }: { job: StaffJob; s: Settings; onClose: () => void; onSaved: () => void }) {
  const [slicer, setSlicer] = useState(job.slicer ?? SLICERS[0]);
  const [grams, setGrams] = useState(job.slicer_grams?.toString() ?? "");
  const [minutes, setMinutes] = useState(job.slicer_minutes?.toString() ?? "");
  const [note, setNote] = useState(job.quote_note ?? "");
  const [busy, setBusy] = useState(false);
  const ppg = s.materials.find((m) => m.key === job.material)?.price_per_gram;
  const g = Number(grams);
  const m = Number(minutes);
  const preview = ppg != null && s.price_per_hour != null && g > 0 && m > 0 ? Math.ceil(Math.max(s.min_fee ?? 0, g * ppg + (m / 60) * s.price_per_hour)) : null;
  const save = async () => {
    setBusy(true);
    try {
      const r = await rpc<{ ok: boolean; error?: string; price?: number }>("staff_print_quote", { p_job: job.id, p_slicer: slicer, p_grams: g, p_minutes: Math.round(m), p_note: note });
      if (!r.ok) return toast(r.error === "prices_not_set" ? "حدد أسعار الخامة وساعة الطابعة الأول" : "اكتب الجرامات والدقايق من الـSlicer", "error");
      toast(`السعر ${r.price} ج اتبعت للطالب`);
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`سعر ${job.code}`}>
      <div className="grid gap-3" data-testid="print-quote">
        <p className="text-sm text-mist">اعمل Slice للملف بالإعدادات اللي الطالب اختارها (والعدد كله على البليت)، واكتب اللي الـSlicer قاله.</p>
        <Field label="الـSlicer">
          <Select value={slicer} onChange={(e) => setSlicer(e.target.value)}>
            {SLICERS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="الخامة (جرام)">
            <Input type="number" step="0.1" value={grams} onChange={(e) => setGrams(e.target.value)} />
          </Field>
          <Field label="الوقت (دقيقة)">
            <Input type="number" step="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
        </div>
        <Field label="ملاحظة للطالب (اختياري)">
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="text-sm text-chalk" data-testid="print-quote-preview">
          {preview != null ? `السعر: ${preview} ج` : ppg == null || s.price_per_hour == null ? "الأسعار لسه متحددتش في الإعدادات" : "اكتب الجرامات والوقت"}
        </p>
        <Button loading={busy} disabled={preview == null} onClick={() => void save()}>
          ابعت السعر للطالب
        </Button>
      </div>
    </Sheet>
  );
}

export function StaffPrint() {
  const { data, error, loading, reload } = useAsync(() => rpc<{ settings: Settings; jobs: StaffJob[] }>("staff_print_jobs"), []);
  const [settings, setSettings] = useState(false);
  const [quoting, setQuoting] = useState<StaffJob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const call = async (key: string, fn: string, args: Record<string, unknown>, done: string) => {
    setBusy(key);
    try {
      const r = await rpc<{ ok: boolean; error?: string }>(fn, args);
      if (!r.ok) return toast(r.error === "reason" ? "اكتب السبب" : "مينفعش دلوقتي", "error");
      toast(done);
      reload();
    } finally {
      setBusy(null);
    }
  };
  const download = async (j: StaffJob) => {
    const { data: d, error: e } = await sb().storage.from("submissions").createSignedUrl(j.file_path, 600, { download: j.file_name });
    if (e || !d) return toast("معرفتش أجيب الملف", "error");
    window.open(d.signedUrl, "_blank", "noopener");
  };
  const s = data?.settings;
  const priced = !!s && s.price_per_hour != null && s.materials.every((m) => m.price_per_gram != null);
  return (
    <>
      <TopBar title="طباعة 3D" sub="طلبات الطلبة والأسعار" actions={s && <Button variant="secondary" icon="settings" onClick={() => setSettings(true)}>الإعدادات</Button>} />
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : data && s ? (
        <div className="grid gap-3" data-testid="staff-print">
          {(!s.open || !priced) && (
            <Card className="text-sm text-warn">{!priced ? "أسعار الخامات أو ساعة الطابعة لسه متحددتش — مفيش تسعير لحد ما تتحدد." : "الطباعة مقفولة للطلبة."}</Card>
          )}
          {data.jobs.length ? (
            data.jobs.map((j) => (
              <Card key={j.id} className="grid gap-2" data-testid={`staff-print-${j.code}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-chalk" dir="auto">{`${j.code} · ${j.file_name}`}</p>
                    <p className="text-xs text-fog">{`${j.student} (${j.student_code})${j.group ? ` · ${j.group}` : ""} · ${fmt.short(j.created_at)}`}</p>
                  </div>
                  <Badge tone={PRINT_STATUS[j.status].tone}>{PRINT_STATUS[j.status].label}</Badge>
                </div>
                <p className="text-sm text-mist">{`${s.materials.find((m) => m.key === j.material)?.name ?? j.material} ${j.color} · ${QUALITY[j.quality as keyof typeof QUALITY] ?? j.quality} · ${j.infill}% · ×${j.quantity}${j.bbox ? ` · ${j.bbox.join(" × ")} mm` : ""}${j.est_volume ? ` · ${j.est_volume} cm³` : ""}`}</p>
                {j.notes && <p className="text-sm text-mist">{j.notes}</p>}
                {j.price != null && <p className="text-sm text-chalk">{`${j.price} ج — ${j.slicer}: ${j.slicer_grams} جم · ${hours(j.slicer_minutes ?? 0)}${j.paid ? " · اتدفع" : ""}`}</p>}
                {j.reason && <p className="text-sm text-danger">{j.reason}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" icon="download" onClick={() => void download(j)}>
                    الملف
                  </Button>
                  {(j.status === "submitted" || j.status === "quoted") && (
                    <>
                      <Button onClick={() => setQuoting(j)}>{j.status === "quoted" ? "تعديل السعر" : "سعّر من الـSlicer"}</Button>
                      <Button
                        variant="ghost"
                        loading={busy === `r${j.id}`}
                        onClick={() => {
                          const reason = prompt("سبب الرفض (الطالب هيشوفه):");
                          if (reason) void call(`r${j.id}`, "staff_print_status", { p_job: j.id, p_status: "rejected", p_reason: reason }, "اترفض");
                        }}
                      >
                        رفض
                      </Button>
                    </>
                  )}
                  {j.status === "accepted" && (
                    <Button loading={busy === `p${j.id}`} onClick={() => void call(`p${j.id}`, "staff_print_status", { p_job: j.id, p_status: "printing" }, "بدأت الطباعة")}>
                      بدأت الطباعة
                    </Button>
                  )}
                  {j.status === "printing" && (
                    <Button loading={busy === `y${j.id}`} onClick={() => void call(`y${j.id}`, "staff_print_status", { p_job: j.id, p_status: "ready" }, "الطالب اتبلغ إنها جاهزة")}>
                      خلصت — جاهزة
                    </Button>
                  )}
                  {j.status === "ready" && (
                    <Button loading={busy === `d${j.id}`} onClick={() => void call(`d${j.id}`, "staff_print_status", { p_job: j.id, p_status: "delivered" }, "اتسلّمت")}>
                      اتسلّمت
                    </Button>
                  )}
                  {["accepted", "printing", "ready", "delivered"].includes(j.status) && (
                    <Button variant="ghost" loading={busy === `m${j.id}`} onClick={() => void call(`m${j.id}`, "staff_print_paid", { p_job: j.id, p_paid: !j.paid }, j.paid ? "اتشال الدفع" : "اتعلّم مدفوع")}>
                      {j.paid ? "مش مدفوع" : "اتدفع"}
                    </Button>
                  )}
                </div>
              </Card>
            ))
          ) : (
            <Empty icon="box" title="مفيش طلبات طباعة" />
          )}
        </div>
      ) : null}
      {settings && s && <SettingsSheet s={s} onClose={() => setSettings(false)} onSaved={reload} />}
      {quoting && s && <QuoteSheet job={quoting} s={s} onClose={() => setQuoting(null)} onSaved={reload} />}
    </>
  );
}
