"use client";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { addChecklistItem, addTaskComment, createTask, deleteChecklistItem, deleteTask, getTaskDetail, moveTask, toggleChecklistItem, updateTask } from "@/server/actions/tasks";

export type Task = { id: string; title: string; description: string; status: Status; priority: string; position: number; assigneeId: string | null; assignee: string | null; projectId: string | null; project: string | null; teamId: string | null; teamAccent: string | null; dueDate: string | null; tags: string[]; checklist: [number, number]; createdBy: string | null };
type Status = "backlog" | "todo" | "in_progress" | "review" | "done";
type Opt = { id: string; name: string };
const COLUMNS: { id: Status; label: string; dot: string }[] = [
  { id: "backlog", label: "Backlog", dot: "bg-steel" },
  { id: "todo", label: "To do", dot: "bg-cyan" },
  { id: "in_progress", label: "In progress", dot: "bg-volt" },
  { id: "review", label: "Review", dot: "bg-warn" },
  { id: "done", label: "Done", dot: "bg-ok" },
];
const PRIORITY: Record<string, string> = { low: "text-steel", medium: "text-cyan", high: "text-warn", critical: "text-danger" };
const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const today = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10); // Cairo date, close enough for due badges

export function TaskBoard({ initial, members, projects, teams, me }: { initial: Task[]; members: Opt[]; projects: Opt[]; teams: Opt[]; me: { userId: string; memberId: string | null; manage: boolean } }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  useEffect(() => setTasks(initial), [initial]);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("task");
    if (id) setOpen(id);
  }, []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const canEdit = (t: Task) => me.manage || (!!me.memberId && t.assigneeId === me.memberId) || t.createdBy === me.userId;
  const visible = useMemo(() => tasks.filter((t) => (!mine || t.assigneeId === me.memberId) && (!q || t.title.toLowerCase().includes(q.toLowerCase()))), [tasks, mine, q, me.memberId]);
  const col = (s: Status) => visible.filter((t) => t.status === s).sort((a, b) => a.position - b.position);
  const find = (id: string) => tasks.find((t) => t.id === id);

  const onStart = (e: DragStartEvent) => setActive(String(e.active.id));
  const onOver = (e: DragOverEvent) => {
    const a = find(String(e.active.id));
    if (!a || !e.over) return;
    const overId = String(e.over.id);
    const target = (COLUMNS.find((c) => c.id === overId)?.id ?? find(overId)?.status) as Status | undefined;
    if (target && target !== a.status) setTasks((ts) => ts.map((t) => (t.id === a.id ? { ...t, status: target } : t)));
  };
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const a = find(String(e.active.id));
    if (!a || !e.over) return;
    if (!canEdit(a)) return router.refresh();
    const list = col(a.status).filter((t) => t.id !== a.id);
    const overId = String(e.over.id);
    let idx = list.findIndex((t) => t.id === overId);
    if (idx < 0) idx = list.length;
    const prev = list[idx - 1]?.position;
    const next = list[idx]?.position;
    const position = prev === undefined && next === undefined ? 0 : prev === undefined ? next! - 1 : next === undefined ? prev + 1 : (prev + next) / 2;
    setTasks((ts) => ts.map((t) => (t.id === a.id ? { ...t, position } : t)));
    start(async () => {
      const r = await moveTask(a.id, a.status, position);
      if (!r.ok) alert(r.error);
      router.refresh();
    });
  };
  const current = open ? find(open) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Search tasks</span>
          <Icon name="search" size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fog" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="h-9 w-full rounded-lg border border-[var(--line-2)] bg-deep/70 ps-9 pe-3 text-sm text-chalk outline-none placeholder:text-fog focus:border-cyan/60" />
        </label>
        {me.memberId && (
          <button type="button" onClick={() => setMine((v) => !v)} aria-pressed={mine} className={cn("h-9 rounded-lg border px-3 text-sm", mine ? "border-cyan/60 bg-cyan/10 text-chalk" : "border-[var(--line-2)] text-fog hover:text-mist")}>
            My tasks
          </button>
        )}
        <span className="ms-auto hidden text-xs text-fog sm:inline">Drag cards between columns · press and hold on phones</span>
      </div>
      <DndContext id="task-board" sensors={sensors} collisionDetection={closestCorners} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => (setActive(null), setTasks(initial))}>
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
          {COLUMNS.map((c) => (
            <Column key={c.id} column={c} tasks={col(c.id)} onOpen={setOpen} onAdd={(title) => start(async () => (await createTask({ title, status: c.id }), router.refresh()))} canAdd={me.manage || !!me.memberId} />
          ))}
        </div>
        <DragOverlay>{active && find(active) ? <Card task={find(active)!} overlay /> : null}</DragOverlay>
      </DndContext>
      {current && <TaskDrawer key={current.id} task={current} members={members} projects={projects} teams={teams} canEdit={canEdit(current)} canAssign={me.manage} onClose={() => (setOpen(null), history.replaceState(null, "", location.pathname))} />}
    </div>
  );
}

function Column({ column, tasks, onOpen, onAdd, canAdd }: { column: (typeof COLUMNS)[number]; tasks: Task[]; onOpen: (id: string) => void; onAdd: (title: string) => void; canAdd: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [adding, setAdding] = useState("");
  return (
    <section aria-label={column.label} className={cn("flex w-[78vw] max-w-[20rem] shrink-0 snap-start flex-col rounded-2xl border bg-deep/40 sm:w-72 lg:w-auto lg:max-w-none", isOver ? "border-cyan/50" : "border-[var(--line)]")}>
      <header className="flex items-center justify-between px-3 py-3">
        <span className="flex items-center gap-2 text-sm font-medium text-chalk">
          <span className={cn("size-2 rounded-full", column.dot)} />
          {column.label}
        </span>
        <span className="rounded-full bg-white/[0.06] px-2 font-mono text-[0.65rem] text-fog">{tasks.length}</span>
      </header>
      {canAdd && (
        <form
          className="px-2 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (adding.trim()) onAdd(adding.trim());
            setAdding("");
          }}
        >
          <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="+ Add a task" aria-label={`Add a task to ${column.label}`} maxLength={200} className="h-8 w-full rounded-lg border border-dashed border-[var(--line-2)] bg-transparent px-2.5 text-xs text-chalk outline-none placeholder:text-fog focus:border-cyan/60 focus:bg-deep" />
        </form>
      )}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3">
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} onOpen={onOpen} />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}

function SortableCard({ task, onOpen }: { task: Task; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} className={cn("touch-manipulation", isDragging && "opacity-30")}>
      <Card task={task} onOpen={() => onOpen(task.id)} />
    </li>
  );
}

function Card({ task, onOpen, overlay }: { task: Task; onOpen?: () => void; overlay?: boolean }) {
  const overdue = task.dueDate && task.status !== "done" && task.dueDate < today();
  return (
    <div role="button" tabIndex={-1} onClick={onOpen} className={cn("relative cursor-grab rounded-xl border border-[var(--line)] bg-panel/80 p-3 text-start shadow-[0_1px_0_rgb(255_255_255/0.04)_inset] transition-colors hover:border-[var(--line-2)] active:cursor-grabbing", overlay && "rotate-2 border-cyan/50 shadow-2xl")}>
      {task.teamAccent && <span className="absolute inset-y-3 start-0 w-0.5 rounded-full" style={{ background: task.teamAccent }} />}
      <p className={cn("text-sm leading-snug", task.status === "done" ? "text-fog line-through" : "text-chalk")}>{task.title}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[0.68rem]">
        <span className={cn("font-mono uppercase", PRIORITY[task.priority])}>{task.priority}</span>
        {task.project && <span className="max-w-[9rem] truncate text-fog">{task.project}</span>}
        {task.checklist[1] > 0 && (
          <span className="font-mono text-fog">
            ☑ {task.checklist[0]}/{task.checklist[1]}
          </span>
        )}
        {task.dueDate && <span className={cn("font-mono", overdue ? "text-danger" : "text-fog")}>{task.dueDate.slice(5)}</span>}
        {task.assignee && (
          <span title={task.assignee} className="ms-auto flex size-6 items-center justify-center rounded-full bg-volt/25 font-mono text-[0.6rem] text-chalk">
            {initials(task.assignee)}
          </span>
        )}
      </div>
    </div>
  );
}

type Detail = Awaited<ReturnType<typeof getTaskDetail>>;

function TaskDrawer({ task, members, projects, teams, canEdit, canAssign, onClose }: { task: Task; members: Opt[]; projects: Opt[]; teams: Opt[]; canEdit: boolean; canAssign: boolean; onClose: () => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState("");
  const [comment, setComment] = useState("");
  const load = () => getTaskDetail(task.id).then(setDetail);
  useEffect(() => {
    void load();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, reload = false) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Failed");
      if (reload) await load();
      router.refresh();
    });
  const save = (patch: Parameters<typeof updateTask>[1]) => run(() => updateTask(task.id, patch));
  const input = "h-9 w-full rounded-lg border border-[var(--line-2)] bg-deep/70 px-2.5 text-sm text-chalk outline-none focus:border-cyan/60 disabled:opacity-60";
  const d = detail?.ok ? detail.data : null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-void/60 backdrop-blur-sm" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={task.title} onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-s border-[var(--line-2)] bg-abyss p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <input defaultValue={task.title} disabled={!canEdit} onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && save({ title: e.target.value.trim() })} aria-label="Title" className="w-full bg-transparent font-display text-lg font-semibold text-chalk outline-none disabled:opacity-90" />
          <button type="button" onClick={onClose} aria-label="Close" className="text-fog hover:text-chalk">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs text-fog">
          <label className="flex flex-col gap-1">
            Status
            <select defaultValue={task.status} disabled={!canEdit} onChange={(e) => run(() => moveTask(task.id, e.target.value, task.position))} className={input}>
              {COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Priority
            <select defaultValue={task.priority} disabled={!canEdit} onChange={(e) => save({ priority: e.target.value as "low" })} className={input}>
              {["low", "medium", "high", "critical"].map((p) => (
                <option key={p} value={p}>
                  {p[0]!.toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Assignee
            <select defaultValue={task.assigneeId ?? ""} disabled={!canAssign} onChange={(e) => save({ assigneeId: e.target.value || null })} className={input}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Due
            <input type="date" defaultValue={task.dueDate ?? ""} disabled={!canEdit} onChange={(e) => save({ dueDate: e.target.value || null })} className={input} />
          </label>
          <label className="flex flex-col gap-1">
            Project
            <select defaultValue={task.projectId ?? ""} disabled={!canEdit} onChange={(e) => save({ projectId: e.target.value || null })} className={input}>
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Team
            <select defaultValue={task.teamId ?? ""} disabled={!canEdit} onChange={(e) => save({ teamId: e.target.value || null })} className={input}>
              <option value="">—</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-4 flex flex-col gap-1 text-xs text-fog">
          Description
          <textarea defaultValue={task.description} disabled={!canEdit} rows={4} onBlur={(e) => e.target.value !== task.description && save({ description: e.target.value })} className="w-full rounded-lg border border-[var(--line-2)] bg-deep/70 p-2.5 text-sm leading-relaxed text-chalk outline-none focus:border-cyan/60 disabled:opacity-60" dir="auto" />
        </label>

        <section className="mt-5">
          <h3 className="t-eyebrow text-[0.55rem] text-fog">Checklist</h3>
          <ul className="mt-2 flex flex-col gap-1">
            {d?.checklist.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={c.done} disabled={!canEdit || pending} onChange={(e) => run(() => toggleChecklistItem(task.id, c.id, e.target.checked), true)} className="size-4 accent-[#2ed47a]" aria-label={c.label} />
                <span className={cn("flex-1", c.done ? "text-fog line-through" : "text-mist")}>{c.label}</span>
                {canEdit && (
                  <button type="button" onClick={() => run(() => deleteChecklistItem(task.id, c.id), true)} aria-label={`Remove ${c.label}`} className="text-fog hover:text-danger">
                    <Icon name="close" size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <form
              className="mt-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (item.trim()) run(() => addChecklistItem(task.id, item.trim()), true);
                setItem("");
              }}
            >
              <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="+ Add an item" maxLength={200} className={input} />
            </form>
          )}
        </section>

        <section className="mt-5">
          <h3 className="t-eyebrow text-[0.55rem] text-fog">Discussion</h3>
          <ul className="mt-2 flex flex-col gap-3">
            {d?.comments.map((c) => (
              <li key={c.id} className="rounded-lg border border-[var(--line)] bg-deep/40 p-2.5 text-sm">
                <p className="mb-1 text-xs text-fog">
                  {c.author} · {new Date(c.at).toLocaleString("en-GB", { timeZone: "Africa/Cairo", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="whitespace-pre-line text-mist" dir="auto">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (comment.trim()) run(() => addTaskComment(task.id, comment.trim()), true);
              setComment("");
            }}
          >
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…" maxLength={4000} className={input} dir="auto" />
            <button type="submit" className="btn btn-sm h-9" disabled={!comment.trim()}>
              <span>Send</span>
            </button>
          </form>
        </section>

        {d && d.activity.length > 0 && (
          <section className="mt-5">
            <h3 className="t-eyebrow text-[0.55rem] text-fog">Activity</h3>
            <ul className="mt-2 space-y-1 text-xs text-fog">
              {d.activity.map((a, i) => (
                <li key={i}>{a.text}</li>
              ))}
            </ul>
          </section>
        )}
        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        {canEdit && (
          <button type="button" onClick={() => confirm("Delete this task?") && run(async () => (await deleteTask(task.id), onClose(), { ok: true }))} className="mt-auto self-start pt-6 text-sm text-danger hover:underline">
            Delete task
          </button>
        )}
      </aside>
    </div>
  );
}
