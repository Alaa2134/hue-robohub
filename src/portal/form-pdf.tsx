"use client";
/**
 * A form's responses as a printable PDF: pick the columns (any question, plus code, date, status and
 * payment), which people, the title and the page direction, and get A4 pages with the BuildX and
 * faculty logos, a zebra table, totals and page numbers. Long answers are cut to one line so every
 * page holds the same number of rows.
 */
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FormField } from "@/components/forms/site-forms";
import { BASE_PATH, errorText, fmt, today } from "./core";
import { imagesReady } from "./certificate";
import { saveNodesAsPdf } from "./pdf";
import { Button, Chip, Field, Input, Sheet, Toggle, toast } from "./ui";

export type PdfRow = {
  id: string;
  ref: string;
  created_at: string;
  status: "new" | "accepted" | "rejected" | "waiting";
  answers: Record<string, string | string[]>;
  paid_at?: string | null;
  paid_amount?: number | null;
};
type Col = { key: string; ar: string; en?: string; wide?: boolean; ltr?: boolean; get: (r: PdfRow) => string };

const STATUS: Record<PdfRow["status"], string> = { new: "جديد", accepted: "مقبول", waiting: "انتظار", rejected: "مرفوض" };
/** Egyptian numbers the way people write them (01…); others as stored. */
const localPhone = (p: string) => (/^\+20(1\d{9})$/.test(p) ? `0${p.slice(3)}` : p);
const show = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join("، ") : (v ?? ""));

/** Every column the PDF can have, in form order. */
function columnsOf(fields: FormField[], paying: boolean): Col[] {
  const cols: Col[] = [
    { key: "_ref", ar: "كود الطلب", en: "Code", ltr: true, get: (r) => r.ref },
    ...fields
      .filter((f) => f.type !== "file")
      .map<Col>((f) => ({
        key: f.id,
        ar: f.label_ar,
        en: f.label_en,
        wide: f.type === "textarea" || f.type === "multi",
        ltr: ["phone", "email", "url", "number", "member"].includes(f.type),
        get: (r) => (f.type === "phone" ? localPhone(show(r.answers[f.id])) : show(r.answers[f.id])),
      })),
    { key: "_date", ar: "تاريخ التسجيل", en: "Registered", get: (r) => fmt.day(r.created_at) },
    { key: "_status", ar: "الحالة", en: "Status", get: (r) => STATUS[r.status] },
  ];
  if (paying) cols.push({ key: "_paid", ar: "الدفع", en: "Payment", get: (r) => (r.paid_at ? `دفع ${Number(r.paid_amount ?? 0)} ج` : "لم يدفع") });
  return cols;
}

/** The usual first pick: the name, phone and the short questions, no long text. */
function defaultPick(fields: FormField[], paying: boolean): string[] {
  const keys = fields.filter((f) => ["name", "phone", "select", "text", "member"].includes(f.type)).slice(0, 5).map((f) => f.id);
  return [...keys, ...(paying ? ["_paid"] : [])];
}

const PORTRAIT = { w: 794, h: 1123, first: 22, next: 26 };
const LANDSCAPE = { w: 1123, h: 794, first: 13, next: 16 };

function Page({ title, sub, cols, rows, from, page, pages, landscape, faculty, signature, total }: {
  title: string;
  sub: string;
  cols: Col[];
  rows: PdfRow[];
  from: number;
  page: number;
  pages: number;
  landscape: boolean;
  faculty: boolean;
  signature: boolean;
  total: number;
}) {
  const S = landscape ? LANDSCAPE : PORTRAIT;
  const dense = cols.length > (landscape ? 8 : 5);
  const th: React.CSSProperties = { background: "#0b1f4d", color: "#fff", fontWeight: 700, fontSize: dense ? 10 : 11.5, padding: "8px 6px", textAlign: "start", lineHeight: 1.25 };
  const td: React.CSSProperties = { padding: dense ? "6px 5px" : "7px 6px", fontSize: dense ? 10.5 : 12, borderBottom: "1px solid #e1e7f0", textAlign: "start", verticalAlign: "middle", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0 };
  const logoH = page === 1 ? 64 : 44;
  return (
    <div dir="rtl" data-testid="form-pdf-page" style={{ width: S.w, height: S.h, padding: "26px 32px 22px", boxSizing: "border-box", background: "#fff", color: "#0b1f4d", fontFamily: "system-ui, Tahoma, sans-serif", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", insetInline: 0, top: 0, height: 8, background: "linear-gradient(90deg, #2b6dff, #3cc4ff 55%, #ff7a45)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 16, borderBottom: "2px solid #0b1f4d", paddingBottom: 10, marginTop: 6 }}>
        <img src={`${BASE_PATH}/brand/logo-badge-512.png`} alt="BuildX" style={{ height: logoH, width: logoH, objectFit: "contain" }} />
        <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
          <div style={{ fontSize: page === 1 ? 22 : 16, fontWeight: 800, lineHeight: 1.3 }}>{title}</div>
          <div style={{ color: "#45526b", marginTop: 3, fontSize: page === 1 ? 12.5 : 11 }}>{sub}</div>
        </div>
        {faculty ? (
          <img src={`${BASE_PATH}/brand/faculty-ai-horus.jpg`} alt="Faculty of Artificial Intelligence, Horus University" style={{ height: logoH, width: logoH, objectFit: "cover", borderRadius: "50%" }} />
        ) : (
          <img src={`${BASE_PATH}/brand/logo-horizontal-black.png`} alt="BuildX HUE" style={{ height: logoH * 0.55 }} />
        )}
      </div>

      {page === 1 && (
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {[
            ["العدد · Total", String(total)],
            ["التاريخ · Date", fmt.full(new Date())],
            ["الجهة · Organization", "BuildX HUE · Horus University"],
          ].map(([k, v]) => (
            <div key={k} style={{ flex: k.startsWith("الجهة") ? 2 : 1, background: "#f4f7fb", border: "1px solid #e1e7f0", borderRadius: 10, padding: "7px 12px" }}>
              <div style={{ fontSize: 10, color: "#45526b" }}>{k}</div>
              <div style={{ fontSize: k.startsWith("العدد") ? 20 : 12.5, fontWeight: 700, marginTop: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 34 }} />
          {cols.map((c) => (
            <col key={c.key} style={{ width: c.wide ? "22%" : undefined }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "center" }}>م</th>
            {cols.map((c) => (
              <th key={c.key} style={th}>
                {c.ar}
                {c.en && <div style={{ fontWeight: 400, opacity: 0.7, fontSize: 9 }}>{c.en}</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} style={{ background: (from + i) % 2 ? "#f6f8fc" : "#fff" }}>
              <td style={{ ...td, textAlign: "center", color: "#45526b" }}>{from + i + 1}</td>
              {cols.map((c, j) => (
                <td key={c.key} style={{ ...td, ...(j === 1 ? { fontWeight: 600 } : {}), ...(c.key === "_paid" ? { color: r.paid_at ? "#127a43" : "#b4541a", fontWeight: 600 } : {}) }} dir={c.ltr ? "ltr" : undefined}>
                  {c.get(r) || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {signature && page === pages && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 40, marginTop: 28 }}>
          {["مسؤول BuildX HUE", "يعتمد · Approved by"].map((k) => (
            <div key={k} style={{ width: 240, textAlign: "center", fontSize: 11.5, color: "#45526b" }}>
              <div style={{ borderBottom: "1px solid #0b1f4d", height: 34 }} />
              <div style={{ marginTop: 4 }}>{k}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "auto", paddingTop: 8, borderTop: "1px solid #e1e7f0", color: "#45526b", fontSize: 10, display: "flex", justifyContent: "space-between" }}>
        <span>BuildX HUE · Faculty of Artificial Intelligence · Horus University in Egypt · buildxhue.com</span>
        <span dir="ltr">
          Page {page} / {pages}
        </span>
      </div>
    </div>
  );
}

/** The column picker and the PDF itself. `rows` are the people in the order to print. */
export function FormPdfSheet({ title, slug, fields, paying, all, shown, picked, onClose }: {
  title: string;
  /** For the file name (Latin, safe everywhere). */
  slug: string;
  fields: FormField[];
  paying: boolean;
  /** Everyone, the ones on screen now (current filters), and the ones ticked (if any). */
  all: PdfRow[];
  shown: PdfRow[];
  picked: PdfRow[];
  onClose: () => void;
}) {
  const cols = useMemo(() => columnsOf(fields, paying), [fields, paying]);
  const [keys, setKeys] = useState<string[]>(() => defaultPick(fields, paying));
  const [who, setWho] = useState<"accepted" | "shown" | "picked" | "all">(picked.length ? "picked" : all.some((r) => r.status === "accepted") ? "accepted" : "all");
  const [head, setHead] = useState(title);
  const [faculty, setFaculty] = useState(true);
  const [signature, setSignature] = useState(true);
  const [render, setRender] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const chosen = cols.filter((c) => keys.includes(c.key));
  const rows = (who === "accepted" ? all.filter((r) => r.status === "accepted") : who === "shown" ? shown : who === "picked" ? picked : all).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const landscape = chosen.length > 5 || chosen.some((c) => c.wide);
  const S = landscape ? LANDSCAPE : PORTRAIT;
  const pages = rows.length <= S.first ? 1 : 1 + Math.ceil((rows.length - S.first) / S.next);
  const toggle = (k: string) => setKeys((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : cols.map((c) => c.key).filter((x) => x === k || ks.includes(x))));

  const make = async () => {
    if (!chosen.length) return toast("اختار خانة واحدة على الأقل", "error");
    if (!rows.length) return toast("مفيش حد في الاختيار ده", "error");
    setBusy(true);
    setRender(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = Array.from(box.current?.children ?? []) as HTMLElement[];
      if (!nodes.length) throw new Error("render");
      await imagesReady(nodes);
      await saveNodesAsPdf(nodes, `buildx-${slug}-${today()}.pdf`, { landscape, widthPx: landscape ? 2246 : 1588 });
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setRender(false);
      setBusy(false);
    }
  };

  const WHO: [typeof who, string, number][] = [
    ["accepted", "المقبولين", all.filter((r) => r.status === "accepted").length],
    ["shown", "اللي ظاهرين دلوقتي", shown.length],
    ...(picked.length ? [["picked", "المحددين", picked.length] as [typeof who, string, number]] : []),
    ["all", "الكل", all.length],
  ];
  return (
    <Sheet open onClose={onClose} title="PDF بالخانات اللي تختارها">
      <div className="grid gap-4" data-testid="form-pdf-sheet">
        <Field label="العنوان">
          <Input value={head} maxLength={120} onChange={(e) => setHead(e.target.value)} />
        </Field>
        <Field label="الخانات" hint="بالترتيب اللي في الفورم. لو اخترت أكتر من 5 أو خانة نص طويل، الصفحة بتبقى بالعرض.">
          <div className="flex flex-wrap gap-2">
            {cols.map((c) => (
              <Chip key={c.key} active={keys.includes(c.key)} onClick={() => toggle(c.key)}>
                {c.ar}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="مين يطلع في الملف">
          <div className="flex flex-wrap gap-2">
            {WHO.map(([k, ar, n]) => (
              <Chip key={k} active={who === k} onClick={() => setWho(k)} count={n}>
                {ar}
              </Chip>
            ))}
          </div>
        </Field>
        <Toggle checked={faculty} onChange={setFaculty} label="لوجو كلية الذكاء الاصطناعي جنب لوجو BuildX" />
        <Toggle checked={signature} onChange={setSignature} label="مكان للتوقيع في آخر صفحة" />
        <p className="text-xs text-fog">
          {rows.length} شخص · {chosen.length} خانة · {pages} صفحة {landscape ? "بالعرض" : "بالطول"}
        </p>
        <Button variant="primary" icon="download" loading={busy} onClick={() => void make()} data-testid="form-pdf-make">
          نزّل الـ PDF
        </Button>
      </div>
      {render &&
        createPortal(
          <div ref={box} aria-hidden style={{ position: "fixed", top: 0, left: "-20000px" }}>
            {Array.from({ length: pages }, (_, i) => {
              const from = i === 0 ? 0 : S.first + (i - 1) * S.next;
              return (
                <Page
                  key={i}
                  title={head}
                  sub="BuildX HUE · Faculty of Artificial Intelligence · Horus University in Egypt"
                  cols={chosen}
                  rows={rows.slice(from, from + (i === 0 ? S.first : S.next))}
                  from={from}
                  page={i + 1}
                  pages={pages}
                  landscape={landscape}
                  faculty={faculty}
                  signature={signature}
                  total={rows.length}
                />
              );
            })}
          </div>,
          document.body,
        )}
    </Sheet>
  );
}
