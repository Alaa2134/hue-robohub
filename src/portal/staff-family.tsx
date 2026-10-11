"use client";
/**
 * أسرة BuildX: the students who signed up on the website (/family), year by year, and the family list
 * for the Student Welfare Department, printed in the department's layout (جامعة حورس · الإدارة العامة
 * لرعاية الطلاب: م، الاسم، الرقم القومي، العنوان، التليفون، المستوى الدراسي) as a PDF, or as Excel.
 * Each registration can be accepted, set aside, or added to the app as a student.
 * Data: family_members (applications area), settings in site_settings 'family' (staff_family_settings).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addressOf, currentAcademicYear, type FamilySettings } from "@/content/family";
import { whatsappLink } from "@/lib/contact";
import { can, errorText, isFull, must, publicOrigin, rpc, sb, today, type StaffRow } from "./core";
import { saveNodesAsPdf } from "./pdf";
import { refreshStudents } from "./staff-data";
import { downloadStyledXlsx, type XRow } from "./xlsx";
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  ErrorBox,
  Field,
  Icon,
  IconButton,
  Input,
  List,
  Loading,
  Row,
  SearchBox,
  Sheet,
  Stat,
  Textarea,
  Toggle,
  TopBar,
  confirmDialog,
  copyText,
  toast,
  useAsync,
} from "./ui";

export type FamilyMember = {
  id: string;
  ref: string;
  academic_year: string;
  full_name: string;
  national_id: string;
  phone: string;
  governorate: string;
  address: string;
  level: number;
  faculty: string;
  student_number: string | null;
  email: string | null;
  status: "new" | "accepted" | "rejected";
  notes: string | null;
  student_id: string | null;
  created_at: string;
};

const STATUS: Record<FamilyMember["status"], { label: string; tone: "info" | "ok" | "muted" }> = {
  new: { label: "جديد", tone: "info" },
  accepted: { label: "مقبول", tone: "ok" },
  rejected: { label: "مستبعد", tone: "muted" },
};

const masked = (nid: string) => `${"•".repeat(10)}${nid.slice(-4)}`;
const byName = (a: FamilyMember, b: FamilyMember) => a.full_name.localeCompare(b.full_name, "ar");

/* ─── The Student Welfare list (PDF) ───────────────────────────────────── */

const W = 1123;
const H = 794;
/** Rows on each page, like the department's printed form. */
export const SHEET_ROWS = 13;

function HueMark() {
  return (
    <svg width="210" height="50" viewBox="0 0 210 50" aria-label="HUE Horus University in Egypt">
      <rect x="0" y="4" width="44" height="34" fill="#b08d3c" />
      <path d="M6 21 Q22 9 38 21 Q22 31 6 21 Z" fill="none" stroke="#fff" strokeWidth="2.2" />
      <circle cx="22" cy="21" r="4.2" fill="#fff" />
      <path d="M17 27 L14 35 M26 27 Q30 33 35 31" stroke="#fff" strokeWidth="2" fill="none" />
      <rect x="47" y="4" width="160" height="34" fill="#1c3a6b" />
      <text
        x="127"
        y="32"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="30"
        fill="#fff"
        letterSpacing="2"
      >
        HUE
      </text>
      <text
        x="105"
        y="48"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="8.4"
        fill="#1c3a6b"
        letterSpacing="0.6"
      >
        HORUS UNIVERSITY IN EGYPT
      </text>
    </svg>
  );
}

function SheetPage({
  rows,
  from,
  page,
  pages,
  s,
}: {
  rows: FamilyMember[];
  from: number;
  page: number;
  pages: number;
  s: Required<FamilySettings>;
}) {
  const cell: React.CSSProperties = {
    border: "1px solid #1d1d1d",
    padding: "0 10px",
    height: 36,
    fontSize: 15,
    verticalAlign: "middle",
  };
  const head: React.CSSProperties = {
    ...cell,
    height: 30,
    fontWeight: 700,
    fontSize: 15,
    textAlign: "center",
    background: "#f3f3f3",
  };
  const blanks = Array.from({ length: Math.max(0, SHEET_ROWS - rows.length) });
  return (
    <div
      dir="rtl"
      style={{
        width: W,
        height: H,
        padding: "26px 40px 22px",
        boxSizing: "border-box",
        background: "#fff",
        color: "#111",
        fontFamily: "'Times New Roman', 'Traditional Arabic', 'Amiri', serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "start" }}>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.7 }}>
          <div>جامعة حورس</div>
          <div>الإدارة العامة لرعاية الطلاب</div>
        </div>
        <HueMark />
        <div
          dir="ltr"
          style={{ fontSize: 14, fontWeight: 700, fontStyle: "italic", lineHeight: 1.7, textAlign: "left" }}
        >
          <div>Horus University</div>
          <div>Student Welfare Department</div>
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: 8, fontWeight: 700, fontSize: 18, lineHeight: 1.8 }}>
        <div>
          كشف بأسماء الطلاب أعضاء أسرة <span dir="ltr">{s.family}</span> بكلية{" "}
          {s.faculty || "................"}
        </div>
        <div style={{ fontSize: 16 }}>
          للعام الجامعي <span dir="ltr">{s.year}</span>
        </div>
      </div>
      <div
        style={{
          marginTop: 10,
          border: "2px solid #1d1d1d",
          borderRadius: 18,
          padding: 14,
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "30%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              {["م", "الاسم", "الرقم القومي", "العنوان", "التليفون", "المستوي الدراسي"].map((h) => (
                <th key={h} style={head}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={m.id}>
                <td style={{ ...cell, textAlign: "center" }}>{from + i + 1}</td>
                <td
                  style={{
                    ...cell,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {m.full_name}
                </td>
                <td
                  style={{
                    ...cell,
                    textAlign: "center",
                    fontFamily: "'Courier New', monospace",
                    fontSize: 14.5,
                    letterSpacing: 0.5,
                  }}
                  dir="ltr"
                >
                  {m.national_id}
                </td>
                <td
                  style={{
                    ...cell,
                    fontSize: 13.5,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {addressOf(m)}
                </td>
                <td
                  style={{
                    ...cell,
                    textAlign: "center",
                    fontFamily: "'Courier New', monospace",
                    fontSize: 14.5,
                  }}
                  dir="ltr"
                >
                  {m.phone}
                </td>
                <td style={{ ...cell, textAlign: "center" }} dir="ltr">
                  Level {m.level}
                </td>
              </tr>
            ))}
            {blanks.map((_, i) => (
              <tr key={`b${i}`}>
                <td style={{ ...cell, textAlign: "center" }}>{from + rows.length + i + 1}</td>
                <td style={cell} />
                <td style={cell} />
                <td style={cell} />
                <td style={cell} />
                <td style={cell} />
              </tr>
            ))}
          </tbody>
        </table>
        <div
          style={{
            marginTop: "auto",
            paddingTop: 10,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 13,
            color: "#333",
          }}
        >
          {page === pages ? (
            <>
              <span>رائد الأسرة: ..............................</span>
              <span>أمين الأسرة: ..............................</span>
              <span>رعاية الطلاب: ..............................</span>
            </>
          ) : (
            <span />
          )}
          <span dir="ltr" style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: "#666" }}>
            {page} / {pages}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The list as the department's form: SHEET_ROWS per page, blank numbered lines to fill the last one. */
export function SheetPages({ list, s }: { list: FamilyMember[]; s: Required<FamilySettings> }) {
  const pages = Math.max(1, Math.ceil(list.length / SHEET_ROWS));
  return (
    <>
      {Array.from({ length: pages }, (_, p) => (
        <SheetPage
          key={p}
          rows={list.slice(p * SHEET_ROWS, (p + 1) * SHEET_ROWS)}
          from={p * SHEET_ROWS}
          page={p + 1}
          pages={pages}
          s={s}
        />
      ))}
    </>
  );
}

function sheetXlsx(list: FamilyMember[], s: Required<FamilySettings>) {
  const cols = [
    "م",
    "الاسم",
    "الرقم القومي",
    "العنوان",
    "التليفون",
    "المستوى الدراسي",
    "الكلية",
    "الرقم الجامعي",
  ];
  const n = cols.length;
  const rows: XRow[] = [
    {
      cells: ["جامعة حورس · الإدارة العامة لرعاية الطلاب", ...Array(n - 1).fill("")],
      style: "sub",
      height: 22,
    },
    {
      cells: [`كشف بأسماء الطلاب أعضاء أسرة ${s.family} بكلية ${s.faculty}`, ...Array(n - 1).fill("")],
      style: "title",
      height: 36,
    },
    { cells: [`للعام الجامعي ${s.year}`, ...Array(n - 1).fill("")], style: "sub", height: 22 },
    { cells: [] },
    { cells: cols, style: "th", height: 28 },
    ...list.map((m, i): XRow => ({
      cells: [
        i + 1,
        m.full_name,
        m.national_id,
        addressOf(m),
        m.phone,
        `Level ${m.level}`,
        m.faculty,
        m.student_number ?? "",
      ],
      style: i % 2 ? "tdAlt" : "td",
      height: 22,
    })),
    { cells: ["", `الإجمالي: ${list.length}`, ...Array(n - 2).fill("")], style: "total" },
  ];
  downloadStyledXlsx(`family-${s.year.replace("/", "-")}-${today()}.xlsx`, [
    {
      name: "Family",
      widths: [6, 34, 20, 30, 16, 16, 24, 16],
      rows,
      merges: ["A1:H1", "A2:H2", "A3:H3"],
      freeze: 5,
      landscape: true,
    },
  ]);
}

/* ─── Screen ───────────────────────────────────────────────────────────── */

const fullSettings = (s: FamilySettings | null | undefined): Required<FamilySettings> => ({
  open: s?.open ?? true,
  year: s?.year || currentAcademicYear(),
  family: s?.family || "BuildX",
  faculty: s?.faculty || "الذكاء الاصطناعي",
});

export function FamilyScreen({ me }: { me: StaffRow }) {
  const write = isFull(me) || can(me, "applications");
  const { data, error, loading, reload, set } = useAsync(async () => {
    const [members, settings] = await Promise.all([
      sb().from("family_members").select("*").order("created_at", { ascending: false }).then(must) as Promise<
        FamilyMember[]
      >,
      sb().from("site_settings").select("value").eq("key", "family").maybeSingle().then(must) as Promise<{
        value: FamilySettings;
      } | null>,
    ]);
    return { members, settings: fullSettings(settings?.value) };
  }, []);
  const [year, setYear] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [status, setStatus] = useState<FamilyMember["status"] | "active">("active");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<FamilyMember | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const pagesRef = useRef<HTMLDivElement>(null);

  const s = data?.settings ?? fullSettings(null);
  const shownYear = year ?? s.year;
  const years = useMemo(
    () => [...new Set([s.year, ...(data?.members ?? []).map((m) => m.academic_year)])].sort().reverse(),
    [data, s.year],
  );
  const ofYear = useMemo(
    () => (data?.members ?? []).filter((m) => m.academic_year === shownYear),
    [data, shownYear],
  );
  const shown = useMemo(() => {
    const k = q.trim();
    return ofYear
      .filter((m) => (status === "active" ? m.status !== "rejected" : m.status === status))
      .filter((m) => level === null || m.level === level)
      .filter(
        (m) =>
          !k ||
          m.full_name.includes(k) ||
          m.phone.includes(k) ||
          m.national_id.endsWith(k) ||
          m.ref.includes(k.toUpperCase()),
      );
  }, [ofYear, status, level, q]);
  const forSheet = useMemo(() => ofYear.filter((m) => m.status !== "rejected").sort(byName), [ofYear]);

  const patch = (m: FamilyMember) =>
    set((d) => ({
      settings: d?.settings ?? fullSettings(null),
      members: (d?.members ?? []).map((x) => (x.id === m.id ? m : x)),
    }));

  const print = async () => {
    if (!forSheet.length) return toast("مفيش حد في الكشف لسه", "error");
    setPrinting(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = Array.from(pagesRef.current?.children ?? []) as HTMLElement[];
      if (!nodes.length) throw new Error("render");
      await saveNodesAsPdf(nodes, `family-${shownYear.replace("/", "-")}-${today()}.pdf`, {
        landscape: true,
        widthPx: 2246,
      });
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setPrinting(false);
    }
  };

  const fresh = ofYear.filter((m) => m.status === "new");
  const acceptAll = async () => {
    if (!(await confirmDialog({ title: `قبول ${fresh.length} تسجيل جديد؟`, ok: "قبول الكل" }))) return;
    try {
      const rows = must(
        await sb()
          .from("family_members")
          .update({ status: "accepted" })
          .in(
            "id",
            fresh.map((m) => m.id),
          )
          .select("*"),
      ) as FamilyMember[];
      const byId = new Map(rows.map((r) => [r.id, r]));
      set((d) => ({
        settings: d?.settings ?? fullSettings(null),
        members: (d?.members ?? []).map((x) => byId.get(x.id) ?? x),
      }));
      toast(`اتقبل ${rows.length}`);
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const counts = [1, 2, 3, 4, 5].map(
    (n) => ofYear.filter((m) => m.level === n && m.status !== "rejected").length,
  );

  return (
    <>
      <TopBar
        title="أسرة BuildX"
        sub={data ? `${forSheet.length} عضو · العام الجامعي ${shownYear}` : undefined}
        actions={
          <>
            <IconButton icon="share" label="لينك التسجيل" onClick={() => setShareOpen(true)} />
            {write && (
              <IconButton icon="settings" label="إعدادات الأسرة" onClick={() => setSettingsOpen(true)} />
            )}
          </>
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorBox error={error} retry={reload} />
      ) : (
        <>
          {!s.open && (
            <Card className="mb-4 flex items-center gap-3 border-warn/30 bg-warn/[0.06]">
              <Icon name="lock" size={20} className="shrink-0 text-warn" />
              <p className="flex-1 text-sm text-mist">التسجيل في الأسرة مقفول على الموقع.</p>
              {write && (
                <Button size="sm" onClick={() => setSettingsOpen(true)}>
                  افتحه
                </Button>
              )}
            </Card>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="في الكشف" value={forSheet.length} icon="users" />
            <Stat
              label="جديد"
              value={ofYear.filter((m) => m.status === "new").length}
              tone="info"
              icon="bell"
            />
            <Stat
              label="مقبول"
              value={ofYear.filter((m) => m.status === "accepted").length}
              tone="ok"
              icon="checkCircle"
            />
          </div>
          <Card className="mt-4">
            <p className="font-semibold text-chalk">كشف رعاية الطلاب</p>
            <p className="mt-1 text-sm text-fog">
              بنفس شكل ورقة الإدارة العامة لرعاية الطلاب: {SHEET_ROWS} اسم في الصفحة، مترتبين أبجدي،
              والمستبعدين مش فيه.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="primary"
                icon="printer"
                loading={printing}
                onClick={print}
                data-testid="family-pdf"
              >
                الكشف PDF
              </Button>
              <Button
                icon="download"
                onClick={() =>
                  forSheet.length
                    ? sheetXlsx(forSheet, { ...s, year: shownYear })
                    : toast("مفيش حد في الكشف لسه", "error")
                }
                data-testid="family-xlsx"
              >
                Excel
              </Button>
            </div>
          </Card>

          <div className="mt-4 grid gap-3">
            {years.length > 1 && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                {years.map((y) => (
                  <Chip key={y} active={shownYear === y} onClick={() => setYear(y)}>
                    <span dir="ltr">{y}</span>
                  </Chip>
                ))}
              </div>
            )}
            <SearchBox value={q} onChange={setQ} placeholder="ابحث بالاسم أو الموبايل أو آخر أرقام القومي" />
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              <Chip active={level === null} onClick={() => setLevel(null)}>
                كل المستويات
              </Chip>
              {[1, 2, 3, 4, 5].map((n, i) => (
                <Chip
                  key={n}
                  active={level === n}
                  onClick={() => setLevel(level === n ? null : n)}
                  count={counts[i]}
                >
                  Level {n}
                </Chip>
              ))}
            </div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {(["active", "new", "accepted", "rejected"] as const).map((k) => (
                <Chip key={k} active={status === k} onClick={() => setStatus(k)}>
                  {k === "active" ? "الكل (من غير المستبعدين)" : STATUS[k].label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mt-4">
            {write && fresh.length > 1 && (
              <Button
                size="sm"
                icon="checkCircle"
                className="mb-3"
                onClick={acceptAll}
                data-testid="family-accept-all"
              >
                قبول كل الجديد ({fresh.length})
              </Button>
            )}
            {!ofYear.length ? (
              <Empty
                icon="users"
                title="مفيش تسجيلات للسنة دي لسه"
                body="ابعت لينك التسجيل للطلاب (أو اطبع الـ QR)، وكل اللي يسجّل هيظهر هنا ويدخل الكشف لوحده."
                action={
                  <Button variant="primary" icon="share" onClick={() => setShareOpen(true)}>
                    لينك التسجيل
                  </Button>
                }
              />
            ) : !shown.length ? (
              <Empty icon="search" title="لا نتائج" />
            ) : (
              <List>
                {shown.map((m) => (
                  <Row key={m.id} onClick={() => setOpen(m)}>
                    <div className="flex items-center gap-3">
                      <span
                        className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl border border-[var(--line-2)] text-[10px] leading-none text-fog"
                        dir="ltr"
                      >
                        Level
                        <b className="mt-0.5 text-base text-chalk">{m.level}</b>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-chalk">{m.full_name}</p>
                        <p className="truncate text-xs text-fog">
                          <span dir="ltr" className="font-mono">
                            {m.phone}
                          </span>
                          {` · ${addressOf(m)}`}
                        </p>
                      </div>
                      <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
                    </div>
                  </Row>
                ))}
              </List>
            )}
          </div>
        </>
      )}

      {open && (
        <MemberSheet
          m={open}
          write={write}
          me={me}
          onClose={() => setOpen(null)}
          onSaved={(m) => (patch(m), setOpen(m))}
        />
      )}
      {settingsOpen && (
        <SettingsSheet
          s={s}
          onClose={() => setSettingsOpen(false)}
          onSaved={(v) => set((d) => ({ members: d?.members ?? [], settings: fullSettings(v) }))}
        />
      )}
      {shareOpen && <ShareSheet onClose={() => setShareOpen(false)} />}
      {printing &&
        createPortal(
          <div
            ref={pagesRef}
            dir="rtl"
            aria-hidden
            style={{ position: "fixed", top: 0, left: "-10000px", width: W }}
          >
            <SheetPages list={forSheet} s={{ ...s, year: shownYear }} />
          </div>,
          document.body,
        )}
    </>
  );
}

function MemberSheet({
  m,
  write,
  me,
  onClose,
  onSaved,
}: {
  m: FamilyMember;
  write: boolean;
  me: StaffRow;
  onClose: () => void;
  onSaved: (m: FamilyMember) => void;
}) {
  const [showId, setShowId] = useState(false);
  const [notes, setNotes] = useState(m.notes ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setNotes(m.notes ?? ""), [m.id, m.notes]);

  const update = async (fields: Partial<FamilyMember>, key: string) => {
    setBusy(key);
    try {
      const row = must(
        await sb().from("family_members").update(fields).eq("id", m.id).select("*").single(),
      ) as FamilyMember;
      onSaved(row);
      toast("اتحفظ");
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const addStudent = async () => {
    setBusy("student");
    try {
      const created = must(
        await sb()
          .from("students")
          .insert({
            code: m.student_number ?? "",
            full_name: m.full_name,
            phone: m.phone,
            group_name: `أسرة ${m.academic_year}`.slice(0, 60),
          })
          .select("id,code")
          .single(),
      ) as { id: string; code: string };
      const row = must(
        await sb()
          .from("family_members")
          .update({ student_id: created.id, status: "accepted" })
          .eq("id", m.id)
          .select("*")
          .single(),
      ) as FamilyMember;
      onSaved(row);
      refreshStudents().catch(() => undefined);
      toast(`اتضاف في التطبيق · ${created.code}`);
    } catch (e) {
      const msg = errorText(e);
      toast(
        /code_taken|duplicate|unique|code_key/i.test(msg)
          ? "الرقم الجامعي ده مستخدم لطالب تاني في التطبيق."
          : msg,
        "error",
      );
    } finally {
      setBusy(null);
    }
  };

  const wa = whatsappLink(
    m.phone,
    `أهلاً ${m.full_name.split(" ")[0]} 👋\nتسجيلك في أسرة BuildX وصلنا (${m.ref}).`,
  );
  const canStudents = isFull(me) || can(me, "roster");
  const line = (k: string, v: React.ReactNode, ltr?: boolean) => (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] py-2.5 last:border-0">
      <span className="shrink-0 text-sm text-fog">{k}</span>
      <span
        className={ltr ? "font-mono text-sm text-chalk" : "text-end text-sm text-chalk"}
        dir={ltr ? "ltr" : undefined}
      >
        {v}
      </span>
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={m.full_name}>
      <div className="grid gap-4" data-testid="family-member">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
          <Badge>
            <span dir="ltr">Level {m.level}</span>
          </Badge>
          <Badge>
            <span dir="ltr">{m.ref}</span>
          </Badge>
        </div>
        <Card>
          {line(
            "الرقم القومي",
            <span className="flex items-center gap-2">
              {showId ? m.national_id : masked(m.national_id)}
              <button
                type="button"
                className="text-cyan"
                aria-label={showId ? "إخفاء" : "إظهار"}
                onClick={() => setShowId(!showId)}
              >
                <Icon name={showId ? "eyeOff" : "eye"} size={16} />
              </button>
            </span>,
            true,
          )}
          {line("الموبايل", m.phone, true)}
          {line("العنوان", addressOf(m))}
          {line("الكلية", m.faculty)}
          {m.student_number && line("الرقم الجامعي", m.student_number, true)}
          {m.email && line("الإيميل", m.email, true)}
          {line(
            "سجّل",
            new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(m.created_at),
            ),
          )}
        </Card>
        <div className="grid grid-cols-2 gap-2">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line-2)] text-sm font-semibold text-chalk hover:bg-white/[0.05]"
            >
              <Icon name="chat" size={18} />
              واتساب
            </a>
          )}
          <Button icon="copy" onClick={() => copyText(m.national_id, "اتنسخ الرقم القومي")}>
            نسخ القومي
          </Button>
        </div>
        {write && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {(["accepted", "new", "rejected"] as const).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={m.status === k ? "primary" : "secondary"}
                  loading={busy === k}
                  disabled={m.status === k}
                  onClick={() => update({ status: k }, k)}
                >
                  {k === "accepted" ? "قبول" : k === "new" ? "جديد" : "استبعاد"}
                </Button>
              ))}
            </div>
            <Field label="ملاحظات (للفريق بس)">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
            </Field>
            {notes !== (m.notes ?? "") && (
              <Button
                loading={busy === "notes"}
                onClick={() => update({ notes: notes.trim() || null }, "notes")}
              >
                حفظ الملاحظات
              </Button>
            )}
            {canStudents &&
              (m.student_id ? (
                <p className="flex items-center gap-2 text-sm text-ok">
                  <Icon name="checkCircle" size={16} />
                  متضاف كطالب في التطبيق
                </p>
              ) : (
                <Button
                  icon="plus"
                  loading={busy === "student"}
                  onClick={addStudent}
                  data-testid="family-to-student"
                >
                  ضيفه طالب في التطبيق
                </Button>
              ))}
          </>
        )}
      </div>
    </Sheet>
  );
}

function SettingsSheet({
  s,
  onClose,
  onSaved,
}: {
  s: Required<FamilySettings>;
  onClose: () => void;
  onSaved: (v: FamilySettings) => void;
}) {
  const [v, setV] = useState(s);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!/^\d{4}\/\d{4}$/.test(v.year)) return toast("اكتب السنة كده: 2026/2027", "error");
    setBusy(true);
    try {
      onSaved(await rpc<FamilySettings>("staff_family_settings", { p: v }));
      toast("اتحفظ");
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="إعدادات الأسرة">
      <div className="grid gap-4">
        <Toggle checked={v.open} onChange={(open) => setV({ ...v, open })} label="التسجيل مفتوح على الموقع" />
        <Field label="العام الجامعي" hint="التسجيلات الجديدة بتتحسب على السنة دي. السنة بتبدأ في سبتمبر.">
          <Input
            value={v.year}
            onChange={(e) => setV({ ...v, year: e.target.value.trim() })}
            dir="ltr"
            placeholder="2026/2027"
          />
        </Field>
        <Field label="اسم الأسرة" hint="بيتكتب في الكشف: «أعضاء أسرة …»">
          <Input value={v.family} onChange={(e) => setV({ ...v, family: e.target.value })} maxLength={60} />
        </Field>
        <Field label="الكلية" hint="بيتكتب في الكشف: «بكلية …»، وبيتملى في الفورم لوحده.">
          <Input
            value={v.faculty}
            onChange={(e) => setV({ ...v, faculty: e.target.value })}
            maxLength={120}
          />
        </Field>
        <Button variant="primary" size="lg" icon="check" loading={busy} onClick={save} block>
          حفظ
        </Button>
      </div>
    </Sheet>
  );
}

function ShareSheet({ onClose }: { onClose: () => void }) {
  const url = `${publicOrigin()}/ar/family/`;
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void import("qrcode").then((QR) =>
      QR.toDataURL(url, { margin: 2, width: 720, errorCorrectionLevel: "M" }).then((u) => live && setQr(u)),
    );
    return () => {
      live = false;
    };
  }, [url]);
  const share = `سجّل في أسرة BuildX للسنة دي (الاسم، الرقم القومي، العنوان، التليفون، المستوى) من هنا 👇\n${url}`;
  return (
    <Sheet open onClose={onClose} title="لينك التسجيل في الأسرة">
      <div className="grid gap-4 text-center">
        {qr ? (
          <img src={qr} alt="QR" className="mx-auto size-56 rounded-xl bg-white p-2" />
        ) : (
          <div className="mx-auto size-56 animate-pulse rounded-xl bg-white/10" />
        )}
        <p className="break-all font-mono text-sm text-mist" dir="ltr">
          {url}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button icon="copy" onClick={() => copyText(share, "اتنسخ اللينك والرسالة")}>
            نسخ اللينك
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(share)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line-2)] text-sm font-semibold text-chalk hover:bg-white/[0.05]"
          >
            <Icon name="chat" size={18} />
            ابعته واتساب
          </a>
        </div>
        {qr && (
          <a
            href={qr}
            download="buildx-family-qr.png"
            className="text-sm font-semibold text-cyan hover:underline"
          >
            نزّل الـ QR للطباعة
          </a>
        )}
      </div>
    </Sheet>
  );
}
