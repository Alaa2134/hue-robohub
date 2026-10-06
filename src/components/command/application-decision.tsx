"use client";
import { useActionState, useState, useTransition } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { mailtoLink, whatsappLink } from "@/lib/contact";
import { recruitMessage } from "@/lib/recruit-messages";
import { formatZoned, fromZonedInput } from "@/lib/zoned";
import type { ActionResult } from "@/server/action";
import { convertApplication, decideApplication, deleteApplication } from "@/server/actions/applications";
import { Field, FormError, Input, Textarea } from "./field";
import { StatusBadge, humanize } from "./ui";

const FLOW = ["pending", "interview", "accepted", "waitlist", "rejected", "trainee"] as const;

type App = { id: string; fullName: string; email: string; phone: string; status: string; interviewAt: string; score: number | null; reviewerNotes: string | null; memberId: string | null };

/** Decision panel: status, interview slot, score, notes — plus one-tap WhatsApp/email with a matching message. */
export function ApplicationDecision({ app, canDecide, canConvert }: { app: App; canDecide: boolean; canConvert: boolean }) {
  const [state, action, pending] = useActionState(decideApplication, null as ActionResult<{ status: string }> | null);
  const [status, setStatus] = useState(app.status);
  const [when, setWhen] = useState(app.interviewAt);
  const [busy, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const whenDate = when ? fromZonedInput(when) : null;
  const whenLabel = whenDate ? formatZoned(whenDate) : null;
  const msg = recruitMessage(status, app.fullName, whenDate ? { en: formatZoned(whenDate), ar: formatZoned(whenDate, { lang: "ar" }) } : null);
  const wa = whatsappLink(app.phone, msg.body);
  const converted = !!app.memberId || status === "converted";

  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="id" value={app.id} />
        <fieldset disabled={!canDecide || pending} className="flex flex-col gap-5 disabled:opacity-90">
          <legend className="sr-only">Decision</legend>
          {converted ? (
            <input type="hidden" name="status" value="converted" />
          ) : (
            <div role="radiogroup" aria-label="Status" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {FLOW.map((s) => (
                <label key={s} className={cn("flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-center text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cyan/60", status === s ? "border-cyan/60 bg-cyan/[0.08] text-chalk" : "border-[var(--line-2)] text-fog hover:text-mist")}>
                  <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} className="sr-only" />
                  {humanize(s)}
                </label>
              ))}
            </div>
          )}
          {(status === "interview" || when) && (
            <Field label="Interview (Cairo time)" name="interviewAt" error={fe.interviewAt} hint={whenLabel ?? undefined}>
              <Input name="interviewAt" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} error={fe.interviewAt} required={status === "interview"} />
            </Field>
          )}
          {status !== "interview" && !when && <input type="hidden" name="interviewAt" value="" />}
          <div className="grid grid-cols-[8rem_1fr] gap-4">
            <Field label="Score" name="score" error={fe.score} hint="0–10" optional>
              <Input name="score" type="number" min={0} max={10} step={1} defaultValue={app.score ?? ""} inputMode="numeric" />
            </Field>
            <Field label="Reviewer notes" name="reviewerNotes" hint="Private — leads and admins only." optional>
              <Textarea name="reviewerNotes" defaultValue={app.reviewerNotes ?? ""} rows={3} className="min-h-[5.5rem]" />
            </Field>
          </div>
        </fieldset>
        {canDecide && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
              <span aria-hidden className="btn-sheen" />
              <Icon name="check" size={14} />
              <span>{pending ? "Saving…" : "Save decision"}</span>
            </button>
            {state?.ok && (
              <span role="status" className="flex items-center gap-2 text-sm text-ok">
                <Icon name="check" size={14} /> Saved as <StatusBadge status={state.data.status} />
              </span>
            )}
          </div>
        )}
        <FormError message={state && !state.ok ? state.error : undefined} requestId={state && !state.ok ? state.requestId : undefined} />
      </form>

      <div className="rounded-xl border border-[var(--line)] bg-deep/50 p-4">
        <p className="t-eyebrow text-[0.55rem] text-fog">Message for “{humanize(status)}”</p>
        <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-mist">
          {msg.body.split("\n\n").map((para) => (
            <p key={para} dir="auto">
              {para}
            </p>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
              <Icon name="external" size={14} />
              <span>WhatsApp</span>
            </a>
          )}
          <a href={mailtoLink(app.email, msg.subject, msg.body)} className="btn btn-sm">
            <Icon name="mail" size={14} />
            <span>Email</span>
          </a>
          <button type="button" className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(msg.body)}>
            <span>Copy text</span>
          </button>
        </div>
      </div>

      {canDecide && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-5">
          {canConvert && !app.memberId && (status === "accepted" || status === "trainee") && (
            <button
              type="button"
              disabled={busy}
              className="btn btn-sm"
              onClick={() =>
                start(async () => {
                  const r = await convertApplication(app.id);
                  if (r && !r.ok) setActionError(r.error);
                })
              }
            >
              <Icon name="users" size={14} />
              <span>{busy ? "Creating member…" : status === "trainee" ? "Convert to trainee member" : "Convert to member"}</span>
            </button>
          )}
          {confirmDelete ? (
            <span className="ms-auto flex items-center gap-2 text-sm">
              <span className="text-danger">Delete this application?</span>
              <button type="button" disabled={busy} className="btn btn-sm text-danger" onClick={() => start(async () => void (await deleteApplication(app.id)))}>
                <span>Yes, delete</span>
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(false)}>
                <span>Keep</span>
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-sm ms-auto text-danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="close" size={14} />
              <span>Delete</span>
            </button>
          )}
          {actionError && <p className="w-full text-sm text-danger">{actionError}</p>}
        </div>
      )}
    </div>
  );
}
