"use client";
/** What the attendees said about one event, summed up (src/lib/feedback-summary.ts). */
import { useState } from "react";
import { summarize, type Feedback, type Summary } from "@/lib/feedback-summary";
import { errorText, must, sb } from "./core";
import { Button, toast } from "./ui";

export function FeedbackCard({ eventKey, ratings }: { eventKey: string; ratings: number }) {
  const [s, setS] = useState<Summary | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const form = eventKey.startsWith("form:") ? eventKey.slice(5) : null;
  if (!form || !ratings) return null;

  const load = async () => {
    setBusy(true);
    try {
      const rows = ((await sb()
        .from("form_session_feedback")
        .select("rating, comment, form_responses!inner(form_id)")
        .eq("form_responses.form_id", form)
        .limit(5000)
        .then(must)) ?? []) as Feedback[];
      setS(summarize(rows));
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  };

  if (s === undefined)
    return (
      <Button size="sm" icon="star" loading={busy} onClick={() => void load()} data-testid="feedback-open">
        {`رأي الحضور (${ratings} تقييم)`}
      </Button>
    );
  if (!s) return <p className="text-sm text-fog">مفيش تقييمات.</p>;
  const max = Math.max(1, ...s.stars);
  return (
    <div className="grid gap-2 rounded-xl border border-[var(--line)] p-3" data-testid="feedback-summary">
      <p className="text-sm font-semibold text-chalk">{`رأي الحضور: ${s.avg} من 5 (${s.count} تقييم)`}</p>
      <div className="grid gap-1">
        {[5, 4, 3, 2, 1].map((n) => (
          <div key={n} className="flex items-center gap-2 text-xs text-mist">
            <span className="w-6">{`${n}★`}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full bg-cyan" style={{ width: `${(s.stars[n - 1] / max) * 100}%` }} />
            </span>
            <span className="w-6 text-end">{s.stars[n - 1]}</span>
          </div>
        ))}
      </div>
      {s.praise.length > 0 && <p className="text-sm text-ok">{`👍 اتكرر في الكلام الحلو: ${s.praise.join("، ")}`}</p>}
      {s.complaints.length > 0 && <p className="text-sm text-warn">{`👎 اتكرر في الشكاوى: ${s.complaints.join("، ")}`}</p>}
      {s.best && <p className="text-sm text-chalk">{`أحسن تعليق: «${s.best}»`}</p>}
      {s.worst && <p className="text-sm text-mist">{`أكتر شكوى: «${s.worst}»`}</p>}
      {s.tip && <p className="rounded-lg bg-cyan/10 p-2 text-sm text-chalk">{`💡 للمرة الجاية: ${s.tip}`}</p>}
    </div>
  );
}
