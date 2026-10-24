"use client";
/**
 * The official bus request to the dean for an event (طلب توفير أتوبيس), on the Students' Welfare
 * letterhead, with the number of students from the form or the event's registrations and how many
 * buses that needs. Optionally a second part: the list of names for the gate. Each form/event keeps
 * its letter (event, date, venue, purpose…), and who it's addressed to and who signs are kept once
 * for every letter (trip_letters, 20261024400000_trip_letters.sql).
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BACK, LEAVE, LetterPage, ListPage, listChunks, PURPOSE, SETTINGS, arDate, arDay, busesAr, busesFor, type Letter, type Settings, type TripPerson } from "@/components/letters/bus-request";
import { errorText, rpc, today } from "./core";
import { imagesReady } from "./certificate";
import { saveNodesAsPdf } from "./pdf";
import { Button, Chip, Field, Input, Loading, Sheet, Textarea, Toggle, toast, useAsync } from "./ui";

export type { TripPerson } from "@/components/letters/bus-request";
/** One choice of who's going: a key, a label and the people. */
export type TripSet = [string, string, TripPerson[]];

/** The sheet: fill in or check the letter, pick who's going, and download the PDF. */
export function TripLetterSheet({ letterKey, slug, defaults, sets, extraLabel, onClose }: {
  /** "form:<id>" or "event:<id>". */
  letterKey: string;
  /** For the file name. */
  slug: string;
  defaults: { event: string; date?: string | null; venue?: string | null };
  sets: TripSet[];
  /** A third column in the names list (faculty, year…), when the people have it. */
  extraLabel?: string;
  onClose: () => void;
}) {
  const saved = useAsync(() => rpc<{ settings: Partial<Settings>; letter: Partial<Letter> }>("staff_trip_letter", { p_key: letterKey }), [letterKey]);
  const [s, setS] = useState<Settings | null>(null);
  const [l, setL] = useState<Letter | null>(null);
  const [who, setWho] = useState(sets[0]?.[0] ?? "");
  const [list, setList] = useState(true);
  const [more, setMore] = useState(false);
  const [render, setRender] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!saved.data || s) return;
    setS({ ...SETTINGS, ...saved.data.settings });
    setL({ event: defaults.event, date: defaults.date ?? "", venue: defaults.venue ?? "", city: "", purpose: PURPOSE, leave: LEAVE, back: BACK, supervisors: 2, ...saved.data.letter });
  }, [saved.data, s, defaults]);

  if (saved.error && !saved.data)
    return (
      <Sheet open onClose={onClose} title="خطاب طلب أتوبيس">
        <p className="text-sm text-danger">{errorText(saved.error)}</p>
      </Sheet>
    );
  if (!s || !l)
    return (
      <Sheet open onClose={onClose} title="خطاب طلب أتوبيس">
        <Loading />
      </Sheet>
    );

  const people = sets.find(([k]) => k === who)?.[2] ?? [];
  const sup = Math.max(0, Math.min(50, Math.round(l.supervisors || 0)));
  const buses = busesFor(people.length + sup, s.seats);
  const chunks = listChunks(people);
  const listPages = list ? chunks.length : 0;
  const putL = <K extends keyof Letter>(k: K, v: Letter[K]) => setL({ ...l, [k]: v });
  const putS = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  const make = async () => {
    if (!l.event.trim()) return toast("اكتب اسم الفعالية", "error");
    if (!people.length) return toast("مفيش حد في الاختيار ده", "error");
    if (!s.to_name.trim() || !s.sign1_name.trim()) return toast("اكتب اسم العميد (المرسَل إليه والتوقيع)", "error");
    setBusy(true);
    // Keep this letter and the shared names for next time.
    await rpc("staff_trip_letter_save", { p_key: letterKey, p_letter: l, p_settings: s }).catch(() => toast("الخطاب ما اتحفظش للمرة الجاية — الملف هيطلع عادي", "error"));
    setRender(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = Array.from(box.current?.children ?? []) as HTMLElement[];
      if (!nodes.length) throw new Error("render");
      await imagesReady(nodes);
      await saveNodesAsPdf(nodes, `buildx-bus-request-${slug}-${today()}.pdf`, { landscape: false, widthPx: 1588 });
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setRender(false);
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="خطاب طلب أتوبيس" wide>
      <div className="grid gap-4" data-testid="trip-letter-sheet">
        <Field label="مين رايح">
          <div className="flex flex-wrap gap-2">
            {sets.map(([k, label, ps]) => (
              <Chip key={k} active={who === k} onClick={() => setWho(k)} count={ps.length}>
                {label}
              </Chip>
            ))}
          </div>
        </Field>
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
        <Field label="اسم الفعالية (زي ما هيتكتب في الخطاب)">
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
        <p className="text-xs text-fog">الخطاب{list ? ` + ${listPages} صفحة أسماء` : ""} · A4. اللي تكتبه بيتحفظ للمرة الجاية.</p>
        <Button variant="primary" icon="download" loading={busy} onClick={() => void make()} data-testid="trip-letter-make">
          نزّل الخطاب PDF
        </Button>
      </div>
      {render &&
        createPortal(
          <div ref={box} aria-hidden style={{ position: "fixed", top: 0, left: "-20000px" }}>
            <LetterPage s={s} l={l} students={people.length} supervisors={sup} buses={buses} />
            {list &&
              chunks.map((chunk, i) => (
                <ListPage key={i} s={s} l={l} people={chunk} from={chunks.slice(0, i).reduce((n, c) => n + c.length, 0)} pageNo={i + 1} pages={listPages} extraLabel={extraLabel} last={i === listPages - 1} />
              ))}
          </div>,
          document.body,
        )}
    </Sheet>
  );
}
