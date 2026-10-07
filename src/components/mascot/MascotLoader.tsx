"use client";
/** Shown on the mascot's spot while the 3D model downloads (the still poster stays underneath). */
export function MascotLoader({ locale, progress }: { locale: "en" | "ar"; progress: number }) {
  const pct = Math.round(Math.max(0.05, Math.min(1, progress)) * 100);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[2%] flex justify-center" aria-hidden>
      <span className="flex items-center gap-2 whitespace-nowrap rounded-full border border-[var(--line-2)] bg-[rgb(9_22_54/0.9)] px-3 py-1 text-[0.68rem] text-mist shadow-lg backdrop-blur">
        <span className="relative block h-1 w-10 overflow-hidden rounded-full bg-white/10">
          <span className="absolute inset-y-0 start-0 rounded-full bg-cyan transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </span>
        {locale === "ar" ? "بنبني حاجة حلوة…" : "Building something awesome…"}
      </span>
    </div>
  );
}
