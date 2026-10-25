"use client";
/**
 * One event for its organiser. An event that registers through a form gets everything forms do
 * (accept / waiting list, payment, QR pass and attendance, buses, supervisor lists, WhatsApp moments),
 * and this page puts its numbers and those tools in one place. An event still on the quick RSVP is
 * offered a registration form made from it, or one that already exists.
 */
import { useState } from "react";
import { can, fmt, must, rpc, sb, type StaffRow } from "./core";
import { Badge, Button, Card, ErrorBox, Field, Icon, Loading, Section, Select, Sheet, Stat, TopBar, confirmDialog, copyText, go, toast, useAsync } from "./ui";

const SITE = "https://buildxhue.com";

export type Hub = {
  event: { id: string; slug: string | null; title: string; starts_at: string | null; ends_at: string | null; location: string | null; published: boolean; rsvp_open: boolean; capacity: number | null };
  form: HubForm | null;
  rsvp: { going: number; waitlist: number; cancelled: number; inside: number; rating: number | null; ratings: number };
};
type HubForm = {
  id: string;
  slug: string;
  title_ar: string;
  open: boolean;
  archived: boolean;
  capacity: number | null;
  event_at: string | null;
  closes_at: string | null;
  pay: number | null;
  attendance: boolean;
  sessions: number;
  total: number;
  new: number;
  accepted: number;
  waiting: number;
  rejected: number;
  paid: number;
  collected: number;
  present: number;
  rating: number | null;
  ratings: number;
  days: { d: string; n: number }[];
  buses: { n: number; label: string | null; seats: number | null; people: number; accepted: number }[];
};

export const eventPage = (slug: string | null) => (slug ? `${SITE}/ar/events/item/?s=${slug}` : null);

/** The organiser's page for an event that registers through a form. */
export function EventHub({ hub, me, reload, onOld }: { hub: Hub; me?: StaffRow; reload: () => void; onOld?: () => void }) {
  const e = hub.event;
  const f = hub.form!;
  const forms = !!me && can(me, "forms");
  const page = eventPage(e.slug);
  const week = f.days.filter((d) => Date.now() - new Date(d.d).getTime() < 7 * 864e5).reduce((a, d) => a + d.n, 0);
  const unlink = async () => {
    if (!(await confirmDialog({ title: "فك ربط الفورم؟", body: "صفحة الفعالية هترجع للتسجيل السريع. الفورم وكل الطلبات اللي فيه هيفضلوا زي ما هما.", ok: "فك الربط", danger: true }))) return;
    try {
      await rpc("staff_event_link_form", { p_event: e.id, p_form: null });
      reload();
    } catch (err) {
      toast.error(err);
    }
  };
  return (
    <>
      <TopBar
        title={e.title}
        sub={[e.starts_at ? fmt.dateTime(e.starts_at) : null, e.location].filter(Boolean).join(" · ") || undefined}
        back="/staff/events"
        actions={
          page ? (
            <Button size="sm" icon="link" onClick={() => copyText(page, "اتنسخ لينك الفعالية")} aria-label="انسخ لينك صفحة الفعالية">
              اللينك
            </Button>
          ) : undefined
        }
      />
      <Card className="flex flex-wrap items-center gap-2" data-testid="event-hub">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-mist">
            التسجيل بفورم <span className="font-semibold text-chalk">«{f.title_ar}»</span>
          </p>
          <p className="text-xs text-fog">{f.open ? (f.closes_at ? `بيقفل ${fmt.dateTime(f.closes_at)}` : "مفتوح لحد ما تقفله") : "الفورم مقفول دلوقتي"}</p>
        </div>
        <Badge tone={f.open ? "ok" : "muted"}>{f.open ? "التسجيل مفتوح" : "مقفول"}</Badge>
        {!e.published && <Badge tone="warn">الفعالية مش منشورة</Badge>}
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="event-hub-stats">
        <Stat label="سجّلوا" value={f.total} sub={week ? `${week} آخر أسبوع` : undefined} icon="users" />
        <Stat label="مقبولين" value={`${f.accepted}${f.capacity ? `/${f.capacity}` : ""}`} tone="ok" icon="check" />
        <Stat label="انتظار" value={f.waiting} tone={f.waiting ? "warn" : undefined} icon="clock" />
        <Stat label="لسه محدش رد عليهم" value={f.new} tone={f.new ? "info" : undefined} icon="alert" />
        {f.pay !== null && <Stat label="دفعوا (من المقبولين)" value={`${f.paid}/${f.accepted}`} sub={`${Number(f.collected).toLocaleString("en-US")} جنيه`} tone={f.paid < f.accepted ? "warn" : "ok"} />}
        {f.attendance && <Stat label="حضروا" value={f.present} sub={f.accepted ? `${Math.round((f.present / Math.max(1, f.accepted)) * 100)}% من المقبولين` : undefined} icon="qr" />}
        {f.ratings > 0 && <Stat label="تقييم السيشنات" value={`${f.rating ?? "—"} / 5`} sub={`${f.ratings} تقييم`} icon="star" />}
      </div>

      <Section title="الإدارة">
        <div className="grid gap-2 sm:grid-cols-2">
          <Action icon="list" title="الطلبات" body="قبول ورفض وقايمة انتظار، وتأكيد الدفع لكل واحد." onClick={() => go(`/staff/forms/${f.id}/responses`)} testId="hub-responses" />
          {f.attendance ? (
            <Action icon="qr" title="الحضور بالـ QR" body={`سكان للتذاكر على الباب${f.sessions > 1 ? ` (${f.sessions} سيشن)` : ""}، وقايمة الغياب.`} onClick={() => go(`/staff/forms/${f.id}/attendance`)} testId="hub-attendance" />
          ) : (
            forms && <Action icon="qr" title="شغّل الحضور بالـ QR" body="كل واحد بياخد تذكرة QR بعد ما يسجّل، وتعمل سكان على الباب." onClick={() => go(`/staff/forms/${f.id}`)} />
          )}
          <Action icon="users" title="الباصات وقوائم المشرفين" body="قايمة كل باص، وجواب الكلية، وتقرير الفعالية، والشهادات." onClick={() => go(`/staff/forms/${f.id}/responses?open=trip`)} testId="hub-trip" />
          {forms && <Action icon="dots" title="إعدادات التسجيل" body="الأسئلة، والعدد، والدفع، والباصات، وميعاد القفل." onClick={() => go(`/staff/forms/${f.id}`)} />}
        </div>
      </Section>

      {f.buses.length > 0 && (
        <Section title="الباصات">
          <div className="grid gap-2 sm:grid-cols-2" data-testid="hub-buses">
            {f.buses.map((b) => (
              <Card key={b.n} className="grid gap-2">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-semibold text-chalk">{b.label ? `${b.label}` : `أتوبيس ${b.n}`}</p>
                  <Badge tone={b.seats !== null && b.people >= b.seats ? "danger" : "muted"}>{b.seats !== null ? `${b.people}/${b.seats}` : b.people}</Badge>
                </div>
                {b.seats !== null && (
                  <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]" role="meter" aria-valuemin={0} aria-valuemax={b.seats} aria-valuenow={b.people} aria-label={`كراسي ${b.label ?? b.n}`}>
                    <div className={b.people >= b.seats ? "h-full rounded-full bg-danger" : "h-full rounded-full bg-cyan"} style={{ width: `${Math.min(100, (b.people / Math.max(1, b.seats)) * 100)}%` }} />
                  </div>
                )}
                <p className="text-xs text-fog">{`${b.accepted} مقبول${b.seats !== null ? ` · فاضل ${Math.max(0, b.seats - b.people)} كرسي` : ""}`}</p>
              </Card>
            ))}
          </div>
        </Section>
      )}

      <Section title="الإشعارات">
        <Card className="grid gap-2 text-sm text-mist">
          <p>الرسايل دي بتروح لوحدها على واتساب من الفورم:</p>
          <ul className="grid gap-1 ps-4 text-xs [list-style:disc]">
            <li>أول ما يسجّل: إنه اتسجّل، والميعاد.</li>
            <li>{`لما تقبله: رسالة القبول${f.attendance ? " وفيها زرار تذكرة الـ QR" : ""}. ولما ترفضه: رسالة اعتذار.`}</li>
            {f.pay !== null && <li>اللي لسه مدفعش: تذكير بالدفع كل يومين (3 مرات بالكتير).</li>}
            {f.attendance && <li>قبل كل موعد حضور بيوم: تذكير بالتذكرة. ولو غيّرت الميعاد: رسالة بالميعاد الجديد.</li>}
            {f.attendance && <li>بعد الحضور: يقيّم السيشن من 5. واللي ميجيش: إنذار الأول، وبعدين حظر.</li>}
          </ul>
          {me && can(me, "whatsapp") && (
            <Button size="sm" icon="chat" className="justify-self-start" onClick={() => go("/staff/whatsapp")}>
              الرسايل التلقائية
            </Button>
          )}
        </Card>
      </Section>

      <div className="mt-6 flex flex-wrap gap-2">
        {page && (
          <a href={page} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line-2)] px-3 text-sm text-mist hover:text-chalk">
            <Icon name="external" size={15} />
            صفحة الفعالية
          </a>
        )}
        {onOld && (
          <Button size="sm" variant="ghost" onClick={onOld}>
            {`التسجيل السريع القديم (${hub.rsvp.going + hub.rsvp.waitlist})`}
          </Button>
        )}
        {forms && (
          <Button size="sm" variant="ghost" onClick={() => void unlink()} data-testid="hub-unlink">
            فك ربط الفورم
          </Button>
        )}
      </div>
    </>
  );
}

function Action({ icon, title, body, onClick, testId }: { icon: "list" | "qr" | "users" | "dots"; title: string; body: string; onClick: () => void; testId?: string }) {
  return (
    <button type="button" onClick={onClick} className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-panel/60 p-3.5 text-start transition-colors hover:border-volt/50" data-testid={testId}>
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-volt/15 text-cyan">
        <Icon name={icon} size={18} />
      </span>
      <span className="grid gap-0.5">
        <span className="font-semibold text-chalk">{title}</span>
        <span className="text-xs text-fog">{body}</span>
      </span>
    </button>
  );
}

/** On an event still on the quick RSVP: register through a form instead (made from the event, or one that exists). */
export function UseFormCard({ eventId, onLinked }: { eventId: string; onLinked: () => void }) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const id = await rpc<string>("staff_event_make_form", { p_event: eventId });
      toast("اتعمل فورم التسجيل واتربط بالفعالية. افتحه من هنا لما تخلص الأسئلة.");
      onLinked();
      go(`/staff/forms/${id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mt-3 grid gap-2" data-testid="use-form">
      <p className="font-semibold text-chalk">سجّل الفعالية بفورم</p>
      <p className="text-sm text-mist">الفورم بيضيف قبول وقايمة انتظار، ودفع، وتذكرة QR للحضور، واختيار الباص، وقوايم المشرفين، والرسايل التلقائية. وصفحة الفعالية هتعرض الفورم بدل التسجيل السريع.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon="plus" loading={busy} onClick={() => void make()} data-testid="use-form-make">
          اعمل فورم من الفعالية
        </Button>
        <Button onClick={() => setPicking(true)}>اربط بفورم موجود</Button>
      </div>
      {picking && <PickForm eventId={eventId} onClose={() => setPicking(false)} onLinked={onLinked} />}
    </Card>
  );
}

function PickForm({ eventId, onClose, onLinked }: { eventId: string; onClose: () => void; onLinked: () => void }) {
  const { data, error, loading } = useAsync(
    async () => (await sb().from("forms").select("id,title_ar,open,created_at").eq("archived", false).order("created_at", { ascending: false }).limit(100).then(must)) as { id: string; title_ar: string; open: boolean }[],
    [],
  );
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const link = async () => {
    setBusy(true);
    try {
      await rpc("staff_event_link_form", { p_event: eventId, p_form: pick });
      onClose();
      onLinked();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="اربط بفورم موجود">
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : (
        <div className="grid gap-3">
          <Field label="الفورم">
            <Select value={pick} onChange={(e) => setPick(e.target.value)} data-testid="pick-form">
              <option value="">اختار…</option>
              {(data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {`${x.title_ar}${x.open ? " (مفتوح)" : ""}`}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" loading={busy} disabled={!pick} onClick={() => void link()}>
            اربط
          </Button>
        </div>
      )}
    </Sheet>
  );
}
