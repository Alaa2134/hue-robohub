"use client";
/**
 * The guide's speech bubble, next to the mascot on the side facing the middle of the screen (above
 * it while it peeks from the bottom edge; narrower on phones). It is a polite live region, so screen
 * readers hear each line once, and its buttons (Show me around, Join...) are ordinary buttons. The
 * speaker reads the line aloud (for when his voice is off, or the browser hasn't let him talk yet).
 */
import { useEffect, useState } from "react";
import { GUIDE_NAME, type SceneAction } from "@/config/mascotJourney";
import { useMascot } from "@/hooks/useMascotState";
import { cn } from "@/lib/cn";
import { canSpeak } from "@/lib/mascot/voice";

export function MascotSpeech({ locale, side, above, compact, onAction, onListen, onClose }: { locale: "en" | "ar"; side: "left" | "right"; above: boolean; compact?: boolean; onAction: (a: SceneAction) => void; onListen: (text: string) => void; onClose: () => void }) {
  const speech = useMascot((s) => s.speech);
  const [voice, setVoice] = useState(false);
  // Voices load late on some browsers.
  useEffect(() => setVoice(canSpeak()), [speech]);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mascot-bubble pointer-events-none absolute z-10 w-max",
        compact ? "max-w-[min(15rem,62vw)]" : "max-w-[min(18rem,calc(100vw-2rem))]",
        above ? "bottom-[88%]" : "top-[6%]",
        above ? (side === "left" ? "right-[10%]" : "left-[10%]") : side === "left" ? (compact ? "right-[72%]" : "right-[80%]") : compact ? "left-[72%]" : "left-[80%]",
      )}
    >
      {speech && (
        <div
          key={speech.id}
          lang={locale}
          dir={locale === "ar" ? "rtl" : "ltr"}
          className={cn("mascot-bubble-in pointer-events-auto relative rounded-2xl border border-[var(--line-2)] bg-[rgb(9_22_54/0.94)] px-4 py-3 leading-snug", compact ? "text-[0.88rem]" : "text-[0.95rem]", "text-chalk shadow-[0_18px_50px_-18px_rgb(0_0_0/0.9)] backdrop-blur-xl")}
        >
          <span aria-hidden className={cn("absolute size-3 rotate-45 border-[var(--line-2)] bg-[rgb(9_22_54/0.94)]", above ? "-bottom-1.5 border-b border-e" : "top-6", !above && (side === "left" ? "-right-1.5 border-r border-t" : "-left-1.5 border-b border-l"), above && (side === "left" ? "right-8" : "left-8"))} />
          <p className="mb-0.5 text-xs font-bold text-cyan">{GUIDE_NAME[locale]}</p>
          <p className={voice ? "pe-10" : "pe-4"}>{speech[locale]}</p>
          {voice && (
            <button
              type="button"
              onClick={() => onListen(speech[locale])}
              aria-label={locale === "ar" ? "اسمعها بصوت بقلظ" : "Read it aloud"}
              title={locale === "ar" ? "اسمعها" : "Read aloud"}
              className="absolute end-8 top-1.5 flex size-7 items-center justify-center rounded-full text-fog transition hover:bg-white/10 hover:text-chalk"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6 9H3v6h3l5 4V5z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
              </svg>
            </button>
          )}
          <button type="button" onClick={onClose} aria-label={locale === "ar" ? "إغلاق" : "Close"} className="absolute end-1.5 top-1.5 flex size-7 items-center justify-center rounded-full text-fog transition hover:bg-white/10 hover:text-chalk">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          {!!speech.actions?.length && (
            <div className="mt-3 flex flex-wrap gap-2">
              {speech.actions.map((a, i) => (
                <button
                  key={a.kind + i}
                  type="button"
                  onClick={() => onAction(a)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
                    i === 0 ? "bg-volt text-white hover:bg-volt-hi" : "border border-[var(--line-2)] text-mist hover:text-chalk",
                  )}
                >
                  {a.label[locale]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
