"use client";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { addLesson, deleteLesson, setProgress } from "@/server/actions/bootcamp";

const CELL: Record<string, { label: string; cls: string }> = {
  not_started: { label: "·", cls: "text-steel" },
  in_progress: { label: "◐", cls: "text-cyan" },
  submitted: { label: "◉", cls: "text-volt-hi" },
  passed: { label: "✓", cls: "text-ok" },
  failed: { label: "✕", cls: "text-danger" },
};
const ORDER = ["not_started", "in_progress", "submitted", "passed", "failed"] as const;

/** Trainee × week grid. Click a cell to advance its status. */
export function ProgressMatrix({ weeks, trainees, progress, canEdit }: { weeks: { id: string; week: number }[]; trainees: { id: string; name: string }[]; progress: Record<string, string>; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!trainees.length) return <p className="text-sm text-fog">No trainees yet — members with the Trainee rank appear here.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-fog">
            <th className="sticky start-0 bg-abyss px-3 py-2 text-start font-medium">Trainee</th>
            {weeks.map((w) => (
              <th key={w.id} className="px-2 py-2 text-center font-medium">
                W{w.week}
              </th>
            ))}
            <th className="px-3 py-2 text-end font-medium">Passed</th>
          </tr>
        </thead>
        <tbody>
          {trainees.map((t) => {
            const passed = weeks.filter((w) => progress[`${t.id}:${w.id}`] === "passed").length;
            return (
              <tr key={t.id} className="border-t border-[var(--line)]">
                <td className="sticky start-0 whitespace-nowrap bg-abyss px-3 py-2 text-mist">{t.name}</td>
                {weeks.map((w) => {
                  const st = progress[`${t.id}:${w.id}`] ?? "not_started";
                  const next = ORDER[(ORDER.indexOf(st as (typeof ORDER)[number]) + 1) % ORDER.length]!;
                  return (
                    <td key={w.id} className="px-1 py-1 text-center">
                      <button type="button" disabled={!canEdit || pending} title={`${st.replace(/_/g, " ")} — click for ${next.replace(/_/g, " ")}`} onClick={() => start(async () => (await setProgress(t.id, w.id, next), router.refresh()))} className={cn("size-8 rounded-md border border-[var(--line)] font-mono text-base hover:border-[var(--line-2)] disabled:cursor-default", CELL[st]?.cls)}>
                        {CELL[st]?.label}
                      </button>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-end font-mono text-xs">
                  {passed}/{weeks.length}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 flex flex-wrap gap-4 text-xs text-fog">
        {ORDER.map((o) => (
          <span key={o}>
            <span className={cn("font-mono", CELL[o]!.cls)}>{CELL[o]!.label}</span> {o.replace(/_/g, " ")}
          </span>
        ))}
      </p>
    </div>
  );
}

export function LessonsEditor({ moduleId, lessons }: { moduleId: string; lessons: { id: string; title: string; durationMinutes: number | null; materialUrl: string | null }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const field = "h-9 min-w-0 rounded-md border border-[var(--line-2)] bg-deep/70 px-2.5 text-sm text-chalk outline-none placeholder:text-steel focus:border-cyan/60";
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-1">
        {lessons.map((l, i) => (
          <li key={l.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-panel/50">
            <span className="font-mono text-xs text-fog">{String(i + 1).padStart(2, "0")}</span>
            <span className="flex-1 text-mist">
              {l.materialUrl ? (
                <a href={l.materialUrl} target="_blank" rel="noopener noreferrer" className="hover:text-cyan">
                  {l.title} ↗
                </a>
              ) : (
                l.title
              )}
            </span>
            {l.durationMinutes && <span className="font-mono text-xs text-fog">{l.durationMinutes}m</span>}
            <button type="button" aria-label={`Remove ${l.title}`} disabled={pending} onClick={() => start(async () => (await deleteLesson(moduleId, l.id), router.refresh()))} className="text-fog hover:text-danger">
              <Icon name="close" size={13} />
            </button>
          </li>
        ))}
        {!lessons.length && <li className="text-sm text-fog">No lessons yet.</li>}
      </ol>
      <form ref={form} className="grid gap-2 sm:grid-cols-[1fr_6rem_1fr_auto]" action={(fd) => start(async () => (await addLesson(moduleId, Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]))), form.current?.reset(), router.refresh()))}>
        <input name="title" required maxLength={160} placeholder="Lesson title" className={field} />
        <input name="durationMinutes" type="number" min={1} max={600} placeholder="Min" aria-label="Minutes" className={field} />
        <input name="materialUrl" type="url" placeholder="Slides / video link" className={field} />
        <button type="submit" disabled={pending} className="btn btn-sm h-9">
          <Icon name="plus" size={14} />
          <span>Add</span>
        </button>
      </form>
    </div>
  );
}
