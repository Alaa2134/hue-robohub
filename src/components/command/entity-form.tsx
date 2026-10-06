"use client";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/server/action";
import { Field, FormError, Input, Select, Textarea } from "./field";
import { ImageField } from "./image-field";

type Base = { name: string; label: string; hint?: string; wide?: boolean; required?: boolean };
export type EntityField =
  | (Base & { kind: "text" | "email" | "url" | "tel" | "date" | "datetime" | "color"; placeholder?: string; ltr?: boolean; maxLength?: number })
  | (Base & { kind: "number"; min?: number; max?: number; step?: number | "any" })
  | (Base & { kind: "textarea"; rows?: number; placeholder?: string; rtl?: boolean })
  | (Base & { kind: "select"; options: readonly { value: string; label: string }[]; empty?: string })
  | (Base & { kind: "switch" })
  | (Base & { kind: "tags"; placeholder?: string })
  | (Base & { kind: "image"; currentUrl?: string | null; aspect?: string })
  | { kind: "heading"; label: string; hint?: string };

export type EntityValue = Record<string, string | number | boolean | null | undefined | readonly string[]>;
type SaveAction = (prev: unknown, form: FormData) => Promise<ActionResult<unknown>>;

/**
 * Declarative Command Center editor used by most modules: fields in, one server action out.
 * Server actions validate everything again; the browser only helps with required/format hints.
 */
export function EntityForm({ action, value, fields, submitLabel = "Save", cancelHref, onDelete, deleteLabel = "Delete", hidden }: { action: SaveAction; value: EntityValue; fields: EntityField[]; submitLabel?: string; cancelHref?: string; onDelete?: () => Promise<unknown>; deleteLabel?: string; hidden?: Record<string, string> }) {
  const [state, formAction, pending] = useActionState(action, null as ActionResult<unknown> | null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {value.id ? <input type="hidden" name="id" value={String(value.id)} /> : null}
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((f, i) => {
          if (f.kind === "heading")
            return (
              <div key={`h${i}`} className="mt-3 border-t border-[var(--line)] pt-5 sm:col-span-2">
                <p className="font-display text-sm font-semibold text-chalk">{f.label}</p>
                {f.hint && <p className="mt-0.5 text-xs text-fog">{f.hint}</p>}
              </div>
            );
          const v = value[f.name];
          const wide = f.wide ?? (f.kind === "textarea" || f.kind === "image");
          const cls = cn(wide && "sm:col-span-2");
          if (f.kind === "image") return <div key={f.name} className={cls}><ImageField name={f.name} label={f.label} currentUrl={f.currentUrl} aspect={f.aspect} hint={f.hint} /></div>;
          if (f.kind === "switch")
            return (
              <label key={f.name} className={cn("flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[var(--line-2)] bg-deep/50 p-4 has-[:checked]:border-ok/40 has-[:checked]:bg-ok/[0.05]", cls)}>
                <span>
                  <span className="block text-sm font-medium text-chalk">{f.label}</span>
                  {f.hint && <span className="block text-xs text-fog">{f.hint}</span>}
                </span>
                <input type="checkbox" name={f.name} defaultChecked={!!v} className="peer sr-only" />
                <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-steel transition-colors peer-checked:bg-ok peer-focus-visible:ring-2 peer-focus-visible:ring-cyan/60 after:absolute after:start-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:start-6" />
              </label>
            );
          const err = fe[f.name];
          const optional = !f.required;
          let control: React.ReactNode;
          if (f.kind === "textarea") control = <Textarea name={f.name} defaultValue={(v as string) ?? ""} rows={f.rows ?? 4} required={f.required} placeholder={f.placeholder} error={err} dir={f.rtl ? "rtl" : undefined} />;
          else if (f.kind === "select")
            control = (
              <Select name={f.name} defaultValue={(v as string) ?? ""} required={f.required} error={err}>
                {f.empty !== undefined && <option value="">{f.empty}</option>}
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            );
          else if (f.kind === "number") control = <Input name={f.name} type="number" inputMode="decimal" defaultValue={v === null || v === undefined ? "" : String(v)} min={f.min} max={f.max} step={f.step} required={f.required} error={err} />;
          else if (f.kind === "tags") control = <Input name={f.name} defaultValue={Array.isArray(v) ? v.join(", ") : ((v as string) ?? "")} placeholder={f.placeholder} error={err} />;
          else {
            const type = f.kind === "datetime" ? "datetime-local" : f.kind;
            control = <Input name={f.name} type={type} defaultValue={(v as string) ?? ""} required={f.required} placeholder={f.placeholder} maxLength={f.maxLength} error={err} dir={f.ltr || f.kind === "url" || f.kind === "email" || f.kind === "tel" ? "ltr" : undefined} className={f.kind === "color" ? "h-11 p-1.5" : undefined} />;
          }
          return (
            <Field key={f.name} label={f.label} name={f.name} hint={f.kind === "datetime" ? (f.hint ?? "Cairo time") : f.kind === "tags" ? (f.hint ?? "Comma separated") : f.hint} error={err} optional={optional && f.kind !== "select"} className={cls}>
              {control}
            </Field>
          );
        })}
      </div>
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-wrap items-center gap-3 border-t border-[var(--line)] bg-abyss/90 px-4 py-4 backdrop-blur lg:bottom-0 lg:mx-0 lg:rounded-xl lg:border">
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          <span aria-hidden className="btn-sheen" />
          <Icon name="check" size={14} />
          <span>{pending ? "Saving…" : submitLabel}</span>
        </button>
        {cancelHref && (
          <Link href={cancelHref} className="btn btn-sm">
            <span>Cancel</span>
          </Link>
        )}
        {state?.ok && (
          <span role="status" className="flex items-center gap-2 text-sm text-ok">
            <Icon name="check" size={14} /> Saved
          </span>
        )}
        {onDelete &&
          (confirming ? (
            <span className="ms-auto flex items-center gap-2 text-sm">
              <span className="text-danger">Delete permanently?</span>
              <button type="button" disabled={deleting} className="btn btn-sm text-danger" onClick={() => startDelete(async () => void (await onDelete()))}>
                <span>{deleting ? "Deleting…" : "Yes, delete"}</span>
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>
                <span>Keep</span>
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-sm ms-auto text-danger" onClick={() => setConfirming(true)}>
              <Icon name="close" size={14} />
              <span>{deleteLabel}</span>
            </button>
          ))}
        <div className="w-full empty:hidden">
          <FormError message={state && !state.ok ? state.error : undefined} requestId={state && !state.ok ? state.requestId : undefined} />
        </div>
      </div>
    </form>
  );
}
