/** Admins: who can use the studio, their role and monthly export minutes. */
import { useCallback, useEffect, useState } from "react";
import { api, type Me } from "./api.ts";
import { Icon, toast } from "./ui.tsx";

type Member = { email: string; userId: string | null; role: "admin" | "editor"; active: boolean; monthlyRenderMinutes: number | null };

export function Team({ me }: { me: Me }) {
  const [list, setList] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "admin">("editor");
  const load = useCallback(async () => setList((await api<{ members: Member[] }>("GET", "/admin/members")).members), []);
  useEffect(() => void load().catch((e) => toast((e as Error).message, "bad")), [load]);
  const save = async (m: Partial<Member> & { email: string }) => {
    try {
      const cur = list.find((x) => x.email === m.email);
      await api("POST", "/admin/members", { email: m.email, role: m.role ?? cur?.role ?? "editor", active: m.active ?? cur?.active ?? true, monthlyRenderMinutes: m.monthlyRenderMinutes === undefined ? (cur?.monthlyRenderMinutes ?? null) : m.monthlyRenderMinutes });
      await load();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <a href="#/" className="btn btn-sm mb-6">
        <Icon name="back" size={14} /> المشاريع
      </a>
      <h1 className="mb-1 text-xl font-bold">فريق الاستوديو</h1>
      <p className="mb-6 text-sm text-mute">اللي هنا بس يقدر يدخل. الإيميل لازم يكون نفس حسابه على الموقع.</p>
      <form
        className="card mb-6 flex flex-wrap gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ email, role }).then(() => setEmail(""));
        }}
      >
        <input className="field min-w-[200px] flex-1" type="email" dir="ltr" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <select className="field w-28" value={role} onChange={(e) => setRole(e.target.value as "editor" | "admin")}>
          <option value="editor">محرر</option>
          <option value="admin">أدمن</option>
        </select>
        <button className="btn btn-primary">إضافة</button>
      </form>
      <div className="card divide-y divide-line">
        {list.map((m) => (
          <div key={m.email} className="flex flex-wrap items-center gap-2 p-3">
            <div className="me-auto min-w-0">
              <p className="truncate text-sm" dir="ltr">
                {m.email}
              </p>
              <p className="text-xs text-mute">{m.userId ? "دخل قبل كده" : "لسه مدخلش"}</p>
            </div>
            <select className="field w-24" value={m.role} disabled={m.email === me.email} onChange={(e) => void save({ email: m.email, role: e.target.value as "admin" | "editor" })}>
              <option value="editor">محرر</option>
              <option value="admin">أدمن</option>
            </select>
            <input
              className="field w-28"
              type="number"
              min={0}
              placeholder="دقايق/شهر"
              title="دقايق التصدير في الشهر (فاضي = الافتراضي)"
              defaultValue={m.monthlyRenderMinutes ?? ""}
              onBlur={(e) => void save({ email: m.email, monthlyRenderMinutes: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <button className="btn btn-sm" disabled={m.email === me.email} onClick={() => void save({ email: m.email, active: !m.active })}>
              {m.active ? "إيقاف" : "تفعيل"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
