"use client";
/**
 * One person across the join application, the family list, the app account, forms and events: one
 * card, each part shown only to whoever's permission covers it (from staff_person). No national ID or
 * address on it — the family list itself stays where it is.
 */
import { fmt, rpc } from "./core";
import { Badge, Card, go, useAsync } from "./ui";

type Person = {
  student?: { id: string; code: string; name: string; group: string | null; active: boolean; member_until: string | null };
  applications?: { id: string; ref: string; status: string; track: string | null; at: string; family_ready: boolean }[];
  family?: { ref: string; year: string; status: string; level: number | null }[];
  forms?: { form: string; title: string; ref: string; status: string; paid: boolean; at: string }[];
  events?: { event: string; title: string; status: string; inside: boolean; at: string }[];
  strikes?: { outcome: "warning" | "ban"; what: string | null; at: string; lifted: boolean }[];
};

const APP: Record<string, string> = { new: "جديد", contacted: "اتواصلنا", interview: "مقابلة", accepted: "مقبول", waitlist: "انتظار", rejected: "مرفوض" };
const FORM: Record<string, string> = { new: "جديد", accepted: "مقبول", waiting: "انتظار", rejected: "مرفوض" };
const EVENT: Record<string, string> = { going: "مؤكَّد", waitlist: "انتظار", cancelled: "لغى" };

export function PersonCard({ student, phone, hide }: { student?: string | null; phone?: string | null; /** The part the screen already shows. */ hide?: "student" | "application" }) {
  const { data } = useAsync(() => (student || phone ? rpc<Person | null>("staff_person", { p_student: student ?? null, p_phone: phone ?? null }) : Promise.resolve(null)), [student, phone]);
  if (!data) return null;
  const apps = data.applications ?? [];
  const parts = [
    data.student && hide !== "student" && (
      <Line key="s" label="حساب التطبيق" onClick={() => go(`/staff/students?q=${encodeURIComponent(data.student!.code)}`)}>
        {`${data.student.name} · ${data.student.code}${data.student.group ? ` · ${data.student.group}` : ""}`}
        {!data.student.active && <Badge tone="muted">موقوف</Badge>}
        {data.student.member_until && <span className="text-xs text-fog">{`العضوية لحد ${fmt.day(data.student.member_until)}`}</span>}
      </Line>
    ),
    hide !== "application" &&
      apps.map((a) => (
        <Line key={a.id} label="طلب الانضمام" onClick={() => go(`/staff/applications/${a.id}`)}>
          {`${a.ref} · ${APP[a.status] ?? a.status} · ${fmt.day(a.at)}`}
          {a.status === "accepted" && !a.family_ready && <Badge tone="warn">لسه مكمّلش بيانات الأسرة</Badge>}
        </Line>
      )),
    (data.family ?? []).map((f) => (
      <Line key={f.ref} label="قائمة الأسرة" onClick={() => go("/staff/family")}>
        {`${f.ref} · ${f.year}${f.level ? ` · فرقة ${f.level}` : ""}`}
      </Line>
    )),
    (data.forms ?? []).slice(0, 8).map((r) => (
      <Line key={r.ref} label="فورم" onClick={() => go(`/staff/forms/${r.form}/responses`)}>
        {`${r.title} · ${FORM[r.status] ?? r.status}${r.paid ? " · دفع" : ""}`}
      </Line>
    )),
    (data.events ?? []).slice(0, 6).map((e, i) => (
      <Line key={`${e.event}${i}`} label="فعالية" onClick={() => go(`/staff/events/${e.event}`)}>
        {`${e.title} · ${EVENT[e.status] ?? e.status}${e.inside ? " · حضر" : ""}`}
      </Line>
    )),
    (data.strikes ?? []).map((k, i) => (
      <Line key={`k${i}`} label={k.outcome === "ban" ? "حظر" : "إنذار"}>
        {`${k.what ?? ""} · ${fmt.day(k.at)}${k.lifted ? " · اتشال" : ""}`}
      </Line>
    )),
  ]
    .flat()
    .filter(Boolean);
  if (!parts.length) return null;
  return (
    <Card className="grid gap-1" data-testid="person-card">
      <p className="mb-1 text-sm font-semibold text-chalk">نفس الشخص في باقي الأماكن</p>
      {parts}
      <p className="mt-1 text-[11px] text-fog">مربوطين بالحساب أو برقم الموبايل. كل جزء بيظهر حسب صلاحيتك.</p>
    </Card>
  );
}

function Line({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  const body = (
    <>
      <span className="w-24 shrink-0 text-xs text-fog">{label}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-mist">{children}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex items-start gap-2 rounded-lg px-1 py-1 text-start hover:bg-white/[0.04]">
      {body}
    </button>
  ) : (
    <div className="flex items-start gap-2 px-1 py-1">{body}</div>
  );
}
