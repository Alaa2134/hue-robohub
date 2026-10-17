"use client";
/**
 * Attendance from an ordinary form: whoever registers gets a QR (on the website, saved to their phone),
 * and the team scans it here at each session. Sessions can be for everyone or only for those who
 * picked a given answer (e.g. a group or a day), so the absent list is only the people expected.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormField } from "@/components/forms/site-forms";
import { whatsappLink } from "@/lib/contact";
import { cn } from "@/lib/cn";
import { errorText, fmt, must, rpc, sb, toLocalInput, fromLocalInput, today } from "./core";
import { Scanner } from "./scanner";
import { downloadXlsx } from "./xlsx";
import { Button, Card, Chip, Empty, ErrorBox, Field, Icon, IconButton, Input, List, Loading, SearchBox, Section, Select, Stat, Toggle, TopBar, copyText, useAsync } from "./ui";

export type AttendSession = { id: string; name: string; at?: string | null; only?: string | null };
export type Attendance = { on: boolean; by?: string | null; sessions?: AttendSession[] };

const SITE = "https://buildxhue.com";
/** The QR's own page on the website (what the QR holds). */
export const passLink = (token: string) => `${SITE}/ar/form/?pass=${token.toLowerCase()}`;
/** A form's sessions; one called «الحضور» when none were added (same rule as the database). */
export const sessionsOf = (a: Attendance | null | undefined): AttendSession[] => (a?.sessions?.length ? a.sessions : [{ id: "main", name: "الحضور" }]);
const sid = () => `s_${Math.random().toString(36).slice(2, 8)}`;
const txt = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join("، ") : (v ?? ""));

/** Is a session for this answer set (same rule as the database)? */
export function sessionFor(a: Attendance | null | undefined, s: AttendSession, answers: Record<string, string | string[]>) {
  if (!s.only || !a?.by) return true;
  const v = answers[a.by];
  return Array.isArray(v) ? v.includes(s.only) : v === s.only;
}

/** In the form editor: turn the QR on, add sessions, and (optionally) tie each to an answer. */
export function AttendanceSettings({ value, fields, onChange }: { value: Attendance | null; fields: FormField[]; onChange: (a: Attendance | null) => void }) {
  const a: Attendance = value ?? { on: false };
  const choices = fields.filter((q) => q.type === "select" || q.type === "multi");
  const by = choices.find((q) => q.id === a.by) ?? null;
  const list = a.sessions ?? [];
  const set = (p: Partial<Attendance>) => onChange({ ...a, ...p });
  const setSession = (i: number, p: Partial<AttendSession>) => set({ sessions: list.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  return (
    <Card className="grid gap-3" data-testid="attendance-settings">
      <Toggle
        checked={a.on}
        onChange={(v) => onChange(v ? { ...a, on: true } : a.sessions?.length || a.by ? { ...a, on: false } : null)}
        label="كل اللي يسجّل ياخد QR للحضور"
        hint="بعد ما يبعت الفورم بيطلعله QR يحفظه على موبايله، وإنتوا بتمسحوه عند الدخول من «الحضور بالـ QR» في الردود."
      />
      {a.on && (
        <>
          <Field label="قسّم المواعيد حسب سؤال (اختياري)" hint="مثلاً «المجموعة» أو «اليوم»: كل موعد يبقى لأصحاب إجابة معيّنة بس، والغياب يتحسب عليهم هما بس.">
            <Select value={a.by ?? ""} onChange={(e) => set({ by: e.target.value || null, sessions: list.map((s) => ({ ...s, only: null })) })} data-testid="attendance-by">
              <option value="">من غير تقسيم — كل المواعيد للكل</option>
              {choices.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label_ar}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-2">
            <p className="text-sm font-semibold text-chalk">مواعيد الحضور</p>
            {!list.length && <p className="text-xs text-fog">من غير مواعيد بيبقى في حضور واحد اسمه «الحضور». ضيف مواعيد لو الكورس أكتر من محاضرة.</p>}
            {list.map((s, i) => (
              <div key={s.id} className="grid gap-2 rounded-2xl border border-[var(--line)] p-3" data-testid="attendance-session">
                <div className="flex items-center gap-2">
                  <Input value={s.name} maxLength={80} placeholder={`محاضرة ${i + 1}`} onChange={(e) => setSession(i, { name: e.target.value })} aria-label="اسم الموعد" className="flex-1" />
                  <IconButton icon="trash" label="شيل الموعد" onClick={() => set({ sessions: list.filter((_, j) => j !== i) })} />
                </div>
                <div className={cn("grid gap-2", by && "sm:grid-cols-2")}>
                  <Input type="datetime-local" value={toLocalInput(s.at)} onChange={(e) => setSession(i, { at: fromLocalInput(e.target.value) })} aria-label="الميعاد" dir="ltr" />
                  {by && (
                    <Select value={s.only ?? ""} onChange={(e) => setSession(i, { only: e.target.value || null })} aria-label="لمين">
                      <option value="">للكل</option>
                      {(by.options ?? []).map((o) => (
                        <option key={o.ar} value={o.ar}>
                          {`لـ «${o.ar}» بس`}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              </div>
            ))}
            <Button size="sm" icon="plus" onClick={() => set({ sessions: [...list, { id: sid(), name: `محاضرة ${list.length + 1}`, at: null, only: null }] })} disabled={list.length >= 60}>
              موعد
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

/** Checks before saving the form. */
export function attendanceProblem(a: Attendance | null | undefined): string | null {
  if (!a?.on) return null;
  if ((a.sessions ?? []).some((s) => !s.name.trim())) return "في موعد حضور من غير اسم";
  return null;
}

type Resp = { id: string; ref: string; name: string | null; phone: string | null; status: string; answers: Record<string, string | string[]>; pass: string | null };
type Mark = { response_id: string; session: string; present: boolean; at: string; method: string };
type FormRow = { id: string; title_ar: string; slug: string; fields: FormField[]; attendance: Attendance | null };
type MarkOut = { ok: boolean; error?: string; already?: boolean; id?: string; name?: string | null; ref?: string; status?: string; at?: string; present?: boolean; answer?: string | string[]; form?: string };
type Flash = { tone: "ok" | "warn" | "danger"; text: string; force?: { code: string; name: string } };

/** The scan, the list of who came and who's absent per session, and the Excel sheet. */
export function FormAttendance({ id }: { id: string }) {
  const { data, error, loading, reload, set } = useAsync(async () => {
    const [form, responses, marks] = await Promise.all([
      sb().from("forms").select("id, title_ar, slug, fields, attendance").eq("id", id).single().then(must) as Promise<FormRow>,
      sb().from("form_responses").select("id, ref, name, phone, status, answers, pass").eq("form_id", id).neq("status", "rejected").order("created_at").limit(5000).then(must) as Promise<Resp[]>,
      sb().from("form_attendance").select("response_id, session, present, at, method, form_responses!inner(form_id)").eq("form_responses.form_id", id).limit(50000).then(must) as Promise<Mark[]>,
    ]);
    return { form, responses, marks };
  }, [id]);
  const sessions = sessionsOf(data?.form.attendance);
  const [session, setSession] = useState<string>("");
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [code, setCode] = useState("");
  const [show, setShow] = useState<"all" | "in" | "out">("all");
  const [q, setQ] = useState("");
  const last = useRef<{ raw: string; at: number }>({ raw: "", at: 0 });

  // Start on the session nearest to now.
  useEffect(() => {
    if (!data || session) return;
    const now = Date.now();
    const timed = sessions.filter((s) => s.at).sort((x, y) => Math.abs(new Date(x.at!).getTime() - now) - Math.abs(new Date(y.at!).getTime() - now));
    setSession(timed[0]?.id ?? sessions[0].id);
  }, [data, session, sessions]);

  const cur = sessions.find((s) => s.id === session) ?? sessions[0];
  const attendance = data?.form.attendance;
  const byField = data?.form.fields.find((fl) => fl.id === attendance?.by);
  const marks = useMemo(() => new Map((data?.marks ?? []).map((m) => [`${m.response_id}:${m.session}`, m])), [data]);
  const here = (r: Resp, s: AttendSession) => !!marks.get(`${r.id}:${s.id}`)?.present;
  const expected = useMemo(() => (data?.responses ?? []).filter((r) => sessionFor(attendance, cur, r.answers)), [data, attendance, cur]);
  const inside = expected.filter((r) => here(r, cur));
  const shown = expected.filter((r) => {
    if (show === "in" && !here(r, cur)) return false;
    if (show === "out" && here(r, cur)) return false;
    const s = q.trim().toLowerCase();
    return !s || [r.name, r.phone, r.ref].some((v) => v?.toLowerCase().includes(s));
  });

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  if (!attendance?.on)
    return (
      <>
        <TopBar title="الحضور بالـ QR" sub={data.form.title_ar} back={`/staff/forms/${id}/responses`} />
        <Empty icon="qr" title="الحضور مش متفعّل في الفورم ده" body="فعّله من صفحة الفورم في «الحضور بالـ QR»." />
      </>
    );

  const apply = (out: MarkOut) => {
    if (!out.id) return;
    const key = `${out.id}:${cur.id}`;
    const next = new Map(marks);
    next.set(key, { response_id: out.id, session: cur.id, present: out.present ?? true, at: out.at ?? new Date().toISOString(), method: "qr" });
    set({ ...data, marks: [...next.values()] });
  };

  const mark = async (args: { code?: string; response?: string; present?: boolean; force?: boolean }) => {
    setBusy(true);
    try {
      const out = await rpc<MarkOut>("staff_form_mark", { p_form: id, p_session: cur.id, p_code: args.code ?? null, p_response: args.response ?? null, p_present: args.present ?? true, p_force: !!args.force });
      if (out.ok) {
        apply(out);
        if (args.response) return;
        setFlash(
          out.already
            ? { tone: "warn", text: `${out.name ?? out.ref} متسجّل حاضر من قبل ${out.at ? fmt.time(out.at) : ""}` }
            : { tone: "ok", text: `✓ ${out.name ?? out.ref} حاضر${out.status === "new" ? "" : out.status === "accepted" ? "" : ` (${out.status})`}` },
        );
      } else if (out.error === "not_this_session" && args.code)
        setFlash({ tone: "warn", text: `${out.name ?? out.ref} مش من «${cur.name}» (اختار: ${txt(out.answer)})`, force: { code: args.code, name: out.name ?? out.ref ?? "" } });
      else if (out.error === "other_form") setFlash({ tone: "danger", text: `ده QR فورم تاني: «${out.form ?? ""}» (${out.name ?? ""})` });
      else setFlash({ tone: "danger", text: "الكود ده مش لاقيينه في الفورم ده" });
    } catch (e) {
      setFlash({ tone: "danger", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const onScan = (raw: string) => {
    const now = Date.now();
    if (raw === last.current.raw && now - last.current.at < 4000) return;
    last.current = { raw, at: now };
    void mark({ code: raw });
  };

  const exportXlsx = () => {
    const rows = data.responses;
    downloadXlsx(
      `buildx-attendance-${data.form.slug}-${today()}.xlsx`,
      [
        ["#", "الاسم", "الموبايل", "الكود", ...(byField ? [byField.label_ar] : []), ...sessions.map((s) => s.name + (s.only ? ` (${s.only})` : "")), "حضر", "من", "النسبة"],
        ...rows.map((r, i) => {
          const mine = sessions.filter((s) => sessionFor(attendance, s, r.answers));
          const n = mine.filter((s) => here(r, s)).length;
          return [
            i + 1,
            r.name ?? "",
            r.phone ?? "",
            r.ref,
            ...(byField ? [txt(r.answers[byField.id])] : []),
            ...sessions.map((s) => (!sessionFor(attendance, s, r.answers) ? "—" : here(r, s) ? "ح" : "غ")),
            n,
            mine.length,
            mine.length ? `${Math.round((n / mine.length) * 100)}%` : "",
          ];
        }),
        [],
        ["ح = حاضر، غ = غايب، — = الموعد مش ليه"],
      ],
      { sheet: "الحضور", rtl: true },
    );
  };

  const absent = expected.filter((r) => !here(r, cur));
  const absentMsg = `أهلاً، معاك فريق BuildX HUE. افتقدناك النهارده في «${cur.name}» من «${data.form.title_ar}». كله تمام؟`;

  return (
    <>
      <TopBar
        title="الحضور بالـ QR"
        sub={data.form.title_ar}
        back={`/staff/forms/${id}/responses`}
        actions={
          <Button size="sm" icon="download" onClick={exportXlsx} data-testid="attendance-xlsx">
            Excel
          </Button>
        }
      />
      {sessions.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" data-testid="attendance-sessions">
          {sessions.map((s) => {
            const exp = data.responses.filter((r) => sessionFor(attendance, s, r.answers));
            return (
              <Chip key={s.id} active={s.id === cur.id} onClick={() => setSession(s.id)} count={exp.filter((r) => here(r, s)).length}>
                {s.name}
                {s.at && <span className="text-fog">· {fmt.short(s.at)}</span>}
              </Chip>
            );
          })}
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2" data-testid="attendance-stats">
        <Stat label="حضروا" value={inside.length} tone="ok" />
        <Stat label="غايبين" value={expected.length - inside.length} tone={expected.length - inside.length ? "danger" : undefined} />
        <Stat label="المتوقعين" value={expected.length} sub={cur.only ? `لـ «${cur.only}»` : undefined} />
      </div>

      <Card className="mt-4 grid gap-3">
        <Button variant={scan ? "secondary" : "primary"} icon="scan" onClick={() => setScan((v) => !v)} data-testid="attendance-scan">
          {scan ? "اقفل الكاميرا" : `امسح الـ QR — ${cur.name}`}
        </Button>
        {scan && <Scanner onDetect={onScan} paused={busy} className="aspect-square w-full overflow-hidden rounded-2xl sm:aspect-video" />}
        {flash && (
          <div
            role="status"
            data-testid="attendance-flash"
            className={cn(
              "grid gap-2 rounded-2xl border px-4 py-3 text-[15px] font-semibold",
              flash.tone === "ok" ? "border-ok/40 bg-ok/10 text-[#7cf0c6]" : flash.tone === "warn" ? "border-warn/40 bg-warn/10 text-[#ffd08a]" : "border-danger/40 bg-danger/10 text-[#ff9aa5]",
            )}
          >
            <span translate="no">{flash.text}</span>
            {flash.force && (
              <Button
                size="sm"
                onClick={() => {
                  const f = flash.force!;
                  setFlash(null);
                  void mark({ code: f.code, force: true });
                }}
              >
                سجّله حاضر برضه
              </Button>
            )}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void mark({ code: code.trim() });
            setCode("");
          }}
        >
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="أو اكتب كود الطلب F-XXXXXXXX" dir="ltr" aria-label="كود الطلب" className="flex-1" />
          <Button type="submit" loading={busy} disabled={!code.trim()}>
            سجّل
          </Button>
        </form>
      </Card>

      <Section title={`${cur.name}${cur.at ? ` · ${fmt.dateTime(cur.at)}` : ""}`}>
        <SearchBox value={q} onChange={setQ} placeholder="اسم، موبايل أو كود…" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip active={show === "all"} onClick={() => setShow("all")} count={expected.length}>
            الكل
          </Chip>
          <Chip active={show === "in"} onClick={() => setShow("in")} count={inside.length}>
            حضروا
          </Chip>
          <Chip active={show === "out"} onClick={() => setShow("out")} count={absent.length}>
            غايبين
          </Chip>
        </div>
        {show === "out" && absent.some((r) => r.phone) && (
          <Button size="sm" icon="copy" className="mt-3" onClick={() => copyText(absent.map((r) => `${r.name ?? r.ref} — ${r.phone ?? ""}`).join("\n"), "اتنسخت أسماء الغايبين وأرقامهم")}>
            انسخ الغايبين وأرقامهم
          </Button>
        )}
        {!shown.length ? (
          <Empty icon="users" title={expected.length ? "مفيش حد هنا" : "لسه محدش سجّل للموعد ده"} />
        ) : (
          <List className="mt-3">
            {shown.map((r) => {
              const m = marks.get(`${r.id}:${cur.id}`);
              const ok = !!m?.present;
              const wa = whatsappLink(r.phone, absentMsg);
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3" data-testid="attendance-row">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-chalk" translate="no">
                      {r.name ?? "—"}
                    </p>
                    <p className="truncate text-xs text-fog">
                      <span dir="ltr" className="font-mono">
                        {r.ref}
                      </span>
                      {byField && r.answers[byField.id] ? <> · {txt(r.answers[byField.id])}</> : null}
                      {ok && m ? <> · {`وصل ${fmt.time(m.at)}`}</> : null}
                    </p>
                  </div>
                  {!ok && wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="واتساب" className="flex size-10 items-center justify-center rounded-xl border border-[var(--line-2)] text-[#25d366]">
                      <Icon name="chat" size={18} />
                    </a>
                  )}
                  <Button size="sm" variant={ok ? "ok" : "secondary"} onClick={() => void mark({ response: r.id, present: !ok, force: true })} aria-pressed={ok}>
                    {ok ? "حاضر ✓" : "غايب"}
                  </Button>
                </div>
              );
            })}
          </List>
        )}
      </Section>
    </>
  );
}

/** In a response's details: its QR link to send or open. */
export function PassLinkRow({ pass, phone, name, title }: { pass: string; phone: string | null; name: string | null; title: string }) {
  const link = passLink(pass);
  const wa = whatsappLink(phone, `أهلاً ${(name ?? "").split(/\s+/)[0]}، ده الـ QR بتاعك للحضور في «${title}». احفظه على موبايلك ووريه للفريق عند الدخول:\n${link}`);
  return (
    <div className="grid gap-2 rounded-2xl border border-cyan/30 bg-cyan/5 p-3" data-testid="pass-link">
      <p className="text-xs font-semibold text-ice">QR الحضور</p>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" icon="copy" onClick={() => copyText(link, "اتنسخ لينك الـ QR")}>
          انسخ اللينك
        </Button>
        {wa ? (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center justify-center rounded-xl bg-[#1fa855] text-sm font-semibold text-white">
            ابعته واتساب
          </a>
        ) : (
          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--line-2)] text-sm text-mist">
            افتحه
          </a>
        )}
      </div>
    </div>
  );
}
