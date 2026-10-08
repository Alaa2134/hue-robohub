"use client";
/** BuildX App → events: who registered on the website, the waiting list, CSV export and door check-in by QR. */
import { useMemo, useState } from "react";
import type { SiteItem } from "@/lib/site-content";
import { downloadCsv, errorText, fmt, must, rpc, sb, today } from "./core";
import { Scanner } from "./scanner";
import { whatsappLink } from "@/lib/contact";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Icon, Input, List, Loading, Row, SearchBox, Sheet, Stat, Textarea, TopBar, confirmDialog, go, toast, useAsync } from "./ui";

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

      {e.starts_at && new Date(e.starts_at).getTime() <= Date.now() && <FeedbackCard ev={e} regs={list} />}

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

type Feedback = { id: string; registration_id: string; rating: number; comment: string | null; publish_ok: boolean; testimonial_id: string | null; created_at: string };

/** After the event: ratings from the ticket page, a nudge on WhatsApp, and publishing good comments. */
function FeedbackCard({ ev, regs }: { ev: Ev; regs: Reg[] }) {
  const fb = useAsync(async () => (await sb().from("event_feedback").select("*").eq("event_id", ev.id).order("created_at", { ascending: false }).then(must)) as Feedback[], [ev.id]);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState("");
  const list = fb.data ?? [];
  const avg = list.length ? list.reduce((a, f) => a + f.rating, 0) / list.length : 0;
  const byReg = new Map(regs.map((r) => [r.id, r]));
  const title = ev.title_ar || ev.title;

  const publish = async (f: Feedback) => {
    const r = byReg.get(f.registration_id);
    if (!r || !f.comment) return;
    setBusy(f.id);
    const first = r.full_name.trim().split(/\s+/)[0];
    const row = { kind: "testimonial", title: first, title_ar: first, summary: f.comment.slice(0, 600), summary_ar: f.comment.slice(0, 600), result: (ev.title || "").slice(0, 200), result_ar: title.slice(0, 200) };
    try {
      let created = await sb().from("site_content").insert({ ...row, published: true }).select("id").single();
      let draft = false;
      if (created.error) {
        // Leads can only write drafts: an owner/admin publishes it from Site content.
        created = await sb().from("site_content").insert({ ...row, published: false }).select("id").single();
        draft = true;
      }
      const id = must(created as { data: { id: string } | null; error: unknown }).id;
      await sb().from("event_feedback").update({ testimonial_id: id }).eq("id", f.id).then(must);
      fb.set(list.map((x) => (x.id === f.id ? { ...x, testimonial_id: id } : x)));
      toast(draft ? "اتعمل كمسودة في «محتوى الموقع» — مدير ينشره" : "اتنشر في «قالوا عن BuildX» على الموقع");
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <Card className="mt-4 grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-chalk">رأي الحضور</p>
        <Button size="sm" onClick={() => setAsking(true)}>
          اطلب تقييم على واتساب
        </Button>
      </div>
      {fb.loading && !fb.data ? (
        <Loading />
      ) : !list.length ? (
        <p className="text-sm text-fog">لسه محدش قيّم. الحضور بيقيّموا من صفحة التذكرة بعد ما الإيفنت يبدأ.</p>
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[#f5c451]">{avg.toFixed(1)}</span>
            <span className="text-sm text-fog">من 5 · {list.length} تقييم</span>
          </p>
          <div className="grid gap-1">
            {[5, 4, 3, 2, 1].map((n) => {
              const c = list.filter((f) => f.rating === n).length;
              return (
                <div key={n} className="flex items-center gap-2 text-xs text-fog">
                  <span className="w-6 text-end">{n}★</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-[#f5c451]" style={{ width: `${(c / list.length) * 100}%` }} />
                  </span>
                  <span className="w-6">{c}</span>
                </div>
              );
            })}
          </div>
          <List>
            {list
              .filter((f) => f.comment)
              .map((f) => {
                const r = byReg.get(f.registration_id);
                return (
                  <div key={f.id} className="grid gap-2 px-4 py-3">
                    <p className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-chalk">{r?.full_name ?? "—"}</span>
                      <span className="text-[#f5c451]">{"★".repeat(f.rating)}</span>
                    </p>
                    <p className="whitespace-pre-line text-sm text-mist">{f.comment}</p>
                    {f.testimonial_id ? (
                      <Badge tone="ok">اتنشر كرأي على الموقع</Badge>
                    ) : f.publish_ok ? (
                      <Button size="sm" className="justify-self-start" loading={busy === f.id} onClick={() => publish(f)}>
                        انشره في «قالوا عن BuildX»
                      </Button>
                    ) : (
                      <p className="text-xs text-fog">مش موافق ينتشر.</p>
                    )}
                  </div>
                );
              })}
          </List>
        </>
      )}
      {asking && <AskFeedback ev={ev} regs={regs.filter((r) => r.status !== "cancelled" && !list.some((f) => f.registration_id === r.id))} onClose={() => setAsking(false)} />}
    </Card>
  );
}

function AskFeedback({ ev, regs, onClose }: { ev: Ev; regs: Reg[]; onClose: () => void }) {
  const inside = regs.filter((r) => r.checked_in_at);
  const people = inside.length ? inside : regs;
  const [text, setText] = useState(`شكراً إنك جيت «${ev.title_ar || ev.title}» 🙏 قيّم الإيفنت في ثانية من تذكرتك:`);
  return (
    <Sheet open onClose={onClose} title={`اطلب تقييم (${people.length})`}>
      <div className="grid gap-4">
        <p className="text-sm text-mist">{inside.length ? "اللي دخلوا الإيفنت ولسه ماقيّموش." : "اللي سجّلوا ولسه ماقيّموش."} كل رسالة فيها رابط تذكرته.</p>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        {!people.length ? (
          <Empty icon="check" title="كله قيّم 🎉" />
        ) : (
          <List>
            {people.map((r) => {
              const wa = whatsappLink(r.phone, `${text}\nhttps://buildxhue.com/ar/ticket/?t=${r.ticket}`);
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-chalk">{r.full_name}</span>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#1fa855] px-3 py-1.5 text-sm font-semibold text-white">
                      واتساب
                    </a>
                  )}
                </div>
              );
            })}
          </List>
        )}
      </div>
    </Sheet>
  );
}

