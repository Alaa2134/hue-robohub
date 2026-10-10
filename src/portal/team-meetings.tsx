"use client";
/**
 * Sector meetings (20261010093000_meetings.sql): heads schedule them, everyone invited is told and
 * reminded; at the meeting the head opens attendance (a 6-digit code, also as a QR that opens this
 * screen with the code), members check in, or send an excuse beforehand. Closing saves the minutes and
 * marks the rest absent; a decision in the minutes can become a task straight away.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { APP_PATH, errorText, fmt, fromLocalInput, publicOrigin, rpc, toLocalInput } from "./core";
import { Avatar, Badge, Button, Card, Chip, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, Section, Sheet, Textarea, TopBar, confirmDialog, go, toast, useAsync } from "./ui";

type AttStatus = "present" | "late" | "excused" | "absent";
export type Meeting = {
  id: string;
  sector_id: string | null;
  sector_name: string | null;
  sector_color: string | null;
  title: string;
  agenda: string;
  starts_at: string;
  place: string | null;
  link: string | null;
  status: "scheduled" | "open" | "done" | "cancelled";
  code: string | null;
  minutes: string | null;
  leads: boolean;
  invited: number;
  present: number;
  mine: { status: AttStatus; note: string | null } | null;
  attendance: { staff_id: string; name: string; status: AttStatus | null; method: string | null; note: string | null }[] | null;
};

const ATT: Record<AttStatus, { label: string; tone: "ok" | "warn" | "info" | "danger" }> = {
  present: { label: "حاضر", tone: "ok" },
  late: { label: "متأخر", tone: "warn" },
  excused: { label: "معتذر", tone: "info" },
  absent: { label: "غايب", tone: "danger" },
};
const STATUS: Record<Meeting["status"], { label: string; tone: "muted" | "volt" | "ok" | "danger" }> = {
  scheduled: { label: "جاي", tone: "muted" },
  open: { label: "الحضور مفتوح", tone: "volt" },
  done: { label: "خلص", tone: "ok" },
  cancelled: { label: "اتلغى", tone: "danger" },
};
const CHECKIN_ERR: Record<string, string> = {
  wrong_code: "الكود غلط. بص على الكود اللي مع الهيد.",
  not_open: "الحضور لسه مش مفتوح (أو الاجتماع خلص).",
  not_invited: "الاجتماع ده مش ليك.",
  rate_limited: "محاولات كتير. استنى شوية.",
};

export const meetingUrl = (id: string, code: string) => `${publicOrigin()}${APP_PATH}#/staff/meetings/${id}?code=${code}`;

/** /staff/meetings — my meetings (the sector's, or the whole team's). */
export function MeetingsScreen({ sectorId, embedded, canCreate }: { sectorId?: string; embedded?: boolean; canCreate?: boolean }) {
  const { data, error, loading, reload } = useAsync(() => rpc<Meeting[]>("staff_meetings", { p_sector: sectorId ?? null }), [sectorId]);
  const [creating, setCreating] = useState(false);
  const upcoming = (data ?? []).filter((m) => m.status === "scheduled" || m.status === "open").reverse();
  const past = (data ?? []).filter((m) => m.status === "done" || m.status === "cancelled");
  const body = loading && !data ? (
    <Loading />
  ) : error ? (
    <ErrorBox error={error} retry={reload} />
  ) : !data?.length ? (
    <Empty
      icon="calendar"
      title="مفيش اجتماعات"
      body={canCreate ? "حدد اجتماع للسيكتور: الكل بيوصله إشعار وتذكير قبلها بساعة، والحضور بالكود." : "لما الهيد يحدد اجتماع هيوصلك إشعار وهتلاقيه هنا."}
      action={
        canCreate ? (
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            اجتماع جديد
          </Button>
        ) : undefined
      }
    />
  ) : (
    <>
      {!!upcoming.length && (
        <Section title="الجاية">
          <MeetingList list={upcoming} />
        </Section>
      )}
      {!!past.length && (
        <Section title="اللي فاتت">
          <MeetingList list={past} />
        </Section>
      )}
    </>
  );
  return (
    <>
      {!embedded && (
        <TopBar
          title="الاجتماعات"
          sub="اجتماعات السيكتورات والفريق"
          back="/staff/more"
        />
      )}
      {embedded && canCreate && !!data?.length && (
        <Button className="mb-3" variant="primary" icon="plus" size="sm" onClick={() => setCreating(true)}>
          اجتماع جديد
        </Button>
      )}
      {body}
      {creating && (
        <MeetingSheet
          sectorId={sectorId ?? null}
          meeting={null}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            go(`/staff/meetings/${id}`);
          }}
        />
      )}
    </>
  );
}

function MeetingList({ list }: { list: Meeting[] }) {
  return (
    <List>
      {list.map((m) => (
        <Row key={m.id} onClick={() => go(`/staff/meetings/${m.id}`)}>
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-2xl border border-[var(--line-2)] text-center leading-none">
              <span className="font-mono text-lg font-bold text-chalk">{new Date(m.starts_at).getDate()}</span>
              <span className="text-[10px] text-fog">{fmt.short(m.starts_at).replace(/[0-9]/g, "").trim().slice(0, 6)}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate font-semibold", m.status === "cancelled" ? "text-fog line-through" : "text-chalk")}>{m.title}</p>
              <p className="truncate text-xs text-fog">
                {fmt.time(m.starts_at)} · {m.sector_name ?? "الفريق كله"}
                {m.place ? ` · ${m.place}` : ""}
              </p>
            </div>
            {m.mine ? <Badge tone={ATT[m.mine.status].tone}>{ATT[m.mine.status].label}</Badge> : <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>}
          </div>
        </Row>
      ))}
    </List>
  );
}

function MeetingSheet({ sectorId, meeting, onClose, onSaved }: { sectorId: string | null; meeting: Meeting | null; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({
    title: meeting?.title ?? "",
    agenda: meeting?.agenda ?? "",
    starts: toLocalInput(meeting?.starts_at ?? new Date(Date.now() + 86_400_000)),
    place: meeting?.place ?? "",
    link: meeting?.link ?? "",
  });
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (f.title.trim().length < 2) return toast("اكتب عنوان الاجتماع", "error");
    const starts = fromLocalInput(f.starts);
    if (!starts) return toast("حدد الميعاد", "error");
    if (f.link.trim() && !/^https:\/\/\S+$/i.test(f.link.trim())) return toast("اللينك لازم يبدأ بـ https://", "error");
    setBusy(true);
    try {
      const id = await rpc<string>("staff_meeting_save", {
        p_id: meeting?.id ?? null,
        p_sector: meeting ? meeting.sector_id : sectorId,
        p_title: f.title.trim(),
        p_agenda: f.agenda.trim(),
        p_starts: starts,
        p_place: f.place.trim(),
        p_link: f.link.trim(),
      });
      toast(meeting ? "اتحفظ الاجتماع" : "اتبعت للكل 📅");
      onSaved(id);
    } catch (e2) {
      toast((e2 as { message?: string })?.message === "bad_time" ? "الميعاد لازم يكون جاي" : errorText(e2), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={meeting ? "تعديل الاجتماع" : "اجتماع جديد"}>
      <form onSubmit={save} className="grid gap-3">
        <Field label="العنوان">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={140} placeholder="مثلاً: اجتماع الأسبوع" />
        </Field>
        <Field label="الأجندة (اختياري)">
          <Textarea value={f.agenda} onChange={(e) => setF({ ...f, agenda: e.target.value })} maxLength={4000} className="min-h-20" />
        </Field>
        <Field label="الميعاد">
          <Input type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="المكان (اختياري)">
            <Input value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} maxLength={140} placeholder="المعمل / أونلاين" />
          </Field>
          <Field label="لينك (اختياري)">
            <Input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} dir="ltr" placeholder="https://meet…" maxLength={300} />
          </Field>
        </div>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          {meeting ? "حفظ" : "حدد الاجتماع"}
        </Button>
      </form>
    </Sheet>
  );
}

/** /staff/meetings/<id> — attendance, check-in, excuse, minutes. */
export function MeetingScreen({ id, query, onTask }: { id: string; query: URLSearchParams; onTask?: (m: Meeting, text: string) => void }) {
  const { data, error, loading, reload } = useAsync(() => rpc<Meeting>("staff_meeting", { p_id: id }), [id]);
  const [editing, setEditing] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [closing, setClosing] = useState(false);
  const [excuse, setExcuse] = useState(false);
  const autoCode = query.get("code");
  const tried = useRef(false);

  const checkin = async (code: string) => {
    try {
      const r = await rpc<{ ok: boolean; error?: string; status?: string }>("staff_meeting_checkin", { p_id: id, p_code: code.trim() });
      if (r.ok) {
        toast(r.status === "late" ? "اتسجلت (متأخر)" : "اتسجّل حضورك ✓");
        reload();
      } else toast(CHECKIN_ERR[r.error ?? ""] ?? "مقدرناش نسجّلك", "error");
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  useEffect(() => {
    if (autoCode && data && !data.mine && data.status === "open" && !tried.current) {
      tried.current = true;
      void checkin(autoCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCode, data]);

  if (loading && !data) return <Loading />;
  if (error || !data)
    return (
      <>
        <TopBar title="الاجتماع" back="/staff/meetings" />
        <ErrorBox error={error ?? "مش موجود"} retry={reload} />
      </>
    );
  const m = data;
  const live = m.status === "scheduled" || m.status === "open";
  const back = m.sector_id ? `/staff/sectors/${m.sector_id}` : "/staff/meetings";

  const open = async () => {
    try {
      await rpc("staff_meeting_open", { p_id: m.id });
      setShowCode(true);
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const cancel = async () => {
    if (!(await confirmDialog({ title: "إلغاء الاجتماع؟", body: "هيوصل كل المدعوين إن الاجتماع اتلغى.", ok: "إلغاء الاجتماع", danger: true }))) return;
    try {
      await rpc("staff_meeting_cancel", { p_id: m.id });
      toast("اتلغى");
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const mark = async (staff: string, status: AttStatus) => {
    try {
      await rpc("staff_meeting_mark", { p_id: m.id, p_staff: staff, p_status: status });
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  return (
    <>
      <TopBar
        title={m.title}
        sub={`${fmt.dateTime(m.starts_at)} · ${m.sector_name ?? "الفريق كله"}`}
        back={back}
        actions={
          m.leads &&
          live && (
            <Button size="sm" icon="edit" onClick={() => setEditing(true)}>
              تعديل
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
        {m.place && (
          <span className="flex items-center gap-1 text-sm text-mist">
            <Icon name="pin" size={14} /> {m.place}
          </span>
        )}
        {m.link && (
          <a href={m.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-cyan">
            <Icon name="link" size={14} /> لينك الاجتماع
          </a>
        )}
        <span className="text-sm text-fog">
          {m.present}/{m.invited} حاضر
        </span>
      </div>
      {m.agenda && (
        <Card className="mb-4">
          <p className="text-xs text-fog">الأجندة</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-mist">{m.agenda}</p>
        </Card>
      )}

      {/* Member: check in, or excuse */}
      {!m.leads && live && (
        <MemberCheckin meeting={m} onCheckin={checkin} onExcuse={() => setExcuse(true)} />
      )}
      {!m.leads && m.mine && (
        <Card className="mb-4 flex items-center gap-3">
          <Badge tone={ATT[m.mine.status].tone}>{ATT[m.mine.status].label}</Badge>
          {m.mine.note && <span className="text-sm text-mist">{m.mine.note}</span>}
        </Card>
      )}

      {/* Head: open attendance, the code and QR, marking, closing */}
      {m.leads && live && (
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {m.status === "open" ? (
            <Button variant="primary" icon="qr" onClick={() => setShowCode(true)}>
              اعرض كود الحضور
            </Button>
          ) : (
            <Button variant="primary" icon="qr" onClick={open}>
              افتح الحضور
            </Button>
          )}
          <Button icon="check" onClick={() => setClosing(true)}>
            اقفل واكتب المحضر
          </Button>
          <Button variant="ghost" onClick={cancel}>
            إلغاء الاجتماع
          </Button>
        </div>
      )}
      {m.leads && m.attendance && (
        <Section title="الحضور">
          <List>
            {m.attendance.map((a) => (
              <Row key={a.staff_id} chevron={false}>
                <div className="flex flex-wrap items-center gap-2">
                  <Avatar name={a.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-chalk">{a.name}</p>
                    {a.note && <p className="truncate text-xs text-fog">{a.note}</p>}
                  </div>
                  {live ? (
                    <div className="flex gap-1">
                      {(["present", "late", "excused", "absent"] as AttStatus[]).map((s) => (
                        <Chip key={s} active={a.status === s} onClick={() => mark(a.staff_id, s)}>
                          {ATT[s].label}
                        </Chip>
                      ))}
                    </div>
                  ) : a.status ? (
                    <Badge tone={ATT[a.status].tone}>{ATT[a.status].label}</Badge>
                  ) : null}
                </div>
              </Row>
            ))}
          </List>
        </Section>
      )}

      {m.minutes && (
        <Section title="المحضر والقرارات">
          <Card className="grid gap-2">
            {m.minutes.split("\n").filter((l) => l.trim()).map((line, i) => (
              <div key={i} className="flex items-start gap-2">
                <p className="flex-1 text-sm leading-relaxed text-mist">{line}</p>
                {m.leads && m.sector_id && onTask && (
                  <Button size="sm" variant="ghost" icon="flag" onClick={() => onTask(m, line.replace(/^[-•*\d.)\s]+/, ""))} aria-label="حوّلها لتاسك">
                    تاسك
                  </Button>
                )}
              </div>
            ))}
          </Card>
        </Section>
      )}

      {showCode && m.leads && <CodeScreen meeting={m} onClose={() => (setShowCode(false), reload())} />}
      {editing && <MeetingSheet sectorId={m.sector_id} meeting={m} onClose={() => setEditing(false)} onSaved={() => (setEditing(false), reload())} />}
      {closing && <CloseSheet meeting={m} onClose={() => setClosing(false)} onDone={() => (setClosing(false), reload())} />}
      {excuse && <ExcuseSheet meeting={m} onClose={() => setExcuse(false)} onDone={() => (setExcuse(false), reload())} />}
    </>
  );
}

function MemberCheckin({ meeting: m, onCheckin, onExcuse }: { meeting: Meeting; onCheckin: (code: string) => void; onExcuse: () => void }) {
  const [code, setCode] = useState("");
  const here = m.mine && (m.mine.status === "present" || m.mine.status === "late");
  if (here) return null;
  return (
    <Card className="mb-4 grid gap-3">
      {m.status === "open" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{6}$/.test(code.trim())) onCheckin(code);
            else toast("الكود 6 أرقام", "error");
          }}
          className="grid gap-2"
        >
          <p className="font-semibold text-chalk">سجّل حضورك</p>
          <p className="text-xs text-fog">اكتب الكود اللي مع الهيد، أو امسح الـ QR بكاميرا الموبايل.</p>
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" dir="ltr" placeholder="000000" className="text-center font-mono text-xl tracking-[0.4em]" aria-label="كود الحضور" />
            <Button type="submit" variant="primary">
              سجّل
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-mist">الحضور بيتفتح في الاجتماع. هيجيلك تذكير قبلها بساعة.</p>
      )}
      {m.mine?.status !== "excused" && (
        <Button variant="ghost" size="sm" onClick={onExcuse}>
          مش هقدر أحضر (اعتذار)
        </Button>
      )}
    </Card>
  );
}

function CodeScreen({ meeting: m, onClose }: { meeting: Meeting; onClose: () => void }) {
  const [img, setImg] = useState("");
  useEffect(() => {
    if (!m.code) return;
    let alive = true;
    import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(meetingUrl(m.id, m.code!), { margin: 1, width: 800, errorCorrectionLevel: "M", color: { dark: "#081634", light: "#ffffff" } }).then((u) => alive && setImg(u)),
    );
    return () => {
      alive = false;
    };
  }, [m.id, m.code]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-abyss px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] text-center">
      <div>
        <p className="text-sm text-fog">امسح الـ QR أو اكتب الكود في التطبيق ← الاجتماع</p>
        <h1 className="mt-1 text-2xl font-bold text-chalk sm:text-4xl">{m.title}</h1>
      </div>
      <div className="rounded-[2rem] bg-white p-4">
        {img ? <img src={img} alt="QR حضور الاجتماع" className="aspect-square w-[min(70vw,50vh)]" /> : <span className="block aspect-square w-[min(70vw,50vh)]" />}
      </div>
      <p className="font-mono text-5xl font-bold tracking-[0.3em] text-chalk" data-testid="meeting-code" dir="ltr">
        {m.code}
      </p>
      <Button icon="close" onClick={onClose}>
        رجوع
      </Button>
    </div>
  );
}

function CloseSheet({ meeting: m, onClose, onDone }: { meeting: Meeting; onClose: () => void; onDone: () => void }) {
  const [minutes, setMinutes] = useState(m.minutes ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await rpc<{ absent: number }>("staff_meeting_close", { p_id: m.id, p_minutes: minutes.trim() });
      toast(r.absent ? `اتقفل · ${r.absent} غايب` : "اتقفل الاجتماع");
      onDone();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="قفل الاجتماع">
      <div className="grid gap-3">
        <Field label="المحضر والقرارات" hint="كل قرار في سطر، وبعدين تقدر تحوّل أي سطر لتاسك بضغطة. بيوصل لكل المدعوين.">
          <Textarea value={minutes} onChange={(e) => setMinutes(e.target.value)} maxLength={8000} className="min-h-40" placeholder={"- نصمم بوست الورشة قبل الخميس\n- نجهز العرض"} />
        </Field>
        <p className="text-xs text-fog">اللي ماسجّلش حضور ولا اعتذر هيتسجّل غايب.</p>
        <Button variant="primary" size="lg" icon="check" loading={busy} onClick={save} block>
          اقفل الاجتماع
        </Button>
      </div>
    </Sheet>
  );
}

function ExcuseSheet({ meeting: m, onClose, onDone }: { meeting: Meeting; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (reason.trim().length < 2) return toast("اكتب السبب", "error");
    setBusy(true);
    try {
      await rpc("staff_meeting_excuse", { p_id: m.id, p_reason: reason.trim() });
      toast("وصل اعتذارك للهيد");
      onDone();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`اعتذار عن: ${m.title}`}>
      <div className="grid gap-3">
        <Field label="السبب">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="min-h-20" />
        </Field>
        <Button variant="primary" loading={busy} onClick={save} block>
          ابعت الاعتذار
        </Button>
      </div>
    </Sheet>
  );
}
