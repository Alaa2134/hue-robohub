"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { checkIn, markAttendance, rotateAttendanceCode, setAttendanceOpen } from "@/server/actions/events";

type Status = "present" | "late" | "absent" | "excused";
const STATUSES: { v: Status; label: string; cls: string }[] = [
  { v: "present", label: "Present", cls: "border-ok/50 bg-ok/15 text-ok" },
  { v: "late", label: "Late", cls: "border-warn/50 bg-warn/15 text-warn" },
  { v: "absent", label: "Absent", cls: "border-danger/50 bg-danger/15 text-danger" },
  { v: "excused", label: "Excused", cls: "border-steel bg-white/[0.06] text-mist" },
];

export function AttendancePanel({ eventId, open, qrSvg, url, roster }: { eventId: string; open: boolean; qrSvg: string | null; url: string | null; roster: { id: string; name: string; status: Status | null; method: string | null }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [big, setBig] = useState(false);
  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });
  const counts = STATUSES.map((s) => ({ ...s, n: roster.filter((r) => r.status === s.v).length }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="flex flex-col items-center gap-3">
          <button type="button" onClick={() => qrSvg && setBig(true)} className={cn("relative size-44 rounded-xl border border-[var(--line-2)] bg-white p-2", !open && "opacity-30")} aria-label="Show QR code full screen" disabled={!qrSvg}>
            {qrSvg ? <span className="block size-full [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : <span className="flex size-full items-center justify-center text-xs text-steel">Open check-in to generate</span>}
          </button>
          {qrSvg && <span className="text-[0.65rem] text-fog">Tap to show full screen</span>}
        </div>
        <div className="flex flex-1 flex-col gap-3 text-sm">
          <p className="text-mist">{open ? "Check-in is open. Members scan this code with their phone camera and sign in to record attendance. Scans 15+ minutes after the start count as late." : "Open check-in to show a QR code at the session. Only signed-in members can check in."}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} className={open ? "btn btn-sm" : "btn btn-primary btn-sm"} onClick={() => act(() => setAttendanceOpen(eventId, !open))}>
              {!open && <span aria-hidden className="btn-sheen" />}
              <Icon name="qr" size={14} />
              <span>{open ? "Close check-in" : "Open check-in"}</span>
            </button>
            {qrSvg && (
              <button type="button" disabled={pending} className="btn btn-sm" onClick={() => confirm("Replace the QR code? Old screenshots/prints stop working.") && act(() => rotateAttendanceCode(eventId))}>
                <span>New code</span>
              </button>
            )}
          </div>
          {url && open && (
            <p className="break-all font-mono text-[0.65rem] text-steel" dir="ltr">
              {url}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {counts.map((c) => (
              <span key={c.v} className={cn("rounded-full border px-2.5 py-0.5 font-mono text-[0.65rem]", c.cls)}>
                {c.label} {c.n}
              </span>
            ))}
            <span className="rounded-full border border-[var(--line-2)] px-2.5 py-0.5 font-mono text-[0.65rem] text-fog">Unmarked {roster.filter((r) => !r.status).length}</span>
          </div>
        </div>
      </div>

      {roster.length > 0 ? (
        <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
          {roster.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm text-mist">
                {r.name}
                {r.method === "qr" && <span className="ms-2 font-mono text-[0.6rem] text-cyan">QR</span>}
              </span>
              <span className="flex flex-wrap gap-1">
                {STATUSES.map((s) => (
                  <button key={s.v} type="button" disabled={pending} onClick={() => act(() => markAttendance(eventId, r.id, r.status === s.v ? null : s.v))} className={cn("rounded-md border px-2 py-1 text-[0.68rem] transition-colors", r.status === s.v ? s.cls : "border-[var(--line)] text-fog hover:text-mist")}>
                    {s.label}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fog">No active members to mark yet.</p>
      )}

      {big && qrSvg && (
        <button type="button" onClick={() => setBig(false)} className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-void/95 p-6" aria-label="Close full-screen QR">
          <span className="block aspect-square w-[min(80vw,80vh)] rounded-2xl bg-white p-4 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <span className="font-display text-lg text-chalk">Scan to check in</span>
        </button>
      )}
    </div>
  );
}

export function CheckInButton({ eventId, code }: { eventId: string; code: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  if (result)
    return (
      <p role="status" className={cn("flex items-center gap-2 rounded-xl border p-4 text-sm", result.ok ? "border-ok/40 bg-ok/[0.08] text-[#bdf5dc]" : "border-danger/40 bg-danger/[0.08] text-danger")}>
        <Icon name={result.ok ? "check" : "close"} size={16} /> {result.text}
      </p>
    );
  return (
    <button
      type="button"
      disabled={pending}
      className="btn btn-primary w-full justify-center"
      onClick={() =>
        start(async () => {
          const r = await checkIn(eventId, code);
          setResult(r.ok ? { ok: true, text: r.data.already ? `Already checked in to ${r.data.title}.` : `Checked in to ${r.data.title}${r.data.status === "late" ? " (late)" : ""}. See you inside!` } : { ok: false, text: r.error });
        })
      }
    >
      <span aria-hidden className="btn-sheen" />
      <Icon name="check" size={16} />
      <span>{pending ? "Checking in…" : "Check me in"}</span>
    </button>
  );
}
