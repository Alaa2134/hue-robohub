"use client";
/**
 * /me/passport — the student's Skill Passport: a page they choose to share (a CV, a company at an
 * event) with what they actually did, from the records. Off until they turn it on; they pick whether
 * the full name and the group show; a new link stops the old one. Nothing private is ever on it.
 */
import { useEffect, useState } from "react";
import { QrImg } from "./equipment";
import { publicOrigin, studentRpc } from "./core";
import { Button, Card, ErrorBox, Field, Input, Loading, Toggle, TopBar, toast, useAsync } from "./ui";

type Passport = {
  slug: string;
  visible: boolean;
  full_name: boolean;
  show_group: boolean;
  headline: string;
  preview: {
    name: string;
    certificates: unknown[];
    challenges: unknown[];
    courses: unknown[];
    projects: unknown[];
    numbers: { sessions: number; quizzes: number; tasks: number };
  } | null;
};

export const passportUrl = (slug: string) => `${publicOrigin()}/passport/?id=${slug}`;

export function StudentPassport() {
  const { data, error, loading, reload } = useAsync(() => studentRpc<Passport>("student_passport"), []);
  const [p, setP] = useState<Passport | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setP(data ?? null), [data]);

  const save = async (next: Partial<Passport>, newLink = false) => {
    if (!p) return;
    const v = { ...p, ...next };
    setBusy(true);
    try {
      const r = await studentRpc<Passport & { ok: boolean; error?: string }>("student_passport_save", {
        p_visible: v.visible,
        p_full_name: v.full_name,
        p_show_group: v.show_group,
        p_headline: v.headline,
        p_new_link: newLink,
      });
      if (!r.ok) throw new Error(r.error);
      setP(r);
      if (newLink) toast("اتعمل لينك جديد، والقديم وقف");
    } catch {
      toast("معرفتش أحفظ، جرّب تاني", "error");
    } finally {
      setBusy(false);
    }
  };

  const url = p ? passportUrl(p.slug) : "";
  const n = p?.preview;
  return (
    <>
      <TopBar title="جواز المهارات" sub="صفحة بإنجازاتك الحقيقية تبعتها لأي حد" back="/me/account" />
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !p ? (
        <Loading />
      ) : p ? (
        <div className="grid gap-4" data-testid="passport">
          <Card className="grid gap-2 text-sm text-mist">
            <p>
              الصفحة بتعرض اللي عملته فعلًا من سجلاتنا: الشهادات (وكل واحدة ليها كود تحقق)، تحديات المعمل اللي عدّيتها، الكورسات
              اللي خلصتها، والمشاريع اللي اتنشرت لك. مفيهاش رقم تليفونك ولا كودك ولا أي ملاحظات.
            </p>
            {n && (
              <p className="text-fog" data-testid="passport-counts">
                {`${n.certificates.length} شهادة · ${n.challenges.length} تحدي · ${n.courses.length} كورس · ${n.projects.length} مشروع · ${n.numbers.sessions} سيشن حضرتها`}
              </p>
            )}
          </Card>
          <Toggle checked={p.visible} disabled={busy} onChange={(visible) => void save({ visible })} label="الصفحة شغالة" hint="أي حد معاه اللينك يقدر يشوفها. اقفلها في أي وقت." />
          <Toggle checked={p.full_name} disabled={busy} onChange={(full_name) => void save({ full_name })} label="اعرض اسمي كامل" hint="لو مقفولة: اسمك الأول وأول حرف من اسم الأب بس." />
          <Toggle checked={p.show_group} disabled={busy} onChange={(show_group) => void save({ show_group })} label="اعرض اسم مجموعتي" />
          <Card className="grid gap-2">
            <Field label="جملة عنك (اختياري)" hint="مثلًا: بحب الروبوتات والأردوينو">
              <Input value={p.headline} maxLength={140} onChange={(e) => setP({ ...p, headline: e.target.value })} />
            </Field>
            <Button variant="secondary" loading={busy} onClick={() => void save({})}>
              حفظ
            </Button>
          </Card>
          {p.visible && (
            <Card className="grid justify-items-center gap-3" data-testid="passport-link">
              <QrImg value={url} size={160} />
              <p className="w-full break-all text-center font-mono text-xs text-mist" dir="ltr">
                {url}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon="copy" variant="secondary" onClick={() => void navigator.clipboard.writeText(url).then(() => toast("اتنسخ"))}>
                  نسخ اللينك
                </Button>
                <Button icon="external" variant="secondary" onClick={() => window.open(url, "_blank", "noopener")}>
                  افتح الصفحة
                </Button>
                <Button icon="refresh" variant="ghost" disabled={busy} onClick={() => confirm("اللينك القديم هيبطل يشتغل. متأكد؟") && void save({}, true)}>
                  لينك جديد
                </Button>
              </div>
            </Card>
          )}
        </div>
      ) : null}
    </>
  );
}
