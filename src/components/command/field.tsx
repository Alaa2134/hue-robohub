import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Command Center form field: label, control, hint and error with proper ARIA wiring. */
export function Field({ label, name, error, hint, children, className, optional }: { label: string; name: string; error?: string; hint?: ReactNode; children?: ReactNode; className?: string; optional?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={name} className="flex items-baseline justify-between gap-3 text-[0.78rem] font-medium text-frost">
        {label}
        {optional && <span className="text-[0.68rem] font-normal text-fog">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <div id={`${name}-hint`} className="text-xs text-fog">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export const inputCls =
  "h-11 w-full rounded-lg border border-[var(--line-2)] bg-deep/80 px-3.5 text-[0.95rem] text-chalk placeholder:text-steel transition-[border-color,box-shadow] outline-none focus:border-cyan/70 focus:shadow-[0_0_0_3px_rgb(56_220_255/0.12)] aria-[invalid=true]:border-danger/70 disabled:opacity-60 max-sm:text-base";

export function Input({ name, error, className, ...rest }: ComponentProps<"input"> & { name: string; error?: string }) {
  return <input id={name} name={name} aria-invalid={error ? true : undefined} aria-describedby={error ? `${name}-error` : undefined} className={cn(inputCls, className)} {...rest} />;
}

export function Textarea({ name, error, className, ...rest }: ComponentProps<"textarea"> & { name: string; error?: string }) {
  return <textarea id={name} name={name} aria-invalid={error ? true : undefined} aria-describedby={error ? `${name}-error` : undefined} className={cn(inputCls, "h-auto min-h-28 py-3 leading-relaxed", className)} {...rest} />;
}

export function Select({ name, error, className, children, ...rest }: ComponentProps<"select"> & { name: string; error?: string }) {
  return (
    <select id={name} name={name} aria-invalid={error ? true : undefined} aria-describedby={error ? `${name}-error` : undefined} className={cn(inputCls, "appearance-none bg-[length:16px] bg-[right_0.8rem_center] bg-no-repeat pe-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239fb0c9' stroke-width='1.6'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

export function FormError({ message, requestId }: { message?: string; requestId?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-[#ffb3ba]">
      {message}
      {requestId && <span className="mt-1 block font-mono text-[0.65rem] text-danger/70">REF {requestId}</span>}
    </div>
  );
}
