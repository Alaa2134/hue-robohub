"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { addMilestone, addProjectMember, deleteBomItem, deleteMilestone, removeProjectMember, saveBomItem, setBomStatus, toggleMilestone } from "@/server/actions/projects";
import { Meter, STATUS_TONE, humanize } from "./ui";

const egp = (n: number) => new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);
const BOM_STATUSES = ["needed", "ordered", "received", "installed", "failed", "replacement_needed"] as const;
type Bom = { id: string; part: string; quantity: number; unitPrice: number; vendor: string | null; url: string | null; status: string; notes: string | null };

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Failed");
      else {
        after?.();
        router.refresh();
      }
    });
  return { pending, error, act };
}

export function BomEditor({ projectId, items, budget, canEdit, title }: { projectId: string; items: Bom[]; budget: number; canEdit: boolean; title: string }) {
  const { pending, error, act } = useAct();
  const form = useRef<HTMLFormElement>(null);
  const total = items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
  const spent = items.filter((i) => i.status === "received" || i.status === "installed").reduce((a, i) => a + i.quantity * i.unitPrice, 0);
  const ordered = items.filter((i) => i.status === "ordered").reduce((a, i) => a + i.quantity * i.unitPrice, 0);
  const pct = budget > 0 ? (total / budget) * 100 : 0;

  const csv = () => {
    const rows = [["Part", "Qty", "Unit price (EGP)", "Line total (EGP)", "Vendor", "Status", "Link", "Notes"], ...items.map((i) => [i.part, i.quantity, i.unitPrice, i.quantity * i.unitPrice, i.vendor ?? "", humanize(i.status), i.url ?? "", i.notes ?? ""])];
    const text = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    a.download = `${title.replace(/[^\w-]+/g, "-").toLowerCase()}-bom.csv`;
    a.click();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["BOM total", egp(total), "text-chalk"],
          ["Spent", egp(spent), "text-ok"],
          ["On order", egp(ordered), "text-cyan"],
          ["Budget left", budget > 0 ? egp(budget - total) : "No budget", budget > 0 && budget - total < 0 ? "text-danger" : "text-mist"],
        ].map(([l, v, c]) => (
          <div key={l} className="rounded-xl border border-[var(--line)] bg-deep/50 p-3">
            <p className="t-eyebrow text-[0.52rem] text-fog">{l}</p>
            <p className={cn("mt-1 font-mono text-sm", c)}>{v}</p>
          </div>
        ))}
      </div>
      {budget > 0 && <Meter value={pct} tone={pct > 100 ? "danger" : pct > 85 ? "warn" : "volt"} />}

      <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-deep/80 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-fog">
            <tr>
              <th className="px-3 py-2.5 text-start font-medium">Part</th>
              <th className="px-3 py-2.5 text-end font-medium">Qty</th>
              <th className="px-3 py-2.5 text-end font-medium">Unit</th>
              <th className="px-3 py-2.5 text-end font-medium">Total</th>
              <th className="px-3 py-2.5 text-start font-medium">Vendor</th>
              <th className="px-3 py-2.5 text-start font-medium">Status</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-[var(--line)]">
                <td className="px-3 py-2 text-mist">
                  {i.url ? (
                    <a href={i.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-cyan">
                      {i.part} ↗
                    </a>
                  ) : (
                    i.part
                  )}
                </td>
                <td className="px-3 py-2 text-end font-mono text-xs">{i.quantity}</td>
                <td className="px-3 py-2 text-end font-mono text-xs">{egp(i.unitPrice)}</td>
                <td className="px-3 py-2 text-end font-mono text-xs text-chalk">{egp(i.quantity * i.unitPrice)}</td>
                <td className="px-3 py-2 text-xs text-fog">{i.vendor ?? "—"}</td>
                <td className="px-3 py-2">
                  {canEdit ? (
                    <select aria-label={`Status of ${i.part}`} value={i.status} disabled={pending} onChange={(e) => act(() => setBomStatus(projectId, i.id, e.target.value as Bom["status"] as never))} className={cn("h-7 rounded-md border bg-transparent px-1.5 text-xs", STATUS_TONE[i.status] === "ok" ? "border-ok/40 text-ok" : STATUS_TONE[i.status] === "danger" ? "border-danger/40 text-danger" : STATUS_TONE[i.status] === "warn" ? "border-warn/40 text-warn" : "border-[var(--line-2)] text-mist")}>
                      {BOM_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {humanize(s)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs">{humanize(i.status)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-end">
                  {canEdit && (
                    <button type="button" aria-label={`Remove ${i.part}`} disabled={pending} onClick={() => confirm(`Remove ${i.part}?`) && act(() => deleteBomItem(projectId, i.id))} className="text-fog hover:text-danger">
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-fog">
                  No parts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form
          ref={form}
          className="grid grid-cols-2 gap-2 xl:grid-cols-[minmax(0,2fr)_4.5rem_6.5rem_minmax(0,1fr)_minmax(0,1fr)_auto]"
          action={(fd) => act(() => saveBomItem(projectId, Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]))), () => form.current?.reset())}
        >
          <input name="part" required maxLength={160} placeholder="Part (e.g. TB6612FNG driver)" className="col-span-2 h-9 min-w-0 rounded-md border border-[var(--line-2)] bg-deep/70 px-2.5 text-sm text-chalk outline-none placeholder:text-steel focus:border-cyan/60 sm:col-span-1" />
          <input name="quantity" type="number" min={1} defaultValue={1} aria-label="Quantity" className="h-9 min-w-0 rounded-md border border-[var(--line-2)] bg-deep/70 px-2.5 text-sm text-chalk outline-none focus:border-cyan/60" />
          <input name="unitPrice" type="number" min={0} step="any" placeholder="Unit EGP" aria-label="Unit price" className="h-9 min-w-0 rounded-md border border-[var(--line-2)] bg-deep/70 px-2.5 text-sm text-chalk outline-none placeholder:text-steel focus:border-cyan/60" />
          <input name="vendor" maxLength={120} placeholder="Vendor" className="h-9 min-w-0 rounded-md border border-[var(--line-2)] bg-deep/70 px-2.5 text-sm text-chalk outline-none placeholder:text-steel focus:border-cyan/60" />
          <input name="url" type="url" placeholder="https://link" className="h-9 min-w-0 rounded-md border border-[var(--line-2)] bg-deep/70 px-2.5 text-sm text-chalk outline-none placeholder:text-steel focus:border-cyan/60" />
          <input type="hidden" name="status" value="needed" />
          <button type="submit" disabled={pending} className="btn btn-sm h-9">
            <Icon name="plus" size={14} />
            <span>Add</span>
          </button>
        </form>
      )}
      <div className="flex items-center justify-between gap-3">
        {error ? <p className="text-sm text-danger">{error}</p> : <span />}
        {items.length > 0 && (
          <button type="button" onClick={csv} className="text-xs text-cyan hover:underline">
            Export CSV
          </button>
        )}
      </div>
    </div>
  );
}

export function ProjectTeam({ projectId, team, members, canEdit }: { projectId: string; team: { id: string; name: string; role: string }[]; members: { id: string; name: string }[]; canEdit: boolean }) {
  const { pending, error, act } = useAct();
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState("Engineer");
  const available = members.filter((m) => !team.some((t) => t.id === m.id));
  return (
    <div className="flex flex-col gap-3">
      {team.length ? (
        <ul className="divide-y divide-[var(--line)]">
          {team.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-mist">
                {t.name} <span className="text-xs text-fog">· {t.role}</span>
              </span>
              {canEdit && (
                <button type="button" disabled={pending} onClick={() => act(() => removeProjectMember(projectId, t.id))} className="text-xs text-fog hover:text-danger">
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fog">No one assigned yet.</p>
      )}
      {canEdit && available.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label="Member" className="h-9 min-w-0 basis-full rounded-md border border-[var(--line-2)] bg-deep/70 px-2 text-sm text-mist">
            <option value="">Add a member…</option>
            {available.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={60} aria-label="Role" className="h-9 min-w-0 flex-1 rounded-md border border-[var(--line-2)] bg-deep/70 px-2.5 text-sm text-chalk" />
          <button type="button" disabled={!memberId || pending} onClick={() => act(() => addProjectMember(projectId, memberId, role), () => setMemberId(""))} className="btn btn-sm h-9">
            <span>Add</span>
          </button>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function Milestones({ projectId, items, canEdit }: { projectId: string; items: { id: string; title: string; dueDate: string | null; done: boolean }[]; canEdit: boolean }) {
  const { pending, error, act } = useAct();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const done = items.filter((i) => i.done).length;
  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 && <Meter value={(done / items.length) * 100} tone="ok" />}
      <ul className="flex flex-col gap-1">
        {items.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-md px-1 py-1.5 text-sm hover:bg-panel/50">
            <input type="checkbox" checked={m.done} disabled={!canEdit || pending} onChange={(e) => act(() => toggleMilestone(projectId, m.id, e.target.checked))} className="size-4 accent-[#2ed47a]" aria-label={m.title} />
            <span className={cn("flex-1", m.done ? "text-fog line-through" : "text-mist")}>{m.title}</span>
            {m.dueDate && <span className="font-mono text-xs text-fog">{m.dueDate}</span>}
            {canEdit && (
              <button type="button" aria-label={`Delete ${m.title}`} onClick={() => act(() => deleteMilestone(projectId, m.id))} className="text-fog hover:text-danger">
                <Icon name="close" size={13} />
              </button>
            )}
          </li>
        ))}
        {!items.length && <li className="text-sm text-fog">No milestones yet.</li>}
      </ul>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Milestone (e.g. Chassis printed)" maxLength={160} className="h-9 min-w-0 basis-full rounded-md border border-[var(--line-2)] bg-deep/70 px-2.5 text-sm text-chalk placeholder:text-steel" />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="h-9 min-w-0 flex-1 rounded-md border border-[var(--line-2)] bg-deep/70 px-2 text-sm text-chalk" />
          <button type="button" disabled={!title.trim() || pending} onClick={() => act(() => addMilestone(projectId, title, due), () => (setTitle(""), setDue("")))} className="btn btn-sm h-9">
            <span>Add</span>
          </button>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
