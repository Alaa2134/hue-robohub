"use client";
/** BuildX App → events: who registered on the website, the waiting list, CSV export and door check-in by QR. */
import { useMemo, useState } from "react";
import type { SiteItem } from "@/lib/site-content";
import { downloadCsv, errorText, fmt, must, rpc, sb, today } from "./core";
import { Scanner } from "./scanner";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Icon, Input, List, Loading, Row, SearchBox, Stat, TopBar, confirmDialog, go, toast, useAsync } from "./ui";

type Reg = { id: string; ticket: string; full_name: string; phone: string; email: string | null; faculty: string | null; status: "going" | "waitlist" | "cancelled"; checked_in_at: string | null; created_at: string };
type Ev = Pick<SiteItem, "id" | "title" | "title_ar" | "starts_at" | "capacity" | "rsvp_open" | "published">;

const STATUS: Record<Reg["status"], { ar: string; tone: "ok" | "warn" | "muted" }> = {
  going: { ar: "مؤكَّد", tone: "ok" },
  waitlist: { ar: "انتظار", tone: "warn" },
  cancelled: { ar: "لغى", tone: "muted" },
};

export function EventsScreen() {
  const { data, error, loading, reload } = useAsync(async () => {
    const events = (await sb().from("site_content").select("id,title,title_ar,starts_at,capacity,rsvp_open,published").eq("kind", "event").order("starts_at", { ascending: false, nullsFirst: false }).limit(200).then(must)) as Ev[];
    const regs = (await sb().from("event_registrations").select("event_id,status,checked_in_at").limit(20000).then(must)) as { event_id: string; status: string; checked_in_at: string | null }[];
    const by = new Map<string, { going: number; waitlist: number; inside: number }>();
    for (const r of regs) {
      const c = by.get(r.event_id) ?? { going: 0, waitlist: 0, inside: 0 };
      if (r.status === "going") c.going++;
      if (r.status === "waitlist") c.waitlist++;
      if (r.checked_in_at) c.inside++;
      by.set(r.event_id, c);
    }
    return events.map((e) => ({ ...e, counts: by.get(e.id) ?? { going: 0, waitlist: 0, inside: 0 } }));
  }, []);
  const withRsvp = (data ?? []).filter((e) => e.rsvp_open || e.counts.going || e.counts.waitlist);

  return (
    <>
      <TopBar title="تسجيل الفعاليات" sub="التسجيل من الموقع والدخول بالـ QR" back="/staff/more" />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !withRsvp.length ? (
        <Empty
          icon="calendar"
          title="مفيش فعاليات فيها تسجيل"
          body="افتح فعالية من «محتوى الموقع» وشغّل «التسجيل من الموقع». الطلاب هيسجلوا من صفحة الفعالية وياخدوا تذكرة QR."
          action={
            <Button variant="primary" onClick={() => go("/staff/site")}>
              محتوى الموقع
            </Button>
          }
        />
      ) : (
        <List>
          {withRsvp.map((e) => (
            <Row key={e.id} onClick={() => go(`/staff/events/${e.id}`)}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-chalk">{e.title_ar || e.title}</p>
                  <p className="truncate text-xs text-fog">
                    {e.starts_at ? fmt.dateTime(e.starts_at) : "—"} · {e.counts.going}
                    {e.capacity ? `/${e.capacity}` : ""} مسجل
                    {e.counts.waitlist ? ` · ${e.counts.waitlist} انتظار` : ""}
                    {e.counts.inside ? ` · ${e.counts.inside} دخلوا` : ""}
                  </p>
                </div>
                {e.rsvp_open ? <Badge tone="ok">مفتوح</Badge> : <Badge tone="muted">مقفول</Badge>}
              </div>
            </Row>
          ))}
        </List>
      )}
    </>
  );
}

type CheckResult = { ok: boolean; error?: string; name?: string; status?: string; already?: boolean; event?: string };

export function EventRegistrations({ id }: { id: string }) {
  const ev = useAsync(async () => (await sb().from("site_content").select("id,title,title_ar,starts_at,capacity,rsvp_open,published").eq("id", id).single().then(must)) as Ev, [id]);
  const regs = useAsync(async () => (await sb().from("event_registrations").select("*").eq("event_id", id).order("created_at").limit(5000).then(must)) as Reg[], [id]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Reg["status"] | "inside" | "all">("all");
  const [scan, setScan] = useState(false);
  const [last, setLast] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");

  const list = useMemo(() => regs.data ?? [], [regs.data]);
  const counts = useMemo(() => {
    const c = { all: list.length, going: 0, waitlist: 0, cancelled: 0, inside: 0 };
    for (const r of list) {
      c[r.status]++;
      if (r.checked_in_at) c.inside++;
    }
    return c;
  }, [list]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return list.filter((r) => (filter === "all" ? true : filter === "inside" ? !!r.checked_in_at : r.status === filter) && (!n || [r.full_name, r.phone, r.ticket, r.faculty].some((v) => v?.toLowerCase().includes(n))));
  }, [list, q, filter]);

  const checkIn = async (raw: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await rpc<CheckResult>("staff_check_in", { p_event: id, p_ticket: raw });
      setLast(r);
      navigator.vibrate?.(r.ok && !r.already ? 60 : [80, 60, 80]);
      if (r.ok) regs.reload();
    } catch (e) {
      setLast({ ok: false, error: errorText(e) });
    } finally {
      setTimeout(() => setBusy(false), 1200);
    }
  };

  const setStatus = async (r: Reg, status: Reg["status"]) => {
    if (status === "cancelled" && !(await confirmDialog({ title: `إلغاء تسجيل ${r.full_name}؟`, body: r.status === "going" ? "مكانه هيروح لأول واحد في قائمة الانتظار." : undefined, ok: "إلغاء التسجيل", danger: true }))) return;
    try {
      await sb().from("event_registrations").update({ status }).eq("id", r.id).then(must);
      regs.reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const manual = async (r: Reg) => {
    try {
      await sb().from("event_registrations").update({ checked_in_at: r.checked_in_at ? null : new Date().toISOString() }).eq("id", r.id).then(must);
      regs.reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  const exportCsv = () =>
    downloadCsv(`buildx-event-${today()}.csv`, [
      ["التذكرة", "الاسم", "الموبايل", "الإيميل", "الكلية", "الحالة", "دخل", "سجّل"],
      ...list.map((r) => [r.ticket, r.full_name, r.phone, r.email, r.faculty, STATUS[r.status].ar, r.checked_in_at ? fmt.dateTime(r.checked_in_at) : "", fmt.dateTime(r.created_at)]),
    ]);

  if ((ev.loading && !ev.data) || (regs.loading && !regs.data)) return <Loading />;
  if (ev.error || !ev.data) return <ErrorBox error={ev.error ?? "الفعالية مش موجودة"} retry={ev.reload} />;
  const e = ev.data;

  const resultText = (r: CheckResult) =>
    r.ok
      ? r.already
        ? `${r.name} — دخل قبل كده`
        : `${r.name} ✓${r.status === "waitlist" ? " (كان على الانتظار)" : ""}`
      : r.error === "other_event"
        ? `${r.name}: التذكرة دي لفعالية تانية (${r.event})`
        : r.error === "cancelled"
          ? `${r.name}: التسجيل ده اتلغى`
          : r.error === "not_found"
            ? "التذكرة مش موجودة"
            : (r.error ?? "حصل خطأ");

  return (
    <>
      <TopBar
        title={e.title_ar || e.title}
        sub={e.starts_at ? fmt.dateTime(e.starts_at) : undefined}
        back="/staff/events"
        actions={
          <Button size="sm" icon="download" onClick={exportCsv} disabled={!list.length}>
            Excel
          </Button>
        }
      />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="مؤكَّد" value={`${counts.going}${e.capacity ? `/${e.capacity}` : ""}`} />
        <Stat label="انتظار" value={counts.waitlist} />
        <Stat label="دخلوا" value={counts.inside} />
      </div>

      <Card className="mt-4 grid gap-3">
        {scan ? (
          <>
            <Scanner onDetect={checkIn} paused={busy} className="aspect-square w-full overflow-hidden rounded-2xl sm:aspect-video" />
            <Button variant="ghost" block onClick={() => setScan(false)}>
              قفل الكاميرا
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" icon="scan" block onClick={() => setScan(true)}>
            تسجيل الدخول بالـ QR
          </Button>
        )}
        <form
          className="flex gap-2"
          onSubmit={(ev2) => {
            ev2.preventDefault();
            if (typed.trim()) void checkIn(typed.trim()).then(() => setTyped(""));
          }}
        >
          <Input value={typed} onChange={(x) => setTyped(x.target.value.toUpperCase())} placeholder="أو اكتب كود التذكرة BXT-…" dir="ltr" className="flex-1" />
          <Button type="submit" disabled={!typed.trim()}>
            دخول
          </Button>
        </form>
        {last && (
          <p role="status" className={`flex items-center gap-2 rounded-xl border p-3 font-semibold ${last.ok && !last.already ? "border-ok/40 bg-ok/10 text-ok" : "border-warn/40 bg-warn/10 text-[#ffd08a]"}`}>
            <Icon name={last.ok && !last.already ? "check" : "alert"} size={18} />
            {resultText(last)}
          </p>
        )}
      </Card>

      {list.length ? (
        <>
          <div className="mt-4">
            <SearchBox value={q} onChange={setQ} placeholder="اسم، موبايل أو كود التذكرة…" />
          </div>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {(
              [
                ["all", "الكل"],
                ["going", "مؤكَّد"],
                ["waitlist", "انتظار"],
                ["inside", "دخلوا"],
                ["cancelled", "لغوا"],
              ] as const
            ).map(([k, label]) => (
              <Chip key={k} active={filter === k} onClick={() => setFilter(k)} count={counts[k]}>
                {label}
              </Chip>
            ))}
          </div>
          <List className="mt-3">
            {shown.map((r) => (
              <Row key={r.id} chevron={false}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-chalk">{r.full_name}</p>
                    <p className="truncate text-xs text-fog" dir="auto">
                      <span dir="ltr">{r.phone}</span>
                      {r.faculty ? ` · ${r.faculty}` : ""} · <span className="font-mono">{r.ticket}</span>
                    </p>
                  </div>
                  <Badge tone={r.checked_in_at ? "volt" : STATUS[r.status].tone}>{r.checked_in_at ? "دخل" : STATUS[r.status].ar}</Badge>
                  {r.status !== "cancelled" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => manual(r)}>
                        {r.checked_in_at ? "تراجع" : "دخّله"}
                      </Button>
                      {r.status === "waitlist" && (
                        <Button size="sm" variant="ghost" onClick={() => setStatus(r, "going")}>
                          أكّد
                        </Button>
                      )}
                      {!r.checked_in_at && (
                        <Button size="sm" variant="ghost" onClick={() => setStatus(r, "cancelled")}>
                          إلغاء
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </Row>
            ))}
          </List>
        </>
      ) : (
        <Card className="mt-4 text-center text-sm text-mist">لسه محدش سجّل. لينك التسجيل هو صفحة الفعالية على الموقع.</Card>
      )}
    </>
  );
}
