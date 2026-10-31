"use client";
/**
 * What the attendees said about one event: the summary (src/lib/feedback-summary.ts), then each
 * person and their rating — name, stars, what they wrote, which session when the event has more than
 * one — with a WhatsApp button to get back to them. Every rating comes from the person's own QR page,
 * so it's tied to their registration; nothing here is guessed.
 */
import { useMemo, useState } from "react";
import { whatsappLink } from "@/lib/contact";
import { summarize, type Summary } from "@/lib/feedback-summary";
import { errorText, fmt, must, sb } from "./core";
import { Button, toast } from "./ui";

type Row = {
  response_id: string;
  session: string;
  rating: number;
  comment: string | null;
  updated_at: string;
  form_responses: { name: string | null; phone: string | null; ref: string | null };
};
type Show = "all" | "low" | "said";

export function FeedbackCard({ eventKey, ratings, title }: { eventKey: string; ratings: number; title?: string }) {
  const [data, setData] = useState<{ rows: Row[]; s: Summary | null; sessions: Map<string, string> } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<Show>("all");
  const form = eventKey.startsWith("form:") ? eventKey.slice(5) : null;
  const shown = useMemo(() => {
    const rows = data?.rows ?? [];
    if (show === "low") return rows.filter((r) => r.rating <= 3).sort((a, b) => a.rating - b.rating);
    if (show === "said") return rows.filter((r) => (r.comment ?? "").trim());
    return rows;
  }, [data, show]);
  if (!form || !ratings) return null;

  const load = async () => {
    setBusy(true);
    try {
      const [rows, f] = await Promise.all([
        sb()
          .from("form_session_feedback")
          .select("response_id, session, rating, comment, updated_at, form_responses!inner(form_id, name, phone, ref)")
          .eq("form_responses.form_id", form)
          .order("updated_at", { ascending: false })
          .limit(5000)
          .then(must) as Promise<Row[] | null>,
        sb().from("forms").select("attendance").eq("id", form).maybeSingle().then(must) as Promise<{ attendance: { sessions?: { id: string; name: string }[] } | null } | null>,
      ]);
      const list = rows ?? [];
      const sessions = new Map((f?.attendance?.sessions ?? []).map((x) => [x.id, x.name]));
      setData({ rows: list, s: summarize(list), sessions });
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  };

  if (data === undefined)
    return (
      <Button size="sm" icon="star" loading={busy} onClick={() => void load()} data-testid="feedback-open">
        {`رأي الحضور (${ratings} تقييم)`}
      </Button>
    );
  const s = data.s;
  if (!s) return <p className="text-sm text-fog">مفيش تقييمات.</p>;
  const max = Math.max(1, ...s.stars);
  const many = data.sessions.size > 1;
  const low = data.rows.filter((r) => r.rating <= 3).length;
  const said = data.rows.filter((r) => (r.comment ?? "").trim()).length;
  const ask = (r: Row) => {
    const name = (r.form_responses.name ?? "").trim().split(/\s+/)[0] || "";
    const what = title ? ` في ${title}` : "";
    return r.rating <= 3
      ? `أهلاً${name ? ` ${name}` : ""} 👋 شكراً إنك قيّمت${what}. يهمنا جداً نعرف إيه اللي ماعجبكش وإزاي نخلّيها أحسن المرة الجاية؟ — فريق BuildX HUE`
      : `أهلاً${name ? ` ${name}` : ""} 👋 شكراً على تقييمك الحلو${what}! نستناك في الجاي 🤖 — فريق BuildX HUE`;
  };
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

      <p className="mt-2 text-sm font-semibold text-chalk">كل واحد وتقييمه</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label="مين يظهر" data-testid="feedback-filter">
        {(
          [
            ["all", `الكل (${data.rows.length})`],
            ["low", `3 نجوم أو أقل (${low})`],
            ["said", `اللي كتبوا رأي (${said})`],
          ] as [Show, string][]
        ).map(([k, label]) => (
          <Button key={k} size="sm" variant={show === k ? "primary" : "ghost"} aria-pressed={show === k} onClick={() => setShow(k)}>
            {label}
          </Button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-fog">مفيش حد هنا.</p>
      ) : (
        <ul className="grid max-h-[28rem] gap-2 overflow-y-auto" data-testid="feedback-people">
          {shown.map((r) => {
            const wa = whatsappLink(r.form_responses.phone, ask(r));
            return (
              <li key={`${r.response_id}:${r.session}`} className="rounded-xl border border-[var(--line)] p-3" data-testid="feedback-person">
                <div className="flex items-center gap-2 text-xs text-fog">
                  <span className={r.rating <= 2 ? "text-danger" : "text-[#ffd08a]"} aria-label={`${r.rating} من 5`}>
                    {"★".repeat(r.rating)}
                    <span className="text-white/20">{"★".repeat(5 - r.rating)}</span>
                  </span>
                  <span className="min-w-0 truncate text-sm font-semibold text-chalk">{r.form_responses.name || r.form_responses.ref || "—"}</span>
                  {many && <span className="shrink-0 rounded-full bg-white/10 px-2">{data.sessions.get(r.session) ?? r.session}</span>}
                  <span className="ms-auto shrink-0">{fmt.short(r.updated_at)}</span>
                </div>
                {(r.comment ?? "").trim() && (
                  <p className="mt-1 whitespace-pre-line text-sm text-chalk" dir="auto">
                    {r.comment}
                  </p>
                )}
                {wa && (
                  <a className="btn btn-sm mt-2" href={wa} target="_blank" rel="noreferrer" data-testid="feedback-wa">
                    كلّمه واتساب
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
