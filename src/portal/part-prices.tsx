"use client";
/**
 * /staff/part-prices — what the Lab's Project Architect shows students about cost and availability.
 * Prices: one row per shop, with the link and the day the price was checked (older than 30 days is
 * marked as old on the Architect). Store: which store item is which Lab part, so the Architect can
 * say how many are free now. The AI plan is off until turned on here.
 */
import { useMemo, useState } from "react";
import { PARTS } from "@/lab/circuit/parts";
import { can, errorText, rpc, type StaffRow } from "./core";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Select, Sheet, Toggle, TopBar, toast, useAsync } from "./ui";

type Price = { id: string; lab_part: string; label: string; price: number; currency: string; source_name: string; source_url: string | null; checked_on: string };
type Item = { id: string; name: string; lab_part: string | null; quantity: number };

const today = () => new Date().toISOString().slice(0, 10);
const partName = (t: string) => PARTS.find((p) => p.type === t)?.name.ar ?? t;
const old = (d: string) => Date.now() - new Date(`${d}T12:00:00`).getTime() > 30 * 864e5;

function PriceSheet({ p, onClose, onSaved }: { p: Price | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ part: p?.lab_part ?? "led", label: p?.label ?? "", price: p?.price?.toString() ?? "", source: p?.source_name ?? "", url: p?.source_url ?? "", checked: p?.checked_on ?? today() });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await rpc<{ ok: boolean }>("staff_part_price_save", { p_id: p?.id ?? null, p_part: f.part, p_label: f.label, p_price: Number(f.price), p_source: f.source, p_url: f.url, p_checked: f.checked });
      if (!r.ok) return toast("راجع السعر واسم المحل والتاريخ (مينفعش تاريخ جاي) واللينك يبدأ بـ https://", "error");
      toast("اتحفظ");
      onSaved();
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={p ? "تعديل السعر" : "سعر جديد"}>
      <div className="grid gap-3" data-testid="price-editor">
        <Field label="القطعة في اللاب">
          <Select value={f.part} onChange={(e) => setF({ ...f, part: e.target.value })}>
            {PARTS.map((x) => (
              <option key={x.type} value={x.type}>
                {x.name.ar}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="وصف (اختياري)" hint="مثلًا: 5 مم أحمر، أو موديل محدد">
          <Input value={f.label} maxLength={120} onChange={(e) => setF({ ...f, label: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="السعر (ج)">
            <Input type="number" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </Field>
          <Field label="اتراجع يوم">
            <Input type="date" dir="ltr" max={today()} value={f.checked} onChange={(e) => setF({ ...f, checked: e.target.value })} />
          </Field>
        </div>
        <Field label="المحل">
          <Input value={f.source} maxLength={80} onChange={(e) => setF({ ...f, source: e.target.value })} />
        </Field>
        <Field label="لينك المنتج (اختياري)">
          <Input value={f.url} dir="ltr" placeholder="https://" onChange={(e) => setF({ ...f, url: e.target.value })} />
        </Field>
        <Button loading={busy} onClick={() => void save()}>
          حفظ
        </Button>
      </div>
    </Sheet>
  );
}

export function PartPrices({ me }: { me: StaffRow }) {
  const { data, error, loading, reload } = useAsync(() => rpc<{ ai: boolean; prices: Price[]; linked: Item[] }>("staff_part_prices"), []);
  const [editing, setEditing] = useState<Price | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const byPart = useMemo(() => {
    const m = new Map<string, Price[]>();
    for (const p of data?.prices ?? []) m.set(p.lab_part, [...(m.get(p.lab_part) ?? []), p]);
    return [...m.entries()];
  }, [data]);
  const call = async (key: string, fn: string, args: Record<string, unknown>, done: string) => {
    setBusy(key);
    try {
      const r = await rpc<{ ok: boolean }>(fn, args);
      if (!r.ok) return toast("مينفعش", "error");
      toast(done);
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <TopBar title="أسعار القطع" sub="اللي معماري المشاريع في اللاب بيعرضه للطلبة" back="/staff/inventory" actions={<Button icon="plus" onClick={() => setEditing("new")}>سعر جديد</Button>} />
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : data ? (
        <div className="grid gap-4" data-testid="part-prices">
          <Card className="text-sm text-mist">كل سعر لازم يكون من محل حقيقي وبتاريخ مراجعته. السعر اللي عدّى عليه 30 يوم بيظهر للطلبة إنه «قديم»، والقطعة اللي ملهاش سعر بتظهر من غير سعر — مفيش تخمين.</Card>
          <Toggle
            checked={data.ai}
            disabled={busy === "ai" || !can(me, "settings")}
            onChange={(on) => void call("ai", "staff_architect_ai", { p_enabled: on }, on ? "التخطيط بالـAI اشتغل" : "التخطيط بالـAI اتقفل")}
            label="تخطيط المشاريع بالـAI في اللاب"
            hint="بيصرف كريديت AI (في حدود بقلظ اليومية). من غيره المعماري بيشتغل على تصميمات اللاب بس — ببلاش."
          />
          {byPart.map(([part, list]) => (
            <Card key={part} className="grid gap-2" data-testid={`prices-${part}`}>
              <p className="font-semibold text-chalk">{partName(part)}</p>
              {list.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">{`${p.price} ${p.currency} · ${p.source_name}${p.label ? ` · ${p.label}` : ""} · ${p.checked_on}`}</span>
                  {old(p.checked_on) && <Badge tone="warn">قديم</Badge>}
                  <Button variant="ghost" icon="edit" onClick={() => setEditing(p)}>
                    تعديل
                  </Button>
                  <Button variant="ghost" loading={busy === p.id} onClick={() => void call(p.id, "staff_part_price_archive", { p_id: p.id }, "اتشال")}>
                    شيل
                  </Button>
                </div>
              ))}
            </Card>
          ))}
          <Card className="grid gap-2">
            <p className="font-semibold text-chalk">أصناف المخزن وقطع اللاب</p>
            <p className="text-xs text-fog">اربط كل صنف بالقطعة اللي هو هي في اللاب عشان المعماري يقول للطلبة كام متاح دلوقتي.</p>
            {data.linked.map((it) => (
              <div key={it.id} className="flex flex-wrap items-center gap-2 text-sm" data-testid={`link-${it.id}`}>
                <span className="min-w-0 flex-1 truncate">{`${it.name} (${it.quantity})`}</span>
                <Select
                  value={it.lab_part ?? ""}
                  disabled={busy === it.id}
                  onChange={(e) => void call(it.id, "staff_inventory_link", { p_item: it.id, p_part: e.target.value }, "اتربط")}
                  aria-label={`قطعة اللاب لـ ${it.name}`}
                >
                  <option value="">—</option>
                  {PARTS.map((x) => (
                    <option key={x.type} value={x.type}>
                      {x.name.ar}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </Card>
        </div>
      ) : null}
      {editing && <PriceSheet p={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}
