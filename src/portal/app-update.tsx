"use client";
/**
 * "Update the app" for the store app. Owners set the lowest version it may run (and the store links)
 * in /staff/apps; an older app shows a full-screen notice with a button to the store, so a
 * change that needs the new app never meets an old one. Stored in site_settings under "apps".
 */
import { registerPlugin } from "@capacitor/core";
import { useEffect, useState, type ReactNode } from "react";
import { can, errorText, isNative, must, sb, type StaffRow } from "./core";
import { BrandLine } from "./shell";
import { Button, Card, Empty, ErrorBox, Field, Icon, Input, Loading, Section, Textarea, TopBar, toast, useAsync } from "./ui";

/** One app for students and the team (com.buildxhue.student); the keys keep their first names. */
export type AppsSettings = {
  student_min?: string;
  message?: string;
  student_android?: string;
  student_ios?: string;
};

const PLAY = (id: string) => `https://play.google.com/store/apps/details?id=${id}`;
const DEFAULT_LINKS = { student_android: PLAY("com.buildxhue.student") };

type AppInfo = { version: string; build: string; id: string };
const App = registerPlugin<{ getInfo(): Promise<AppInfo> }>("App");

/** -1, 0 or 1, comparing "1.2.10" style versions number by number. */
export function compareVersions(a: string, b: string) {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

const platform = () => (/iphone|ipad|ipod|macintosh/i.test(navigator.userAgent) ? "ios" : "android");

/** Wraps the app: in a store app older than the allowed minimum, shows the update screen instead. */
export function UpdateGate({ children }: { children: ReactNode }) {
  const [need, setNeed] = useState<{ url: string; message: string; version: string; min: string } | null>(null);
  useEffect(() => {
    if (!isNative()) return;
    let alive = true;
    (async () => {
      const [info, rows] = await Promise.all([App.getInfo(), sb().from("site_settings").select("value").eq("key", "apps").limit(1).then(must)]);
      const s = ((rows as { value: AppsSettings }[])[0]?.value ?? {}) as AppsSettings;
      const min = (s.student_min ?? "").trim();
      if (!alive || !min || compareVersions(info.version, min) >= 0) return;
      const links = { ...DEFAULT_LINKS, ...s } as Record<string, string | undefined>;
      setNeed({ url: links[`student_${platform()}`] ?? "", message: s.message ?? "", version: info.version, min });
    })().catch(() => undefined); // offline or no plugin: let them in
    return () => {
      alive = false;
    };
  }, []);
  if (!need) return <>{children}</>;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-abyss px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center">
      <BrandLine />
      <span className="flex size-20 items-center justify-center rounded-3xl bg-volt/15 text-cyan">
        <Icon name="download" size={40} />
      </span>
      <div>
        <h1 className="text-2xl font-bold text-chalk">في تحديث جديد للتطبيق</h1>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-mist">{need.message || "النسخة دي قديمة ومش هتشتغل صح. حدّث التطبيق من المتجر عشان تكمل."}</p>
        <p className="mt-2 font-mono text-xs text-fog" dir="ltr">
          {need.version} → {need.min}
        </p>
      </div>
      {need.url && (
        <Button variant="primary" size="lg" icon="download" onClick={() => window.open(need.url, "_blank", "noopener")}>
          تحديث من المتجر
        </Button>
      )}
    </div>
  );
}

/** /staff/apps — owners, admins and whoever has "settings": minimum versions and store links. */
export function AppsSettingsScreen({ me }: { me: StaffRow }) {
  const admin = can(me, "settings");
  const { data, error, loading, reload } = useAsync(async () => {
    const rows = (await sb().from("site_settings").select("value").eq("key", "apps").limit(1).then(must)) as { value: AppsSettings }[];
    return rows[0]?.value ?? {};
  }, []);
  const [s, setS] = useState<AppsSettings>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setS({ ...data });
  }, [data]);
  if (!admin)
    return (
      <>
        <TopBar title="التطبيقات" back="/staff/more" />
        <Empty icon="lock" title="الصفحة دي للمالك والأدمنز بس" />
      </>
    );
  const field = (k: keyof AppsSettings, label: string, placeholder: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <Input value={s[k] ?? ""} onChange={(e) => setS((p) => ({ ...p, [k]: e.target.value }))} dir="ltr" placeholder={placeholder} />
    </Field>
  );
  const save = async () => {
    for (const k of ["student_min"] as const) if (s[k]?.trim() && !/^\d+(\.\d+){0,2}$/.test(s[k]!.trim())) return toast("رقم الإصدار يكون زي 1.0.0", "error");
    for (const k of ["student_android", "student_ios"] as const) if (s[k]?.trim() && !/^https:\/\/\S+$/.test(s[k]!.trim())) return toast("لينكات المتاجر لازم تبدأ بـ https://", "error");
    setBusy(true);
    try {
      const value = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]).filter(([, v]) => v));
      await sb().from("site_settings").upsert({ key: "apps", value }).then(must);
      toast("اتحفظ ✓");
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <TopBar title="التطبيقات" sub="أقل إصدار مسموح ولينكات المتاجر" back="/staff/more" actions={<Button size="sm" variant="primary" loading={busy} onClick={save}>حفظ</Button>} />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : (
        <div className="grid gap-2 pb-10">
          <p className="text-sm leading-relaxed text-fog">
            لما تحط أقل إصدار، أي حد معاه نسخة أقدم بيشوف شاشة «في تحديث جديد» ومش بيقدر يكمل غير لما يحدّث. سيبها فاضية عشان محدش يتمنع. رقم الإصدار هو اللي بتكتبه في «Run workflow».
          </p>
          <Section title="BuildX HUE (الطلاب والفريق)">
            <Card className="grid gap-3">
              {field("student_min", "أقل إصدار مسموح", "1.0.0")}
              {field("student_android", "لينك Google Play", DEFAULT_LINKS.student_android)}
              {field("student_ios", "لينك App Store", "https://apps.apple.com/app/id…", "من App Store Connect ← App Information ← View on App Store")}
            </Card>
          </Section>
          <Section title="الرسالة (اختياري)">
            <Card>
              <Field label="بتظهر في شاشة التحديث">
                <Textarea value={s.message ?? ""} onChange={(e) => setS((p) => ({ ...p, message: e.target.value }))} maxLength={300} className="min-h-20" placeholder="ضفنا التاسكات وتسجيل الحضور بالـ QR. حدّث عشان تستخدمهم." />
              </Field>
            </Card>
          </Section>
        </div>
      )}
    </>
  );
}
