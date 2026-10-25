"use client";
/**
 * BuildX App → site settings → Baqloz's AI: an off switch, the limits (per visitor and per day for
 * the whole site) and what it used each day (calls, answers from the cache, refusals, tokens).
 * The key itself lives in Supabase secrets and never reaches the app.
 */
import { useState } from "react";
import { fmt, must, rpc, sb } from "./core";
import { Button, Card, Field, Input, Toggle, toast, useAsync } from "./ui";

type GuideAi = { enabled: boolean; per_ip_10min: number; per_ip_day: number; site_day: number; per_user_tokens: number };
type Detail = { budget: number; people_today: number; top: { who: string; service: string; calls: number; tokens: number }[]; errors: { at: string; service: string; status: number | null; kind: string | null }[]; errors_week: number };
type Day = { day: string; calls: number; cache_hits: number; refused: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number };

const DEFAULTS: GuideAi = { enabled: true, per_ip_10min: 6, per_ip_day: 25, site_day: 300, per_user_tokens: 40000 };
const n = (x: number) => new Intl.NumberFormat("ar-EG").format(x);

export function GuideAiCard() {
  const { data, set } = useAsync(async () => {
    const [s, usage] = await Promise.all([
      sb().from("site_settings").select("value").eq("key", "guide_ai").maybeSingle().then(must) as Promise<{ value: Partial<GuideAi> } | null>,
      rpc<Day[]>("staff_guide_usage").catch(() => [] as Day[]),
    ]);
    const detail = await rpc<Detail>("staff_ai_usage_detail").catch(() => null);
    return { cfg: { ...DEFAULTS, ...(s?.value ?? {}) }, usage, detail };
  }, []);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const { cfg, usage, detail } = data;
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
      <Field label="حد التوكنز لكل شخص في اليوم" hint="بيحدد التكلفة لكل زائر أو طالب أو عضو فريق، مهما كان عدد أسئلته. لما يخلص، بقلظ بيرد من معلوماته هو لحد بكرة.">
        {num("per_user_tokens", 1000, 2000000)}
      </Field>
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
        {detail && (
          <div className="mt-3 grid gap-2 border-t border-[var(--line)] pt-3 text-mist" data-testid="ai-detail">
            <p>{`النهارده: ${n(detail.people_today)} شخص استخدم الـ AI · الحد ${n(detail.budget)} توكن للشخص`}</p>
            {detail.top.length > 0 && (
              <ul className="grid gap-0.5 text-xs">
                {detail.top.map((u) => (
                  <li key={`${u.who}${u.service}`} className="flex justify-between gap-2">
                    <span dir="ltr" className="font-mono text-fog">{`#${u.who}`}</span>
                    <span>{`${u.service === "app" ? "التطبيق" : "الموقع"} · ${n(u.calls)} سؤال · ${n(u.tokens)} توكن${u.tokens >= detail.budget ? " · وصل للحد" : ""}`}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-fog">الأشخاص بيظهروا برقم مشفّر بس، من غير عنوان أو اسم.</p>
            <p className={detail.errors_week ? "text-warn" : ""}>{detail.errors_week ? `${n(detail.errors_week)} خطأ من خدمة الـ AI آخر 7 أيام` : "مفيش أخطاء من خدمة الـ AI آخر 7 أيام"}</p>
            {detail.errors.length > 0 && (
              <ul className="grid gap-0.5 text-xs" data-testid="ai-errors">
                {detail.errors.slice(0, 8).map((e, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{fmt.dateTime(e.at)}</span>
                    <span dir="ltr">{`${e.service} · ${e.status ?? "—"} · ${e.kind || "error"}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="mt-2 text-xs text-fog">بقلظ بيرد لوحده على الأسئلة اللي يعرفها (التراكات، الإيفنتات، الانضمام…)، والـ AI بيتسأل بس في اللي ميعرفوش، وبحد أقصى 8 مرات لكل زائر في الزيارة.</p>
      </div>
    </Card>
  );
}
