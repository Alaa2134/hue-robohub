"use client";
/**
 * One student's monthly report as an A4 PDF (attendance, quizzes, tasks, points), made on the
 * device so it can be sent on WhatsApp straight from the team app. Data: staff_student_report().
 */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BASE_PATH, errorText, rpc } from "./core";
import { imagesReady } from "./certificate";
import { saveNodesAsPdf } from "./pdf";
import { BADGES } from "./points";
import { Button, Field, Input, Sheet, toast } from "./ui";

type Report = {
  student: { name: string; code: string; group: string };
  from: string;
  to: string;
  attendance: { title: string; at: string; status: "present" | "late" | "excused" | "absent" }[];
  quizzes: { title: string; score: number; max: number; at: string }[];
  tasks: { title: string; max: number; due: string | null; submitted: string | null; late: boolean | null; grade: number | null }[];
  points: { points: number; rank: number; of: number; badges: string[] } | null;
};

const STATUS: Record<Report["attendance"][number]["status"], { ar: string; color: string }> = {
  present: { ar: "حاضر", color: "#0f9d6b" },
  late: { ar: "متأخر", color: "#c98a12" },
  excused: { ar: "بعذر", color: "#2b6dff" },
  absent: { ar: "غائب", color: "#d23a4a" },
};

const d = (iso: string) => new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(new Date(iso));
const monthName = (iso: string) => new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00`));

/** "2026-10" → first and last day of that month. */
function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function Page({ r }: { r: Report }) {
  const counts = { present: 0, late: 0, excused: 0, absent: 0 };
  for (const a of r.attendance) counts[a.status]++;
  const total = r.attendance.length;
  const rate = total ? Math.round(((counts.present + counts.late) / total) * 100) : null;
  const cell: React.CSSProperties = { padding: "7px 10px", borderBottom: "1px solid #e3e8f0", textAlign: "right" };
  const head: React.CSSProperties = { ...cell, color: "#45526b", fontWeight: 600, fontSize: 12, background: "#f4f7fb" };
  const h2: React.CSSProperties = { fontSize: 16, fontWeight: 800, margin: "22px 0 8px", color: "#081634" };
  return (
    <div dir="rtl" style={{ width: 794, minHeight: 1123, padding: "44px 48px", boxSizing: "border-box", background: "#fff", color: "#081634", fontFamily: "system-ui, Tahoma, sans-serif", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "3px solid #081634", paddingBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>تقرير الطالب الشهري</div>
          <div style={{ color: "#45526b", marginTop: 4 }}>{monthName(r.from)}</div>
        </div>
        <img src={`${BASE_PATH}/brand/logo-horizontal-black.svg`} alt="BuildX HUE" style={{ height: 34 }} />
      </div>

      <div style={{ display: "flex", gap: 24, marginTop: 18, alignItems: "baseline" }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{r.student.name}</div>
        <div style={{ color: "#45526b", direction: "ltr" }}>{r.student.code}</div>
        <div style={{ color: "#45526b" }}>{r.student.group}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 18 }}>
        {[
          ["نسبة الحضور", rate == null ? "—" : `${rate}%`],
          ["النقاط", r.points ? String(r.points.points) : "—"],
          ["الترتيب في المجموعة", r.points ? `${r.points.rank} من ${r.points.of}` : "—"],
          ["الأوسمة", r.points ? String(r.points.badges.length) : "—"],
        ].map(([label, value]) => (
          <div key={label} style={{ border: "1px solid #e3e8f0", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ color: "#45526b", fontSize: 11 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={h2}>
        الحضور ({counts.present} حاضر · {counts.late} متأخر · {counts.excused} بعذر · {counts.absent} غائب)
      </div>
      {r.attendance.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={head}>التاريخ</th>
              <th style={head}>الجلسة</th>
              <th style={head}>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {r.attendance.map((a, i) => (
              <tr key={i}>
                <td style={{ ...cell, width: 90 }}>{d(a.at)}</td>
                <td style={cell}>{a.title}</td>
                <td style={{ ...cell, width: 80, color: STATUS[a.status].color, fontWeight: 700 }}>{STATUS[a.status].ar}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ color: "#45526b" }}>مفيش جلسات في الشهر ده.</div>
      )}

      <div style={h2}>الكويزات</div>
      {r.quizzes.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {r.quizzes.map((q, i) => (
              <tr key={i}>
                <td style={{ ...cell, width: 90 }}>{d(q.at)}</td>
                <td style={cell}>{q.title}</td>
                <td style={{ ...cell, width: 80, fontWeight: 700, direction: "ltr", textAlign: "left" }}>
                  {+q.score}/{+q.max}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ color: "#45526b" }}>محلّش كويزات في الشهر ده.</div>
      )}

      <div style={h2}>التاسكات</div>
      {r.tasks.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {r.tasks.map((t, i) => (
              <tr key={i}>
                <td style={{ ...cell, width: 90 }}>{t.due ? d(t.due) : "—"}</td>
                <td style={cell}>{t.title}</td>
                <td style={{ ...cell, width: 110, fontWeight: 700 }}>
                  {t.grade != null ? <span style={{ direction: "ltr", display: "inline-block" }}>{`${+t.grade}/${t.max}`}</span> : t.submitted ? (t.late ? "اتسلّم متأخر" : "اتسلّم") : <span style={{ color: "#d23a4a" }}>مسلّمش</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ color: "#45526b" }}>مفيش تاسكات في الشهر ده.</div>
      )}

      {!!r.points?.badges.length && (
        <>
          <div style={h2}>الأوسمة</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {r.points.badges.map((b) => (
              <span key={b} style={{ border: `1px solid ${BADGES[b]?.color ?? "#999"}`, color: "#081634", borderRadius: 999, padding: "4px 12px", fontWeight: 600 }}>
                {BADGES[b]?.ar ?? b}
              </span>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 28, paddingTop: 12, borderTop: "1px solid #e3e8f0", color: "#45526b", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
        <span>BuildX HUE · Horus University</span>
        <span>اتعمل {new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date())}</span>
      </div>
    </div>
  );
}

/** Sheet: pick a month, get the PDF. */
export function ReportSheet({ student, onClose }: { student: { id: string; name: string; code: string }; onClose: () => void }) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  const make = async () => {
    setBusy(true);
    try {
      const { from, to } = monthRange(month);
      const r = await rpc<Report | null>("staff_student_report", { p_student: student.id, p_from: from, p_to: to });
      if (!r) throw new Error("الطالب ده مش موجود");
      setReport(r);
      // Wait for the page to render off screen, then capture it.
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const node = pageRef.current?.firstElementChild as HTMLElement | null;
      if (!node) throw new Error("render");
      await imagesReady([node]);
      await saveNodesAsPdf([node], `report-${student.code}-${month}.pdf`, { widthPx: 1654 });
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={`تقرير ${student.name}`}>
      <div className="grid gap-4">
        <p className="text-sm leading-relaxed text-mist">الحضور والكويزات والتاسكات والنقاط في ملف PDF واحد، تبعته للطالب أو لأهله.</p>
        <Field label="الشهر">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} dir="ltr" />
        </Field>
        <Button variant="primary" size="lg" icon="download" block loading={busy} onClick={make} disabled={!/^\d{4}-\d{2}$/.test(month)}>
          اعمل التقرير PDF
        </Button>
      </div>
      {report &&
        createPortal(
          <div ref={pageRef} aria-hidden style={{ position: "fixed", top: 0, left: "-10000px" }}>
            <Page r={report} />
          </div>,
          document.body,
        )}
    </Sheet>
  );
}
