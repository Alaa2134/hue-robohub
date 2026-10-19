"use client";
/**
 * The monthly report for sponsors: what BuildX HUE did in a month (reach on the website, training,
 * events, new members, certificates and projects) as a branded A4 PDF, made on the device so it can be
 * sent straight from the team app. Data: staff_sponsor_report().
 */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BASE_PATH, errorText, rpc } from "./core";
import { imagesReady } from "./certificate";
import { saveNodesAsPdf } from "./pdf";
import { Button, Card, Field, Input, Stat, Textarea, TopBar, toast } from "./ui";

export type SponsorReport = {
  from: string;
  to: string;
  reach: {
    views: number;
    visitors: number;
    views_before: number;
    countries: number;
    mobile: number;
    top: { path: string; views: number }[];
  };
  training: { sessions: number; attendances: number; students: number; active: number; quizzes: number };
  events: { title: string; at: string; registered: number; attended: number }[];
  community: { applications: number; accepted: number; new_students: number };
  output: {
    certificates: number;
    projects: number;
    posts: number;
    highlights: { title: string; kind: string }[];
  };
  partners: { name: string; image: string | null }[];
};

const PAGES: Record<string, string> = {
  "": "الصفحة الرئيسية",
  tracks: "المسارات",
  join: "التقديم",
  robotex: "روبوتكس",
  events: "الفعاليات",
  news: "الأخبار",
  team: "الفريق",
  projects: "المشاريع",
  directory: "مواقع هتفيدك",
  contact: "تواصل معانا",
  sponsors: "الرعاية",
  about: "عن الفريق",
  stories: "قصص النجاح",
};
/** "/ar/tracks/" → "المسارات"; pages the list doesn't know keep their path. */
export const pageName = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "ar" || parts[0] === "en") parts.shift();
  const key = parts.join("/");
  return PAGES[key] ?? `/${key}`;
};

const num = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
const monthName = (iso: string) =>
  new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00`));
const day = (iso: string) =>
  new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(new Date(iso));

/** "2026-10" → first and last day of that month. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Growth against the period before it, when there is one to compare with. */
export const growth = (now: number, before: number) =>
  before > 0 ? Math.round(((now - before) / before) * 100) : null;

function Page({ r, sponsor, note }: { r: SponsorReport; sponsor: string; note: string }) {
  const g = growth(r.reach.views, r.reach.views_before);
  const mobile = r.reach.views ? Math.round((r.reach.mobile / r.reach.views) * 100) : 0;
  const h2: React.CSSProperties = { fontSize: 16, fontWeight: 800, margin: "24px 0 10px", color: "#081634" };
  const cell: React.CSSProperties = {
    padding: "7px 10px",
    borderBottom: "1px solid #e3e8f0",
    textAlign: "right",
  };
  const tile = (label: string, value: string, sub?: string) => (
    <div key={label} style={{ border: "1px solid #e3e8f0", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ color: "#45526b", fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: "#081634" }}>{value}</div>
      {sub && <div style={{ color: "#45526b", fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <div
      dir="rtl"
      style={{
        width: 794,
        minHeight: 1123,
        padding: "44px 48px",
        boxSizing: "border-box",
        background: "#fff",
        color: "#081634",
        fontFamily: "system-ui, Tahoma, sans-serif",
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "3px solid #081634",
          paddingBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>تقرير الشهر للرعاة والشركاء</div>
          <div style={{ color: "#45526b", marginTop: 4 }}>{monthName(r.from)}</div>
        </div>
        <img src={`${BASE_PATH}/brand/logo-horizontal-black.png`} alt="BuildX HUE" style={{ height: 34 }} />
      </div>

      {sponsor && (
        <div style={{ marginTop: 16, fontSize: 15 }}>
          مقدَّم إلى: <b>{sponsor}</b>
        </div>
      )}
      {note && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            background: "#f4f7fb",
            borderRadius: 10,
            lineHeight: 1.8,
            whiteSpace: "pre-wrap",
          }}
        >
          {note}
        </div>
      )}

      <div style={h2}>الوصول على الموقع</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {tile(
          "مشاهدات الصفحات",
          num(r.reach.views),
          g == null ? undefined : `${g >= 0 ? "+" : ""}${num(g)}% عن الشهر اللي قبله`,
        )}
        {tile("زوار", num(r.reach.visitors))}
        {tile("دول", num(r.reach.countries))}
        {tile("من الموبايل", `${num(mobile)}%`)}
      </div>
      {!!r.reach.top.length && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <tbody>
            {r.reach.top.map((t) => (
              <tr key={t.path}>
                <td style={cell}>{pageName(t.path)}</td>
                <td style={{ ...cell, width: 120, fontWeight: 700 }}>{num(t.views)} مشاهدة</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={h2}>التدريب</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {tile("جلسات اتعملت", num(r.training.sessions))}
        {tile("مرات حضور", num(r.training.attendances))}
        {tile("طلاب حضروا", num(r.training.students), `من ${num(r.training.active)} طالب نشط`)}
        {tile("كويزات اتحلّت", num(r.training.quizzes))}
      </div>

      <div style={h2}>المجتمع والإنجازات</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {tile("طلبات انضمام", num(r.community.applications), `${num(r.community.accepted)} اتقبلوا`)}
        {tile("طلاب جداد", num(r.community.new_students))}
        {tile("شهادات", num(r.output.certificates))}
        {tile("مشاريع طلاب", num(r.output.projects))}
      </div>

      {!!r.events.length && (
        <>
          <div style={h2}>الفعاليات</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {r.events.map((e, i) => (
                <tr key={i}>
                  <td style={{ ...cell, width: 80 }}>{day(e.at)}</td>
                  <td style={cell}>{e.title}</td>
                  <td style={{ ...cell, width: 170, fontWeight: 700 }}>
                    {num(e.registered)} سجّلوا · {num(e.attended)} حضروا
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!!r.output.highlights.length && (
        <>
          <div style={h2}>أبرز اللي حصل</div>
          <ul style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2 }}>
            {r.output.highlights.map((h, i) => (
              <li key={i}>{h.title}</li>
            ))}
          </ul>
        </>
      )}

      {!!r.partners.length && (
        <>
          <div style={h2}>شكرًا لشركائنا</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {r.partners.map((p) => (
              <span
                key={p.name}
                style={{
                  border: "1px solid #e3e8f0",
                  borderRadius: 999,
                  padding: "5px 14px",
                  fontWeight: 600,
                }}
              >
                {p.name}
              </span>
            ))}
          </div>
        </>
      )}

      <div
        style={{
          marginTop: 28,
          paddingTop: 12,
          borderTop: "1px solid #e3e8f0",
          color: "#45526b",
          fontSize: 11,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>BuildX HUE · Horus University · buildxhue.com</span>
        <span>اتعمل {new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date())}</span>
      </div>
    </div>
  );
}

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function SponsorReportScreen() {
  const [month, setMonth] = useState(thisMonth);
  const [sponsor, setSponsor] = useState("");
  const [note, setNote] = useState("");
  const [report, setReport] = useState<SponsorReport | null>(null);
  const [busy, setBusy] = useState<"load" | "pdf" | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const valid = /^\d{4}-\d{2}$/.test(month);

  const load = async () => {
    setBusy("load");
    try {
      const { from, to } = monthRange(month);
      setReport(await rpc<SponsorReport>("staff_sponsor_report", { p_from: from, p_to: to }));
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const pdf = async () => {
    if (!report) return;
    setBusy("pdf");
    try {
      // The page renders off screen; wait for it and its logo, then capture it.
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const node = pageRef.current?.firstElementChild as HTMLElement | null;
      if (!node) throw new Error("render");
      await imagesReady([node]);
      await saveNodesAsPdf([node], `buildx-sponsor-report-${month}.pdf`, { widthPx: 1654 });
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const g = report ? growth(report.reach.views, report.reach.views_before) : null;
  return (
    <>
      <TopBar title="تقرير الرعاة الشهري" sub="أرقام الشهر في PDF تبعته للرعاة والشركاء" back="/staff/more" />
      <Card className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الشهر">
            <Input
              type="month"
              dir="ltr"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setReport(null);
              }}
            />
          </Field>
          <Field label="مقدَّم إلى (اختياري)" hint="اسم الشركة أو الراعي اللي هتبعتله.">
            <Input value={sponsor} maxLength={80} onChange={(e) => setSponsor(e.target.value)} />
          </Field>
        </div>
        <Field label="كلمة في أول التقرير (اختياري)">
          <Textarea
            rows={3}
            maxLength={600}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="شكرًا لدعمكم الشهر ده… وده اللي قدرنا نعمله سوا."
          />
        </Field>
        <Button
          variant="primary"
          icon="chart"
          loading={busy === "load"}
          disabled={!valid}
          onClick={() => void load()}
        >
          {report ? "حدّث الأرقام" : "هات أرقام الشهر"}
        </Button>
      </Card>

      {report && (
        <div className="mt-4 grid gap-3" data-testid="sponsor-report">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="مشاهدات الموقع"
              value={report.reach.views}
              sub={g == null ? undefined : `${g >= 0 ? "+" : ""}${g}% عن الشهر اللي قبله`}
            />
            <Stat label="زوار" value={report.reach.visitors} />
            <Stat
              label="جلسات تدريب"
              value={report.training.sessions}
              sub={`${report.training.attendances} مرة حضور`}
            />
            <Stat label="طلاب حضروا" value={report.training.students} />
            <Stat
              label="فعاليات"
              value={report.events.length}
              sub={`${report.events.reduce((s, e) => s + e.attended, 0)} حضروا`}
            />
            <Stat
              label="طلبات انضمام"
              value={report.community.applications}
              sub={`${report.community.accepted} اتقبلوا`}
            />
            <Stat label="شهادات" value={report.output.certificates} />
            <Stat label="مشاريع طلاب" value={report.output.projects} />
          </div>
          <Button
            variant="primary"
            size="lg"
            icon="download"
            block
            loading={busy === "pdf"}
            onClick={() => void pdf()}
          >
            نزّل التقرير PDF
          </Button>
        </div>
      )}

      {report &&
        createPortal(
          <div ref={pageRef} aria-hidden style={{ position: "fixed", top: 0, left: "-10000px" }}>
            <Page r={report} sponsor={sponsor.trim()} note={note.trim()} />
          </div>,
          document.body,
        )}
    </>
  );
}
