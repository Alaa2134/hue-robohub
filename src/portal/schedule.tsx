"use client";
/**
 * Student schedule (upcoming sessions for their group + published events, with "add to calendar")
 * and announcements from the coaches. See 20261008130000_schedule_announcements.sql.
 */
import { useMemo, useState, type FormEvent } from "react";
import { can, download, errorText, fmt, must, sb, studentRpc, studentRpcOffline, type StaffRow } from "./core";
import { GroupSelect, groupsOf, useStudents } from "./staff-data";
import { Badge, Button, Card, Empty, ErrorBox, Field, Icon, IconButton, Input, List, Loading, Sheet, Textarea, Toggle, TopBar, confirmDialog, toast, useAsync } from "./ui";

/* ─── Announcements (student) ──────────────────────────────────────────── */

type Note = { id: string; title: string; body: string; pinned: boolean; at: string };

/** Student home: the coaches' announcements for their group. */
export function Announcements() {
  const { data } = useAsync(() => studentRpcOffline<Note[]>("student_announcements"), []);
  if (!data?.length) return null;
  return (
    <div className="mt-4 grid gap-2">
      {data.slice(0, 3).map((n) => (
        <Card key={n.id} className={n.pinned ? "border-gold/30 bg-gold/[0.05]" : "border-cyan/20 bg-cyan/[0.04]"}>
          <p className="flex items-center gap-2 font-semibold text-chalk">
            <Icon name={n.pinned ? "star" : "bell"} size={16} className={n.pinned ? "text-gold" : "text-cyan"} />
            <span className="min-w-0 flex-1">{n.title}</span>
            <span className="shrink-0 text-xs font-normal text-fog">{fmt.rel(n.at)}</span>
          </p>
          {n.body && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-mist">{n.body}</p>}
        </Card>
      ))}
    </div>
  );
}

/* ─── Schedule (student) ───────────────────────────────────────────────── */

type Item = { kind: "session" | "event"; id: string; title: string; startsAt: string; endsAt: string | null; location: string | null; slug?: string };

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
const endOf = (it: Item) => (it.endsAt ? new Date(it.endsAt) : new Date(new Date(it.startsAt).getTime() + 2 * 3600_000));

/** One calendar file for the given items (opens in Calendar / Google Calendar). */
export function toIcs(items: Item[]) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BuildX HUE//App//AR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  const stamp = icsDate(new Date());
  for (const it of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${it.kind}-${it.id}@buildxhue.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(new Date(it.startsAt))}`,
      `DTEND:${icsDate(endOf(it))}`,
      `SUMMARY:${icsText(`${it.title} · BuildX HUE`)}`,
      ...(it.location ? [`LOCATION:${icsText(it.location)}`] : []),
      "BEGIN:VALARM",
      "TRIGGER:-PT1H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsText(it.title)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

const googleLink = (it: Item) =>
  `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${it.title} · BuildX HUE`)}&dates=${icsDate(new Date(it.startsAt))}/${icsDate(endOf(it))}${it.location ? `&location=${encodeURIComponent(it.location)}` : ""}`;

export function useSchedule() {
  return useAsync(() => studentRpcOffline<Item[]>("student_schedule"), []);
}

/** Student home: the next thing on the schedule. */
export function NextUpCard() {
  const { data } = useSchedule();
  const next = data?.find((i) => new Date(i.startsAt).getTime() > Date.now() - 3600_000);
  if (!next) return null;
  return (
    <a href="#/me/schedule" className="mt-3 flex items-center gap-4 rounded-3xl border border-[var(--line-2)] bg-panel/70 p-5">
      <span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-volt/15 text-cyan">
        <span className="text-[11px] leading-none">{new Intl.DateTimeFormat("ar-EG", { weekday: "short" }).format(new Date(next.startsAt))}</span>
        <span className="font-mono text-xl font-bold leading-tight">{new Date(next.startsAt).getDate()}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-fog">{next.kind === "event" ? "الفعالية الجاية" : "السيشن الجاية"}</p>
        <p className="truncate font-semibold text-chalk">{next.title}</p>
        <p className="text-xs text-fog">{fmt.dateTime(next.startsAt)}</p>
      </div>
      <Icon name="chevron" size={18} className="rotate-180 text-fog" />
    </a>
  );
}

/** /me/schedule */
export function StudentSchedule() {
  const { data, error, loading, reload } = useSchedule();
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error ?? "مقدرناش نحمّل المواعيد"} retry={reload} />;
  return (
    <>
      <TopBar
        title="المواعيد"
        sub="السيشنات والفعاليات الجاية"
        back="/me"
        actions={
          data.length > 1 ? (
            <Button size="sm" icon="calendar" onClick={() => download(new Blob([toIcs(data)], { type: "text/calendar" }), "buildx-schedule.ics")}>
              الكل للتقويم
            </Button>
          ) : undefined
        }
      />
      {!data.length ? (
        <Empty icon="calendar" title="مفيش مواعيد جاية" body="لما المدرب يحدد سيشن جاية أو تتنشر فعالية هتظهر هنا." />
      ) : (
        <div className="grid gap-2">
          {data.map((it) => (
            <Card key={`${it.kind}-${it.id}`} className="grid gap-2">
              <div className="flex items-start gap-3">
                <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white/[0.05] text-chalk">
                  <span className="text-[10px] leading-none text-fog">{new Intl.DateTimeFormat("ar-EG", { month: "short" }).format(new Date(it.startsAt))}</span>
                  <span className="font-mono text-lg font-bold leading-tight">{new Date(it.startsAt).getDate()}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-chalk">{it.title}</p>
                  <p className="text-xs text-fog">
                    {fmt.dateTime(it.startsAt)}
                    {it.location ? ` · ${it.location}` : ""}
                  </p>
                </div>
                <Badge tone={it.kind === "event" ? "volt" : "info"}>{it.kind === "event" ? "فعالية" : "سيشن"}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon="calendar" onClick={() => download(new Blob([toIcs([it])], { type: "text/calendar" }), `buildx-${it.kind}.ics`)}>
                  أضف للتقويم
                </Button>
                <Button size="sm" icon="link" onClick={() => window.open(googleLink(it), "_blank", "noopener")}>
                  Google Calendar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

/* ─── Announcements (staff) ────────────────────────────────────────────── */

type Announcement = { id: string; title: string; body: string; group_name: string; pinned: boolean; expires_at: string | null; created_at: string };

/** /staff/announcements */
export function AnnouncementsScreen({ me }: { me: StaffRow }) {
  const { data, error, loading, reload } = useAsync(async () => must(await sb().from("announcements").select("*").order("created_at", { ascending: false }).limit(100)) as Announcement[], []);
  const [creating, setCreating] = useState(false);
  const remove = async (a: Announcement) => {
    if (!(await confirmDialog({ title: "مسح الإعلان؟", ok: "مسح", danger: true }))) return;
    try {
      await sb().from("announcements").delete().eq("id", a.id).then(must);
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const live = (a: Announcement) => !a.expires_at || new Date(a.expires_at).getTime() > Date.now();
  return (
    <>
      <TopBar
        title="إعلانات للطلاب"
        sub="بتظهر في أول صفحة في تطبيق الطلاب"
        back="/staff/more"
        actions={
          <Button size="sm" variant="primary" icon="plus" onClick={() => setCreating(true)}>
            إعلان
          </Button>
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty icon="bell" title="مفيش إعلانات" body="مثلاً: «سيشن بكرة اتأجلت لـ 5 العصر» لمجموعة واحدة أو للكل." action={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>إعلان جديد</Button>} />
      ) : (
        <List>
          {data.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-chalk">
                  {a.pinned && <Icon name="star" size={14} className="me-1 inline text-gold" />}
                  {a.title}
                </p>
                {a.body && <p className="mt-0.5 line-clamp-2 text-sm text-mist">{a.body}</p>}
                <p className="mt-1 text-xs text-fog">
                  {a.group_name || "كل المجموعات"} · {fmt.rel(a.created_at)}
                  {a.expires_at ? ` · ${live(a) ? "لحد" : "انتهى"} ${fmt.dateTime(a.expires_at)}` : ""}
                </p>
              </div>
              {!live(a) && <Badge>منتهي</Badge>}
              <IconButton icon="trash" label="مسح" onClick={() => remove(a)} />
            </div>
          ))}
        </List>
      )}
      {creating && (
        <AnnouncementSheet
          me={me}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function AnnouncementSheet({ me, onClose, onSaved }: { me: StaffRow; onClose: () => void; onSaved: () => void }) {
  const students = useStudents();
  const groups = useMemo(() => groupsOf(students.list), [students.list]);
  const [f, setF] = useState({ title: "", body: "", group_name: "", pinned: false, days: "7", push: can(me, "notify") });
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (f.title.trim().length < 2) return toast("اكتب عنوان الإعلان", "error");
    const days = parseInt(f.days, 10);
    setBusy(true);
    try {
      await sb()
        .from("announcements")
        .insert({ title: f.title.trim(), body: f.body.trim(), group_name: f.group_name, pinned: f.pinned, expires_at: days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : null })
        .then(must);
      if (f.push && can(me, "notify")) {
        const { error } = await sb().functions.invoke("send-push", { body: { title: f.title.trim(), body: f.body.trim().slice(0, 240), url: "/app/#/me", audience: f.group_name ? "group" : "students", group: f.group_name || null } });
        if (error) toast("الإعلان اتنشر، بس الإشعار موصلش", "error");
      }
      toast("اتنشر الإعلان ✓");
      onSaved();
    } catch (e2) {
      toast(errorText(e2), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="إعلان جديد">
      <form onSubmit={save} className="grid gap-3">
        <Field label="العنوان">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={140} placeholder="سيشن بكرة الساعة 5" />
        </Field>
        <Field label="التفاصيل (اختياري)">
          <Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={2000} className="min-h-24" />
        </Field>
        <Field label="لمين">
          <GroupSelect value={f.group_name} onChange={(v) => setF({ ...f, group_name: v })} groups={groups} allLabel="كل المجموعات" />
        </Field>
        <Field label="يفضل ظاهر كام يوم" hint="0 = لحد ما تمسحه">
          <Input type="number" inputMode="numeric" min={0} max={365} value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} dir="ltr" />
        </Field>
        <Toggle checked={f.pinned} onChange={(v) => setF({ ...f, pinned: v })} label="مثبّت فوق" />
        {can(me, "notify") && <Toggle checked={f.push} onChange={(v) => setF({ ...f, push: v })} label="ابعته إشعار كمان" hint="للي مفعّلين الإشعارات." />}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          نشر
        </Button>
      </form>
    </Sheet>
  );
}
