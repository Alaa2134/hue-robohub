"use client";
import { useActionState } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/server/action";
import { saveSetting } from "@/server/actions/settings";
import { Field, FormError, Input, Textarea } from "./field";

export type SettingField =
  | { kind?: "text"; name: string; label: string; type?: "text" | "email" | "url" | "tel"; hint?: string; localized?: boolean; textarea?: boolean; rows?: number; placeholder?: string; wide?: boolean; ltr?: boolean }
  | { kind: "switch"; name: string; label: string; hint?: string }
  | { kind: "heading"; label: string };

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** One CMS section: declarative fields (EN + AR where localized), saved atomically and published instantly. */
export function SettingsSection({ settingKey, value, fields, submitLabel = "Save & publish" }: { settingKey: string; value: unknown; fields: SettingField[]; submitLabel?: string }) {
  const [state, action, pending] = useActionState(saveSetting, null as ActionResult | null);
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="_key" value={settingKey} />
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((f, i) => {
          if (f.kind === "heading") {
            return (
              <p key={`h${i}`} className="t-eyebrow -mb-2 mt-2 text-[0.55rem] text-cyan sm:col-span-2">
                {f.label}
              </p>
            );
          }
          if (f.kind === "switch") {
            return (
              <label key={f.name} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[var(--line-2)] bg-deep/50 p-4 has-[:checked]:border-ok/40 has-[:checked]:bg-ok/[0.05]">
                <span>
                  <span className="block text-sm font-medium text-chalk">{f.label}</span>
                  {f.hint && <span className="block text-xs text-fog">{f.hint}</span>}
                </span>
                <input type="checkbox" name={f.name} defaultChecked={!!get(value, f.name)} className="peer sr-only" />
                <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-steel transition-colors peer-checked:bg-ok peer-focus-visible:ring-2 peer-focus-visible:ring-cyan/60 after:absolute after:start-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:start-6" />
              </label>
            );
          }
          const control = (n: string, dir?: "ltr" | "rtl") => {
            const v = (get(value, n) as string | undefined) ?? "";
            return f.textarea ? (
              <Textarea name={n} defaultValue={v} error={fe[n]} rows={f.rows ?? 3} placeholder={f.placeholder} dir={dir} lang={dir === "rtl" ? "ar" : undefined} />
            ) : (
              <Input name={n} type={f.type ?? "text"} defaultValue={v} error={fe[n]} placeholder={f.placeholder} dir={dir} lang={dir === "rtl" ? "ar" : undefined} />
            );
          };
          if (!f.localized) {
            return (
              <Field key={f.name} label={f.label} name={f.name} hint={f.hint} error={fe[f.name]} className={cn(f.wide && "sm:col-span-2")}>
                {control(f.name, f.ltr || f.type === "email" || f.type === "url" || f.type === "tel" ? "ltr" : undefined)}
              </Field>
            );
          }
          return (
            <div key={f.name} className={cn("grid gap-3 sm:grid-cols-2", f.wide !== false && "sm:col-span-2")}>
              <Field label={`${f.label} · English`} name={`${f.name}.en`} hint={f.hint} error={fe[`${f.name}.en`]}>
                {control(`${f.name}.en`, "ltr")}
              </Field>
              <Field label={`${f.label} · العربية`} name={`${f.name}.ar`} error={fe[`${f.name}.ar`]} optional>
                {control(`${f.name}.ar`, "rtl")}
              </Field>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5">
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          <span aria-hidden className="btn-sheen" />
          <Icon name="check" size={14} />
          <span>{pending ? "Publishing…" : submitLabel}</span>
        </button>
        {state?.ok && (
          <span role="status" className="flex items-center gap-2 text-sm text-ok">
            <Icon name="check" size={14} /> Published — live on the website.
          </span>
        )}
        <FormError message={state && !state.ok ? state.error : undefined} requestId={state && !state.ok ? state.requestId : undefined} />
      </div>
    </form>
  );
}
