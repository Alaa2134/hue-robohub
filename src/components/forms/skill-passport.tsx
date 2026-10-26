"use client";
/**
 * /passport?id=…: a student's Skill Passport, shared by them. Everything on it comes from BuildX HUE's
 * own records — certificates (each with its verification code), Lab challenges passed in the
 * simulator, Academy courses completed, published projects — and nothing private. Data:
 * passport_public (rate-limited; only passports their owner turned on).
 */
import { useEffect, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { CHALLENGE_INFO, type Skill } from "@/lab/academy/points";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";
import { timeoutSignal } from "@/lib/timeout";

type Cert = { code: string; kind: string; title: string; title_ar: string | null; hours: number | null; on: string };
type Passport = {
  name: string;
  group: string | null;
  headline: string | null;
  since: string;
  certificates: Cert[];
  challenges: { slug: string; on: string }[];
  courses: { title: string; title_en: string | null; lessons: number }[];
  projects: { title: string; description: string; url: string | null }[];
  numbers: { sessions: number; quizzes: number; tasks: number };
};

const T = {
  en: {
    loading: "Loading the passport…",
    none: "This passport isn't available. Its owner may have turned it off or made a new link.",
    limited: "Too many requests, try again in a few minutes.",
    network: "Couldn't load it right now. Try again.",
    since: "Member since",
    verified: "Everything here comes from BuildX HUE's records — nothing is typed in by the student.",
    skills: { programming: "Programming", electronics: "Electronics", robotics: "Robotics" } as Record<Skill, string>,
    certs: "Certificates",
    verify: "Verify",
    hours: "h",
    challenges: "Lab challenges passed",
    challengesNote: "Checked by running the student's own program in the BuildX Lab simulator.",
    courses: "Academy courses completed",
    lessons: "lessons",
    projects: "Projects published",
    numbers: "Activity",
    sessions: "sessions attended",
    quizzes: "quizzes passed",
    tasks: "graded tasks",
    empty: "Nothing here yet.",
  },
  ar: {
    loading: "بنحمّل الجواز…",
    none: "الجواز ده مش متاح. ممكن صاحبه قفله أو عمل لينك جديد.",
    limited: "طلبات كتير، جرّب كمان كام دقيقة.",
    network: "مقدرناش نحمّله دلوقتي. جرّب تاني.",
    since: "عضو من",
    verified: "كل اللي هنا جاي من سجلات BuildX HUE — مفيش حاجة الطالب كتبها بنفسه.",
    skills: { programming: "برمجة", electronics: "إلكترونيات", robotics: "روبوتات" } as Record<Skill, string>,
    certs: "الشهادات",
    verify: "تحقّق",
    hours: "ساعة",
    challenges: "تحديات المعمل اللي عدّاها",
    challengesNote: "اتحقق منها بتشغيل برنامج الطالب نفسه في محاكي BuildX Lab.",
    courses: "كورسات الأكاديمية اللي خلّصها",
    lessons: "درس",
    projects: "مشاريع اتنشرت",
    numbers: "النشاط",
    sessions: "سيشن حضرها",
    quizzes: "كويز نجح فيه",
    tasks: "تاسك اتقيّم",
    empty: "لسه مفيش هنا حاجة.",
  },
};

export function SkillPassport({ locale }: { locale: string }) {
  const l = locale === "ar" ? "ar" : "en";
  const t = T[l];
  const [state, setState] = useState<"loading" | "none" | "limited" | "network" | "ok">("loading");
  const [p, setP] = useState<Passport | null>(null);
  const prefix = l === "ar" ? "/ar" : "";
  const day = (iso: string) => new Intl.DateTimeFormat(l === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso.slice(0, 10)}T12:00:00`));
  const month = (ym: string) => new Intl.DateTimeFormat(l === "ar" ? "ar-EG" : "en-GB", { month: "long", year: "numeric" }).format(new Date(`${ym}-15T12:00:00`));

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("id") ?? "";
    if (!/^[0-9a-f]{16}$/.test(id)) return setState("none");
    void fetch(`${SUPABASE_URL}/rest/v1/rpc/passport_public`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: id }),
      signal: timeoutSignal(10_000),
    })
      .then(async (r) => {
        const out = (await r.json().catch(() => null)) as ({ ok: true; found: boolean } & Passport) | { ok: false } | null;
        if (!r.ok || !out) return setState("network");
        if (!out.ok) return setState("limited");
        if (!out.found) return setState("none");
        setP(out);
        setState("ok");
      })
      .catch(() => setState("network"));
  }, []);

  if (state !== "ok" || !p)
    return (
      <p role="status" className={cn("frame p-6 text-center", state === "loading" ? "text-mist" : "text-danger")} data-testid="passport-state">
        {state === "loading" || state === "ok" ? t.loading : t[state]}
      </p>
    );

  const known = p.challenges.filter((c) => CHALLENGE_INFO[c.slug]);
  const bySkill = (Object.keys(t.skills) as Skill[]).map((s) => ({ s, n: known.filter((c) => CHALLENGE_INFO[c.slug].skill === s).length })).filter((x) => x.n > 0);
  const section = (title: string, children: React.ReactNode, note?: string) => (
    <section className="frame grid gap-3 p-6">
      <h2 className="text-lg font-bold text-chalk">{title}</h2>
      {note && <p className="-mt-1 text-xs text-fog">{note}</p>}
      {children}
    </section>
  );
  return (
    <div className="grid gap-6" data-testid="passport-page">
      <header className="frame grid gap-3 p-6 sm:p-8">
        <p className="text-3xl font-bold text-chalk" data-testid="passport-name">
          {p.name}
        </p>
        {p.headline && <p className="text-lg text-mist">{p.headline}</p>}
        <p className="text-sm text-fog">
          {[p.group, `${t.since} ${month(p.since)}`].filter(Boolean).join(" · ")}
        </p>
        {bySkill.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {bySkill.map((x) => (
              <span key={x.s} className="rounded-full border border-cyan/40 bg-cyan/10 px-3 py-1 text-sm text-cyan">
                {t.skills[x.s]} · {x.n}
              </span>
            ))}
          </div>
        )}
        <p className="flex items-center gap-2 text-xs text-fog">
          <Icon name="shield" size={14} /> {t.verified}
        </p>
      </header>

      {section(
        t.certs,
        p.certificates.length ? (
          <ul className="grid gap-2">
            {p.certificates.map((c) => (
              <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--line)] p-3">
                <Icon name="award" size={18} className="text-gold" />
                <span className="min-w-0 flex-1 font-medium text-chalk">{(l === "ar" && c.title_ar) || c.title}</span>
                <span className="text-sm text-fog">
                  {day(c.on)}
                  {c.hours ? ` · ${c.hours} ${t.hours}` : ""}
                </span>
                <a href={`${prefix}/verify/?c=${encodeURIComponent(c.code)}`} className="font-mono text-xs text-cyan underline" dir="ltr">
                  {t.verify} {c.code}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fog">{t.empty}</p>
        ),
      )}

      {known.length > 0 &&
        section(
          t.challenges,
          <ul className="grid gap-2 sm:grid-cols-2" data-testid="passport-challenges">
            {known.map((c) => (
              <li key={c.slug} className="flex items-center gap-2 rounded-xl border border-[var(--line)] p-3 text-sm">
                <Icon name="check" size={16} className="text-ok" />
                <span className="min-w-0 flex-1 text-chalk">{CHALLENGE_INFO[c.slug].title[l]}</span>
                <span className="text-fog">{day(c.on)}</span>
              </li>
            ))}
          </ul>,
          t.challengesNote,
        )}

      {p.courses.length > 0 &&
        section(
          t.courses,
          <ul className="grid gap-2">
            {p.courses.map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Icon name="book" size={16} className="text-cyan" />
                <span className="flex-1 text-chalk">{(l === "en" && c.title_en) || c.title}</span>
                <span className="text-fog">
                  {c.lessons} {t.lessons}
                </span>
              </li>
            ))}
          </ul>,
        )}

      {p.projects.length > 0 &&
        section(
          t.projects,
          <ul className="grid gap-3">
            {p.projects.map((x, i) => (
              <li key={i} className="grid gap-1">
                <span className="font-medium text-chalk">
                  {x.url ? (
                    <a href={x.url} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-cyan/50">
                      {x.title}
                    </a>
                  ) : (
                    x.title
                  )}
                </span>
                {x.description && <span className="text-sm text-mist">{x.description}</span>}
              </li>
            ))}
          </ul>,
        )}

      {section(
        t.numbers,
        <div className="grid grid-cols-3 gap-3 text-center">
          {(["sessions", "quizzes", "tasks"] as const).map((k) => (
            <div key={k} className="rounded-xl border border-[var(--line)] p-3">
              <p className="text-2xl font-bold text-chalk">{p.numbers[k]}</p>
              <p className="text-xs text-fog">{t[k]}</p>
            </div>
          ))}
        </div>,
      )}
    </div>
  );
}
