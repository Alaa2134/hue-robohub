"use client";
/**
 * The month's report for the college (media desk): a PDF with the college's patronage lines, the
 * month's totals, then a page per event with its cover photo, its real numbers and the college post
 * written for it (src/lib/college-post.ts). Everything comes from the records; nothing is invented.
 */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { collegePost, type CollegeSetup } from "@/lib/college-post";
import type { DeskEvent } from "@/lib/media-writer";
import { siteImageUrl } from "@/lib/site-content";
import { imagesReady } from "./certificate";
import { BASE_PATH, errorText, today } from "./core";
import { saveNodesAsPdf } from "./pdf";
import { Button, Select, toast } from "./ui";

type Ev = DeskEvent & { cover?: string | null };

const monthKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Africa/Cairo" }).format(new Date(iso)).slice(0, 7);
const monthName = (key: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-15T00:00:00Z`));
const day = (iso: string) => new Intl.DateTimeFormat("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Cairo" }).format(new Date(iso));

const NAVY = "#0b1f4d";
const page: React.CSSProperties = { width: 794, height: 1123, background: "#fff", color: "#111", fontFamily: "var(--font-plex-arabic), Tahoma, sans-serif", padding: 48, boxSizing: "border-box", direction: "rtl", position: "relative", overflow: "hidden" };

export function MonthReport({ events, setup }: { events: Ev[]; setup: CollegeSetup }) {
  const now = Date.now();
  const done = events.filter((e) => new Date(e.at).getTime() < now);
  const months = [...new Set(done.map((e) => monthKey(e.at)))].sort().reverse();
  const [month, setMonth] = useState(months[0] ?? "");
  const [render, setRender] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  if (!months.length) return null;
  const list = done.filter((e) => monthKey(e.at) === month).sort((a, b) => a.at.localeCompare(b.at));
  const came = list.reduce((n, e) => n + e.attended, 0);
  const rated = list.filter((e) => e.ratings > 0);

  const make = async () => {
    setBusy(true);
    setRender(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = Array.from(box.current?.children ?? []) as HTMLElement[];
      if (!nodes.length) throw new Error("render");
      await imagesReady(nodes, 8000);
      await saveNodesAsPdf(nodes, `buildx-month-${month}-${today()}.pdf`, { widthPx: 1588 });
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setRender(false);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="month-report">
      <span className="text-sm text-mist">تقرير الشهر للكلية:</span>
      <Select value={month} onChange={(x) => setMonth(x.target.value)} className="max-w-[12rem]">
        {months.map((m) => (
          <option key={m} value={m}>
            {monthName(m)}
          </option>
        ))}
      </Select>
      <Button size="sm" icon="download" loading={busy} onClick={() => void make()} data-testid="month-report-pdf">
        {`PDF (${list.length} فعالية)`}
      </Button>
      {render &&
        createPortal(
          <div ref={box} aria-hidden style={{ position: "fixed", top: 0, left: "-20000px" }}>
            <section style={page}>
              <img src={`${BASE_PATH}/brand/logo-horizontal-color.png`} alt="" style={{ height: 56 }} />
              <h1 style={{ color: NAVY, fontSize: 30, margin: "28px 0 6px" }}>{`تقرير أنشطة فريق BuildX HUE — ${monthName(month)}`}</h1>
              {setup.college && <p style={{ margin: 0, color: "#444", fontSize: 16 }}>{[setup.college, setup.university].filter(Boolean).join(" — ")}</p>}
              {setup.header?.trim() && <p style={{ whiteSpace: "pre-line", fontSize: 13, lineHeight: 1.8, color: "#333", marginTop: 20 }}>{setup.header.trim()}</p>}
              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                {(
                  [
                    [list.length, "فعالية"],
                    [came, "حضور (بالـ QR)"],
                    [list.reduce((n, e) => n + e.photos, 0), "صورة منشورة"],
                    ...(rated.length ? ([[(rated.reduce((n, e) => n + (e.rating ?? 0) * e.ratings, 0) / rated.reduce((n, e) => n + e.ratings, 0)).toFixed(1), "متوسط التقييم من 5"]] as [string, string][]) : []),
                  ] as [string | number, string][]
                ).map(([n, l]) => (
                  <div key={l} style={{ flex: 1, border: `2px solid ${NAVY}`, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 30, fontWeight: 800, color: NAVY }}>{n}</div>
                    <div style={{ fontSize: 13, color: "#444" }}>{l}</div>
                  </div>
                ))}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24, fontSize: 14 }}>
                <thead>
                  <tr style={{ background: NAVY, color: "#fff" }}>
                    {["الفعالية", "اليوم", "سجّل", "حضر", "التقييم"].map((h) => (
                      <th key={h} style={{ padding: 8, textAlign: "right" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((e, i) => (
                    <tr key={e.key} style={{ background: i % 2 ? "#f2f5fb" : "#fff" }}>
                      <td style={{ padding: 8 }}>{e.title}</td>
                      <td style={{ padding: 8 }}>{day(e.at)}</td>
                      <td style={{ padding: 8 }}>{e.registered || "—"}</td>
                      <td style={{ padding: 8 }}>{e.attended || "—"}</td>
                      <td style={{ padding: 8 }}>{e.ratings ? `${e.rating} (${e.ratings})` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            {list.map((e) => (
              <section key={e.key} style={page}>
                <h2 style={{ color: NAVY, fontSize: 24, margin: "0 0 4px" }}>{e.title}</h2>
                <p style={{ margin: 0, color: "#555" }}>{[day(e.at), e.place].filter(Boolean).join(" · ")}</p>
                {e.cover && <img src={siteImageUrl(e.cover)} crossOrigin="anonymous" alt="" style={{ width: "100%", height: 360, objectFit: "cover", borderRadius: 12, marginTop: 16 }} />}
                <p style={{ whiteSpace: "pre-line", fontSize: 13.5, lineHeight: 1.9, marginTop: 16 }}>{collegePost({ ...setup, header: "" }, { event: e, tracks: [], names: [] })}</p>
              </section>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
