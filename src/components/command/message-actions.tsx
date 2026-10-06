"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteMessage, setMessageStatus } from "@/server/actions/messages";

/** Inbox row actions (opening an unread message marks it read — see MarkReadOnOpen). */
export function MessageActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "archived" ? (
        <button type="button" disabled={pending} className="btn btn-sm" onClick={() => run(() => setMessageStatus(id, "archived"))}>
          <span>Archive</span>
        </button>
      ) : (
        <button type="button" disabled={pending} className="btn btn-sm" onClick={() => run(() => setMessageStatus(id, "new"))}>
          <span>Move to inbox</span>
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        className="btn btn-sm text-danger"
        onClick={() => {
          if (confirm("Delete this message permanently?")) run(() => deleteMessage(id));
        }}
      >
        <span>Delete</span>
      </button>
    </div>
  );
}

/** Collapsible message; opening an unread one marks it read in place (it stays in the inbox until archived). */
export function MarkReadOnOpen({ id, unread, children }: { id: string; unread: boolean; children: React.ReactNode }) {
  const [isUnread, setUnread] = useState(unread);
  return (
    <details
      data-unread={isUnread}
      className="group rounded-2xl border border-[var(--line)] bg-deep/40 open:border-[var(--line-2)] open:bg-panel/40"
      onToggle={(e) => {
        if (isUnread && (e.currentTarget as HTMLDetailsElement).open) {
          setUnread(false);
          void setMessageStatus(id, "read");
        }
      }}
    >
      {children}
    </details>
  );
}
