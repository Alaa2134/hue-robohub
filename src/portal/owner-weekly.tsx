"use client";
/**
 * The owner's weekly report (sent every Sunday by itself: push, email, and WhatsApp once Meta approves
 * its template). Here it shows this week's numbers any time, and can send it now. Real counts only.
 */
import { useState } from "react";
import { rpc, type StaffRow } from "./core";
import { Button, Card, Icon, toast, useAsync } from "./ui";

type Weekly = {
  applications: number;
  formReplies: number;
  overdueTasks: number;
  unanswered: number;
  lowRatings: number;
  noPostCount: number;
  attendance: number;
  activeStudents: number;
  newBadges: number;
  text: string;
};

const ITEMS: [keyof Weekly, string, string][] = [
  ["applications", "طلبات انضمام", "/staff/applications"],
  ["formReplies", "ردود فورمز", "/staff/forms"],
  ["overdueTasks", "تاسكات متأخرة", "/staff/warnings"],
  ["unanswered", "رسايل من غير رد", "/staff/inbox"],
  ["lowRatings", "تقييمات قليلة", "/staff/forms"],
  ["noPostCount", "فعاليات من غير خبر", "/staff/media"],
];

export function OwnerWeeklyCard({ me }: { me: StaffRow }) {
  const { data, reload } = useAsync(
    () =>
      me.role === "owner" || me.role === "admin" ? rpc<Weekly>("staff_owner_weekly") : Promise.resolve(null),
    [me.user_id],
  );
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const send = async () => {
    setBusy(true);
    try {
      await rpc("staff_owner_weekly", { p_send: true });
      toast("اتبعت: إشعار وإيميل (وواتساب لو القالب اتوافق عليه)");
      reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mb-4 grid gap-3" data-testid="owner-weekly">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-cyan/15 text-cyan">
          <Icon name="chart" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-chalk">تقرير الأسبوع</p>
          <p className="text-xs text-fog">آخر 7 أيام · بيوصلك لوحده كل أحد الصبح</p>
        </div>
        <Button size="sm" icon="share" loading={busy} onClick={send} data-testid="owner-weekly-send">
          ابعته دلوقتي
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ITEMS.map(([k, label, to]) => (
          <a
            key={k}
            href={`#${to}`}
            className="rounded-xl border border-[var(--line)] p-2.5 text-center hover:border-[var(--line-2)]"
          >
            <span
              className={`block font-mono text-2xl font-bold ${Number(data[k]) > 0 && k !== "applications" && k !== "formReplies" ? "text-warn" : "text-chalk"}`}
            >
              {data[k] as number}
            </span>
            <span className="block text-[11px] leading-tight text-fog">{label}</span>
          </a>
        ))}
      </div>
      <p className="text-xs text-mist">{`الطلاب: ${data.attendance} حضور · ${data.activeStudents} دخلوا التطبيق · ${data.newBadges} شارة جديدة`}</p>
    </Card>
  );
}
