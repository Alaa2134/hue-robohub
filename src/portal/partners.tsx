"use client";
/**
 * Partners and verified impact reports (under the sponsor report). Each partner gets a private link
 * to their page on the site, which lists the reports issued for them. Issuing a report freezes the
 * month's numbers from the records under a code; anyone with the code checks it on /verify/report.
 * A report can be withdrawn with a reason, never edited.
 */
import { useState } from "react";
import { errorText, fmt, publicOrigin, rpc } from "./core";
import { Badge, Button, Card, Field, Input, Select, Sheet, Toggle, toast, useAsync } from "./ui";

type Partner = { id: string; name: string; contact: string; token: string; active: boolean; reports: number };
type Report = { id: string; code: string; partner: string | null; from: string; to: string; issued_at: string; revoked_at: string | null; revoked_reason: string | null };

export const portalUrl = (token: string) => `${publicOrigin()}/ar/partner/?t=${token}`;
export const reportUrl = (code: string) => `${publicOrigin()}/ar/verify/report/?c=${code}`;
/** "2026-10" → its first and last day. */
const monthRange = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, "0")}` };
};
const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast("اتنسخ"));

function PartnerSheet({ p, onClose, onSaved }: { p: Partner | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(p?.name ?? "");
  const [contact, setContact] = useState(p?.contact ?? "");
  const [active, setActive] = useState(p?.active ?? true);
  const [busy, setBusy] = useState(false);
  const save = async (newLink = false) => {
    setBusy(true);
    try {
      const r = await rpc<{ ok: boolean; error?: string }>("staff_partner_save", { p_id: p?.id ?? null, p_name: name, p_contact: contact, p_active: active, p_new_link: newLink });
      if (!r.ok) return toast("اكتب اسم الشريك", "error");
      toast(newLink ? "اتعمل لينك جديد — القديم وقف" : "اتحفظ");
      onSaved();
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={p ? p.name : "شريك جديد"}>
      <div className="grid gap-3">
        <Field label="اسم الشريك">
          <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="مين بنتواصل معاه (للفريق بس)">
          <Input value={contact} maxLength={200} onChange={(e) => setContact(e.target.value)} />
        </Field>
        <Toggle checked={active} onChange={setActive} label="صفحة الشريك شغالة" />
        <Button loading={busy} onClick={() => void save()}>
          حفظ
        </Button>
        {p && (
          <Button variant="ghost" disabled={busy} onClick={() => confirm("اللينك القديم هيبطل يشتغل. متأكد؟") && void save(true)}>
            لينك جديد للشريك
          </Button>
        )}
      </div>
    </Sheet>
  );
}

export function PartnersPanel() {
  const { data, reload } = useAsync(() => rpc<{ partners: Partner[]; reports: Report[] }>("staff_partners"), []);
  const [editing, setEditing] = useState<Partner | "new" | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(0); // last month: a finished period
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [partner, setPartner] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const issue = async () => {
    setBusy("issue");
    try {
      const { from, to } = monthRange(month);
      const r = await rpc<{ ok: boolean; error?: string; code?: string }>("staff_impact_issue", { p_partner: partner || null, p_from: from, p_to: to });
      if (!r.ok) return toast(r.error === "future" ? "الشهر لسه مخلصش — اختار شهر خلص" : "معرفتش أصدر التقرير", "error");
      toast(`اتصدر: ${r.code}`);
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };
  const revoke = async (r: Report) => {
    const reason = prompt("سبب السحب (هيظهر لأي حد يتحقق من الكود):");
    if (!reason) return;
    setBusy(r.id);
    try {
      const out = await rpc<{ ok: boolean }>("staff_impact_revoke", { p_id: r.id, p_reason: reason });
      if (!out.ok) return toast("اكتب سبب أطول", "error");
      toast("التقرير اتسحب");
      reload();
    } finally {
      setBusy(null);
    }
  };
  if (!data) return null;
  return (
    <div className="mt-6 grid gap-3" data-testid="partners-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-chalk">الشركاء والتقارير الموثّقة</p>
        <Button variant="secondary" icon="plus" onClick={() => setEditing("new")}>
          شريك جديد
        </Button>
      </div>
      <Card className="grid gap-2 text-sm text-mist">
        <p>التقرير الموثّق بيثبّت أرقام الشهر من السجلات تحت كود (BXR-…). أي حد معاه الكود يشوفه زي ما اتصدر بالظبط، وكل شريك ليه صفحة خاصة بتعرض تقاريره.</p>
      </Card>
      {data.partners.map((p) => (
        <Card key={p.id} className="flex flex-wrap items-center gap-2" data-testid={`partner-${p.name}`}>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-chalk">{p.name}</p>
            <p className="text-xs text-fog">{`${p.reports} تقرير${p.contact ? ` · ${p.contact}` : ""}`}</p>
          </div>
          {!p.active && <Badge>موقوف</Badge>}
          <Button variant="ghost" icon="copy" onClick={() => copy(portalUrl(p.token))}>
            لينك صفحته
          </Button>
          <Button variant="ghost" icon="edit" onClick={() => setEditing(p)}>
            تعديل
          </Button>
        </Card>
      ))}
      <Card className="grid gap-3">
        <p className="font-semibold text-chalk">أصدر تقرير موثّق</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الشهر">
            <Input type="month" dir="ltr" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <Field label="لمين">
            <Select value={partner} onChange={(e) => setPartner(e.target.value)}>
              <option value="">لأي حد (من غير شريك)</option>
              {data.partners
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        <Button loading={busy === "issue"} disabled={!/^\d{4}-\d{2}$/.test(month)} onClick={() => void issue()}>
          أصدر التقرير
        </Button>
      </Card>
      {data.reports.map((r) => (
        <Card key={r.id} className="flex flex-wrap items-center gap-2" data-testid={`report-${r.code}`}>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm text-chalk" dir="ltr">
              {r.code}
            </p>
            <p className="text-xs text-fog">{`${r.partner ?? "عام"} · ${r.from} → ${r.to} · ${fmt.short(r.issued_at)}`}</p>
            {r.revoked_reason && <p className="text-xs text-danger">{`اتسحب: ${r.revoked_reason}`}</p>}
          </div>
          <Button variant="ghost" icon="copy" onClick={() => copy(reportUrl(r.code))}>
            لينك التحقق
          </Button>
          {!r.revoked_at && (
            <Button variant="ghost" loading={busy === r.id} onClick={() => void revoke(r)}>
              اسحب
            </Button>
          )}
        </Card>
      ))}
      {editing && <PartnerSheet p={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  );
}
