"use client";
/** Attendance: sessions, live barcode scanning (camera or USB scanner), offline queue, manual fixes. */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import {
  STATUS_LABEL,
  codeKey,
  downloadCsv,
  feedback,
  fmt,
  fromLocalInput,
  isNetworkError,
  must,
  rpc,
  sb,
  toLocalInput,
  uid,
  type AttRow,
  type AttStatus,
  type Session,
  type Student,
} from "./core";
import { Scanner } from "./scanner";
import { GroupSelect, makeFinder, patchStudents, refreshStudents, scanQueue, useGroups, useStudents } from "./staff-data";
import {
  Avatar,
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
  STATUS_TONE,
  SearchBox,
  Sheet,
  Stat,
  TopBar,
  confirmDialog,
  go,
  toast,
  useAsync,
} from "./ui";

type SessionWithCount = Session & { attendance: { count: number }[] };
type ScanResult = {
  result: "marked" | "already" | "unknown" | "inactive" | "closed" | "no_session";
  student?: { id: string; code: string; name: string; group: string; active: boolean };
  status?: AttStatus;
  at?: string;
  code?: string;
};

/* ─── Sessions list ────────────────────────────────────────────────────── */

export function SessionsScreen() {
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useAsync(
    async () => must(await sb().from("attendance_sessions").select("*, attendance(count)").order("starts_at", { ascending: false }).limit(200)) as SessionWithCount[],
    [],
  );
  const byDay = useMemo(() => {
    const m = new Map<string, SessionWithCount[]>();
    for (const s of data ?? []) {
      const k = new Date(s.starts_at).toDateString();
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.values()];
  }, [data]);

  return (
    <>
      <TopBar
        title="الحضور"
        sub="جلسات الحضور والمسح بالباركود"
        actions={
          <Button size="sm" variant="primary" icon="plus" onClick={() => setCreating(true)}>
            جلسة جديدة
          </Button>
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty
          icon="scan"
          title="لا توجد جلسات بعد"
          body="ابدأ جلسة حضور، وبعدها امسح باركود كارنيه كل طالب بالكاميرا أو بقارئ USB."
          action={
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              ابدأ أول جلسة
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5">
          {byDay.map((day) => (
            <div key={day[0]!.id}>
              <p className="mb-2 text-[13px] font-semibold text-fog">{fmt.day(day[0]!.starts_at)}</p>
              <List>
                {day.map((s) => (
                  <Row key={s.id} onClick={() => go(`/staff/attendance/${s.id}`)}>
                    <div className="flex items-center gap-3">
                      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", s.closed_at ? "bg-white/[0.05] text-fog" : "bg-ok/15 text-ok")}>
                        <Icon name={s.closed_at ? "check" : "scan"} size={20} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-chalk">{s.title}</p>
                        <p className="truncate text-xs text-fog">
                          {fmt.time(s.starts_at)} · {s.group_name || "كل المجموعات"}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="font-mono text-lg font-semibold text-chalk">{s.attendance?.[0]?.count ?? 0}</p>
                        <p className="text-[11px] text-fog">{s.closed_at ? "مغلقة" : "مفتوحة"}</p>
                      </div>
                    </div>
                  </Row>
                ))}
              </List>
            </div>
          ))}
        </div>
      )}
      <SessionSheet open={creating} onClose={() => setCreating(false)} onSaved={(id) => go(`/staff/attendance/${id}`)} />
    </>
  );
}

/** Create or edit a session. */
export function SessionSheet({ open, onClose, session, onSaved }: { open: boolean; onClose: () => void; session?: Session; onSaved: (id: string) => void }) {
  const groups = useGroups();
  const [form, setForm] = useState({ title: "", group: "", starts: "", late: "15" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(
      session
        ? { title: session.title, group: session.group_name, starts: toLocalInput(session.starts_at), late: String(session.late_after_min) }
        : { title: `محاضرة ${fmt.short(new Date())}`, group: "", starts: toLocalInput(new Date()), late: "15" },
    );
  }, [open, session]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const row = {
        title: form.title.trim() || "محاضرة",
        group_name: form.group,
        starts_at: fromLocalInput(form.starts) ?? new Date().toISOString(),
        late_after_min: Math.max(0, Math.min(600, Number(form.late) || 0)),
      };
      if (session) {
        must(await sb().from("attendance_sessions").update(row).eq("id", session.id).select().single());
        onSaved(session.id);
      } else {
        const created = must(await sb().from("attendance_sessions").insert(row).select().single()) as Session;
        onSaved(created.id);
      }
      onClose();
    } catch (e2) {
      toast.error(e2);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={session ? "تعديل الجلسة" : "جلسة حضور جديدة"}>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="عنوان الجلسة">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} required />
        </Field>
        <Field label="المجموعة" hint="الطلاب المتوقع حضورهم. «كل المجموعات» = كل الطلاب النشطين.">
          <GroupSelect value={form.group} onChange={(group) => setForm({ ...form, group })} groups={groups} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="وقت البداية">
            <Input type="datetime-local" value={form.starts} onChange={(e) => setForm({ ...form, starts: e.target.value })} required />
          </Field>
          <Field label="متأخر بعد (دقيقة)">
            <Input type="number" inputMode="numeric" min={0} max={600} value={form.late} onChange={(e) => setForm({ ...form, late: e.target.value })} dir="ltr" />
          </Field>
        </div>
        <Button type="submit" variant="primary" size="lg" icon={session ? "check" : "scan"} loading={busy} block>
          {session ? "حفظ" : "ابدأ المسح"}
        </Button>
      </form>
    </Sheet>
  );
}

/* ─── Live session ─────────────────────────────────────────────────────── */

type Rec = AttRow & { pending?: boolean };
type Last = { kind: "ok" | "already" | "unknown" | "inactive" | "error" | "closed"; name?: string; code: string; status?: AttStatus; at?: string; group?: string; other?: boolean };

export function SessionScreen({ id }: { id: string }) {
  const students = useStudents();
  const [session, setSession] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [records, setRecords] = useState<Map<string, Rec>>(new Map());
  const [tab, setTab] = useState<"scan" | "list">("scan");
  const [last, setLast] = useState<Last | null>(null);
  const [queued, setQueued] = useState(() => (typeof window === "undefined" ? 0 : scanQueue.count(id)));
  const [online, setOnline] = useState(true);
  const [manual, setManual] = useState("");
  const [unknown, setUnknown] = useState<string | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [editSession, setEditSession] = useState(false);
  const [filter, setFilter] = useState<"all" | AttStatus>("all");
  const [q, setQ] = useState("");
  // The camera keeps seeing a card for a while: one reaction per card every 8 s.
  const seen = useRef(new Map<string, number>());
  const flushing = useRef(false);
  const manualInput = useRef<HTMLInputElement>(null);

  const list = useMemo(() => students.list ?? [], [students.list]);
  const find = useMemo(() => makeFinder(list), [list]);
  const byId = useMemo(() => new Map(list.map((s) => [s.id, s])), [list]);

  const loadRecords = useCallback(async () => {
    const rows = must(await sb().from("attendance").select("*").eq("session_id", id)) as AttRow[];
    setRecords((prev) => {
      const next = new Map<string, Rec>();
      for (const r of rows) next.set(r.student_id, r);
      for (const [k, v] of prev) if (v.pending && !next.has(k)) next.set(k, v);
      return next;
    });
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = must(await sb().from("attendance_sessions").select("*").eq("id", id).maybeSingle()) as Session | null;
        if (!alive) return;
        if (!s) {
          setLoadError(new Error("not_found"));
          return;
        }
        setSession(s);
        await loadRecords();
      } catch (e) {
        if (alive) setLoadError(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, loadRecords]);

  // Other devices scan too: refresh every 10 s while visible and online.
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden && navigator.onLine) loadRecords().catch(() => undefined);
    }, 10_000);
    return () => clearInterval(t);
  }, [loadRecords]);

  const applyServer = useCallback((r: ScanResult) => {
    if (!r.student || (r.result !== "marked" && r.result !== "already")) return;
    const sid = r.student.id;
    setRecords((prev) => {
      const next = new Map(prev);
      next.set(sid, { session_id: id, student_id: sid, status: r.status ?? "present", method: "scan", marked_at: r.at ?? new Date().toISOString() });
      return next;
    });
  }, [id]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const item of scanQueue.all().filter((x) => x.session === id)) {
        try {
          const r = await rpc<ScanResult>("attendance_scan", { p_session: item.session, p_raw: item.raw, p_at: item.at, p_method: item.method });
          scanQueue.remove(item.id);
          if (r.result === "closed") toast("الجلسة مغلقة، لم يُسجَّل المسح.", "error");
          applyServer(r);
          setOnline(true);
        } catch (e) {
          if (isNetworkError(e)) {
            setOnline(false);
            break;
          }
          scanQueue.remove(item.id);
          toast.error(e);
        }
      }
    } finally {
      flushing.current = false;
      setQueued(scanQueue.count(id));
    }
  }, [id, applyServer]);

  useEffect(() => {
    flush();
    const on = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) flush();
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    const t = setInterval(() => scanQueue.count(id) && flush(), 15_000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
      clearInterval(t);
    };
  }, [flush, id]);

  const statusAt = useCallback(
    (at: Date): AttStatus => (session && at.getTime() > new Date(session.starts_at).getTime() + session.late_after_min * 60_000 ? "late" : "present"),
    [session],
  );

  const handleCode = useCallback(
    async (raw: string, method: "scan" | "manual") => {
      const key = codeKey(raw);
      if (!key || !session) return;
      const now = Date.now();
      if (method === "scan" && now - (seen.current.get(key) ?? 0) < 8000) return;
      seen.current.set(key, now);
      if (session.closed_at) {
        setLast({ kind: "closed", code: raw });
        feedback("error");
        return;
      }
      const st = find(raw);
      if (st) {
        if (!st.active) {
          setLast({ kind: "inactive", name: st.name, code: st.code });
          feedback("error");
          return;
        }
        const existing = records.get(st.id);
        if (existing) {
          setLast({ kind: "already", name: st.name, code: st.code, status: existing.status, at: existing.marked_at });
          feedback("warn");
          return;
        }
        const at = new Date();
        const status = statusAt(at);
        setRecords((prev) => new Map(prev).set(st.id, { session_id: id, student_id: st.id, status, method, marked_at: at.toISOString(), pending: true }));
        setLast({ kind: "ok", name: st.name, code: st.code, status, at: at.toISOString(), group: st.group, other: !!session.group_name && st.group !== session.group_name });
        feedback("ok");
        scanQueue.push({ id: uid(), session: id, raw: st.code, at: at.toISOString(), method });
        setQueued(scanQueue.count(id));
        flush();
        return;
      }
      // Not in the local roster: the server may know a newer student.
      try {
        const r = await rpc<ScanResult>("attendance_scan", { p_session: id, p_raw: raw, p_at: new Date().toISOString(), p_method: method });
        if (r.result === "marked" || r.result === "already") {
          applyServer(r);
          refreshStudents().catch(() => undefined);
          setLast({ kind: r.result === "marked" ? "ok" : "already", name: r.student?.name, code: r.student?.code ?? raw, status: r.status, at: r.at });
          feedback(r.result === "marked" ? "ok" : "warn");
        } else if (r.result === "inactive") {
          setLast({ kind: "inactive", name: r.student?.name, code: raw });
          feedback("error");
        } else {
          setLast({ kind: "unknown", code: raw });
          setUnknown(raw);
          feedback("error");
        }
      } catch (e) {
        setLast({ kind: isNetworkError(e) ? "unknown" : "error", code: raw });
        if (isNetworkError(e)) setUnknown(raw);
        feedback("error");
      }
    },
    [find, records, session, statusAt, id, flush, applyServer],
  );

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    const v = manual.trim();
    if (!v) return;
    handleCode(v, "manual");
    setManual("");
    manualInput.current?.focus();
  };

  const setStatus = async (st: Student, status: AttStatus | null) => {
    const prev = records.get(st.id);
    try {
      if (status === null) {
        must(await sb().from("attendance").delete().eq("session_id", id).eq("student_id", st.id).select());
        setRecords((m) => {
          const n = new Map(m);
          n.delete(st.id);
          return n;
        });
      } else {
        const row = { session_id: id, student_id: st.id, status, method: "manual" as const, marked_at: prev?.marked_at ?? new Date().toISOString() };
        must(await sb().from("attendance").upsert(row, { onConflict: "session_id,student_id" }).select());
        setRecords((m) => new Map(m).set(st.id, row));
      }
      setEditing(null);
    } catch (e) {
      toast.error(e);
    }
  };

  const toggleClosed = async () => {
    if (!session) return;
    const closing = !session.closed_at;
    if (closing && !(await confirmDialog({ title: "إنهاء الجلسة؟", body: "بعد الإنهاء يُعتبر غير المسجَّلين غائبين، ويمكنك إعادة فتحها لاحقًا.", ok: "إنهاء الجلسة" }))) return;
    try {
      const s = must(await sb().from("attendance_sessions").update({ closed_at: closing ? new Date().toISOString() : null }).eq("id", id).select().single()) as Session;
      setSession(s);
      toast(closing ? "تم إنهاء الجلسة" : "تمت إعادة فتح الجلسة");
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: "حذف الجلسة؟", body: "سيُحذف سجل الحضور الخاص بها نهائيًا.", ok: "حذف", danger: true }))) return;
    try {
      const gone = must(await sb().from("attendance_sessions").delete().eq("id", id).select()) as Session[];
      if (!gone.length) throw new Error("forbidden");
      toast("تم حذف الجلسة");
      go("/staff/attendance", true);
    } catch (e) {
      toast.error(e);
    }
  };

  // Students expected in this session, plus anyone from another group who was marked.
  const expected = useMemo(() => {
    if (!session) return [] as Student[];
    const inGroup = list.filter((s) => s.active && (!session.group_name || s.group === session.group_name));
    const ids = new Set(inGroup.map((s) => s.id));
    const extra = [...records.keys()].filter((k) => !ids.has(k)).map((k) => byId.get(k)).filter(Boolean) as Student[];
    return [...inGroup, ...extra];
  }, [list, session, records, byId]);

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, excused: 0, absent: 0 };
    for (const s of expected) {
      const r = records.get(s.id);
      c[r ? r.status : "absent"]++;
    }
    return c;
  }, [expected, records]);

  const exportCsv = () => {
    if (!session) return;
    downloadCsv(`attendance-${session.title}-${session.starts_at.slice(0, 10)}.csv`, [
      ["الاسم", "رقم الطالب", "المجموعة", "الحالة", "وقت التسجيل", "الطريقة"],
      ...expected
        .map((s) => {
          const r = records.get(s.id);
          return [s.name, s.code, s.group, STATUS_LABEL[r?.status ?? "absent"], r ? fmt.time(r.marked_at) : "", r ? (r.method === "scan" ? "باركود" : "يدوي") : ""];
        })
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "ar")),
    ]);
  };

  if (loadError) return <ErrorBox error={loadError} retry={() => location.reload()} />;
  if (!session) return <Loading />;

  const recentRecs = [...records.values()].sort((a, b) => b.marked_at.localeCompare(a.marked_at)).slice(0, 6);
  const shown = expected
    .filter((s) => {
      const st = records.get(s.id)?.status ?? "absent";
      if (filter !== "all" && st !== filter) return false;
      if (!q) return true;
      return s.name.includes(q) || s.code.includes(q) || codeKey(s.code).includes(codeKey(q));
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  return (
    <>
      <TopBar
        title={session.title}
        sub={`${fmt.dateTime(session.starts_at)} · ${session.group_name || "كل المجموعات"} · متأخر بعد ${session.late_after_min} د`}
        back="/staff/attendance"
        actions={<SessionMenu closed={!!session.closed_at} onEdit={() => setEditSession(true)} onToggle={toggleClosed} onExport={exportCsv} onDelete={remove} />}
      />

      {session.closed_at && (
        <Card className="mb-4 flex items-center gap-3 border-warn/30 bg-warn/[0.06]">
          <Icon name="lock" size={20} className="text-warn" />
          <p className="flex-1 text-sm text-mist">الجلسة مغلقة منذ {fmt.time(session.closed_at)}. أعد فتحها لتسجيل حضور جديد.</p>
          <Button size="sm" onClick={toggleClosed}>
            إعادة فتح
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-4 gap-2">
        <Stat label="حاضر" value={counts.present} tone="ok" />
        <Stat label="متأخر" value={counts.late} tone="warn" />
        <Stat label="بعذر" value={counts.excused} tone="info" />
        <Stat label="غائب" value={counts.absent} tone="danger" />
      </div>

      {(queued > 0 || !online) && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/[0.07] px-3 py-2 text-[13px] text-[#ffd08a]">
          <Icon name="wifiOff" size={16} />
          {queued > 0 ? `${queued} مسح محفوظ على الجهاز وسيُرسل تلقائيًا عند عودة الإنترنت.` : "لا يوجد إنترنت. استمر في المسح، وسيُحفظ على الجهاز."}
        </div>
      )}

      <div className="mt-4 flex gap-2 rounded-2xl border border-[var(--line)] bg-panel/50 p-1">
        {(["scan", "list"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn("flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition", tab === t ? "bg-white/[0.08] text-chalk" : "text-fog")}
          >
            <Icon name={t === "scan" ? "scan" : "list"} size={18} />
            {t === "scan" ? "المسح" : `القائمة (${expected.length})`}
          </button>
        ))}
      </div>

      {tab === "scan" ? (
        <div className="mt-4 grid gap-4">
          {!session.closed_at && <Scanner onDetect={(raw) => handleCode(raw, "scan")} paused={!!unknown} />}
          <LastScan last={last} onUnknown={(c) => setUnknown(c)} />
          {!session.closed_at && (
            <form onSubmit={submitManual} className="flex gap-2">
              <Input
                ref={manualInput}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="رقم الطالب"
                dir="ltr"
                inputMode="text"
                autoComplete="off"
                enterKeyHint="done"
                className="text-center font-mono"
                aria-label="رقم الطالب"
              />
              <Button type="submit" variant="primary" icon="check" className="shrink-0">
                تسجيل
              </Button>
            </form>
          )}
          {!session.closed_at && <p className="-mt-2 text-center text-xs text-fog">قارئ الباركود (USB أو بلوتوث) يكتب في الخانة دي مباشرة ويسجّل لوحده.</p>}
          {recentRecs.length > 0 && (
            <List>
              {recentRecs.map((r) => {
                const s = byId.get(r.student_id);
                return (
                  <Row key={r.student_id} onClick={s ? () => setEditing(s) : undefined}>
                    <div className="flex items-center gap-3">
                      <Avatar name={s?.name ?? "?"} className="size-9" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-chalk">{s?.name ?? r.student_id.slice(0, 8)}</p>
                        <p className="font-mono text-xs text-fog" dir="ltr">
                          {s?.code}
                        </p>
                      </div>
                      {r.pending && <Icon name="clock" size={16} className="text-warn" />}
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      <span className="w-14 text-end font-mono text-xs text-fog">{fmt.time(r.marked_at)}</span>
                    </div>
                  </Row>
                );
              })}
            </List>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <SearchBox value={q} onChange={setQ} placeholder="ابحث بالاسم أو الرقم" />
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <Chip active={filter === "all"} onClick={() => setFilter("all")} count={expected.length}>
              الكل
            </Chip>
            {(["present", "late", "excused", "absent"] as const).map((s) => (
              <Chip key={s} active={filter === s} onClick={() => setFilter(s)} count={counts[s]}>
                {STATUS_LABEL[s]}
              </Chip>
            ))}
          </div>
          {students.loading && !students.list ? (
            <Loading />
          ) : shown.length === 0 ? (
            <Empty icon="users" title="لا يوجد طلاب هنا" body={list.length ? undefined : "أضف الطلاب من شاشة «الطلاب» أولًا."} />
          ) : (
            <List>
              {shown.map((s) => {
                const r = records.get(s.id);
                const status = r?.status ?? "absent";
                return (
                  <Row key={s.id} onClick={() => setEditing(s)}>
                    <div className="flex items-center gap-3">
                      <Avatar name={s.name} className="size-9" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-chalk">{s.name}</p>
                        <p className="truncate font-mono text-xs text-fog">
                          <span dir="ltr">{s.code}</span>
                          {session.group_name && s.group !== session.group_name ? ` · ${s.group || "بدون مجموعة"}` : ""}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                      {r && <span className="w-14 text-end font-mono text-xs text-fog">{fmt.time(r.marked_at)}</span>}
                    </div>
                  </Row>
                );
              })}
            </List>
          )}
        </div>
      )}

      <StatusSheet student={editing} current={editing ? records.get(editing.id)?.status ?? null : null} onClose={() => setEditing(null)} onSet={setStatus} />
      <UnknownSheet
        code={unknown}
        session={session}
        students={list}
        onClose={() => setUnknown(null)}
        onResolved={(r) => {
          applyServer(r);
          setLast({ kind: r.result === "marked" ? "ok" : "already", name: r.student?.name, code: r.student?.code ?? "", status: r.status, at: r.at });
          feedback("ok");
          setUnknown(null);
        }}
      />
      <SessionSheet open={editSession} onClose={() => setEditSession(false)} session={session} onSaved={() => sb().from("attendance_sessions").select("*").eq("id", id).single().then(({ data }) => data && setSession(data as Session))} />
    </>
  );
}

function SessionMenu({ closed, onEdit, onToggle, onExport, onDelete }: { closed: boolean; onEdit: () => void; onToggle: () => void; onExport: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const act = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  return (
    <>
      <IconButton icon="dots" label="خيارات الجلسة" onClick={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title="خيارات الجلسة">
        <div className="grid gap-2">
          <Button icon={closed ? "refresh" : "lock"} onClick={act(onToggle)} block>
            {closed ? "إعادة فتح الجلسة" : "إنهاء الجلسة"}
          </Button>
          <Button icon="download" onClick={act(onExport)} block>
            تنزيل كشف الحضور (Excel/CSV)
          </Button>
          <Button icon="edit" onClick={act(onEdit)} block>
            تعديل الجلسة
          </Button>
          <Button icon="trash" variant="danger" onClick={act(onDelete)} block>
            حذف الجلسة
          </Button>
        </div>
      </Sheet>
    </>
  );
}

function LastScan({ last, onUnknown }: { last: Last | null; onUnknown: (code: string) => void }) {
  if (!last)
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--line-2)] px-4 py-5 text-sm text-fog">
        <Icon name="barcode" size={26} />
        نتيجة آخر مسح هتظهر هنا.
      </div>
    );
  const tone =
    last.kind === "ok"
      ? last.status === "late"
        ? "border-warn/50 bg-warn/[0.1]"
        : "border-ok/50 bg-ok/[0.1]"
      : last.kind === "already"
        ? "border-cyan/40 bg-cyan/[0.08]"
        : "border-danger/50 bg-danger/[0.1]";
  const title =
    last.kind === "ok"
      ? last.status === "late"
        ? "تم التسجيل · متأخر"
        : "تم التسجيل · حاضر"
      : last.kind === "already"
        ? "مسجَّل بالفعل"
        : last.kind === "inactive"
          ? "طالب موقوف"
          : last.kind === "closed"
            ? "الجلسة مغلقة"
            : last.kind === "error"
              ? "حدث خطأ"
              : "رقم غير مسجَّل";
  return (
    <div className={cn("flex items-center gap-4 rounded-2xl border p-4", tone)} role="status" aria-live="assertive">
      <span
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-2xl",
          last.kind === "ok" ? (last.status === "late" ? "bg-warn text-black" : "bg-ok text-[#04241a]") : last.kind === "already" ? "bg-cyan/20 text-cyan" : "bg-danger text-white",
        )}
      >
        <Icon name={last.kind === "ok" ? "check" : last.kind === "already" ? "info" : "close"} size={26} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-mist">{title}</p>
        <p className="truncate text-xl font-bold text-chalk">{last.name ?? <span dir="ltr">{last.code}</span>}</p>
        <p className="truncate text-xs text-fog">
          <span dir="ltr" className="font-mono">
            {last.name ? last.code : ""}
          </span>
          {last.at ? ` · ${fmt.time(last.at)}` : ""}
          {last.other ? ` · من مجموعة أخرى (${last.group || "بدون"})` : ""}
        </p>
      </div>
      {last.kind === "unknown" && (
        <Button size="sm" onClick={() => onUnknown(last.code)}>
          إضافة
        </Button>
      )}
    </div>
  );
}

function StatusSheet({ student, current, onClose, onSet }: { student: Student | null; current: AttStatus | null; onClose: () => void; onSet: (s: Student, v: AttStatus | null) => void }) {
  return (
    <Sheet open={!!student} onClose={onClose} title={student?.name ?? ""}>
      {student && (
        <div className="grid gap-3">
          <p className="text-sm text-fog">
            رقم <span dir="ltr" className="font-mono text-mist">{student.code}</span> · الحالة الحالية: {STATUS_LABEL[current ?? "absent"]}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["present", "late", "excused", "absent"] as const).map((s) => (
              <Button key={s} variant={current === s ? "primary" : "secondary"} onClick={() => onSet(student, s)}>
                {STATUS_LABEL[s]}
              </Button>
            ))}
          </div>
          {current && (
            <Button variant="ghost" icon="trash" onClick={() => onSet(student, null)}>
              إلغاء التسجيل
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** An unknown barcode: add a new student with it, or link it to an existing student's card. */
function UnknownSheet({
  code,
  session,
  students,
  onClose,
  onResolved,
}: {
  code: string | null;
  session: Session;
  students: Student[];
  onClose: () => void;
  onResolved: (r: ScanResult) => void;
}) {
  const groups = useGroups();
  const [mode, setMode] = useState<"new" | "link">("new");
  const [name, setName] = useState("");
  const [group, setGroup] = useState(session.group_name);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (code) {
      setMode("new");
      setName("");
      setGroup(session.group_name);
      setQ("");
    }
  }, [code, session.group_name]);

  const mark = async (raw: string) => rpc<ScanResult>("attendance_scan", { p_session: session.id, p_raw: raw, p_at: new Date().toISOString(), p_method: "scan" });

  const addNew = async (e: FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setBusy(true);
    try {
      must(await sb().from("students").insert({ code: code.trim(), full_name: name.trim(), group_name: group }).select());
      await refreshStudents();
      onResolved(await mark(code));
      toast("تمت إضافة الطالب وتسجيل حضوره");
    } catch (e2) {
      toast.error(e2);
    } finally {
      setBusy(false);
    }
  };

  const link = async (s: Student) => {
    if (!code) return;
    setBusy(true);
    try {
      must(await sb().from("students").update({ barcode: code.trim() }).eq("id", s.id).select());
      patchStudents((list) => list.map((x) => (x.id === s.id ? { ...x, barcode: code.trim(), barcodeKey: codeKey(code) } : x)));
      onResolved(await mark(code));
      toast("تم ربط الباركود بالطالب");
      refreshStudents().catch(() => undefined);
    } catch (e2) {
      toast.error(e2);
    } finally {
      setBusy(false);
    }
  };

  const matches = q.trim()
    ? students.filter((s) => s.name.includes(q.trim()) || codeKey(s.code).includes(codeKey(q))).slice(0, 30)
    : students.filter((s) => !s.barcode && (!session.group_name || s.group === session.group_name)).slice(0, 30);

  return (
    <Sheet open={!!code} onClose={onClose} title="رقم غير مسجَّل">
      <p className="mb-4 rounded-xl bg-white/[0.04] px-3 py-2 text-center font-mono text-xl text-chalk" dir="ltr">
        {code}
      </p>
      <div className="mb-4 flex gap-2 rounded-2xl border border-[var(--line)] bg-panel/50 p-1">
        {(["new", "link"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn("h-10 flex-1 rounded-xl text-sm font-semibold", mode === m ? "bg-white/[0.08] text-chalk" : "text-fog")}>
            {m === "new" ? "طالب جديد" : "ربط بطالب موجود"}
          </button>
        ))}
      </div>
      {mode === "new" ? (
        <form onSubmit={addNew} className="grid gap-4">
          <Field label="اسم الطالب">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </Field>
          <Field label="المجموعة">
            <GroupSelect value={group} onChange={setGroup} groups={groups} allLabel="بدون مجموعة" allowNew />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={busy} icon="plus" block>
            إضافة وتسجيل الحضور
          </Button>
        </form>
      ) : (
        <div className="grid gap-3">
          <p className="text-xs leading-relaxed text-fog">لو باركود الكارنيه مختلف عن الرقم المسجَّل، اربطه مرة واحدة وبعد كده هيتعرف عليه تلقائيًا.</p>
          <SearchBox value={q} onChange={setQ} placeholder="ابحث بالاسم أو الرقم" />
          <List className="max-h-72 overflow-y-auto">
            {matches.map((s) => (
              <Row key={s.id} onClick={busy ? undefined : () => link(s)}>
                <p className="font-medium text-chalk">{s.name}</p>
                <p className="font-mono text-xs text-fog" dir="ltr">
                  {s.code}
                  {s.barcode ? ` · ${s.barcode}` : ""}
                </p>
              </Row>
            ))}
            {!matches.length && <p className="p-4 text-center text-sm text-fog">لا نتائج</p>}
          </List>
        </div>
      )}
    </Sheet>
  );
}

