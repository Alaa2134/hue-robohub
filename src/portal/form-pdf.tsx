"use client";
/**
 * A form's responses as a printable PDF: pick the columns (any question, plus code, date, status and
 * payment), which people, the title and the page direction, and get A4 pages with the BuildX and
 * faculty logos, a zebra table, totals and page numbers. Long answers are cut to one line so every
 * page holds the same number of rows.
 *
 * In English (for conferences and partners) the whole page turns left-to-right and every name is
 * written in English: the spelling checked before, the person's own English answer, or one spelled
 * from the Arabic (lib/translit). The team reviews the list first; what they fix is saved for the
 * next file in one request.
 */
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FormField } from "@/components/forms/site-forms";
import { intlPhone, nameToEnglish } from "@/lib/translit";
import { BASE_PATH, errorText, fmt, rpc, today } from "./core";
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
  tags?: string[];
  name?: string | null;
  /** The English spelling the team checked before. */
  name_en?: string | null;
};
type Lang = "ar" | "en";
type Col = { key: string; ar: string; en?: string; wide?: boolean; ltr?: boolean; /** The person's name: never cut short. */ name?: boolean; get: (r: PdfRow) => string };

const STATUS: Record<PdfRow["status"], string> = { new: "جديد", accepted: "مقبول", waiting: "انتظار", rejected: "مرفوض" };
const STATUS_EN: Record<PdfRow["status"], string> = { new: "New", accepted: "Accepted", waiting: "Waiting list", rejected: "Not accepted" };
const enDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Cairo" });
const enFull = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Cairo" });
/** Egyptian numbers the way people write them (01…); others as stored. */
const localPhone = (p: string) => (/^\+20(1\d{9})$/.test(p) ? `0${p.slice(3)}` : p);
const show = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join("، ") : (v ?? ""));

/** The question that already asks for the name in English (the expo forms have one). */
export const englishNameField = (fields: FormField[]) => fields.find((f) => f.id === "name_en" || (f.type === "text" && /(إنجليزي|انجليزي|انجليزى)/.test(f.label_ar) && /اسم/.test(f.label_ar)));

/** Every column the PDF can have, in form order. In English, `names` holds each person's checked name. */
function columnsOf(fields: FormField[], paying: boolean, grouped: boolean, lang: Lang, names: Record<string, string>, friends: Record<string, string> = {}): Col[] {
  const en = lang === "en";
  const mainName = fields.find((f) => f.type === "name")?.id;
  const optionEn = (f: FormField, v: string) => f.options?.find((o) => o.ar === v)?.en || v;
  const value = (f: FormField, r: PdfRow) => {
    const v = r.answers[f.id];
    // "Coming with a friend" holds the friend's request code: their name next to it.
    if (f.type === "friend") return typeof v === "string" && v ? (friends[v] ? `${friends[v]} (${v})` : v) : "";
    if (!en) return f.type === "phone" ? localPhone(show(v)) : show(v);
    if (f.id === mainName) return names[r.id] ?? nameToEnglish(r.name ?? show(v)).text;
    if (f.type === "name") return nameToEnglish(show(v)).text;
    if (f.type === "phone") return intlPhone(show(v));
    if (f.type === "select" || f.type === "multi") return (Array.isArray(v) ? v : v ? [v] : []).map((x) => optionEn(f, x)).join(", ");
    return Array.isArray(v) ? v.join(", ") : (v ?? "");
  };
  const cols: Col[] = [
    { key: "_ref", ar: "كود الطلب", en: "Code", ltr: true, get: (r) => r.ref },
    ...fields
      .filter((f) => f.type !== "file" && !(en && f.id === englishNameField(fields)?.id))
      .map<Col>((f) => ({
        key: f.id,
        ar: f.label_ar,
        en: f.label_en || (f.type === "name" ? "Full name" : f.type === "phone" ? "Mobile" : f.type === "email" ? "Email" : undefined),
        wide: f.type === "textarea" || f.type === "multi",
        ltr: ["phone", "email", "url", "number", "member", "nid"].includes(f.type),
        name: f.type === "name",
        get: (r) => value(f, r),
      })),
    { key: "_date", ar: "تاريخ التسجيل", en: "Registered", get: (r) => (en ? enDay.format(new Date(r.created_at)) : fmt.day(r.created_at)) },
    { key: "_status", ar: "الحالة", en: "Status", get: (r) => (en ? STATUS_EN : STATUS)[r.status] },
  ];
  if (grouped) cols.push({ key: "_groups", ar: "المجموعة", en: "Group", get: (r) => (r.tags ?? []).join(en ? ", " : "، ") });
  if (paying)
    cols.push({
      key: "_paid",
      ar: "الدفع",
      en: "Payment",
      get: (r) => (r.paid_at ? (en ? `Paid · ${Number(r.paid_amount ?? 0)} EGP` : `دفع ${Number(r.paid_amount ?? 0)} ج`) : en ? "Unpaid" : "لم يدفع"),
    });
  return cols;
}

/** The usual first pick: the name, phone and the short questions, no long text. */
function defaultPick(fields: FormField[], paying: boolean): string[] {
  const keys = fields.filter((f) => ["name", "phone", "select", "text", "member"].includes(f.type)).slice(0, 5).map((f) => f.id);
  return [...keys, ...(paying ? ["_paid"] : [])];
}

const PORTRAIT = { w: 794, h: 1123, first: 22, next: 26 };
const LANDSCAPE = { w: 1123, h: 794, first: 13, next: 16 };

function Page({ title, sub, cols, rows, from, page, pages, landscape, faculty, signature, total, lang, heads }: {
  lang: Lang;
  /** Column titles typed for the English file. */
  heads: Record<string, string>;
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
  const en = lang === "en";
  const dense = cols.length > (landscape ? 8 : 5);
  const th: React.CSSProperties = { background: "#0b1f4d", color: "#fff", fontWeight: 700, fontSize: dense ? 10 : 11.5, padding: "8px 6px", textAlign: "start", lineHeight: 1.25 };
  const td: React.CSSProperties = { padding: dense ? "6px 5px" : "7px 6px", fontSize: dense ? 10.5 : 12, borderBottom: "1px solid #e1e7f0", textAlign: "start", verticalAlign: "middle", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0 };
  const logoH = page === 1 ? 64 : 44;
  return (
    <div
      dir={en ? "ltr" : "rtl"}
      lang={lang}
      data-testid="form-pdf-page"
      style={{ width: S.w, height: S.h, padding: "26px 32px 22px", boxSizing: "border-box", background: "#fff", color: "#0b1f4d", fontFamily: en ? "Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" : "system-ui, Tahoma, sans-serif", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
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
          {(en
            ? [
                ["Participants", String(total), 1],
                ["Date", enFull.format(new Date()), 1],
                ["Organization", "BuildX HUE · Horus University in Egypt", 2],
              ]
            : [
                ["العدد · Total", String(total), 1],
                ["التاريخ · Date", fmt.full(new Date()), 1],
                ["الجهة · Organization", "BuildX HUE · Horus University", 2],
              ]
          ).map(([k, v, grow], i) => (
            <div key={k} style={{ flex: grow as number, background: "#f4f7fb", border: "1px solid #e1e7f0", borderRadius: 10, padding: "7px 12px" }}>
              <div style={{ fontSize: 10, color: "#45526b", ...(en ? { textTransform: "uppercase", letterSpacing: 0.6 } : {}) }}>{k}</div>
              <div style={{ fontSize: i === 0 ? 20 : 12.5, fontWeight: 700, marginTop: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 34 }} />
          {cols.map((c) => (
            <col key={c.key} style={{ width: c.wide ? "22%" : c.name ? (landscape ? "20%" : "28%") : undefined }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "center" }}>{en ? "#" : "م"}</th>
            {cols.map((c) =>
              en ? (
                <th key={c.key} style={th}>
                  {heads[c.key]?.trim() || c.en || c.ar}
                </th>
              ) : (
                <th key={c.key} style={th}>
                  {c.ar}
                  {c.en && <div style={{ fontWeight: 400, opacity: 0.7, fontSize: 9 }}>{c.en}</div>}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} style={{ background: (from + i) % 2 ? "#f6f8fc" : "#fff" }}>
              <td style={{ ...td, textAlign: "center", color: "#45526b" }}>{from + i + 1}</td>
              {cols.map((c, j) => (
                <td
                  key={c.key}
                  style={{
                    ...td,
                    ...(c.name || (j === 1 && !cols.some((x) => x.name)) ? { fontWeight: 600 } : {}),
                    // A name is never cut: it takes a second line if it must.
                    ...(c.name ? { whiteSpace: "normal", lineHeight: 1.25, overflow: "visible" } : {}),
                    ...(c.key === "_paid" ? { color: r.paid_at ? "#127a43" : "#b4541a", fontWeight: 600 } : {}),
                  }}
                  dir={c.ltr && !en ? "ltr" : undefined}
                >
                  {c.get(r) || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {signature && page === pages && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 40, marginTop: 28 }}>
          {(en ? ["BuildX HUE Representative", "Approved by"] : ["مسؤول BuildX HUE", "يعتمد · Approved by"]).map((k) => (
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
          Page {page} of {pages}
        </span>
      </div>
    </div>
  );
}

/** The column picker and the PDF itself. `rows` are the people in the order to print. */
export function FormPdfSheet({ formId, title, titleEn, slug, fields, paying, groups = [], all, shown, picked, onNamesSaved, onClose }: {
  formId: string;
  title: string;
  titleEn?: string | null;
  /** The English names the team just checked, to keep them on screen without reloading. */
  onNamesSaved?: (names: Record<string, string>) => void;
  /** For the file name (Latin, safe everywhere). */
  slug: string;
  fields: FormField[];
  paying: boolean;
  /** The form's groups: each can be printed on its own. */
  groups?: string[];
  /** Everyone, the ones on screen now (current filters), and the ones ticked (if any). */
  all: PdfRow[];
  shown: PdfRow[];
  picked: PdfRow[];
  onClose: () => void;
}) {
  const [lang, setLang] = useState<Lang>("ar");
  const en = lang === "en";
  const enField = englishNameField(fields);
  const mainName = fields.find((f) => f.type === "name")?.id;
  /** Each person's name in English and where it came from: checked before, their own answer, or spelled. */
  const start = useMemo(() => {
    const out: Record<string, { text: string; guessed: boolean }> = {};
    for (const r of all) {
      const own = enField ? show(r.answers[enField.id]).trim() : "";
      const ar = r.name ?? (mainName ? show(r.answers[mainName]) : "");
      out[r.id] = r.name_en ? { text: r.name_en, guessed: false } : own ? nameToEnglish(own) : nameToEnglish(ar);
    }
    return out;
  }, [all, enField, mainName]);
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(start).map(([k, v]) => [k, v.text])));
  const [heads, setHeads] = useState<Record<string, string>>({});
  const friends = useMemo(() => Object.fromEntries(all.map((r) => [r.ref, en ? names[r.id] ?? "" : (r.name ?? "")])), [all, en, names]);
  const cols = useMemo(() => columnsOf(fields, paying, groups.length > 0, lang, names, friends), [fields, paying, groups.length, lang, names, friends]);
  const [keys, setKeys] = useState<string[]>(() => defaultPick(fields, paying));
  const [who, setWho] = useState<string>(picked.length ? "picked" : all.some((r) => r.status === "accepted") ? "accepted" : "all");
  const [head, setHead] = useState(title);
  const [headEn, setHeadEn] = useState(titleEn ?? "");
  const [faculty, setFaculty] = useState(true);
  const [signature, setSignature] = useState(true);
  const [render, setRender] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const chosen = cols.filter((c) => keys.includes(c.key));
  const rows = (who === "accepted" ? all.filter((r) => r.status === "accepted") : who === "shown" ? shown : who === "picked" ? picked : who.startsWith("g:") ? all.filter((r) => (r.tags ?? []).includes(who.slice(2))) : all).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const landscape = chosen.length > 5 || chosen.some((c) => c.wide);
  const S = landscape ? LANDSCAPE : PORTRAIT;
  const pages = rows.length <= S.first ? 1 : 1 + Math.ceil((rows.length - S.first) / S.next);
  const toggle = (k: string) => setKeys((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : cols.map((c) => c.key).filter((x) => x === k || ks.includes(x))));

  const nameShown = en && !!mainName && keys.includes(mainName);
  const toCheck = nameShown ? rows.filter((r) => start[r.id]?.guessed && names[r.id] === start[r.id].text).length : 0;

  const make = async () => {
    if (!chosen.length) return toast("اختار خانة واحدة على الأقل", "error");
    if (!rows.length) return toast("مفيش حد في الاختيار ده", "error");
    if (en && !headEn.trim()) return toast("اكتب عنوان الملف بالإنجليزي", "error");
    if (nameShown && rows.some((r) => !names[r.id]?.trim())) return toast("في اسم بالإنجليزي فاضي", "error");
    setBusy(true);
    // Keep the checked English names for next time (one request for all of them).
    if (nameShown) {
      const changed = Object.fromEntries(rows.filter((r) => (names[r.id] ?? "").trim() !== (r.name_en ?? "")).map((r) => [r.id, names[r.id].replace(/\s+/g, " ").trim()]));
      if (Object.keys(changed).length)
        await rpc("staff_form_names_en", { p_form: formId, p_names: changed })
          .then(() => onNamesSaved?.(changed))
          .catch(() => toast("الأسماء ما اتحفظتش للمرة الجاية — الملف هيطلع عادي", "error"));
    }
    setRender(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = Array.from(box.current?.children ?? []) as HTMLElement[];
      if (!nodes.length) throw new Error("render");
      await imagesReady(nodes);
      await saveNodesAsPdf(nodes, `buildx-${slug}${en ? "-en" : ""}-${today()}.pdf`, { landscape, widthPx: landscape ? 2246 : 1588 });
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setRender(false);
      setBusy(false);
    }
  };

  const WHO: [string, string, number][] = [
    ["accepted", "المقبولين", all.filter((r) => r.status === "accepted").length],
    ["shown", "اللي ظاهرين دلوقتي", shown.length],
    ...(picked.length ? [["picked", "المحددين", picked.length] as [string, string, number]] : []),
    ["all", "الكل", all.length],
    ...groups.map((g) => [`g:${g}`, g, all.filter((r) => (r.tags ?? []).includes(g)).length] as [string, string, number]),
  ];
  return (
    <Sheet open onClose={onClose} title="PDF بالخانات اللي تختارها" wide={en}>
      <div className="grid gap-4" data-testid="form-pdf-sheet">
        <Field label="لغة الملف" hint="بالإنجليزي: الصفحة كلها من الشمال لليمين، والأسامي بتتكتب بالإنجليزي — للمؤتمرات والجهات برّه.">
          <div className="flex gap-2">
            <Chip active={!en} onClick={() => setLang("ar")}>
              عربي
            </Chip>
            <Chip active={en} onClick={() => setLang("en")}>
              English
            </Chip>
          </div>
        </Field>
        {en ? (
          <Field label="العنوان بالإنجليزي">
            <Input dir="ltr" value={headEn} maxLength={120} placeholder="e.g. Robotex 2026 — BuildX HUE Delegation" onChange={(e) => setHeadEn(e.target.value)} data-testid="form-pdf-title-en" />
          </Field>
        ) : (
          <Field label="العنوان">
            <Input value={head} maxLength={120} onChange={(e) => setHead(e.target.value)} />
          </Field>
        )}
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
              <Chip
                key={k}
                active={who === k}
                onClick={() => {
                  setWho(k);
                  if (k.startsWith("g:")) {
                    setHead(`${title} · ${k.slice(2)}`);
                    if (titleEn) setHeadEn(`${titleEn} · ${k.slice(2)}`);
                  }
                }}
                count={n}
              >
                {ar}
              </Chip>
            ))}
          </div>
        </Field>
        {en && (
          <Field label="عناوين الأعمدة بالإنجليزي" hint="من سؤال الفورم بالإنجليزي، وتقدر تغيّرها للملف ده.">
            <div className="grid gap-2 sm:grid-cols-2">
              {chosen.map((c) => (
                <label key={c.key} className="grid gap-1 text-xs text-fog">
                  {c.ar}
                  <Input dir="ltr" value={heads[c.key] ?? c.en ?? ""} placeholder={c.ar} maxLength={60} onChange={(e) => setHeads((h) => ({ ...h, [c.key]: e.target.value }))} />
                </label>
              ))}
            </div>
          </Field>
        )}
        {nameShown && (
          <Field label={`الأسامي بالإنجليزي (${rows.length})`} hint={toCheck ? `${toCheck} اسم اتكتب حرف بحرف — راجعهم (معلّمين بالأصفر). اللي تصلّحه بيتحفظ للمرة الجاية.` : "الأسامي جاهزة. اللي تصلّحه بيتحفظ للمرة الجاية."}>
            <ul className="grid max-h-80 gap-1.5 overflow-y-auto rounded-xl border border-[var(--line)] p-2" data-testid="form-pdf-names">
              {rows.map((r) => {
                const check = start[r.id]?.guessed && names[r.id] === start[r.id].text;
                return (
                  <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2">
                    <span className="truncate text-sm text-mist">{r.name ?? (mainName ? show(r.answers[mainName]) : "") ?? "—"}</span>
                    <Input
                      dir="ltr"
                      value={names[r.id] ?? ""}
                      maxLength={120}
                      aria-label={`English name: ${r.name ?? r.ref}`}
                      className={check ? "border-warn/60 bg-warn/[0.07]" : undefined}
                      onChange={(e) => setNames((m) => ({ ...m, [r.id]: e.target.value }))}
                    />
                  </li>
                );
              })}
            </ul>
          </Field>
        )}
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
                  lang={lang}
                  heads={heads}
                  title={en ? headEn.trim() : head}
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
