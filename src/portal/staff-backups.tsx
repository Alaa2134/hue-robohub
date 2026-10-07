"use client";
/** BuildX App → More → النسخ الاحتياطية (owner only): seven nightly snapshots plus one on demand, each downloadable as JSON. */
import { useState } from "react";
import { download, errorText, fmt, rpc, type StaffRow } from "./core";
import { Button, Card, Empty, ErrorBox, List, Loading, Row, TopBar, toast, useAsync } from "./ui";

type Snap = { slot: number; taken_at: string; counts: Record<string, number>; bytes: number };
const DAYS = ["الأحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];

export function BackupsScreen({ me }: { me: StaffRow }) {
  const owner = me.role === "owner";
  const { data, error, loading, reload } = useAsync(async () => (owner ? await rpc<Snap[]>("staff_backups") : []), [owner]);
  const [busy, setBusy] = useState<number | "now" | null>(null);

  const now = async () => {
    setBusy("now");
    try {
      await rpc("staff_backup_now");
      toast("اتعملت نسخة دلوقتي ✓");
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };
  const save = async (s: Snap) => {
    setBusy(s.slot);
    try {
      const d = await rpc<object>("staff_backup_download", { p_slot: s.slot });
      download(new Blob([JSON.stringify(d)], { type: "application/json" }), `buildx-backup-${s.taken_at.slice(0, 10)}.json`);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  };

  if (!owner)
    return (
      <>
        <TopBar title="النسخ الاحتياطية" back="/staff/more" />
        <Empty icon="lock" title="الصفحة دي للمالك بس" />
      </>
    );
  return (
    <>
      <TopBar
        title="النسخ الاحتياطية"
        sub="نسخة كل ليلة الساعة 2:23 — آخر 7 أيام"
        back="/staff/more"
        actions={
          <Button size="sm" variant="primary" loading={busy === "now"} onClick={now}>
            نسخة دلوقتي
          </Button>
        }
      />
      <p className="text-sm leading-relaxed text-mist">كل البيانات (الطلاب، الحضور، الكويزات، الطلبات، محتوى الموقع، الشهادات، التسجيلات) من غير أرقام الدخول السرية. نزّل نسخة واحفظها في Drive كل فترة.</p>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty icon="download" title="لسه مفيش نسخ" body="أول نسخة هتتعمل الليلة، أو دوس «نسخة دلوقتي»." />
      ) : (
        <List className="mt-4">
          {data.map((s) => (
            <Row key={s.slot} chevron={false}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-chalk">{s.slot === 7 ? "نسخة يدوية" : `نسخة ${DAYS[s.slot]}`}</p>
                  <p className="truncate text-xs text-fog">
                    {fmt.dateTime(s.taken_at)} · {s.counts.students ?? 0} طالب · {s.counts.applications ?? 0} طلب · {Math.max(1, Math.round(s.bytes / 1024))} KB
                  </p>
                </div>
                <Button size="sm" icon="download" loading={busy === s.slot} onClick={() => save(s)}>
                  تنزيل
                </Button>
              </div>
            </Row>
          ))}
        </List>
      )}
      <Card className="mt-4 text-xs leading-relaxed text-fog">لو احتجت ترجّع نسخة، ابعت الملف للمطوّر — الملف فيه كل جدول لوحده بصيغة JSON.</Card>
    </>
  );
}
