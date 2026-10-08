"use client";
/** Points and badges: the student's own screen and the staff leaderboard (computed in the database, see 20261007170000_points_badges.sql). */
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { errorText, must, rpc, sb, studentRpc } from "./core";
import { groupsOf, useStudents } from "./staff-data";
import { Button, Card, Chip, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, Section, Sheet, Stat, Toggle, TopBar, toast, useAsync, type IconKey } from "./ui";

export const BADGES: Record<string, { ar: string; hint: string; icon: IconKey; color: string }> = {
  first_step: { ar: "أول خطوة", hint: "حضرت أول جلسة", icon: "check", color: "#38dcff" },
  regular: { ar: "ملتزم", hint: "حضرت 10 جلسات", icon: "calendar", color: "#5a90ff" },
  iron: { ar: "حديدي", hint: "حضرت 25 جلسة", icon: "shield", color: "#c9d6e8" },
  quiz_runner: { ar: "كويزاتي", hint: "حليت 5 كويزات", icon: "quiz", color: "#a78bfa" },
  full_marks: { ar: "الدرجة النهائية", hint: "قفلت كويز", icon: "star", color: "#e8b45c" },
  genius: { ar: "عبقري", hint: "قفلت 5 كويزات", icon: "award", color: "#f59e0b" },
  certified: { ar: "معاه شهادة", hint: "خدت شهادة", icon: "award", color: "#34d399" },
  social: { ar: "اجتماعي", hint: "حضرت 3 فعاليات", icon: "users", color: "#f472b6" },
  team_star: { ar: "نجم الفريق", hint: "50 نقطة تقدير من الفريق", icon: "star", color: "#fde047" },
};

export const POINT_RULES = "الحضور 10 (متأخر 6) · كل كويز لحد 20 · كل تاسك لحد 20 · الشهادة 30 · الفعالية 15 · ونقاط تقدير من الفريق";

function Badge_({ k, dim }: { k: string; dim?: boolean }) {
  const b = BADGES[k];
  if (!b) return null;
  return (
    <div className={cn("flex flex-col items-center gap-1.5 rounded-2xl border border-[var(--line)] p-3 text-center", dim && "opacity-35 grayscale")}>
      <span className="flex size-11 items-center justify-center rounded-full" style={{ background: `${b.color}22`, color: b.color }}>
        <Icon name={b.icon} size={22} />
      </span>
      <span className="text-[13px] font-semibold text-chalk">{b.ar}</span>
      <span className="text-[11px] leading-snug text-fog">{b.hint}</span>
    </div>
  );
}

type Mine = { points: number; rank?: number; of?: number; group?: string; breakdown?: Record<string, number>; badges: string[]; top: { name: string; points: number; me: boolean }[] };

export function useMyPoints() {
  return useAsync(() => studentRpc<Mine>("student_points"), []);
}

/** Small card on the student home. */
export function PointsCard() {
  const { data } = useMyPoints();
  if (!data) return null;
  return (
    <a href="#/me/points" className="mt-3 flex items-center gap-4 rounded-3xl border border-gold/30 bg-gradient-to-l from-gold/10 to-transparent p-5">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gold/15 text-gold">
        <Icon name="star" size={28} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-chalk">
          <span className="font-mono text-2xl">{data.points}</span> نقطة
        </p>
        <p className="mt-0.5 text-xs text-fog">{data.rank ? `ترتيبك ${data.rank} من ${data.of} في مجموعتك · ${data.badges.length} وسام` : "احضر وحل كويزات عشان تجمع نقاط"}</p>
      </div>
      <Icon name="chevron" size={18} className="rotate-180 text-fog" />
    </a>
  );
}

/** /me/points */
export function MyPoints() {
  const { data, error, loading, reload } = useMyPoints();
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error ?? "مقدرناش نحمّل النقاط"} retry={reload} />;
  const b = data.breakdown ?? {};
  return (
    <>
      <TopBar title="نقاطي وأوسمتي" back="/me" />
      <Card className="flex items-center gap-4 border-gold/30">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-gold/15 text-gold">
          <Icon name="star" size={32} />
        </span>
        <div>
          <p className="font-mono text-4xl font-bold text-chalk">{data.points}</p>
          <p className="text-sm text-fog">{data.rank ? `الترتيب ${data.rank} من ${data.of}${data.group ? ` · ${data.group}` : ""}` : "نقطة"}</p>
        </div>
      </Card>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <Stat label="جلسات" value={b.attended ?? 0} />
        <Stat label="كويزات" value={b.quizzes ?? 0} />
        <Stat label="تاسكات" value={b.tasks ?? 0} />
        <Stat label="فعاليات" value={b.events ?? 0} />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fog">{POINT_RULES}</p>

      <Section title={`الأوسمة (${data.badges.length} من ${Object.keys(BADGES).length})`}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {Object.keys(BADGES).map((k) => (
            <Badge_ key={k} k={k} dim={!data.badges.includes(k)} />
          ))}
        </div>
      </Section>

      {data.top.length > 1 && (
        <Section title="أعلى 10 في مجموعتك">
          <List>
            {data.top.map((t, i) => (
              <Row key={`${t.name}-${i}`} chevron={false} className={cn(t.me && "bg-volt/10")}>
                <div className="flex items-center gap-3">
                  <span className={cn("w-7 text-center font-mono font-bold", i < 3 ? "text-gold" : "text-fog")}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-chalk">
                    <bdi>{t.name}</bdi>
                    {t.me && " (انت)"}
                  </span>
                  <span className="font-mono text-chalk">{t.points}</span>
                </div>
              </Row>
            ))}
          </List>
        </Section>
      )}
    </>
  );
}

type Line = { id: string; name: string; group: string; points: number; attended: number; quizzes: number; perfect: number; certs: number; events: number; bonus: number; badges: string[] };

/** /staff/leaderboard */
export function LeaderboardScreen() {
  const students = useStudents();
  const groups = useMemo(() => groupsOf(students.list), [students.list]);
  const [group, setGroup] = useState("");
  const { data, error, loading, reload } = useAsync(() => rpc<Line[]>("staff_leaderboard", { p_group: group || null }), [group]);
  const [giving, setGiving] = useState<Line | null>(null);

  return (
    <>
      <TopBar title="النقاط والأوسمة" sub={POINT_RULES} back="/staff/more" />
      <HallOfFameCard lines={data ?? []} />
      {groups.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip active={!group} onClick={() => setGroup("")}>
            الكل
          </Chip>
          {groups.map((g) => (
            <Chip key={g} active={group === g} onClick={() => setGroup(g)}>
              {g}
            </Chip>
          ))}
        </div>
      )}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty icon="star" title="لسه مفيش طلاب" body="النقاط بتتحسب لوحدها من الحضور والكويزات والشهادات والفعاليات." />
      ) : (
        <List className="mt-3">
          {data.map((l, i) => (
            <Row key={l.id} onClick={() => setGiving(l)}>
              <div className="flex items-center gap-3">
                <span className={cn("w-7 text-center font-mono font-bold", i < 3 ? "text-gold" : "text-fog")}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-chalk">
                    <bdi>{l.name}</bdi>
                  </p>
                  <p className="truncate text-xs text-fog">
                    {l.group || "—"} · حضور {l.attended} · كويزات {l.quizzes}
                    {l.bonus ? ` · تقدير ${l.bonus > 0 ? "+" : ""}${l.bonus}` : ""}
                  </p>
                  {l.badges.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {l.badges.map((b) => (
                        <span key={b} title={BADGES[b]?.ar} className="flex size-5 items-center justify-center rounded-full" style={{ background: `${BADGES[b]?.color}22`, color: BADGES[b]?.color }}>
                          <Icon name={BADGES[b]?.icon ?? "star"} size={12} />
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <span className="font-mono text-lg font-bold text-chalk">{l.points}</span>
              </div>
            </Row>
          ))}
        </List>
      )}
      {giving && (
        <BonusSheet
          line={giving}
          onClose={() => setGiving(null)}
          onDone={() => {
            setGiving(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function BonusSheet({ line, onClose, onDone }: { line: Line; onClose: () => void; onDone: () => void }) {
  const [points, setPoints] = useState(10);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const give = async () => {
    if (reason.trim().length < 2) return toast("اكتب السبب (بيظهر في سجل النشاط)", "error");
    setBusy(true);
    try {
      await sb().from("student_bonus").insert({ student_id: line.id, points, reason: reason.trim() }).then(must);
      toast(`${points > 0 ? "+" : ""}${points} لـ ${line.name}`);
      onDone();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`نقاط تقدير لـ ${line.name}`}>
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {[5, 10, 20, 50, -5, -10].map((n) => (
            <Chip key={n} active={points === n} onClick={() => setPoints(n)}>
              {n > 0 ? `+${n}` : n}
            </Chip>
          ))}
        </div>
        <Field label="السبب" hint="مثلاً: ساعد زمايله في المشروع، قدّم ورشة…">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={140} />
        </Field>
        <Button variant="primary" size="lg" block loading={busy} onClick={give}>
          {points > 0 ? `إضافة ${points} نقطة` : `خصم ${-points} نقطة`}
        </Button>
      </div>
    </Sheet>
  );
}

type Hof = { show: boolean; count: number; star: { student_id: string; reason_ar: string; reason_en: string; month: string } | null };

/** The website's hall of fame: show the top students, and pick a member of the month. */
function HallOfFameCard({ lines }: { lines: Line[] }) {
  const { data, set } = useAsync(async () => {
    const r = (await sb().from("site_settings").select("value").eq("key", "hall_of_fame").maybeSingle().then(must)) as { value: Partial<Hof> } | null;
    return { show: false, count: 10, star: null, ...(r?.value ?? {}) } as Hof;
  }, []);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const save = async (next: Hof, msg = "اتحفظ على الموقع") => {
    setBusy(true);
    try {
      await sb().from("site_settings").upsert({ key: "hall_of_fame", value: next }).then(must);
      set(next);
      toast(msg);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const star = data.star;
  const starName = star ? (lines.find((l) => l.id === star.student_id)?.name ?? "—") : "";
  return (
    <Card className="mb-4 grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-chalk">لوحة الشرف على الموقع</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? "إخفاء" : "تعديل"}
        </Button>
      </div>
      <p className="text-sm text-mist">
        {data.show ? `الموقع بيعرض أعلى ${data.count} (الاسم الأول + أول حرف من التاني بس)` : "الترتيب مش ظاهر على الموقع"}
        {star ? ` · نجم الشهر: ${starName}` : ""}
      </p>
      {open && (
        <>
          <Toggle checked={data.show} disabled={busy} onChange={(v) => save({ ...data, show: v }, v ? "الترتيب ظاهر على الموقع" : "الترتيب اتخفى")} label="اعرض أعلى الطلاب على الموقع" hint="الأسماء بتظهر مختصرة، ومن غير أرقام أو بيانات تانية." />
          <Field label="العدد">
            <Input type="number" min={3} max={20} value={data.count} onChange={(e) => set({ ...data, count: Math.min(20, Math.max(3, Number(e.target.value) || 10)) })} onBlur={() => save(data)} />
          </Field>
          <Field label="نجم الشهر" hint="بيظهر في كارت لوحده على الصفحة الرئيسية، باسمه الأول والتاني.">
            <select
              className="h-11 w-full rounded-xl border border-[var(--line-2)] bg-void/60 px-3 text-chalk"
              value={star?.student_id ?? ""}
              onChange={(e) => set({ ...data, star: e.target.value ? { student_id: e.target.value, reason_ar: star?.reason_ar ?? "", reason_en: star?.reason_en ?? "", month: star?.month ?? new Date().toISOString().slice(0, 7) } : null })}
            >
              <option value="">— مفيش —</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.points})
                </option>
              ))}
            </select>
          </Field>
          {star && (
            <>
              <Field label="ليه؟ (عربي)">
                <Input maxLength={200} value={star.reason_ar} placeholder="مثلاً: حضر كل الجلسات وقاد فريق السومو في التحدي" onChange={(e) => set({ ...data, star: { ...star, reason_ar: e.target.value } })} />
              </Field>
              <Field label="Why? (English)">
                <Input dir="ltr" maxLength={200} value={star.reason_en} onChange={(e) => set({ ...data, star: { ...star, reason_en: e.target.value } })} />
              </Field>
              <Field label="الشهر">
                <Input type="month" value={star.month} onChange={(e) => set({ ...data, star: { ...star, month: e.target.value } })} />
              </Field>
            </>
          )}
          <Button size="sm" variant="primary" loading={busy} onClick={() => save(data)}>
            حفظ
          </Button>
        </>
      )}
    </Card>
  );
}

