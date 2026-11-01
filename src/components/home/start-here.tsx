"use client";
/**
 * «ابدأ من هنا»: the visitor says who they are (a student who wants to join, a team member, a sponsor,
 * a professor / university / press) and gets the three or four pages that matter to them. The choice is
 * remembered on this device so the next visit opens on it. No AI, nothing sent anywhere.
 */
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/brand/icons";
import { cn } from "@/lib/cn";

type Who = "student" | "member" | "sponsor" | "academic";
type Link = { to: string; ar: string; en: string; abs?: boolean };

const ROLES: { key: Who; icon: IconName; ar: string; en: string; links: Link[] }[] = [
  {
    key: "student",
    icon: "rocket",
    ar: "طالب وعايز أنضم",
    en: "A student who wants to join",
    links: [
      { to: "/join", ar: "قدّم طلب الانضمام", en: "Apply to join" },
      { to: "/tracks", ar: "اختار مسارك", en: "Pick your track" },
      { to: "/events", ar: "الفعاليات الجاية", en: "Upcoming events" },
      { to: "/faq", ar: "أسئلة بتتكرر", en: "Common questions" },
    ],
  },
  {
    key: "member",
    icon: "users",
    ar: "عضو في الفريق",
    en: "A team member",
    links: [
      { to: "/app/", ar: "افتح التطبيق", en: "Open the app", abs: true },
      { to: "/lab/", ar: "BuildX Lab (المحاكي)", en: "BuildX Lab (simulator)", abs: true },
      { to: "/events", ar: "الفعاليات", en: "Events" },
      { to: "/verify", ar: "تحقّق من شهادة", en: "Verify a certificate" },
    ],
  },
  {
    key: "sponsor",
    icon: "handshake",
    ar: "راعي أو شركة",
    en: "A sponsor or company",
    links: [
      { to: "/sponsors", ar: "الرعاية وملف الميديا", en: "Sponsorship and media kit" },
      { to: "/achievements", ar: "إنجازاتنا", en: "Our achievements" },
      { to: "/projects", ar: "مشاريع الطلبة", en: "Student projects" },
      { to: "/contact", ar: "كلّمنا", en: "Talk to us" },
    ],
  },
  {
    key: "academic",
    icon: "book",
    ar: "دكتور أو جامعة أو إعلام",
    en: "A professor, university or press",
    links: [
      { to: "/about", ar: "إحنا مين", en: "Who we are" },
      { to: "/news", ar: "الأخبار", en: "News" },
      { to: "/achievements", ar: "إنجازاتنا", en: "Our achievements" },
      { to: "/contact", ar: "تواصل معانا", en: "Get in touch" },
    ],
  },
];

const KEY = "bx-who";

export function StartHere({ locale, base }: { locale: string; base: string }) {
  const l = locale === "en" ? "en" : "ar";
  const [who, setWho] = useState<Who | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY) as Who | null;
      if (v && ROLES.some((r) => r.key === v)) setWho(v);
    } catch {
      /* no storage: nothing remembered */
    }
  }, []);
  const pick = (k: Who) => {
    setWho(k);
    try {
      localStorage.setItem(KEY, k);
    } catch {
      /* fine */
    }
  };
  const role = ROLES.find((r) => r.key === who);
  return (
    <section
      className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6"
      aria-labelledby="start-here"
      data-testid="start-here"
    >
      <div className="frame grid gap-5 p-5 sm:p-7">
        <div>
          <p className="t-eyebrow text-[0.65rem] text-cyan">{l === "ar" ? "ابدأ من هنا" : "Start here"}</p>
          <h2 id="start-here" className="t-headline mt-1 text-2xl text-chalk sm:text-3xl">
            {l === "ar"
              ? "إنت مين؟ ونوديك على اللي يهمك على طول"
              : "Who are you? We'll take you to what matters"}
          </h2>
        </div>
        <div
          className="grid grid-cols-2 gap-2.5 lg:grid-cols-4"
          role="radiogroup"
          aria-label={l === "ar" ? "إنت مين" : "Who are you"}
        >
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="radio"
              aria-checked={who === r.key}
              onClick={() => pick(r.key)}
              data-testid={`who-${r.key}`}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 text-start transition",
                who === r.key
                  ? "border-volt bg-volt/10 ring-1 ring-volt/60"
                  : "border-[var(--line)] hover:border-[var(--line-2)] hover:bg-white/[0.03]",
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-volt/15 text-volt">
                <Icon name={r.icon} size={20} />
              </span>
              <span className="text-sm font-semibold leading-snug text-chalk">{r[l]}</span>
            </button>
          ))}
        </div>
        {role && (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="start-links">
            {role.links.map((x) => (
              <li key={x.to}>
                <a
                  href={x.abs ? x.to : `${base}${x.to}/`}
                  className="group flex h-full items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-panel/50 px-4 py-3 text-sm font-semibold text-chalk transition hover:border-volt/60"
                >
                  {x[l]}
                  <Icon
                    name="arrow"
                    size={16}
                    className="shrink-0 text-cyan transition group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
                  />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
