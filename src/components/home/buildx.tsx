import Link from "next/link";
import { Icon } from "@/components/brand/icons";
import { Reveal } from "@/components/motion/reveal";
import { SectionHead } from "@/components/ui/section-head";
import {
  ACTIVITIES,
  CHALLENGES,
  FACULTY,
  GOALS,
  LEADS,
  MEMBERS,
  PLANNED_EVENTS,
  ROADMAP,
  SOLUTIONS,
  UNITS,
  l,
} from "@/content/buildx";
import { cn } from "@/lib/cn";

type Card = (typeof ACTIVITIES)[number];

/** Plain, readable card grid: icon, title, one line of body. */
export function CardGrid({
  items,
  locale,
  cols = 3,
  tone = "default",
}: {
  items: Card[];
  locale: string;
  cols?: 2 | 3 | 4 | 5;
  tone?: "default" | "warm" | "solid";
}) {
  return (
    <ul
      className={cn(
        "grid gap-3 sm:grid-cols-2 sm:gap-4",
        cols === 3 && "lg:grid-cols-3",
        cols === 4 && "lg:grid-cols-4",
        cols === 5 && "lg:grid-cols-5",
      )}
    >
      {items.map((c, i) => (
        <Reveal
          as="li"
          key={c.title.en}
          delay={i * 60}
          className={cn(
            "flex flex-col gap-3 rounded-[18px] border p-6",
            tone === "warm" && "border-[rgb(255_181_71/0.22)] bg-[rgb(255_181_71/0.05)]",
            tone === "solid" && "border-volt/40 bg-gradient-to-br from-volt/25 to-volt/5",
            tone === "default" && "border-[var(--line-2)] bg-panel/70",
          )}
        >
          <span
            className={cn(
              "flex size-12 items-center justify-center rounded-xl",
              tone === "warm" ? "bg-[rgb(255_181_71/0.14)] text-warn" : "bg-volt/15 text-cyan",
            )}
          >
            <Icon name={c.icon} size={24} />
          </span>
          <h3 className="t-title text-xl text-chalk">{l(c.title, locale)}</h3>
          <p className="text-base leading-relaxed text-mist">{l(c.body, locale)}</p>
        </Reveal>
      ))}
    </ul>
  );
}

/** Why BuildX HUE: the problems students face, and how the community answers them. */
export function WhySection({ locale, index = "01" }: { locale: string; index?: string }) {
  const ar = locale === "ar";
  return (
    <section
      id="why"
      aria-labelledby="why-title"
      className="relative mx-auto max-w-[1680px] px-5 py-20 sm:px-8 lg:py-28"
    >
      <SectionHead
        id="why-title"
        index={index}
        eyebrow={ar ? "ليه BuildX HUE؟" : "Why BuildX HUE?"}
        title={ar ? "من التعلّم للتأثير الحقيقي" : "From learning to real impact"}
        body={
          ar
            ? "طلاب كتير بيحبوا التكنولوجيا والروبوتات، بس بيقابلوا نفس المشاكل:"
            : "Many students love technology and robotics, but run into the same problems:"
        }
      />
      <div className="mt-12">
        <CardGrid items={CHALLENGES} locale={locale} cols={4} tone="warm" />
      </div>
      <Reveal as="p" className="t-headline mt-14 mb-6 flex items-center gap-3 text-2xl text-chalk">
        <Icon name="arrow" size={22} className="text-cyan rtl:-scale-x-100" />
        {ar ? "وده اللي بنقدّمه" : "Here's how we help"}
      </Reveal>
      <CardGrid items={SOLUTIONS} locale={locale} cols={4} tone="solid" />
    </section>
  );
}

/** What we do: the six kinds of activity. */
export function ActivitiesSection({ locale, index = "03" }: { locale: string; index?: string }) {
  const ar = locale === "ar";
  return (
    <section
      id="activities"
      aria-labelledby="activities-title"
      className="border-y border-[var(--line)] bg-abyss"
    >
      <div className="mx-auto max-w-[1680px] px-5 py-20 sm:px-8 lg:py-28">
        <SectionHead
          id="activities-title"
          index={index}
          eyebrow={ar ? "بنعمل إيه" : "What we do"}
          title={ar ? "اتعلّم. ابنِ. نافس. قود." : "Learn. Build. Compete. Lead."}
          body={
            ar
              ? "بننظّم أنشطة ومشاريع وتدريبات وفعاليات عملية عشان تتعلّم وتبني وتنافس في الروبوتات والذكاء الاصطناعي وإنترنت الأشياء وغيرها."
              : "Hands-on activities, projects, training and events that help you learn, build and compete in robotics, AI, IoT and more."
          }
        />
        <div className="mt-12">
          <CardGrid items={ACTIVITIES} locale={locale} cols={3} />
        </div>
      </div>
    </section>
  );
}

/** Season plan: four quarters, then the planned events as a simple timeline. */
export function RoadmapSection({
  locale,
  index = "05",
  eventsHref,
  showEvents = true,
}: {
  locale: string;
  index?: string;
  eventsHref?: string;
  showEvents?: boolean;
}) {
  const ar = locale === "ar";
  return (
    <section
      id="roadmap"
      aria-labelledby="roadmap-title"
      className="relative mx-auto max-w-[1680px] px-5 py-20 sm:px-8 lg:py-28"
    >
      <SectionHead
        id="roadmap-title"
        index={index}
        eyebrow={ar ? "خطة السنة 2026 – 2027" : "Yearly roadmap 2026 – 2027"}
        title={ar ? "سنة مليانة فرص" : "A year full of opportunities"}
        body={
          ar
            ? "خطة واضحة بأهداف نقدر نقيسها، عشان كل عضو يعرف إحنا رايحين فين."
            : "A clear plan with measurable goals, so every member knows where we're heading."
        }
        action={
          eventsHref ? (
            <Link href={eventsHref} className="btn">
              <span>{ar ? "كل الفعاليات" : "All events"}</span>
              <Icon name="arrow" size={15} className="btn-arrow" />
            </Link>
          ) : undefined
        }
      />
      <ol className="mt-12 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {ROADMAP.map((q, i) => (
          <Reveal
            as="li"
            key={q.q}
            delay={i * 80}
            className="relative overflow-hidden rounded-[18px] border border-[var(--line-2)] bg-panel/70 p-6"
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-volt to-cyan" />
            <div className="flex items-baseline justify-between gap-3">
              <span className="t-display text-4xl text-volt-hi" dir="ltr">
                {q.q}
              </span>
              <span className="text-sm font-semibold text-cyan">{l(q.when, locale)}</span>
            </div>
            <h3 className="t-title mt-4 text-xl text-chalk">{l(q.title, locale)}</h3>
            <ul className="mt-4 space-y-2 text-base text-mist">
              {q.items.map((it) => (
                <li key={it.en} className="flex gap-2.5">
                  <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-cyan" />
                  {l(it, locale)}
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </ol>

      {showEvents && (
        <>
          <Reveal className="mt-16 mb-6">
            <h3 className="t-headline text-2xl text-chalk">
              {ar ? "الفعاليات اللي جاية" : "What's planned"}
            </h3>
          </Reveal>
          <ol className="relative grid gap-3 border-s-2 border-volt/40 ps-6 sm:ps-8">
            {PLANNED_EVENTS.map((e, i) => (
              <Reveal
                as="li"
                key={e.title.en}
                delay={i * 50}
                className="relative rounded-[16px] border border-[var(--line-2)] bg-panel/60 p-5"
              >
                <span
                  aria-hidden
                  className="absolute -start-[calc(1.5rem+7px)] top-6 size-3 rounded-full border-2 border-cyan bg-void sm:-start-[calc(2rem+7px)]"
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Icon name={e.icon} size={20} className="text-cyan" />
                  <h4 className="t-title text-lg text-chalk">{l(e.title, locale)}</h4>
                  {e.when && (
                    <span className="rounded-full bg-volt/15 px-3 py-0.5 text-sm font-semibold text-volt-hi">
                      {l(e.when, locale)}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-base text-mist">{l(e.body, locale)}</p>
              </Reveal>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** Season targets. Labelled as goals — never presented as achieved numbers. */
export function GoalsSection({ locale }: { locale: string }) {
  const ar = locale === "ar";
  return (
    <section
      id="goals"
      aria-labelledby="goals-title"
      className="border-y border-[var(--line)] bg-gradient-to-br from-volt-lo/40 via-abyss to-abyss"
    >
      <div className="mx-auto max-w-[1680px] px-5 py-20 sm:px-8 lg:py-24">
        <Reveal as="p" className="t-eyebrow mb-4 text-cyan">
          {ar ? "أهدافنا" : "Our goals"}
        </Reveal>
        <h2 id="goals-title" className="t-display text-[clamp(2rem,4.6vw,3.8rem)] text-chalk">
          {ar ? "اللي ناويين نحققه السنة دي" : "What we're aiming for this year"}
        </h2>
        <ul role="list" className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {GOALS.map((g, i) => (
            <Reveal
              as="li"
              key={g.value + g.label.en}
              delay={i * 60}
              className={cn(
                "rounded-[18px] border border-[var(--line-2)] bg-void/40 p-6 text-center",
                i === GOALS.length - 1 && "col-span-2 lg:col-span-1",
              )}
            >
              <p className="t-display text-5xl text-cyan" dir="ltr">
                {g.value}
              </p>
              <p className="mt-2 text-lg font-semibold text-chalk">{l(g.label, locale)}</p>
              <p className="mt-1 text-sm text-mist">{l(g.note, locale)}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Who runs the community: leads, five teams, members, faculty support. */
export function StructureSection({ locale, index = "04" }: { locale: string; index?: string }) {
  const ar = locale === "ar";
  return (
    <section
      id="structure"
      aria-labelledby="structure-title"
      className="relative mx-auto max-w-[1680px] px-5 py-20 sm:px-8 lg:py-28"
    >
      <SectionHead
        id="structure-title"
        index={index}
        eyebrow={ar ? "الهيكل التنظيمي" : "Organizational structure"}
        title={ar ? "طلاب بيقودوا طلاب" : "Students leading students"}
        body={
          ar
            ? "BuildX HUE مجتمع بيقوده الطلاب، بفريق منظّم يضمن النمو والتعاون والاستمرارية."
            : "BuildX HUE is student-led, with a clear structure that keeps the community growing, collaborative and sustainable."
        }
      />
      <div className="mt-12 grid gap-3 sm:grid-cols-2 sm:gap-4">
        {LEADS.map((x, i) => (
          <Reveal
            key={x.title.en}
            delay={i * 80}
            className="rounded-[18px] bg-gradient-to-br from-volt to-volt-lo p-6"
          >
            <h3 className="t-title text-2xl text-white">{l(x.title, locale)}</h3>
            <p className="mt-2 text-base text-white/85">{l(x.body, locale)}</p>
          </Reveal>
        ))}
      </div>
      <div className="mt-4">
        <CardGrid items={UNITS} locale={locale} cols={5} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Reveal className="rounded-[18px] border-2 border-dashed border-volt/40 p-6">
          <h3 className="t-title text-xl text-chalk">{l(MEMBERS.title, locale)}</h3>
          <p className="mt-2 text-base text-mist">{l(MEMBERS.body, locale)}</p>
        </Reveal>
        <Reveal delay={80} className="rounded-[18px] border border-[var(--line-2)] bg-panel/70 p-6">
          <h3 className="t-title flex items-center gap-2.5 text-xl text-chalk">
            <Icon name="shield" size={20} className="text-cyan" />
            {l(FACULTY.title, locale)}
          </h3>
          <p className="mt-2 text-base text-mist">{l(FACULTY.body, locale)}</p>
        </Reveal>
      </div>
    </section>
  );
}
