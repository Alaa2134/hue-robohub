"use client";
/** Home page: member of the month and the top students by points (only when the team turns it on). */
import { useEffect, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

type Star = { name: string; group: string | null; reason_ar: string | null; reason_en: string | null; month: string | null; points: number | null };
type Hof = { star: Star | null; board: { name: string; points: number; badges: number }[] };

const T = {
  ar: { title: "لوحة الشرف", star: "نجم الشهر", top: "الأعلى في النقاط", pts: "نقطة", badges: "وسام", how: "النقاط بتيجي من الحضور والكويزات والشهادات والإيفنتات." },
  en: { title: "Hall of fame", star: "Member of the month", top: "Top by points", pts: "pts", badges: "badges", how: "Points come from attendance, quizzes, certificates and events." },
};
const MEDAL = ["#f5c451", "#c9d6e8", "#d79a5d"];

export function HallOfFame({ locale }: { locale: string }) {
  const l = locale === "ar" ? "ar" : "en";
  const t = T[l];
  const [d, setD] = useState<Hof | null>(null);
  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/hall_of_fame`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: "{}" })
      .then((r) => (r.ok ? r.json() : null))
      .then((x: Hof | null) => x && setD(x))
      .catch(() => undefined);
  }, []);
  if (!d || (!d.star && !d.board.length)) return null;
  const month = d.star?.month ? new Date(`${d.star.month}-01T12:00:00`).toLocaleDateString(l === "ar" ? "ar-EG" : "en-GB", { month: "long", year: "numeric" }) : "";
  return (
    <section id="hall-of-fame" aria-labelledby="hof-title" className="mx-auto max-w-[1680px] px-5 py-20 sm:px-8 lg:py-28">
      <h2 id="hof-title" className="t-display mb-10 text-[clamp(1.9rem,4.4vw,3.6rem)] text-chalk">
        {t.title}
      </h2>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {d.star && (
          <div className="frame relative flex flex-col gap-4 overflow-hidden p-7 sm:p-9" style={{ ["--edge" as string]: 0.9 }}>
            <span aria-hidden className="absolute -end-10 -top-10 size-40 rounded-full bg-[#f5c451]/15 blur-2xl" />
            <p className="t-eyebrow flex items-center gap-2 text-[#f5c451]">
              <Icon name="award" size={16} />
              {t.star}
              {month && <span className="text-fog">· {month}</span>}
            </p>
            <p className="t-headline text-[clamp(1.8rem,4vw,3rem)] text-chalk">{d.star.name}</p>
            {d.star.group && <p className="text-sm text-fog">{d.star.group}</p>}
            {(l === "en" ? d.star.reason_en || d.star.reason_ar : d.star.reason_ar) && <p className="max-w-lg text-pretty text-lg leading-relaxed text-frost">{l === "en" ? d.star.reason_en || d.star.reason_ar : d.star.reason_ar}</p>}
            {!!d.star.points && (
              <p className="mt-auto font-mono text-cyan">
                {d.star.points} {t.pts}
              </p>
            )}
          </div>
        )}
        {d.board.length > 0 && (
          <div className="frame p-5 sm:p-7">
            <p className="t-eyebrow mb-4 text-fog">{t.top}</p>
            <ol className="grid gap-1.5">
              {d.board.map((b, i) => (
                <li key={`${b.name}-${i}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 odd:bg-white/[0.03]">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold" style={i < 3 ? { background: `${MEDAL[i]}26`, color: MEDAL[i] } : { color: "var(--color-fog)" }}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-chalk">
                    <bdi>{b.name}</bdi>
                  </span>
                  {b.badges > 0 && (
                    <span className="hidden text-xs text-fog sm:inline">
                      {b.badges} {t.badges}
                    </span>
                  )}
                  <span className="font-mono text-chalk">{b.points}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-fog">{t.how}</p>
          </div>
        )}
      </div>
    </section>
  );
}
