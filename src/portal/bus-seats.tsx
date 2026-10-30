"use client";
/**
 * The seat map of one bus: the bus from above (driver and door at the front, two seats each side of
 * the aisle, the back row of five), each seat with who sits there. Tap someone, then a seat, to move
 * them (or swap with whoever is there); the people without a seat wait under the bus. «رتّبهم» seats
 * everyone in the order they registered, friends side by side. The map downloads as a PDF for the
 * supervisor, with the list by seat number.
 */
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { autoSeat, busRows, type BusRow } from "@/lib/bus-seats";
import { cn } from "@/lib/cn";
import type { TripPerson } from "@/components/letters/bus-request";
import { errorText, today } from "./core";
import { saveNodesAsPdf } from "./pdf";
import { Button, Sheet, toast } from "./ui";

type Pick = { seat: number } | { id: string } | null;

/** «محمد أحمد علي» → «محمد أ.» — enough to find yourself on the map. */
const short = (name: string) => {
  const [a = "", b = ""] = name.trim().split(/\s+/);
  return b ? `${a} ${b[0]}.` : a;
};

export function BusSeats({ bus, seats: capacity, title, sup, people, seatOf, friendOf, onSave, onClose }: {
  bus: number;
  seats: number;
  title: string;
  sup?: { name: string; phone: string };
  /** The people on this bus, in the order they registered. */
  people: TripPerson[];
  seatOf: Record<string, number>;
  /** Who each person said they came with (someone else's id), for seating them together. */
  friendOf: Record<string, string | undefined>;
  onSave: (assign: Record<string, number>) => Promise<void>;
  onClose: () => void;
}) {
  const rows = useMemo(() => busRows(capacity), [capacity]);
  const max = rows.flat().filter((s) => s != null).length;
  const [map, setMap] = useState<Record<string, number>>(() => Object.fromEntries(people.map((p) => [p.id, seatOf[p.id] && seatOf[p.id] <= max ? seatOf[p.id] : 0])));
  const [pick, setPick] = useState<Pick>(null);
  const [busy, setBusy] = useState<"" | "save" | "pdf">("");
  const [printing, setPrinting] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const bySeat = useMemo(() => {
    const m = new Map<number, TripPerson>();
    for (const p of people) if (map[p.id]) m.set(map[p.id], p);
    return m;
  }, [people, map]);
  const standing = people.filter((p) => !map[p.id]);
  const dirty = people.some((p) => (map[p.id] || 0) !== ((seatOf[p.id] && seatOf[p.id] <= max ? seatOf[p.id] : 0) || 0));
  const picked = pick && "seat" in pick ? bySeat.get(pick.seat) : pick ? people.find((p) => p.id === pick.id) : undefined;

  const tapSeat = (n: number) => {
    const here = bySeat.get(n);
    if (!pick) return here && setPick({ seat: n });
    if ("seat" in pick && pick.seat === n) return setPick(null);
    const mover = "seat" in pick ? bySeat.get(pick.seat) : people.find((p) => p.id === pick.id);
    if (!mover) return setPick(here ? { seat: n } : null);
    const from = map[mover.id] || 0;
    // Whoever sat here takes the mover's old seat (or stands, if the mover had none).
    setMap({ ...map, [mover.id]: n, ...(here ? { [here.id]: from } : {}) });
    setPick(null);
  };
  const standUp = () => {
    if (!picked) return;
    setMap({ ...map, [picked.id]: 0 });
    setPick(null);
  };
  const arrange = () => {
    const out = autoSeat(people.map((p) => ({ id: p.id, friend: friendOf[p.id] })), capacity);
    setMap(Object.fromEntries(people.map((p) => [p.id, out[p.id] ?? 0])));
    setPick(null);
  };
  const save = async () => {
    setBusy("save");
    try {
      await onSave(map);
      toast("اتحفظ ترتيب الكراسي ✓", "ok");
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy("");
    }
  };
  const pdf = async () => {
    setBusy("pdf");
    setPrinting(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = Array.from(box.current?.children ?? []) as HTMLElement[];
      if (!nodes.length) throw new Error("render");
      await saveNodesAsPdf(nodes, `buildx-bus-${bus}-seats-${today()}.pdf`, { landscape: false, widthPx: 1588 });
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setPrinting(false);
      setBusy("");
    }
  };

  return (
    <Sheet open onClose={onClose} title={`كراسي أتوبيس ${bus}`} wide>
      <div className="grid gap-4" data-testid="bus-seats">
        <p className="text-sm text-mist">
          {`${people.length - standing.length} قاعد من ${people.length} · ${max} كرسي`}
          {people.length > max ? ` · ⚠ ${people.length - max} زيادة عن الكراسي` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon="users" onClick={arrange} data-testid="bus-arrange">
            رتّبهم (الصحاب جنب بعض)
          </Button>
          {picked && (
            <Button size="sm" onClick={standUp} data-testid="bus-stand">
              {`شيل ${short(picked.name)} من الكرسي`}
            </Button>
          )}
          <Button size="sm" icon="download" loading={busy === "pdf"} onClick={() => void pdf()} data-testid="bus-pdf">
            PDF للمشرف
          </Button>
          <Button size="sm" variant="primary" loading={busy === "save"} disabled={!dirty} onClick={() => void save()} data-testid="bus-save">
            حفظ
          </Button>
        </div>
        <p className="text-xs text-fog">{picked ? `اختار الكرسي اللي ${short(picked.name)} هيقعد عليه (لو عليه حد، هيتبدّلوا).` : "دوس على حد (على كرسي أو تحت) وبعدين على الكرسي اللي يروحله."}</p>

        <BusDrawing rows={rows} bySeat={bySeat} pick={pick && "seat" in pick ? pick.seat : null} sup={sup} onSeat={tapSeat} />

        <div className="grid gap-2">
          <p className="text-sm font-semibold text-chalk">{standing.length ? `من غير كرسي (${standing.length})` : "كله قاعد ✓"}</p>
          <div className="flex flex-wrap gap-2" data-testid="bus-standing">
            {standing.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPick(pick && "id" in pick && pick.id === p.id ? null : { id: p.id })}
                aria-pressed={!!pick && "id" in pick && pick.id === p.id}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  pick && "id" in pick && pick.id === p.id ? "border-cyan bg-cyan/20 text-chalk" : "border-[var(--line-2)] text-mist hover:text-chalk",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      {printing &&
        createPortal(
          <div ref={box} aria-hidden style={{ position: "fixed", top: 0, left: "-20000px" }}>
            <SeatSheet title={title} bus={bus} sup={sup} rows={rows} bySeat={bySeat} standing={standing} />
          </div>,
          document.body,
        )}
    </Sheet>
  );
}

/** The bus from above. Built left-to-right as it really is (driver on the left), whatever the page direction. */
function BusDrawing({ rows, bySeat, pick, sup, onSeat, print }: { rows: BusRow[]; bySeat: Map<number, TripPerson>; pick: number | null; sup?: { name: string }; onSeat?: (n: number) => void; print?: boolean }) {
  const cell = print ? "h-[92px] w-[150px] text-[22px]" : "h-14 w-[3.6rem] text-[11px] sm:w-16";
  return (
    <div dir="ltr" className={cn("mx-auto w-fit rounded-[2.2rem] border-4 p-3", print ? "border-[#1e3a8a] bg-white p-8" : "border-[var(--line-2)] bg-[#0a1634]")} data-testid="bus-drawing">
      <div className={cn("mb-3 flex items-end justify-between gap-2 border-b-2 border-dashed pb-3", print ? "border-[#94a3b8]" : "border-[var(--line)]")}>
        <div className={cn("grid place-items-center rounded-xl", cell, print ? "bg-[#e2e8f0] text-[#334155]" : "bg-white/5 text-fog")}>🚍 السواق</div>
        {sup?.name ? (
          <div className={cn("grid place-items-center rounded-xl px-1 text-center leading-tight", cell, print ? "bg-[#fef3c7] text-[#92400e]" : "bg-warn/15 text-[#ffd08a]")} dir="rtl">
            <span>مشرف</span>
            <span className="w-full truncate">{short(sup.name)}</span>
          </div>
        ) : null}
        <div className={cn("grid place-items-center rounded-xl border-2 border-dashed", cell, print ? "border-[#94a3b8] text-[#64748b]" : "border-[var(--line-2)] text-fog")}>الباب</div>
      </div>
      <div className="grid gap-2">
        {rows.map((row, i) => (
          <div key={i} className="flex justify-center gap-2">
            {row.map((n, k) =>
              n == null ? (
                <div key={k} className={cn(cell, "opacity-0")} aria-hidden />
              ) : (
                <Seat key={k} n={n} who={bySeat.get(n)} picked={pick === n} cell={cell} print={print} onClick={onSeat && (() => onSeat(n))} />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Seat({ n, who, picked, cell, print, onClick }: { n: number; who?: TripPerson; picked: boolean; cell: string; print?: boolean; onClick?: () => void }) {
  const inner = (
    <>
      <span className={cn("font-mono", print ? "text-[18px] text-[#64748b]" : "text-[10px] text-fog")}>{n}</span>
      <span className="w-full truncate px-0.5 font-semibold" dir="rtl">
        {who ? short(who.name) : ""}
      </span>
    </>
  );
  const look = cn(
    "grid content-center justify-items-center rounded-t-2xl rounded-b-md border-2 leading-tight",
    cell,
    print
      ? who
        ? "border-[#2563eb] bg-[#dbeafe] text-[#0f172a]"
        : "border-dashed border-[#cbd5e1] text-[#94a3b8]"
      : picked
        ? "border-cyan bg-cyan/30 text-chalk ring-2 ring-cyan"
        : who
          ? "border-[#2f7bff]/60 bg-[#2f7bff]/20 text-chalk"
          : "border-dashed border-[var(--line-2)] text-fog",
  );
  if (!onClick) return <div className={look}>{inner}</div>;
  return (
    <button type="button" className={look} onClick={onClick} aria-pressed={picked} aria-label={who ? `كرسي ${n}: ${who.name}` : `كرسي ${n} فاضي`} data-testid={`seat-${n}`}>
      {inner}
    </button>
  );
}

/** The A4 page for the supervisor: the map, then everyone by seat number with their phone. */
function SeatSheet({ title, bus, sup, rows, bySeat, standing }: { title: string; bus: number; sup?: { name: string; phone: string }; rows: BusRow[]; bySeat: Map<number, TripPerson>; standing: TripPerson[] }) {
  const list = [...bySeat.entries()].sort((a, b) => a[0] - b[0]);
  return (
    <div dir="rtl" style={{ width: 1588, minHeight: 2246, background: "#fff", color: "#0f172a", padding: 72, fontFamily: "inherit" }} className="grid content-start gap-10">
      <div className="grid gap-2">
        <p style={{ fontSize: 44, fontWeight: 800 }}>{`${title} — أتوبيس ${bus}`}</p>
        <p style={{ fontSize: 26, color: "#475569" }}>{`${list.length} راكب${sup?.name ? ` · المشرف: ${sup.name}${sup.phone ? ` (${sup.phone})` : ""}` : ""}`}</p>
      </div>
      <BusDrawing rows={rows} bySeat={bySeat} pick={null} sup={sup} print />
      <div style={{ columns: 2, columnGap: 48, fontSize: 24 }}>
        {list.map(([n, p]) => (
          <p key={n} style={{ breakInside: "avoid", padding: "6px 0", borderBottom: "1px solid #e2e8f0" }}>
            <b style={{ display: "inline-block", width: 56 }}>{n}</b>
            {p.name}
            {p.phone ? <span style={{ color: "#64748b" }}>{` · ${p.phone}`}</span> : null}
          </p>
        ))}
      </div>
      {standing.length > 0 && <p style={{ fontSize: 24, color: "#b45309" }}>{`من غير كرسي: ${standing.map((p) => p.name).join("، ")}`}</p>}
    </div>
  );
}
