"use client";
/**
 * An event's papers, from its form or its registrations, all on the Students' Welfare letterhead:
 *  · «أتوبيس»: the bus request to the dean with the head count and how many buses, the split into
 *    buses with who's in charge of each, and the names lists for the gate;
 *  · «اعتذار»: the lecture excuse letter for those who were really there, with their names;
 *  · «تقرير»: the report after the event (numbers, what happened, photos, what people said, money);
 *  · «حسابات»: fees collected and other income against what was spent, and an Excel sheet;
 *  · «شهادات»: participation certificates for those who were there, sent on WhatsApp.
 * Each form/event keeps its own details, and the addressees and signatures are kept once for every
 * letter (trip_letters, 20261024400000_trip_letters.sql).
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BACK,
  ExcuseLetterPage,
  LEAVE,
  LetterPage,
  ListPage,
  listChunks,
  PURPOSE,
  ReportPage,
  SETTINGS,
  arDate,
  arDay,
  busesAr,
  busesFor,
  egpAr,
  type Letter,
  type ReportFeedback,
  type ReportStats,
  type Settings,
  type TripPerson,
} from "@/components/letters/bus-request";
import { siteImageUrl } from "@/lib/site-content";
import { can, errorText, must, rpc, sb, today, type StaffRow } from "./core";
import { imagesReady, verifyUrl } from "./certificate";
import { BusSeats } from "./bus-seats";
import { saveNodesAsPdf } from "./pdf";
import { sendOnWhatsApp } from "./wa-handoff";
import { downloadXlsx } from "./xlsx";
import { Button, Chip, Field, IconButton, Input, Loading, Select, Sheet, Textarea, Toggle, go, toast, useAsync } from "./ui";

export type { TripPerson } from "@/components/letters/bus-request";
/** One choice of who's going: a key, a label and the people. */
export type TripSet = [string, string, TripPerson[]];

type Tab = "bus" | "excuse" | "report" | "money" | "certs";
const TABS: [Tab, string][] = [
  ["bus", "أتوبيس"],
  ["excuse", "اعتذار محاضرات"],
  ["report", "تقرير"],
  ["money", "حسابات"],
  ["certs", "شهادات"],
];
type Photo = { image_path: string; tags: string[] };
const num = (v: string) => Math.max(0, Math.min(10_000_000, Number(v.replace(/[^\d.]/g, "")) || 0));

export function TripLetterSheet({ me, letterKey, slug, defaults, sets, extraLabel, buses: busSplit, stats, feedback, onClose }: {
  me?: StaffRow;
  /** "form:<id>" or "event:<id>". */
  letterKey: string;
  /** For the file names. */
  slug: string;
  defaults: { event: string; date?: string | null; venue?: string | null };
  /** Who: the first one is picked; a set keyed "attended" (scanned at the door) is used for the excuse letter and certificates. */
  sets: TripSet[];
  /** A third column in the names list (faculty, year…), when the people have it. */
  extraLabel?: string;
  /** A form's people can be split into buses: each person's bus now (1, 2…), and saving a new split. */
  buses?: {
    current: Record<string, number>;
    split: (assign: Record<string, number>) => Promise<void>;
    /** Where each one sits on their bus, who they came with, and saving a bus's seats. */
    seats?: { of: Record<string, number>; friends: Record<string, string | undefined>; rank: Record<string, number>; save: (assign: Record<string, number>) => Promise<void> };
  };
  /** For the report and the accounts. */
  stats?: ReportStats & { fee?: number | null };
  /** What attendees said (events). */
  feedback?: ReportFeedback | null;
  onClose: () => void;
}) {
  const saved = useAsync(() => rpc<{ settings: Partial<Settings>; letter: Partial<Letter> }>("staff_trip_letter", { p_key: letterKey }), [letterKey]);
  const photos = useAsync(async () => (await sb().from("site_content").select("image_path, tags").eq("kind", "photo").eq("published", true).order("starts_at", { ascending: false }).limit(500).then(must)) as Photo[], []);
  const [tab, setTab] = useState<Tab>("bus");
  const [s, setS] = useState<Settings | null>(null);
  const [l, setL] = useState<Letter | null>(null);
  const [who, setWho] = useState(sets[0]?.[0] ?? "");
  const [list, setList] = useState(true);
  const [perBus, setPerBus] = useState(true);
  const [seatsOf, setSeatsOf] = useState<number | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [more, setMore] = useState(false);
  const [render, setRender] = useState<Tab | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!saved.data || s) return;
    setS({ ...SETTINGS, ...saved.data.settings });
    setL({ event: defaults.event, date: defaults.date ?? "", venue: defaults.venue ?? "", city: "", purpose: PURPOSE, leave: LEAVE, back: BACK, supervisors: 2, ...saved.data.letter });
  }, [saved.data, s, defaults]);

  if (saved.error && !saved.data)
    return (
      <Sheet open onClose={onClose} title="ملف الفعالية">
        <p className="text-sm text-danger">{errorText(saved.error)}</p>
      </Sheet>
    );
  if (!s || !l)
    return (
      <Sheet open onClose={onClose} title="ملف الفعالية">
        <Loading />
      </Sheet>
    );

  const attended = sets.find(([k]) => k === "attended");
  const people = sets.find(([k]) => k === who)?.[2] ?? [];
  // The excuse letter and certificates are for who was really there (when we know).
  const there = attended?.[2] ?? people;
  const sup = Math.max(0, Math.min(50, Math.round(l.supervisors || 0)));
  const buses = busesFor(people.length + sup, s.seats);
  const putL = <K extends keyof Letter>(k: K, v: Letter[K]) => setL({ ...l, [k]: v });
  const putS = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  // The names: one list, or a list per bus (with who's in charge) once they're split.
  const onBus = (id: string) => busSplit?.current[id] ?? 0;
  const maxBus = Math.max(0, ...people.map((x) => onBus(x.id)));
  const split = maxBus > 0;
  const groupsOf: { bus?: { name: string; count: number; sup?: { name: string; phone: string } }; people: TripPerson[] }[] =
    split && perBus
      ? [
          ...Array.from({ length: maxBus }, (_, i) => {
            const ps = people.filter((x) => onBus(x.id) === i + 1);
            return { bus: { name: `أتوبيس ${i + 1}`, count: ps.length, sup: l.bus_sups?.[i] }, people: ps };
          }).filter((g) => g.people.length),
          ...(people.some((x) => !onBus(x.id)) ? [{ bus: { name: "من غير أتوبيس", count: people.filter((x) => !onBus(x.id)).length }, people: people.filter((x) => !onBus(x.id)) }] : []),
        ]
      : [{ people }];
  const pagesFor = (gs: typeof groupsOf) => gs.flatMap((g) => listChunks(g.people).map((chunk, i, all) => ({ chunk, bus: g.bus, from: all.slice(0, i).reduce((n, c) => n + c.length, 0), last: i === all.length - 1 })));
  const busPages = pagesFor(groupsOf);
  const excusePages = pagesFor([{ people: there }]);
  const busCount = (b: number) => people.filter((x) => onBus(x.id) === b).length;
  const doSplit = async () => {
    if (!busSplit) return;
    setSplitting(true);
    try {
      // Balanced, in the order they registered: sizes differ by one at most.
      await busSplit.split(Object.fromEntries(people.map((x, i) => [x.id, Math.floor((i * buses) / people.length) + 1])));
      toast(`اتقسموا على ${busesAr(buses)}`, "ok");
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setSplitting(false);
    }
  };
  const setSup = (i: number, k: "name" | "phone", v: string) => {
    const next = [...(l.bus_sups ?? [])];
    while (next.length <= i) next.push({ name: "", phone: "" });
    next[i] = { ...next[i], [k]: v };
    putL("bus_sups", next);
  };

  // The report's photos: an album from the website's gallery (the one named like the event, if any).
  const albums = [...new Set((photos.data ?? []).flatMap((p) => p.tags))];
  const album = l.album ?? albums.find((a) => a === l.event || a.includes(l.event) || l.event.includes(a)) ?? "";
  const albumPhotos = album ? (photos.data ?? []).filter((p) => p.tags.includes(album)).slice(0, 6) : [];

  // Money: fees collected + other income − what was spent.
  const rows = (k: "income" | "expenses") => l[k] ?? [];
  const setRow = (k: "income" | "expenses", i: number, p: Partial<{ label: string; amount: number }>) => putL(k, rows(k).map((r, j) => (j === i ? { ...r, ...p } : r)));
  const collected = stats?.collected ?? 0;
  const otherIn = rows("income").reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const spent = rows("expenses").reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const exportMoney = () =>
    downloadXlsx(
      `buildx-accounts-${slug}-${today()}.xlsx`,
      [
        [l.event],
        [],
        ["البند", "المبلغ (جنيه)"],
        ["الدخل", ""],
        ...(stats?.collected !== undefined ? [[`رسوم الطلاب (${stats.paid ?? 0} دفعوا)`, collected]] : []),
        ...rows("income").map((r) => [r.label, Number(r.amount) || 0]),
        ["إجمالي الدخل", collected + otherIn],
        [],
        ["المصروفات", ""],
        ...rows("expenses").map((r) => [r.label, Number(r.amount) || 0]),
        ["إجمالي المصروفات", spent],
        [],
        ["الفرق", collected + otherIn - spent],
      ],
      { sheet: "الحسابات", rtl: true },
    );

  const save = () => rpc("staff_trip_letter_save", { p_key: letterKey, p_letter: l, p_settings: s }).catch(() => toast("ما اتحفظش للمرة الجاية — الملف هيطلع عادي", "error"));

  const make = async (what: Tab) => {
    if (!l.event.trim()) return toast("اكتب اسم الفعالية", "error");
    if (what === "bus" && !people.length) return toast("مفيش حد في الاختيار ده", "error");
    if (what === "excuse" && !there.length) return toast("لسه محدش اتسجّل حضوره", "error");
    if (what === "bus" && (!s.to_name.trim() || !s.sign1_name.trim())) return toast("اكتب اسم العميد (المرسَل إليه والتوقيع)", "error");
    setBusy(true);
    // Keep this event's details and the shared names for next time.
    await save();
    setRender(what);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = Array.from(box.current?.children ?? []) as HTMLElement[];
      if (!nodes.length) throw new Error("render");
      await imagesReady(nodes);
      const name = what === "bus" ? "bus-request" : what === "excuse" ? "lecture-excuse" : "event-report";
      await saveNodesAsPdf(nodes, `buildx-${name}-${slug}-${today()}.pdf`, { landscape: false, widthPx: 1588 });
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setRender(null);
      setBusy(false);
    }
  };

  // Participation certificates for who was there, then a WhatsApp with each one's link.
  const issueCerts = async () => {
    if (!there.length) return toast("لسه محدش اتسجّل حضوره", "error");
    if (there.length > 300) return toast("أقصى حد 300 شهادة في المرة", "error");
    setBusy(true);
    try {
      // Pressing it again only adds who doesn't have this event's certificate yet.
      const title = l.event.trim();
      type Cert = { code: string; recipient_name: string };
      const had = (await sb().from("certificates").select("code, recipient_name").eq("title", title).eq("kind", "participation").is("revoked_at", null).then(must)) as Cert[];
      const key = (n: string) => n.trim().replace(/\s+/g, " ");
      const codes = new Map(had.map((c) => [key(c.recipient_name), c.code]));
      const fresh = there.filter((x) => !codes.has(key(x.name)));
      const out = fresh.length
        ? ((await sb()
            .from("certificates")
            .insert(fresh.map((x) => ({ recipient_name: key(x.name), kind: "participation", title, details_ar: l.date ? `${arDay(l.date)} ${arDate(l.date)}` : null, issued_on: l.date || today() })))
            .select("code, recipient_name")
            .then(must)) as Cert[])
        : [];
      out.forEach((c) => codes.set(key(c.recipient_name), c.code));
      toast(out.length ? `اتصدرت ${out.length} شهادة ✓${had.length ? ` (و${there.length - fresh.length} كانت طالعة قبل كده)` : ""}` : "كلهم ليهم شهادة الفعالية دي قبل كده", "ok");
      if (me && can(me, "whatsapp"))
        sendOnWhatsApp(
          there.map((x) => {
            const code = codes.get(key(x.name)) ?? "";
            return { phone: x.phone, name: x.name, vars: { code, link: code ? verifyUrl(code) : "" } };
          }),
          { label: `شهادات «${l.event}» (${there.length})`, context: `${letterKey}:certs`, text: `مبروك 🎓 شهادة حضورك «${l.event}» من BuildX HUE جاهزة. تقدر تشوفها وتنزّلها من هنا: {link}` },
        );
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const whoPicker = (
    <Field label={tab === "bus" ? "مين رايح" : "مين"}>
      <div className="flex flex-wrap gap-2">
        {sets.map(([k, label, ps]) => (
          <Chip key={k} active={who === k} onClick={() => setWho(k)} count={ps.length}>
            {label}
          </Chip>
        ))}
      </div>
    </Field>
  );
  const eventFields = (
    <>
      <Field label="اسم الفعالية (زي ما هيتكتب في الورق)">
        <Input value={l.event} maxLength={140} onChange={(e) => putL("event", e.target.value)} data-testid="trip-letter-event" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
        <Field label="التاريخ" hint={l.date ? `${arDay(l.date)} ${arDate(l.date)}` : undefined}>
          <Input type="date" value={l.date} onChange={(e) => putL("date", e.target.value)} dir="ltr" data-testid="trip-letter-date" />
        </Field>
        <Field label="المكان">
          <Input value={l.venue} maxLength={160} placeholder="جامعة …" onChange={(e) => putL("venue", e.target.value)} data-testid="trip-letter-venue" />
        </Field>
        <Field label="المدينة">
          <Input value={l.city} maxLength={60} placeholder="الإسكندرية" onChange={(e) => putL("city", e.target.value)} />
        </Field>
      </div>
    </>
  );
  const thereNote = attended ? `${there.length} اتمسح الـ QR بتاعهم` : `${there.length} (مفيش مسح QR، فبيتاخد الاختيار اللي فوق)`;

  return (
    <Sheet open onClose={onClose} title="ملف الفعالية" wide>
      <div className="grid gap-4" data-testid="trip-letter-sheet">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist">
          {TABS.map(([k, label]) => (
            <Chip key={k} active={tab === k} onClick={() => setTab(k)}>
              {label}
            </Chip>
          ))}
        </div>

        {tab === "bus" && (
          <>
            {whoPicker}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
              <Field label="عدد المشرفين">
                <Input type="number" inputMode="numeric" min={0} max={50} value={String(l.supervisors)} onChange={(e) => putL("supervisors", Number(e.target.value) || 0)} dir="ltr" />
              </Field>
              <Field label="كراسي الأتوبيس">
                <Input type="number" inputMode="numeric" min={10} max={80} value={String(s.seats)} onChange={(e) => putS("seats", Number(e.target.value) || 50)} dir="ltr" />
              </Field>
              <p className="col-span-2 self-end rounded-xl bg-cyan/10 px-3 py-2 text-sm font-semibold text-ice sm:col-span-1" data-testid="trip-letter-count">
                {people.length} طالب + {sup} مشرف = {people.length + sup} · {busesAr(buses)}
              </p>
            </div>
            {busSplit && people.length > 0 && (
              <div className="grid gap-3 rounded-2xl border border-[var(--line)] p-3" data-testid="trip-buses">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex-1 text-sm font-semibold text-chalk" data-testid="trip-bus-counts">
                    {split ? Array.from({ length: maxBus }, (_, i) => `أتوبيس ${i + 1}: ${busCount(i + 1)}`).join(" · ") : "لسه متقسموش على الأتوبيسات"}
                  </p>
                  {buses > 1 && (
                    <Button size="sm" loading={splitting} onClick={() => void doSplit()} data-testid="trip-split">
                      {split ? "قسّمهم تاني" : "قسّمهم"} على {busesAr(buses)}
                    </Button>
                  )}
                </div>
                {split && (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2 [&>*]:min-w-0">
                      {Array.from({ length: maxBus }, (_, i) => (
                        <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 [&>*]:min-w-0">
                          <span className="text-xs text-fog">أتوبيس {i + 1}</span>
                          <Input value={l.bus_sups?.[i]?.name ?? ""} maxLength={60} placeholder="المشرف" aria-label={`مشرف أتوبيس ${i + 1}`} onChange={(e) => setSup(i, "name", e.target.value)} />
                          <Input value={l.bus_sups?.[i]?.phone ?? ""} maxLength={20} placeholder="رقمه" dir="ltr" inputMode="tel" aria-label={`رقم مشرف أتوبيس ${i + 1}`} onChange={(e) => setSup(i, "phone", e.target.value)} />
                          {busSplit?.seats ? (
                            <Button size="sm" disabled={!busCount(i + 1)} onClick={() => setSeatsOf(i + 1)} data-testid={`bus-seats-open-${i + 1}`}>
                              {(() => {
                                const sat = people.filter((x) => onBus(x.id) === i + 1 && busSplit.seats!.of[x.id]).length;
                                return sat ? `الكراسي ${sat}/${busCount(i + 1)}` : "الكراسي";
                              })()}
                            </Button>
                          ) : (
                            <span />
                          )}
                        </div>
                      ))}
                    </div>
                    <Toggle checked={perBus} onChange={setPerBus} label="كشف لكل أتوبيس لوحده (باسم المشرف)" />
                  </>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex-1 text-xs text-fog">التقسيم بيتحفظ كمجموعة على كل شخص، فتقدر تفلتر بيه في الردود، وتمسح الـ QR على باب كل أتوبيس في الذهاب والعودة.</p>
                  {letterKey.startsWith("form:") && (
                    <Button size="sm" icon="scan" onClick={() => go(`/staff/forms/${letterKey.slice(5)}/attendance`)} data-testid="trip-boarding">
                      مسح الركوب بالـ QR
                    </Button>
                  )}
                </div>
              </div>
            )}
            {eventFields}
            <Field label="هدف الزيارة">
              <Textarea value={l.purpose} maxLength={900} className="min-h-24" onChange={(e) => putL("purpose", e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="ميعاد التحرك">
                <Input value={l.leave} maxLength={60} placeholder="صباحًا / الساعة 7 صباحًا" onChange={(e) => putL("leave", e.target.value)} />
              </Field>
              <Field label="العودة">
                <Input value={l.back} maxLength={140} onChange={(e) => putL("back", e.target.value)} />
              </Field>
            </div>
            <Toggle checked={list} onChange={setList} label="كشف بالأسماء في صفحات بعد الخطاب (للبوابة وشركة النقل)" />
            <button type="button" className="w-fit text-sm font-semibold text-cyan" onClick={() => setMore(!more)} aria-expanded={more}>
              {more ? "إخفاء" : "تعديل"} المرسَل إليه والتوقيعات ومكان التحرك
            </button>
            {more && (
              <div className="grid gap-3 rounded-2xl border border-[var(--line)] p-3 sm:grid-cols-2 [&>*]:min-w-0" data-testid="trip-letter-people">
                <Field label="اللقب">
                  <Input value={s.to_title} maxLength={60} onChange={(e) => putS("to_title", e.target.value)} />
                </Field>
                <Field label="اسم المرسَل إليه">
                  <Input value={s.to_name} maxLength={80} onChange={(e) => putS("to_name", e.target.value)} />
                </Field>
                <Field label="صفته">
                  <Input value={s.to_role} maxLength={120} onChange={(e) => putS("to_role", e.target.value)} />
                </Field>
                <Field label="مكان التحرك">
                  <Input value={s.from_place} maxLength={120} onChange={(e) => putS("from_place", e.target.value)} />
                </Field>
                <Field label="التوقيع الأول (الصفة)">
                  <Input value={s.sign1_role} maxLength={60} onChange={(e) => putS("sign1_role", e.target.value)} />
                </Field>
                <Field label="التوقيع الأول (الاسم)">
                  <Input value={s.sign1_name} maxLength={80} onChange={(e) => putS("sign1_name", e.target.value)} />
                </Field>
                <Field label="التوقيع التاني (الصفة)">
                  <Input value={s.sign2_role} maxLength={60} onChange={(e) => putS("sign2_role", e.target.value)} />
                </Field>
                <Field label="التوقيع التاني (الاسم)">
                  <Input value={s.sign2_name} maxLength={80} onChange={(e) => putS("sign2_name", e.target.value)} />
                </Field>
              </div>
            )}
            <p className="text-xs text-fog">الخطاب{list ? ` + ${busPages.length} صفحة أسماء` : ""} · A4. اللي تكتبه بيتحفظ للمرة الجاية.</p>
            <Button variant="primary" icon="download" loading={busy} onClick={() => void make("bus")} data-testid="trip-letter-make">
              نزّل الخطاب PDF
            </Button>
          </>
        )}

        {tab === "excuse" && (
          <>
            <p className="rounded-xl bg-cyan/10 px-3 py-2 text-sm text-ice" data-testid="trip-excuse-count">
              الخطاب لشؤون التعليم والطلاب عشان غياب يوم الفعالية يتحسب بعذر، ومعاه كشف بأسماء اللي حضروا: {thereNote}.
            </p>
            {eventFields}
            <div className="grid gap-3 rounded-2xl border border-[var(--line)] p-3 sm:grid-cols-3 [&>*]:min-w-0">
              <Field label="اللقب">
                <Input value={s.ex_title ?? s.to_title} maxLength={60} onChange={(e) => putS("ex_title", e.target.value)} />
              </Field>
              <Field label="اسم المرسَل إليه">
                <Input value={s.ex_name ?? ""} maxLength={80} placeholder="اختياري" onChange={(e) => putS("ex_name", e.target.value)} />
              </Field>
              <Field label="صفته">
                <Input value={s.ex_role ?? "وكيل الكلية لشؤون التعليم والطلاب"} maxLength={120} onChange={(e) => putS("ex_role", e.target.value)} />
              </Field>
            </div>
            <Button variant="primary" icon="download" loading={busy} onClick={() => void make("excuse")} data-testid="trip-excuse-make">
              نزّل خطاب الاعتذار PDF ({there.length})
            </Button>
          </>
        )}

        {tab === "report" && (
          <>
            {eventFields}
            <Field label="اللي حصل في الفعالية" hint="فقرة أو اتنين: اتعمل إيه، مين اتكلم، اتعلموا إيه… بتطلع في التقرير للعميد ورعاية الطلاب.">
              <Textarea value={l.summary ?? ""} maxLength={1200} className="min-h-28" onChange={(e) => putL("summary", e.target.value)} data-testid="trip-report-summary" />
            </Field>
            <Field label="الصور (من ألبوم على الموقع)" hint={albumPhotos.length ? `${albumPhotos.length} صورة هتطلع في التقرير` : "ارفع صور الفعالية من «محتوى الموقع» وهي تظهر هنا"}>
              <Select value={album} onChange={(e) => putL("album", e.target.value)}>
                <option value="">من غير صور</option>
                {albums.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
            {albumPhotos.length > 0 && (
              <div className="grid grid-cols-6 gap-1">
                {albumPhotos.map((p) => (
                  <img key={p.image_path} src={siteImageUrl(p.image_path, "thumb")} alt="" className="aspect-square w-full rounded-lg object-cover" />
                ))}
              </div>
            )}
            {stats && (
              <p className="text-xs text-fog">
                الأرقام: سجّلوا {stats.registered}
                {stats.accepted !== undefined ? ` · اتقبلوا ${stats.accepted}` : ""}
                {stats.attended !== undefined ? ` · حضروا ${stats.attended}` : ""}
                {stats.paid !== undefined ? ` · دفعوا ${stats.paid}` : ""}
                {feedback?.count ? ` · تقييم ${feedback.avg.toFixed(1)}/5 من ${feedback.count}` : ""}
              </p>
            )}
            <Button variant="primary" icon="download" loading={busy} onClick={() => void make("report")} data-testid="trip-report-make">
              نزّل التقرير PDF
            </Button>
            {me && can(me, "site") && (
              <Button
                icon="globe"
                data-testid="trip-report-post"
                onClick={() => {
                  // A news post started from the report: the summary and the real numbers, ready to edit.
                  const came = stats?.attended || stats?.accepted || 0;
                  const body = [l.summary?.trim(), came ? `شارك ${came} من أعضاء BuildX HUE.` : ""].filter(Boolean).join("\n\n");
                  onClose();
                  go(`/staff/site?quick=post&title=${encodeURIComponent(l.event)}&body=${encodeURIComponent(body)}`);
                }}
              >
                انشر خبر عن الفعالية على الموقع
              </Button>
            )}
          </>
        )}

        {tab === "money" && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center" data-testid="trip-money">
              <div className="rounded-xl bg-ok/10 p-2">
                <p className="text-lg font-bold text-ok">{egpAr(collected + otherIn)}</p>
                <p className="text-xs text-fog">الدخل</p>
              </div>
              <div className="rounded-xl bg-danger/10 p-2">
                <p className="text-lg font-bold text-[#ff9aa5]">{egpAr(spent)}</p>
                <p className="text-xs text-fog">المصروفات</p>
              </div>
              <div className="rounded-xl bg-cyan/10 p-2">
                <p className="text-lg font-bold text-ice" data-testid="trip-money-balance">
                  {egpAr(collected + otherIn - spent)}
                </p>
                <p className="text-xs text-fog">الفرق</p>
              </div>
            </div>
            {stats?.collected !== undefined && (
              <p className="text-sm text-mist">
                رسوم الطلاب: {egpAr(collected)} من {stats.paid ?? 0} دفعوا (بتتحسب لوحدها من «الدفع» في الردود).
              </p>
            )}
            {(["income", "expenses"] as const).map((k) => (
              <Field key={k} label={k === "income" ? "دخل تاني (رعاية، دعم من الكلية…)" : "المصروفات (أتوبيس، طباعة، أكل…)"}>
                <div className="grid gap-2">
                  {rows(k).map((r, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2 [&>*]:min-w-0">
                      <Input value={r.label} maxLength={80} placeholder="البند" aria-label="البند" onChange={(e) => setRow(k, i, { label: e.target.value })} />
                      <Input value={r.amount ? String(r.amount) : ""} inputMode="decimal" dir="ltr" placeholder="0" aria-label="المبلغ" onChange={(e) => setRow(k, i, { amount: num(e.target.value) })} />
                      <IconButton icon="trash" label="شيل البند" onClick={() => putL(k, rows(k).filter((_, j) => j !== i))} />
                    </div>
                  ))}
                  <Button size="sm" icon="plus" variant="ghost" className="w-fit" onClick={() => putL(k, [...rows(k), { label: "", amount: 0 }].slice(0, 40))} data-testid={`trip-add-${k}`}>
                    بند
                  </Button>
                </div>
              </Field>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon="download" onClick={exportMoney} data-testid="trip-money-xlsx">
                Excel
              </Button>
              <Button
                icon="check"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  await save();
                  setBusy(false);
                  toast("اتحفظت الحسابات", "ok");
                }}
              >
                احفظ
              </Button>
            </div>
            <p className="text-xs text-fog">الحسابات بتظهر كمان في تقرير الفعالية.</p>
          </>
        )}

        {tab === "certs" && (
          <>
            <p className="rounded-xl bg-cyan/10 px-3 py-2 text-sm text-ice" data-testid="trip-certs-count">
              شهادة حضور لكل اللي حضروا: {thereNote}. كل شهادة ليها كود تحقق، وبعدها بتتبعت لكل واحد على الواتساب باللينك بتاعها.
            </p>
            {eventFields}
            {me && !can(me, "certificates") ? (
              <p className="text-sm text-fog">إصدار الشهادات محتاج صلاحية «الشهادات».</p>
            ) : (
              <Button variant="primary" icon="award" loading={busy} disabled={!there.length} onClick={() => void issueCerts()} data-testid="trip-certs-issue">
                اطلع {there.length} شهادة وابعتها
              </Button>
            )}
          </>
        )}
      </div>
      {seatsOf != null && busSplit?.seats && (
        <BusSeats
          key={seatsOf}
          bus={seatsOf}
          seats={s.seats}
          title={l.event}
          sup={l.bus_sups?.[seatsOf - 1]}
          people={people.filter((x) => onBus(x.id) === seatsOf).sort((a, b) => (busSplit.seats!.rank[a.id] ?? 0) - (busSplit.seats!.rank[b.id] ?? 0))}
          seatOf={busSplit.seats.of}
          friendOf={busSplit.seats.friends}
          onSave={busSplit.seats.save}
          onClose={() => setSeatsOf(null)}
        />
      )}
      {render &&
        createPortal(
          <div ref={box} aria-hidden style={{ position: "fixed", top: 0, left: "-20000px" }}>
            {render === "bus" && (
              <>
                <LetterPage s={s} l={l} students={people.length} supervisors={sup} buses={buses} />
                {list && busPages.map((pg, i) => <ListPage key={i} s={s} l={l} people={pg.chunk} from={pg.from} pageNo={i + 1} pages={busPages.length} extraLabel={extraLabel} last={pg.last} bus={pg.bus} />)}
              </>
            )}
            {render === "excuse" && (
              <>
                <ExcuseLetterPage s={s} l={l} count={there.length} />
                {excusePages.map((pg, i) => (
                  <ListPage key={i} s={s} l={l} people={pg.chunk} from={pg.from} pageNo={i + 1} pages={excusePages.length} extraLabel={extraLabel} last={pg.last} />
                ))}
              </>
            )}
            {render === "report" && (
              <ReportPage
                s={s}
                l={{ ...l, album }}
                stats={stats ?? { registered: people.length }}
                photos={albumPhotos.map((p) => siteImageUrl(p.image_path, "full"))}
                feedback={feedback}
              />
            )}
          </div>,
          document.body,
        )}
    </Sheet>
  );
}
