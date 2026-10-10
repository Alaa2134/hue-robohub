"use client";
/**
 * Expo visits as a delegation (20261011120000_expo_delegation.sql): accepting an applicant registers
 * them in the team's delegation with a number (BX-001…). From the responses screen the team makes the
 * delegation list for the expo's administration: a formatted Excel and a branded PDF (A4 landscape,
 * the delegation's details, the list by number, a count per day and a signature line).
 */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BASE_PATH, errorText, today } from "./core";
import { imagesReady } from "./certificate";
import { saveNodesAsPdf } from "./pdf";
import { downloadStyledXlsx, type XRow } from "./xlsx";
import { Button, Card, Field, Input, Textarea, Toggle, copyText, go, toast } from "./ui";

export type Delegation = { event?: string; venue?: string; dates?: string; org?: string; lead_name?: string; lead_phone?: string; meet_ar?: string; /** The expo's own visitor registration, filled in by the team for each delegate. */ register_url?: string };
type Answers = Record<string, string | string[]>;
export type DelegateResponse = { id: string; ref: string; name: string | null; phone: string | null; email: string | null; status: string; member_no: number | null; accepted_at: string | null; external_done_at?: string | null; answers: Answers };
type DelegationForm = { title_ar: string; slug: string; delegation: Delegation | null; capacity: number | null };

export const memberId = (n: number | null) => (n ? `BX-${String(n).padStart(3, "0")}` : "—");
const txt = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join("، ") : (v ?? "")).trim();
/** Local numbers as the expo expects them: +20 1x xxxx xxxx. */
const intl = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "");
  if (/^01\d{9}$/.test(d)) return `+20 ${d.slice(1, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  if (/^201\d{9}$/.test(d)) return `+20 ${d.slice(2, 4)} ${d.slice(4, 8)} ${d.slice(8)}`;
  return p ?? "";
};

type Delegate = { no: string; nameEn: string; nameAr: string; org: string; faculty: string; year: string; phone: string; email: string; day: string };

/** The accepted, in delegation order. */
export function delegates(responses: DelegateResponse[]): Delegate[] {
  return responses
    .filter((r) => r.status === "accepted")
    .sort((a, b) => (a.member_no ?? 1e9) - (b.member_no ?? 1e9) || (a.accepted_at ?? "").localeCompare(b.accepted_at ?? ""))
    .map((r) => ({
      no: memberId(r.member_no),
      nameEn: txt(r.answers.name_en),
      nameAr: r.name ?? txt(r.answers.name),
      org: txt(r.answers.org),
      faculty: txt(r.answers.faculty),
      year: txt(r.answers.year),
      phone: intl(r.phone),
      email: r.email ?? txt(r.answers.email),
      day: txt(r.answers.day),
    }));
}

const byDay = (list: Delegate[]) => {
  const m = new Map<string, number>();
  for (const d of list) m.set(d.day || "—", (m.get(d.day || "—") ?? 0) + 1);
  return [...m.entries()];
};
const stamp = () => new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Cairo" }).format(new Date());

/* ─── Excel ─────────────────────────────────────────────────────────────── */

export function delegationXlsx(form: DelegationForm, list: Delegate[]) {
  const g = form.delegation ?? {};
  const cols = ["No.\nم", "Delegation ID\nرقم الوفد", "Name (English)\nالاسم بالإنجليزي", "Name (Arabic)\nالاسم بالعربي", "University / School\nالجامعة", "Faculty\nالكلية", "Year\nالسنة", "Mobile\nالموبايل", "Email\nالإيميل", "Visit day\nيوم الزيارة"];
  const widths = [6, 13, 26, 26, 24, 22, 11, 18, 30, 20];
  const n = cols.length;
  const info: [string, string][] = [
    ["Organization / الجهة", g.org || "BuildX HUE"],
    ["Delegation lead / مسؤول الوفد", [g.lead_name, intl(g.lead_phone ?? null)].filter(Boolean).join(" · ") || "—"],
    ["Event / المعرض", [g.event, g.dates].filter(Boolean).join(" · ") || form.title_ar],
    ["Venue / المكان", g.venue || "—"],
    ["Delegates / عدد الوفد", String(list.length)],
    ["Generated / اتعمل", stamp()],
  ];
  const rows: XRow[] = [
    { cells: [`BuildX HUE — Delegation List  ·  كشف وفد BuildX HUE`, ...Array(n - 1).fill("")], style: "title", height: 38 },
    { cells: [[g.event, g.dates, g.venue].filter(Boolean).join("  ·  ") || form.title_ar, ...Array(n - 1).fill("")], style: "sub", height: 22 },
    { cells: [] },
    ...info.map(([k, v]): XRow => ({ cells: [k, "", "", v, ...Array(n - 4).fill("")], styles: ["label", "label", "label", "td", ...Array(n - 4).fill("td")] })),
    { cells: [] },
    { cells: cols, style: "th", height: 36 },
    ...list.map((d, i): XRow => ({ cells: [i + 1, d.no, d.nameEn, d.nameAr, d.org, d.faculty, d.year, d.phone, d.email, d.day], style: i % 2 ? "tdAlt" : "td", height: 22 })),
    { cells: ["", "", `Total: ${list.length}`, `الإجمالي: ${list.length}`, ...Array(n - 4).fill("")], style: "total" },
  ];
  const head = 3 + info.length + 2;
  const merges = ["A1:J1", "A2:J2", ...info.map((_, i) => `A${4 + i}:C${4 + i}`), ...info.map((_, i) => `D${4 + i}:J${4 + i}`)];
  const days = byDay(list);
  downloadStyledXlsx(`delegation-${form.slug}-${today()}.xlsx`, [
    { name: "Delegation", widths, rows, merges, freeze: head, landscape: true },
    {
      name: "By day",
      widths: [30, 14],
      landscape: false,
      merges: ["A1:B1"],
      rows: [
        { cells: ["Delegates per day · العدد في كل يوم", ""], style: "title", height: 34 },
        { cells: [] },
        { cells: ["Day / اليوم", "Count / العدد"], style: "th", height: 28 },
        ...days.map(([d, c], i): XRow => ({ cells: [d, c], style: i % 2 ? "tdAlt" : "td" })),
        { cells: ["Total / الإجمالي", list.length], style: "total" },
      ],
    },
  ]);
}

/* ─── PDF ───────────────────────────────────────────────────────────────── */

const W = 1123;
const H = 794;
const FIRST = 14;
const NEXT = 17;

function PdfPage({ form, list, from, page, pages, last }: { form: DelegationForm; list: Delegate[]; from: number; page: number; pages: number; last: boolean }) {
  const g = form.delegation ?? {};
  const rows = list.slice(from, from + (page === 1 ? FIRST : NEXT));
  const th: React.CSSProperties = { background: "#0b1f4d", color: "#fff", fontWeight: 700, fontSize: 11, padding: "7px 6px", textAlign: "start", lineHeight: 1.25 };
  const td: React.CSSProperties = { padding: "6px", fontSize: 11.5, borderBottom: "1px solid #e1e7f0", textAlign: "start", verticalAlign: "middle" };
  const cols: [string, string][] = [
    ["م", "#"],
    ["رقم الوفد", "ID"],
    ["Name (English)", "الاسم بالإنجليزي"],
    ["الاسم بالعربي", "Arabic name"],
    ["الجامعة", "University"],
    ["الكلية / السنة", "Faculty / Year"],
    ["الموبايل", "Mobile"],
    ["الإيميل", "Email"],
    ["اليوم", "Day"],
  ];
  return (
    <div dir="rtl" style={{ width: W, height: H, padding: "30px 36px 26px", boxSizing: "border-box", background: "#fff", color: "#0b1f4d", fontFamily: "system-ui, Tahoma, sans-serif", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", insetInlineStart: 0, top: 0, bottom: 0, width: 10, background: "linear-gradient(#2b6dff, #ff7a45)" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "3px solid #0b1f4d", paddingBottom: 10 }}>
        <div>
          <div style={{ fontSize: page === 1 ? 24 : 17, fontWeight: 800 }}>
            كشف وفد <span dir="ltr">BuildX HUE</span>
            <span dir="ltr" style={{ fontWeight: 600, color: "#2b6dff", marginInlineStart: 10, fontSize: page === 1 ? 18 : 14 }}>
              Delegation List
            </span>
          </div>
          <div style={{ color: "#45526b", marginTop: 3, fontSize: 13 }} dir="ltr">
            {[g.event, g.dates].filter(Boolean).join(" · ") || form.title_ar}
          </div>
        </div>
        <img src={`${BASE_PATH}/brand/logo-horizontal-black.svg`} alt="BuildX HUE" style={{ height: page === 1 ? 40 : 30 }} />
      </div>

      {page === 1 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 14 }}>
          {[
            ["الجهة · Organization", g.org || "BuildX HUE"],
            ["المكان · Venue", g.venue || "—"],
            ["مسؤول الوفد · Delegation lead", [g.lead_name, intl(g.lead_phone ?? null)].filter(Boolean).join(" · ") || "—"],
            ["عدد الوفد · Delegates", String(list.length)],
          ].map(([k, v]) => (
            <div key={k} style={{ background: "#f4f7fb", border: "1px solid #e1e7f0", borderRadius: 10, padding: "8px 12px" }}>
              <div style={{ fontSize: 10.5, color: "#45526b" }}>{k}</div>
              <div style={{ fontSize: k.startsWith("عدد") ? 22 : 13, fontWeight: 700, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14 }}>
        <thead>
          <tr>
            {cols.map(([a, b]) => (
              <th key={a} style={th}>
                {a}
                <div style={{ fontWeight: 400, opacity: 0.75, fontSize: 9.5 }}>{b}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => (
            <tr key={d.no + i} style={{ background: (from + i) % 2 ? "#f7f9fc" : "#fff" }}>
              <td style={{ ...td, color: "#45526b" }}>{from + i + 1}</td>
              <td style={{ ...td, fontWeight: 700, fontFamily: "ui-monospace, Menlo, monospace" }} dir="ltr">
                {d.no}
              </td>
              <td style={{ ...td, fontWeight: 600 }} dir="ltr">
                {d.nameEn}
              </td>
              <td style={td}>{d.nameAr}</td>
              <td style={td}>{d.org}</td>
              <td style={td}>{[d.faculty, d.year].filter(Boolean).join(" · ")}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }} dir="ltr">
                {d.phone}
              </td>
              <td style={{ ...td, fontSize: 10.5 }} dir="ltr">
                {d.email}
              </td>
              <td style={td}>{d.day}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {last && (
        <div style={{ display: "flex", gap: 24, marginTop: 16, alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
            {byDay(list).map(([d, c]) => (
              <span key={d} style={{ border: "1px solid #c9d3e3", borderRadius: 999, padding: "4px 12px", fontSize: 12 }}>
                {d}: <b>{c}</b>
              </span>
            ))}
          </div>
          <div style={{ width: 300, textAlign: "center", fontSize: 12, color: "#45526b" }}>
            <div style={{ borderBottom: "1px solid #0b1f4d", height: 36 }} />
            <div style={{ marginTop: 4 }}>توقيع مسؤول الوفد · Delegation lead signature</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: "auto", paddingTop: 8, borderTop: "1px solid #e1e7f0", color: "#45526b", fontSize: 10.5, display: "flex", justifyContent: "space-between" }}>
        <span>BuildX HUE · Horus University Egypt · buildxhue.com</span>
        <span dir="ltr">
          Page {page} / {pages} · {stamp()}
        </span>
      </div>
    </div>
  );
}

/** Delegation box on the responses screen: counts, and the files for the expo. */
export function DelegationCard({ form, responses }: { form: DelegationForm; responses: DelegateResponse[] }) {
  const list = delegates(responses);
  const [pdf, setPdf] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pages = list.length <= FIRST ? 1 : 1 + Math.ceil((list.length - FIRST) / NEXT);
  const makePdf = async () => {
    setBusy(true);
    setPdf(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = Array.from(box.current?.children ?? []) as HTMLElement[];
      if (!nodes.length) throw new Error("render");
      await imagesReady(nodes);
      await saveNodesAsPdf(nodes, `delegation-${form.slug}-${today()}.pdf`, { landscape: true, widthPx: 2246 });
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setPdf(false);
      setBusy(false);
    }
  };
  const left = form.capacity ? Math.max(0, form.capacity - list.length) : null;
  const reg = form.delegation?.register_url ? responses.filter((r) => r.status === "accepted" && r.external_done_at).length : null;
  return (
    <Card className="mt-3 grid gap-3 border-[#ff7a45]/40 bg-[#ff7a45]/[0.05]" data-testid="delegation-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-chalk">
          وفد المعرض: {list.length} مسجّل{form.capacity ? ` من ${form.capacity}` : ""}
        </p>
        {left !== null && <p className="text-xs text-fog">{left ? `فاضل ${left} مكان` : "الوفد كامل"}</p>}
      </div>
      {reg !== null && (
        <p className="text-sm text-mist" data-testid="expo-registered">
          اتسجّلوا في موقع المعرض: <b className={reg === list.length ? "text-ok" : "text-chalk"}>{reg}</b> من {list.length}
          {reg < list.length ? " · افتح أي مقبول وسجّله من «سجّله في موقع المعرض»" : " ✓"}
        </p>
      )}
      <p className="text-xs leading-relaxed text-fog">أي حد بتقبله بيتسجّل في الوفد علطول وياخد رقم (BX-001…) ويشوف تصريحه من صفحة المعرض. ابعت الكشف لإدارة المعرض من هنا.</p>
      {!!list.length && (
        <div className="flex flex-wrap gap-2 text-xs text-mist">
          {byDay(list).map(([d, c]) => (
            <span key={d} className="rounded-full border border-[var(--line-2)] px-2.5 py-1">
              {d}: {c}
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" icon="download" disabled={!list.length} loading={busy} onClick={makePdf}>
          PDF لإدارة المعرض
        </Button>
        <Button icon="download" disabled={!list.length} onClick={() => delegationXlsx(form, list)}>
          Excel لإدارة المعرض
        </Button>
      </div>
      {form.slug === "robotex-2026" && (
        <Button size="sm" variant="ghost" icon="upload" onClick={() => go("/staff/site?k=photo&album=robotex")}>
          ارفع صور الزيارة (بتظهر في ألبوم صفحة المعرض)
        </Button>
      )}
      {pdf &&
        createPortal(
          <div ref={box} aria-hidden style={{ position: "fixed", top: 0, left: "-20000px" }}>
            {Array.from({ length: pages }, (_, i) => (
              <PdfPage key={i} form={form} list={list} from={i === 0 ? 0 : FIRST + (i - 1) * NEXT} page={i + 1} pages={pages} last={i === pages - 1} />
            ))}
          </div>,
          document.body,
        )}
    </Card>
  );
}

/** Form editor: make the form a delegation and fill its details. */
export function DelegationSettings({ delegation, capacity, onChange }: { delegation: Delegation | null; capacity: number | null; onChange: (p: { delegation?: Delegation | null; capacity?: number | null }) => void }) {
  const g = delegation ?? {};
  const set = (k: keyof Delegation, v: string) => onChange({ delegation: { ...g, [k]: v } });
  return (
    <Card className="grid gap-3">
      <Toggle
        checked={!!delegation}
        onChange={(v) => onChange({ delegation: v ? { event: "", venue: "", dates: "", org: "BuildX HUE — Horus University Egypt", lead_name: "", lead_phone: "", meet_ar: "" } : null })}
        label="اللي يتقبل يتسجّل في الوفد علطول"
        hint="بياخد رقم في الوفد وتصريح على الموقع، وتقدر تطلّع كشف الوفد PDF و Excel لإدارة المعرض."
      />
      {delegation && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم المعرض / الفعالية (إنجليزي)">
              <Input dir="ltr" value={g.event ?? ""} maxLength={120} onChange={(e) => set("event", e.target.value)} />
            </Field>
            <Field label="المواعيد">
              <Input dir="ltr" value={g.dates ?? ""} maxLength={80} placeholder="14–16 November 2026" onChange={(e) => set("dates", e.target.value)} />
            </Field>
            <Field label="المكان">
              <Input dir="ltr" value={g.venue ?? ""} maxLength={160} onChange={(e) => set("venue", e.target.value)} />
            </Field>
            <Field label="الجهة">
              <Input dir="ltr" value={g.org ?? ""} maxLength={120} onChange={(e) => set("org", e.target.value)} />
            </Field>
            <Field label="مسؤول الوفد">
              <Input value={g.lead_name ?? ""} maxLength={80} onChange={(e) => set("lead_name", e.target.value)} />
            </Field>
            <Field label="موبايل مسؤول الوفد">
              <Input dir="ltr" type="tel" value={g.lead_phone ?? ""} maxLength={20} onChange={(e) => set("lead_phone", e.target.value)} />
            </Field>
          </div>
          <Field label="لينك تسجيل الزوار في موقع المعرض" hint="اختياري. لو المعرض محتاج كل زائر يتسجّل عنده، الفريق بيسجّل كل مقبول من التطبيق ببياناته جاهزة.">
            <Input dir="ltr" type="url" placeholder="https://" value={g.register_url ?? ""} maxLength={300} onChange={(e) => set("register_url", e.target.value.trim())} />
          </Field>
          <Field label="أقصى عدد للوفد" hint="اختياري. لما يكمل، مش هتقدر تقبل حد زيادة.">
            <Input type="number" inputMode="numeric" min={1} value={capacity ?? ""} onChange={(e) => onChange({ capacity: e.target.value ? Math.max(1, Number(e.target.value)) : null })} />
          </Field>
          <Field label="التجمع والمواعيد (بيظهر في تصريح المقبولين)">
            <Textarea rows={2} maxLength={500} value={g.meet_ar ?? ""} placeholder="التجمع 8:30 الصبح قدام بوابة الجامعة، والأتوبيس بيتحرك 9 بالظبط." onChange={(e) => set("meet_ar", e.target.value)} />
          </Field>
        </>
      )}
    </Card>
  );
}

const local = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "");
  return /^201\d{9}$/.test(d) ? `0${d.slice(2)}` : (p ?? "");
};

/** One delegate on the expo's own site: their details ready to copy, the registration page, and "done". */
export function ExpoRegister({ url, r, onMark }: { url: string; r: DelegateResponse; onMark: (done: boolean) => void }) {
  const rows: [string, string][] = [
    ["Full name (English)", txt(r.answers.name_en)],
    ["Email", r.email ?? txt(r.answers.email)],
    ["Mobile", local(r.phone)],
    ["Company / University", txt(r.answers.org)],
    ["Job title", ["Student", txt(r.answers.faculty)].filter(Boolean).join(" — ")],
  ];
  const all = rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  return (
    <Card className="grid gap-3 border-cyan/30 bg-cyan/[0.04]" data-testid="expo-register">
      <p className="font-semibold text-chalk">سجّله في موقع المعرض</p>
      <p className="text-xs leading-relaxed text-fog">افتح صفحة التسجيل، وانسخ كل بيان في خانته (بالإنجليزي زي ما هو)، والبادج بيوصل على إيميله. بعدها علّم «اتسجّل».</p>
      <dl className="grid gap-1.5">
        {rows.map(([k, v]) =>
          v ? (
            <div key={k} className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2">
              <dt className="w-32 shrink-0 text-xs text-fog" dir="ltr">
                {k}
              </dt>
              <dd className="min-w-0 flex-1 truncate text-sm text-chalk" dir="ltr">
                {v}
              </dd>
              <Button size="sm" variant="ghost" icon="copy" onClick={() => copyText(v, "اتنسخ")} aria-label={`انسخ ${k}`} />
            </div>
          ) : null,
        )}
      </dl>
      <div className="grid grid-cols-2 gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center rounded-xl bg-cyan/20 text-sm font-semibold text-ice">
          افتح صفحة التسجيل ↗
        </a>
        <Button size="sm" icon="copy" onClick={() => copyText(all, "اتنسخت كل البيانات")}>
          انسخ الكل
        </Button>
      </div>
      <Toggle checked={!!r.external_done_at} onChange={onMark} label="اتسجّل في موقع المعرض" hint={r.external_done_at ? "✓ متسجّل" : "علّمها بعد ما التسجيل يتم."} />
    </Card>
  );
}
