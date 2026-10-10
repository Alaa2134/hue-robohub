"use client";
/** BuildX App UI kit: Arabic RTL, touch-first, brand tokens from globals.css. */
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type SVGProps,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Icons, type IconName } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { errorText } from "./core";

/* ─── Icons (brand set + app glyphs drawn on the same 24px grid) ───────── */

function Svg({ size = 20, children, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

const APP_ICONS = {
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />,
  download: <path d="M12 4v12M7 11l5 5 5-5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  logout: <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 8l-4 4 4 4M5 12h11" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  file: <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  copy: <path d="M9 9h10v11H9zM5 15V4h10" />,
  share: <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />,
  keyboard: <path d="M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10" />,
  wifiOff: <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.2-1.6M2 9a15 15 0 0 1 4.5-2.8M22 9a15 15 0 0 0-11-3.8M12 20h.01" />,
  printer: <path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" />,
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2L20 3M17 6l3 3M15 8l2 2" />
    </>
  ),
  dots: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  alert: <path d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  xCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 10" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9 2h6" />
    </>
  ),
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  scan: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />,
  barcode: <path d="M4 5v14M7 5v14M10 5v14M14 5v14M16 5v14M20 5v14M12 5v14" strokeWidth={1.5} />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  quiz: (
    <>
      <path d="M5 4h14v16H5z" />
      <path d="M9 9a3 3 0 1 1 3.5 3c-.4.1-.5.4-.5.8V14M12 17h.01" />
    </>
  ),
  eyeOff: <path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 22 12a14 14 0 0 1-2.5 3.4M6.6 6.6A14 14 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  install: <path d="M12 3v11M7 10l5 5 5-5M5 21h14" />,
  box: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />,
} as const;

export type IconKey = IconName | keyof typeof APP_ICONS;

export function Icon({ name, size = 20, className }: { name: IconKey; size?: number; className?: string }) {
  if (name in APP_ICONS)
    return (
      <Svg size={size} className={className}>
        {APP_ICONS[name as keyof typeof APP_ICONS]}
      </Svg>
    );
  const C = Icons[name as IconName];
  return <C size={size} className={className} />;
}

/* ─── Router (hash based: static hosting needs no rewrites) ────────────── */

export function useRoute() {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    on();
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const raw = hash.replace(/^#/, "") || "/";
  const [p, q] = raw.split("?");
  return { path: (p ?? "").split("/").filter(Boolean), query: new URLSearchParams(q ?? ""), raw };
}

export function go(to: string, replace = false) {
  if (replace) {
    history.replaceState(null, "", `#${to}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else window.location.hash = to;
}

/* ─── Data loading ─────────────────────────────────────────────────────── */

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (error) => alive && setState((s) => ({ ...s, error, loading: false })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const set = useCallback((data: T | ((prev: T | undefined) => T)) => setState((s) => ({ ...s, data: typeof data === "function" ? (data as (p: T | undefined) => T)(s.data) : data })), []);
  return { ...state, reload, set };
}

/* ─── Toasts & confirm ─────────────────────────────────────────────────── */

type ToastItem = { id: number; text: string; kind: "ok" | "error" | "info" };
const toastListeners = new Set<(t: ToastItem) => void>();
let toastSeq = 0;

export function toast(text: string, kind: ToastItem["kind"] = "ok") {
  const t = { id: ++toastSeq, text, kind };
  toastListeners.forEach((l) => l(t));
}
toast.error = (e: unknown) => toast(typeof e === "string" ? e : errorText(e), "error");

type ConfirmReq = { title: string; body?: ReactNode; ok?: string; danger?: boolean; resolve: (v: boolean) => void };
const confirmListeners = new Set<(r: ConfirmReq) => void>();
export function confirmDialog(o: Omit<ConfirmReq, "resolve">) {
  return new Promise<boolean>((resolve) => confirmListeners.forEach((l) => l({ ...o, resolve })));
}

export function Overlays() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [ask, setAsk] = useState<ConfirmReq | null>(null);
  useEffect(() => {
    const onToast = (t: ToastItem) => {
      setToasts((list) => [...list.slice(-2), t]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), t.kind === "error" ? 5000 : 2800);
    };
    const onAsk = (r: ConfirmReq) => setAsk(r);
    toastListeners.add(onToast);
    confirmListeners.add(onAsk);
    return () => {
      toastListeners.delete(onToast);
      confirmListeners.delete(onAsk);
    };
  }, []);
  const close = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4 print:hidden" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={cn(
              "flex max-w-md items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur-xl",
              t.kind === "error" ? "border-danger/40 bg-[#2a0d14]/95 text-[#ffd0d5]" : t.kind === "info" ? "border-cyan/30 bg-panel/95 text-chalk" : "border-ok/40 bg-[#062a1f]/95 text-[#c9fbe8]",
            )}
          >
            <Icon name={t.kind === "error" ? "alert" : t.kind === "info" ? "info" : "checkCircle"} size={18} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      <Sheet open={!!ask} onClose={() => close(false)} title={ask?.title ?? ""}>
        {ask?.body && <div className="mb-5 text-[15px] leading-relaxed text-mist">{ask.body}</div>}
        <div className="flex gap-3">
          <Button variant={ask?.danger ? "danger" : "primary"} block onClick={() => close(true)}>
            {ask?.ok ?? "تأكيد"}
          </Button>
          <Button variant="secondary" block onClick={() => close(false)}>
            إلغاء
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/* ─── Primitives ───────────────────────────────────────────────────────── */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "ok";
  size?: "sm" | "md" | "lg";
  icon?: IconKey;
  loading?: boolean;
  block?: boolean;
};

export function Button({ variant = "secondary", size = "md", icon, loading, block, className, children, disabled, type = "button", ...rest }: BtnProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-9 px-3 text-[13px]" : size === "lg" ? "h-14 px-6 text-base" : "h-11 px-4 text-[15px]",
        variant === "primary" && "bg-gradient-to-b from-[#3d7dff] to-[#1f57e6] text-white shadow-[0_10px_30px_-10px_rgb(43_109_255/0.75)] hover:from-[#4d89ff]",
        variant === "secondary" && "border border-[var(--line-2)] bg-white/[0.04] text-chalk hover:border-cyan/40 hover:bg-white/[0.07]",
        variant === "ghost" && "text-mist hover:bg-white/[0.06] hover:text-chalk",
        variant === "danger" && "border border-danger/35 bg-danger/10 text-[#ff9aa5] hover:bg-danger/15",
        variant === "ok" && "bg-gradient-to-b from-[#3fe0aa] to-[#1fb984] text-[#04241a] shadow-[0_10px_30px_-12px_rgb(51_214_159/0.7)]",
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : 19} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconKey; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-mist transition hover:bg-white/[0.07] hover:text-chalk active:scale-95 disabled:opacity-40", className)}
      {...rest}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

export const inputClass =
  "h-12 w-full rounded-xl border border-[var(--line-2)] bg-deep/80 px-3.5 text-[15px] text-chalk outline-none transition placeholder:text-fog/80 focus:border-cyan/60 focus:ring-2 focus:ring-cyan/15 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(inputClass, className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClass, "appearance-none bg-[length:16px] bg-[left_0.9rem_center] bg-no-repeat pe-9 ps-3.5", className)} style={{ backgroundImage: SELECT_ARROW }} {...rest}>
      {children}
    </select>
  );
}
const SELECT_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239fb0c9' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputClass, "h-auto min-h-24 py-3 leading-relaxed", className)} {...rest} />;
});

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cn("grid content-start gap-1.5", className)}>
      <span className="text-[13px] font-medium text-mist">{label}</span>
      {children}
      {hint && !error && <span className="text-xs leading-relaxed text-fog">{hint}</span>}
      {error && <span className="text-xs text-[#ff9aa5]">{error}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-white/[0.02] px-4 py-3 text-start transition hover:border-[var(--line-2)] disabled:opacity-50"
    >
      <span className="grid gap-0.5">
        <span className="text-[15px] font-medium text-chalk">{label}</span>
        {hint && <span className="text-xs text-fog">{hint}</span>}
      </span>
      <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-ok" : "bg-steel")}>
        <span className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-all", checked ? "start-6" : "start-1")} />
      </span>
    </button>
  );
}

export function Chip({ active, onClick, children, count }: { active?: boolean; onClick?: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition",
        active ? "border-cyan/60 bg-cyan/15 text-ice" : "border-[var(--line-2)] text-mist hover:text-chalk",
      )}
    >
      {children}
      {count != null && <span className={cn("rounded-full px-1.5 text-[11px]", active ? "bg-cyan/25" : "bg-white/10")}>{count}</span>}
    </button>
  );
}

type Tone = "ok" | "warn" | "danger" | "info" | "muted" | "volt";
const TONES: Record<Tone, string> = {
  ok: "border-ok/30 bg-ok/10 text-[#7cf0c6]",
  warn: "border-warn/30 bg-warn/10 text-[#ffd08a]",
  danger: "border-danger/30 bg-danger/10 text-[#ff9aa5]",
  info: "border-cyan/30 bg-cyan/10 text-ice",
  muted: "border-[var(--line-2)] bg-white/[0.04] text-mist",
  volt: "border-volt/40 bg-volt/15 text-[#a9c6ff]",
};
export function Badge({ tone = "muted", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-[12px] font-medium", TONES[tone], className)}>{children}</span>;
}

export const STATUS_TONE: Record<string, Tone> = { present: "ok", late: "warn", excused: "info", absent: "danger", pending: "muted" };

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-[var(--line)] bg-panel/70 p-4 shadow-[0_1px_0_rgb(255_255_255/0.03)_inset]", className)} {...rest}>
      {children}
    </div>
  );
}

export function Spinner({ size = 22 }: { size?: number }) {
  return <span aria-hidden style={{ width: size, height: size }} className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent opacity-80" />;
}

export function Loading({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-fog" role="status">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-8 text-center">
      <Icon name="wifiOff" size={28} className="text-[#ff9aa5]" />
      <p className="text-[15px] text-mist">{errorText(error)}</p>
      {retry && (
        <Button size="sm" icon="refresh" onClick={retry}>
          إعادة المحاولة
        </Button>
      )}
    </Card>
  );
}

export function Empty({ icon = "layers", title, body, action }: { icon?: IconKey; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--line-2)] px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-white/[0.04] text-cyan">
        <Icon name={icon} size={26} />
      </span>
      <p className="text-base font-semibold text-chalk">{title}</p>
      {body && <p className="max-w-sm text-sm leading-relaxed text-fog">{body}</p>}
      {action}
    </div>
  );
}

export function Stat({ label, value, tone, icon, sub }: { label: string; value: ReactNode; tone?: "ok" | "warn" | "danger" | "info"; icon?: IconKey; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-panel/60 p-3.5">
      <div className="flex items-center justify-between gap-2 text-fog">
        <span className="text-[12px] font-medium">{label}</span>
        {icon && <Icon name={icon} size={16} />}
      </div>
      <p className={cn("mt-1.5 font-mono text-2xl font-semibold tabular-nums", tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-[#ff8794]" : tone === "info" ? "text-cyan" : "text-chalk")}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-fog">{sub}</p>}
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 7, label }: { value: number; size?: number; stroke?: number; label?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(120 160 230 / 0.15)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={v >= 75 ? "#33d69f" : v >= 50 ? "#ffb547" : "#ff4d5e"} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold text-chalk">{label ?? `${Math.round(v)}%`}</span>
    </div>
  );
}

export function Bar({ value, tone = "volt" }: { value: number; tone?: "volt" | "ok" | "warn" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div className={cn("h-full rounded-full transition-all", tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-gradient-to-l from-cyan to-volt")} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = "بحث…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Icon name="search" size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-fog" />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="ps-10" />
    </div>
  );
}

/* ─── Sheet (bottom sheet on phones, dialog on desktop) ────────────────── */

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>("input:not([type=hidden]),textarea,select");
    if (first && window.matchMedia("(pointer: fine)").matches) first.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" dir="rtl">
      <button type="button" aria-label="إغلاق" className="absolute inset-0 bg-[#01030a]/75 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panel}
        className={cn(
          "relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[28px] border border-[var(--line-2)] bg-[#0a1326] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-20px_80px_-20px_rgb(0_0_0/0.8)] sm:rounded-[28px]",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-chalk">{title}</h2>
          <IconButton icon="close" label="إغلاق" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ─── Layout ───────────────────────────────────────────────────────────── */

export function TopBar({ title, sub, back, actions }: { title: ReactNode; sub?: ReactNode; back?: string | (() => void); actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-4 flex min-h-16 items-center gap-2 border-b border-[var(--line)] bg-abyss/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:-mx-6 sm:px-6">
      {back && <IconButton icon="chevron" label="رجوع" onClick={() => (typeof back === "string" ? go(back) : back())} className="-ms-2" />}
      <div className="min-w-0 flex-1 py-2">
        <h1 className="truncate text-lg font-bold text-chalk">{title}</h1>
        {sub && <div className="truncate text-xs text-fog">{sub}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}

export function Section({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("mt-6", className)}>
      {(title || action) && (
        <div className="mb-2.5 flex items-center justify-between gap-3">
          {title && <h2 className="text-[15px] font-bold text-chalk">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A tappable list row. */
export function Row({ onClick, children, className, chevron = true }: { onClick?: () => void; children: ReactNode; className?: string; chevron?: boolean }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("flex w-full items-center gap-3 px-4 py-3 text-start transition", onClick && "hover:bg-white/[0.03] active:bg-white/[0.05]", className)}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onClick && chevron && <Icon name="chevron" size={16} className="shrink-0 rotate-180 text-fog" />}
    </Tag>
  );
}

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-panel/60", className)}>{children}</div>;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-volt/40 to-cyan/20 text-sm font-bold text-chalk ring-1 ring-white/10", className)}>{letters || "؟"}</span>
  );
}

export function copyText(text: string, done = "تم النسخ") {
  navigator.clipboard?.writeText(text).then(
    () => toast(done),
    () => toast("تعذّر النسخ", "error"),
  );
}
