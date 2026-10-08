"use client";
/**
 * BuildX App → site settings → Baqloz's AI: an off switch, the limits (per visitor and per day for
 * the whole site) and what it used each day (calls, answers from the cache, refusals, tokens).
 * The key itself lives in Supabase secrets and never reaches the app.
 */
import { useState } from "react";
import { must, rpc, sb } from "./core";
import { Button, Card, Field, Input, Toggle, toast, useAsync } from "./ui";

type GuideAi = { enabled: boolean; per_ip_10min: number; per_ip_day: number; site_day: number };
type Day = { day: string; calls: number; cache_hits: number; refused: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number };

const DEFAULTS: GuideAi = { enabled: true, per_ip_10min: 6, per_ip_day: 25, site_day: 300 };
const n = (x: number) => new Intl.NumberFormat("ar-EG").format(x);

export function GuideAiCard() {
  const { data, set } = useAsync(async () => {
    const [s, usage] = await Promise.all([
      sb().from("site_settings").select("value").eq("key", "guide_ai").maybeSingle().then(must) as Promise<{ value: Partial<GuideAi> } | null>,
      rpc<Day[]>("staff_guide_usage").catch(() => [] as Day[]),
    ]);
    return { cfg: { ...DEFAULTS, ...(s?.value ?? {}) }, usage };
  }, []);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const { cfg, usage } = data;
  const save = async (next: GuideAi, msg = "اتحفظ") => {
    setBusy(true);
    try {
      await sb().from("site_settings").upsert({ key: "guide_ai", value: next }).then(must);
      set({ ...data, cfg: next });
      toast(msg);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const num = (k: keyof Omit<GuideAi, "enabled">, min: number, max: number) => (
    <Input type="number" inputMode="numeric" min={min} max={max} value={cfg[k]} onChange={(e) => set({ ...data, cfg: { ...cfg, [k]: Math.min(max, Math.max(min, Number(e.target.value) || min)) } })} />
  );
  const today = usage[0];
  const week = usage.slice(0, 7);
  const sum = (k: keyof Day) => week.reduce((a, d) => a + Number(d[k] ?? 0), 0);
  return (
    <Card className="grid gap-3">
      <Toggle checked={cfg.enabled} disabled={busy} onChange={(v) => save({ ...cfg, enabled: v }, v ? "الـ AI شغّال" : "الـ AI اتقفل — بقلظ هيرد من دماغه بس")} label={cfg.enabled ? "ردود الـ AI شغّالة" : "ردود الـ AI مقفولة"} hint="لو قفلتها بقلظ بيفضل يرد من معلوماته هو، ومفيش أي استهلاك." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="لكل زائر كل 10 دقايق">{num("per_ip_10min", 1, 50)}</Field>
        <Field label="لكل زائر في اليوم">{num("per_ip_day", 1, 500)}</Field>
        <Field label="للموقع كله في اليوم" hint="أقصى عدد أسئلة للـ AI في اليوم">{num("site_day", 1, 20000)}</Field>
      </div>
      <Button size="sm" loading={busy} onClick={() => save(cfg)}>
        حفظ الحدود
      </Button>
      <div className="rounded-xl bg-white/[0.04] p-3 text-sm">
        <p className="mb-2 font-semibold text-chalk">الاستهلاك</p>
        {!usage.length ? (
          <p className="text-fog">لسه مفيش استخدام.</p>
        ) : (
          <div className="grid gap-1 text-mist">
            <p>
              النهارده: {n(today?.calls ?? 0)} سؤال للـ AI · {n(today?.cache_hits ?? 0)} من الكاش (ببلاش) · {n(today?.refused ?? 0)} اترفضوا بسبب الحدود
            </p>
            <p>
              آخر 7 أيام: {n(sum("calls"))} سؤال · توكنز داخلة {n(sum("input_tokens"))} · خارجة {n(sum("output_tokens"))} · من كاش البرومبت {n(sum("cache_read_tokens"))}
            </p>
          </div>
        )}
        <p className="mt-2 text-xs text-fog">بقلظ بيرد لوحده على الأسئلة اللي يعرفها (التراكات، الإيفنتات، الانضمام…)، والـ AI بيتسأل بس في اللي ميعرفوش، وبحد أقصى 8 مرات لكل زائر في الزيارة.</p>
      </div>
    </Card>
  );
}
