"use client";
/** Owner/admin screen for the website's own settings: contact, socials, hero, announcement and goals. */
import { useEffect, useState } from "react";
import type { GoalSetting, SiteSettings } from "@/lib/site-settings";
import { siteImageUrl } from "@/lib/site-content";
import { errorText, must, removeObjects, savedText, sb, uploadImage, type StaffRow } from "./core";
import { Button, Card, Empty, ErrorBox, Field, IconButton, Input, Loading, Section, Textarea, Toggle, TopBar, toast, useAsync } from "./ui";

const EMPTY_GOAL: GoalSetting = { value: "", label_en: "", label_ar: "", note_en: "", note_ar: "" };

export function SiteSettingsScreen({ me }: { me: StaffRow }) {
  const admin = me.role !== "lead";
  const { data, error, loading, reload } = useAsync(async () => {
    const rows = (await sb().from("site_settings").select("value").eq("key", "site").limit(1).then(must)) as { value: SiteSettings }[];
    return rows[0]?.value ?? {};
  }, []);
  const [s, setS] = useState<SiteSettings>({});
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  useEffect(() => {
    if (data) setS(structuredClone(data));
  }, [data]);

  if (!admin)
    return (
      <>
        <TopBar title="إعدادات الموقع" back="/staff/more" />
        <Empty icon="lock" title="الصفحة دي للمالك والأدمنز بس" />
      </>
    );

  const set = <K extends keyof SiteSettings>(k: K, v: Partial<NonNullable<SiteSettings[K]>>) => setS((p) => ({ ...p, [k]: { ...(p[k] as object), ...v } }));
  const goals = s.goals ?? [];
  const setGoal = (i: number, v: Partial<GoalSetting>) => setS((p) => ({ ...p, goals: (p.goals ?? []).map((g, j) => (j === i ? { ...g, ...v } : g)) }));
  const moveGoal = (i: number, d: -1 | 1) =>
    setS((p) => {
      const list = [...(p.goals ?? [])];
      const j = i + d;
      if (j < 0 || j >= list.length) return p;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...p, goals: list };
    });

  const pickHero = async (file: File | undefined) => {
    if (!file) return;
    setImgBusy(true);
    try {
      const r = await uploadImage("site", me.user_id, file, { maxEdge: 2400, thumbEdge: 900 });
      const old = s.hero?.image?.path;
      set("hero", { image: { path: r.path, width: r.width, height: r.height } });
      if (old) removeObjects([old], "site").catch(() => undefined);
      toast(`اترفعت الصورة واتصغّرت (${savedText(r.before, r.after)})`);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setImgBusy(false);
    }
  };

  const save = async () => {
    for (const u of [s.contact?.map_url, s.announcement?.url, ...Object.values(s.socials ?? {})])
      if (u && u.trim() && !/^https:\/\/\S+$/.test(u.trim()) && !(u === s.announcement?.url && u.startsWith("/"))) return toast(`اللينك "${u}" لازم يبدأ بـ https://`, "error");
    setBusy(true);
    try {
      const value: SiteSettings = { ...s, goals: goals.filter((g) => g.value.trim() && (g.label_ar.trim() || g.label_en.trim())) };
      await sb().from("site_settings").upsert({ key: "site", value }).then(must);
      toast("اتحفظ ✓ — الإعلان بيظهر فورًا، والباقي خلال نص ساعة");
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const heroImg = s.hero?.image;
  return (
    <>
      <TopBar title="إعدادات الموقع" sub="بيانات التواصل والواجهة والإعلانات" back="/staff/more" actions={<Button size="sm" variant="primary" loading={busy} onClick={save}>حفظ</Button>} />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : (
        <div className="grid gap-2 pb-10">
          <p className="text-sm leading-relaxed text-fog">أي خانة تسيبها فاضية بيفضل مكانها الكلام الأصلي اللي على الموقع.</p>

          <Section title="الإعلان">
            <Card className="grid gap-3">
              <Toggle checked={!!s.announcement?.on} onChange={(v) => set("announcement", { on: v })} label="إظهار إعلان على الموقع" hint="كارت صغير تحت الصفحة، الزائر يقدر يقفله." />
              <Field label="نص الإعلان (عربي)">
                <Input value={s.announcement?.text_ar ?? ""} onChange={(e) => set("announcement", { text_ar: e.target.value })} maxLength={220} placeholder="التقديم مفتوح لحد 30 أكتوبر!" />
              </Field>
              <Field label="نص الإعلان (English)">
                <Input value={s.announcement?.text_en ?? ""} onChange={(e) => set("announcement", { text_en: e.target.value })} maxLength={220} dir="ltr" placeholder="Applications are open until Oct 30!" />
              </Field>
              <Field label="رابط (اختياري)" hint="صفحة في الموقع زي /join أو لينك كامل https://…">
                <Input value={s.announcement?.url ?? ""} onChange={(e) => set("announcement", { url: e.target.value })} dir="ltr" placeholder="/join" />
              </Field>
            </Card>
          </Section>

          <Section title="الواجهة الرئيسية">
            <Card className="grid gap-3">
              <div className="grid gap-2">
                <span className="text-[13px] font-medium text-mist">صورة الواجهة</span>
                {heroImg ? (
                  <img src={siteImageUrl(heroImg.path, "thumb")} alt="" className="aspect-video w-full rounded-xl object-cover" />
                ) : (
                  <p className="rounded-xl border border-dashed border-[var(--line-2)] p-4 text-center text-sm text-fog">الصورة الأصلية (الروبوت) شغالة دلوقتي.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex">
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickHero(e.target.files?.[0])} />
                    <span className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-[var(--line-2)] px-4 text-sm font-semibold text-chalk">{imgBusy ? "بيترفع…" : heroImg ? "غيّر الصورة" : "ارفع صورة"}</span>
                  </label>
                  {heroImg && (
                    <Button size="sm" variant="ghost" onClick={() => set("hero", { image: null })}>
                      رجّع الصورة الأصلية
                    </Button>
                  )}
                </div>
                <p className="text-xs text-fog">الأفضل صورة عرضية (أفقي). بتتصغّر وتتحوّل لـ WebP لوحدها قبل الرفع.</p>
              </div>
              <Field label="السطر الصغير فوق الاسم (عربي)">
                <Input value={s.hero?.eyebrow_ar ?? ""} onChange={(e) => set("hero", { eyebrow_ar: e.target.value })} maxLength={90} />
              </Field>
              <Field label="السطر الصغير فوق الاسم (English)">
                <Input value={s.hero?.eyebrow_en ?? ""} onChange={(e) => set("hero", { eyebrow_en: e.target.value })} maxLength={90} dir="ltr" />
              </Field>
              <Field label="الوصف (عربي)">
                <Textarea value={s.hero?.subtitle_ar ?? ""} onChange={(e) => set("hero", { subtitle_ar: e.target.value })} maxLength={260} rows={3} />
              </Field>
              <Field label="الوصف (English)">
                <Textarea value={s.hero?.subtitle_en ?? ""} onChange={(e) => set("hero", { subtitle_en: e.target.value })} maxLength={260} rows={3} dir="ltr" />
              </Field>
            </Card>
          </Section>

          <Section title="بيانات التواصل">
            <Card className="grid gap-3 sm:grid-cols-2">
              <Field label="الإيميل">
                <Input type="email" value={s.contact?.email ?? ""} onChange={(e) => set("contact", { email: e.target.value })} dir="ltr" placeholder="info@buildxhue.com" />
              </Field>
              <Field label="رقم التليفون">
                <Input value={s.contact?.phone ?? ""} onChange={(e) => set("contact", { phone: e.target.value })} dir="ltr" inputMode="tel" />
              </Field>
              <Field label="رقم الواتساب" hint="بالصيغة الدولية، مثال 2010…">
                <Input value={s.contact?.whatsapp ?? ""} onChange={(e) => set("contact", { whatsapp: e.target.value })} dir="ltr" inputMode="tel" />
              </Field>
              <Field label="رابط الخريطة (اختياري)">
                <Input value={s.contact?.map_url ?? ""} onChange={(e) => set("contact", { map_url: e.target.value })} dir="ltr" placeholder="https://maps.app.goo.gl/…" />
              </Field>
              <Field label="العنوان (عربي)">
                <Input value={s.contact?.address_ar ?? ""} onChange={(e) => set("contact", { address_ar: e.target.value })} />
              </Field>
              <Field label="العنوان (English)">
                <Input value={s.contact?.address_en ?? ""} onChange={(e) => set("contact", { address_en: e.target.value })} dir="ltr" />
              </Field>
            </Card>
          </Section>

          <Section title="السوشيال ميديا">
            <Card className="grid gap-3 sm:grid-cols-2">
              {(["facebook", "instagram", "linkedin", "youtube", "github"] as const).map((k) => (
                <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                  <Input value={s.socials?.[k] ?? ""} onChange={(e) => set("socials", { [k]: e.target.value })} dir="ltr" placeholder={`https://${k}.com/…`} />
                </Field>
              ))}
            </Card>
          </Section>

          <Section
            title="أهداف السنة (الأرقام اللي في الصفحة الرئيسية)"
            action={
              goals.length < 8 && (
                <Button size="sm" variant="ghost" icon="plus" onClick={() => setS((p) => ({ ...p, goals: [...(p.goals ?? []), { ...EMPTY_GOAL }] }))}>
                  هدف
                </Button>
              )
            }
          >
            {goals.length === 0 && <p className="text-sm text-fog">الأهداف الأصلية (100+ عضو، 10+ مسابقات…) شغالة. أضف أهداف هنا عشان تستبدلها.</p>}
            <div className="grid gap-3">
              {goals.map((g, i) => (
                <Card key={i} className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <Input value={g.value} onChange={(e) => setGoal(i, { value: e.target.value })} placeholder="100+" dir="ltr" className="w-28" maxLength={8} />
                    <span className="flex-1" />
                    <IconButton icon="arrowUp" label="لفوق" onClick={() => moveGoal(i, -1)} />
                    <IconButton icon="arrowDown" label="لتحت" onClick={() => moveGoal(i, 1)} />
                    <IconButton icon="trash" label="مسح" onClick={() => setS((p) => ({ ...p, goals: (p.goals ?? []).filter((_, j) => j !== i) }))} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input value={g.label_ar} onChange={(e) => setGoal(i, { label_ar: e.target.value })} placeholder="عضو نشط" maxLength={40} />
                    <Input value={g.label_en} onChange={(e) => setGoal(i, { label_en: e.target.value })} placeholder="Active members" dir="ltr" maxLength={40} />
                    <Input value={g.note_ar} onChange={(e) => setGoal(i, { note_ar: e.target.value })} placeholder="بنهاية السنة" maxLength={60} />
                    <Input value={g.note_en} onChange={(e) => setGoal(i, { note_en: e.target.value })} placeholder="by the end of the year" dir="ltr" maxLength={60} />
                  </div>
                </Card>
              ))}
            </div>
          </Section>

          <Button variant="primary" block loading={busy} onClick={save} className="mt-4">
            حفظ الإعدادات
          </Button>
        </div>
      )}
    </>
  );
}
