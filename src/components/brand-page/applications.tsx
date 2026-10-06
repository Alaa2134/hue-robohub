import { Mark, Wordmark } from "@/components/brand/logo";

/** Member ID card (front/back). The QR SVG is generated server-side from the real join URL. */
export function IdCard({ qrSvg, role = "MEMBER" }: { qrSvg: string; role?: string }) {
  return (
    <div className="flex flex-wrap justify-center gap-6" dir="ltr">
      <div className="relative h-[21rem] w-[13.5rem] overflow-hidden rounded-[18px] border border-[var(--line-2)] bg-[linear-gradient(160deg,#0e1a30,#081634_55%)] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9)]">
        <div aria-hidden className="grid-lines absolute inset-0 opacity-30" />
        <div aria-hidden className="absolute -end-10 -top-10 size-40 rounded-full bg-volt/25 blur-3xl" />
        <div className="relative flex h-full flex-col items-center px-5 pb-5 pt-6">
          <div className="flex w-full items-center justify-between">
            <Mark className="h-6 w-auto" />
            <span className="font-mono text-[0.5rem] tracking-[0.25em] text-fog">ID · 2026</span>
          </div>
          <div className="mt-6 flex size-24 items-center justify-center rounded-full border-2 border-volt/60 bg-panel">
            <svg viewBox="0 0 24 24" className="size-14 text-steel" aria-hidden>
              <circle cx="12" cy="8.5" r="4" fill="currentColor" />
              <path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5" fill="currentColor" />
            </svg>
          </div>
          <p className="mt-5 font-display text-lg font-bold tracking-wide text-chalk [font-stretch:115%]">YOUR NAME</p>
          <p className="font-mono text-[0.6rem] tracking-[0.3em] text-cyan">{role}</p>
          <div className="mt-auto w-full">
            <Wordmark className="h-[0.62rem] w-auto" />
            <p className="mt-1.5 font-mono text-[0.45rem] tracking-[0.3em] text-fog">BUILD · INNOVATE · COMPETE</p>
          </div>
        </div>
        <div aria-hidden className="absolute inset-x-0 bottom-0 flex h-1.5">
          {["#2F7BFF", "#FF3B4E", "#FF8A1F", "#2ED47A", "#9B6BFF"].map((c) => (
            <span key={c} className="flex-1" style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="relative h-[21rem] w-[13.5rem] overflow-hidden rounded-[18px] border border-[var(--line-2)] bg-[#05080f] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9)]">
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
          <div className="rounded-xl bg-white p-2.5" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="font-display text-sm font-semibold tracking-[0.2em] text-cyan [font-stretch:112%]">SCAN TO APPLY</p>
          <p className="font-mono text-[0.5rem] tracking-[0.3em] text-fog">JOIN BUILDX HUE</p>
        </div>
      </div>
    </div>
  );
}

/** Team T-shirt technical flat, front + back. */
export function ShirtFlats() {
  const shirt = "M60 18 L95 6 Q120 22 145 6 L180 18 L222 52 L198 86 L178 74 L178 232 L62 232 L62 74 L42 86 L18 52 Z";
  return (
    <div className="grid gap-6 sm:grid-cols-2" dir="ltr">
      {["front", "back"].map((side) => (
        <figure key={side} className="frame flex flex-col items-center p-6">
          <svg viewBox="0 0 240 240" className="h-64 w-auto" role="img" aria-label={`T-shirt ${side}`}>
            <defs>
              <linearGradient id={`sh-${side}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#0d1424" />
                <stop offset="1" stopColor="#05080f" />
              </linearGradient>
            </defs>
            <path d={shirt} fill={`url(#sh-${side})`} stroke="#2a3a56" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M95 6 Q120 30 145 6" fill="none" stroke="#2a3a56" strokeWidth="1.5" />
            <path d="M62 232 L178 232" stroke="#2b6dff" strokeWidth="3" />
            <path d="M18 52 L42 86 M222 52 L198 86" stroke="#2b6dff" strokeWidth="2" />
            {side === "front" ? (
              <g transform="translate(132 62) scale(0.26)">
                <path fillRule="evenodd" fill="#F2F5F8" d="M0 16L16 0L46 0L56 10L56 49L46 59L38 59L58 100L38 100L20 62L18 62L18 100L0 100ZM18 18L38 18L38 41L18 41ZM64 0L82 0L82 100L64 100ZM100 0L118 0L118 84L102 100L100 100Z" />
                <path fill="#2B6DFF" d="M82 41L100 41L100 59L82 59Z" />
              </g>
            ) : (
              <g>
                <g transform="translate(85 70) scale(0.6)">
                  <path fillRule="evenodd" fill="#F2F5F8" d="M0 16L16 0L46 0L56 10L56 49L46 59L38 59L58 100L38 100L20 62L18 62L18 100L0 100ZM18 18L38 18L38 41L18 41ZM64 0L82 0L82 100L64 100ZM100 0L118 0L118 84L102 100L100 100Z" />
                  <path fill="#2B6DFF" d="M82 41L100 41L100 59L82 59Z" />
                </g>
                <text x="120" y="150" textAnchor="middle" fill="#F2F5F8" fontFamily="var(--font-saira)" fontWeight="800" fontSize="15" letterSpacing="1">
                  HUE ROBO<tspan fill="#2B6DFF">HUB</tspan>
                </text>
                <text x="120" y="166" textAnchor="middle" fill="#9fb0c9" fontFamily="var(--font-jbmono)" fontSize="6.5" letterSpacing="3">
                  BUILD • INNOVATE • COMPETE
                </text>
              </g>
            )}
          </svg>
          <figcaption className="mt-3 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-fog">{side}</figcaption>
        </figure>
      ))}
    </div>
  );
}
