"use client";
/**
 * The BuildX 3D AI page: an animated hero (a model being built), what it's for, how it works, the two
 * ways to make a model, why us, live prices from the database, a gallery of models customers chose to
 * share (picked by the team), questions, and a way into the studio.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/brand/icons";
import { Band } from "@/components/pages/section";
import { cn } from "@/lib/cn";
import { DEFAULT_PACKAGES, getInfo, modelUrl, type GalleryItem, type Info } from "./api";
import { COPY, type Lang } from "./copy";
import { ModelViewer } from "./viewer";

const DemoScene = dynamic(() => import("./scene"), { ssr: false });

const DEMO_PROMPTS = {
  ar: ["روبوت لعبة أبيض بعيون مضيئة", "فازة سيراميك زرقا بتموّجات", "صاروخ لعبة أحمر وأبيض", "ترس معدني لمشروع روبوت"],
  en: ["a white toy robot with glowing eyes", "a blue ceramic vase with waves", "a red and white toy rocket", "a metal gear for a robot project"],
};

function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((v) => (v >= text.length ? v : v + 1)), 38);
    return () => clearInterval(id);
  }, [text]);
  return (
    <span>
      {text.slice(0, n)}
      <span className="ms-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-cyan align-[-0.15em]" />
    </span>
  );
}

function Hero({ c, lang, studio, info }: { c: (typeof COPY)["ar"]; lang: Lang; studio: string; info: Info | null }) {
  const [tick, setTick] = useState({ i: 0, p: 0 });
  return (
    <section className="relative isolate overflow-hidden bg-void">
      <div aria-hidden className="grid-lines mask-radial absolute inset-0 -z-10 opacity-40" />
      <div aria-hidden className="absolute -top-40 start-1/2 -z-10 size-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(60,196,255,0.22),transparent_65%)] blur-2xl" />
      <div className="mx-auto grid max-w-[1680px] items-center gap-10 px-5 pb-16 pt-28 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-36">
        <div>
          <p className="enter mb-5 inline-flex items-center gap-2 rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-ice">
            <span className="size-1.5 animate-[pulse-dot_2.2s_infinite] rounded-full bg-cyan" />
            {c.eyebrow}
          </p>
          <h1 className="enter font-display text-[clamp(2.2rem,5.4vw,4.6rem)] font-bold leading-[1.05] tracking-tight text-chalk" style={{ ["--d" as string]: "80ms" }}>
            {c.title}
          </h1>
          <p className="enter mt-6 max-w-[38rem] text-lg leading-relaxed text-mist" style={{ ["--d" as string]: "160ms" }}>
            {c.lead}
          </p>
          <div className="enter mt-8 flex flex-wrap gap-3" style={{ ["--d" as string]: "240ms" }}>
            <Link href={studio} className="btn btn-primary btn-lg" data-testid="ai3d-start">
              <span aria-hidden className="btn-sheen" />
              <span>{c.start}</span>
              <Icon name="arrow" size={16} className="btn-arrow" />
            </Link>
            <a href="#pricing" className="btn btn-lg">
              <span>{c.prices}</span>
            </a>
          </div>
          {info && !info.enabled && <p className="mt-5 text-sm text-gold">{c.soon}</p>}
          {info && info.made > 0 && (
            <p className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-fog">
              {info.made.toLocaleString("en-US")} · {lang === "ar" ? "موديل اتعمل" : "models made"}
            </p>
          )}
        </div>
        <div className="relative aspect-square w-full max-w-[40rem] justify-self-center">
          <div aria-hidden className="absolute inset-[8%] rounded-full border border-cyan/15" />
          <div aria-hidden className="absolute inset-[18%] animate-[spin_40s_linear_infinite] rounded-full border border-dashed border-cyan/20" />
          <DemoScene onTick={(i, p) => setTick((t) => (t.i === i && Math.abs(t.p - p) < 0.02 ? t : { i, p }))} />
          <div className="pointer-events-none absolute inset-x-[6%] top-[4%] rounded-2xl border border-[var(--line)] bg-void/70 p-3 backdrop-blur">
            <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-fog">
              <span>prompt</span>
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-gold">{c.demo}</span>
            </div>
            <p className="min-h-[1.5em] text-sm text-chalk" dir="auto">
              <Typewriter text={DEMO_PROMPTS[lang][tick.i % 4]} />
            </p>
          </div>
          <div className="pointer-events-none absolute inset-x-[10%] bottom-[5%]">
            <div className="mb-1.5 flex justify-between font-mono text-[0.62rem] uppercase tracking-[0.18em] text-fog">
              <span>{c.building}</span>
              <span>{Math.round(tick.p * 100)}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-volt to-cyan transition-[width] duration-150" style={{ width: `${Math.round(tick.p * 100)}%` }} />
            </div>
          </div>
        </div>
      </div>
      <p className="mx-auto max-w-[1680px] px-5 pb-6 text-xs text-steel sm:px-8">{c.demoNote}</p>
      <div className="overflow-hidden border-y border-[var(--line)] bg-abyss py-4" aria-hidden>
        <div className="flex w-max animate-[marquee_40s_linear_infinite] gap-10 font-display text-lg text-fog">
          {[...c.uses, ...c.uses, ...c.uses].map((u, i) => (
            <span key={i} className="flex items-center gap-10">
              {u}
              <span className="text-cyan">✦</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function How({ c }: { c: (typeof COPY)["ar"] }) {
  const icons: IconName[] = ["idea", "ai", "cad"];
  return (
    <Band>
      <h2 className="font-display text-[clamp(1.8rem,3.6vw,3rem)] font-bold text-chalk">{c.howTitle}</h2>
      <ol className="mt-10 grid gap-5 md:grid-cols-3">
        {c.how.map((s, i) => (
          <li key={i} className="group relative overflow-hidden rounded-3xl border border-[var(--line)] bg-abyss p-7 transition-colors hover:border-cyan/40">
            <span aria-hidden className="absolute -end-4 -top-6 font-display text-[7rem] font-bold leading-none text-white/[0.04] transition-colors group-hover:text-cyan/10">
              {i + 1}
            </span>
            <span className="grid size-12 place-items-center rounded-2xl bg-cyan/10 text-cyan">
              <Icon name={icons[i]} size={24} />
            </span>
            <h3 className="mt-5 text-xl font-semibold text-chalk">{s.t}</h3>
            <p className="mt-2 leading-relaxed text-mist">{s.b}</p>
          </li>
        ))}
      </ol>
    </Band>
  );
}

function Modes({ c }: { c: (typeof COPY)["ar"] }) {
  return (
    <Band alt>
      <h2 className="font-display text-[clamp(1.8rem,3.6vw,3rem)] font-bold text-chalk">{c.modesTitle}</h2>
      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <article className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-void p-7">
          <div aria-hidden className="mb-6 rounded-2xl border border-[var(--line)] bg-abyss p-4 font-mono text-sm text-ice">
            <span className="text-fog">&gt; </span>a medieval wooden treasure chest, gold trim
            <span className="ms-0.5 inline-block h-4 w-[2px] animate-pulse bg-cyan align-middle" />
          </div>
          <h3 className="flex items-center gap-2 text-xl font-semibold text-chalk">
            <Icon name="book" size={20} className="text-cyan" />
            {c.modeText}
          </h3>
          <p className="mt-2 leading-relaxed text-mist">{c.modeTextBody}</p>
        </article>
        <article className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-void p-7">
          <div aria-hidden className="mb-6 flex items-center gap-4">
            <div className="grid size-20 place-items-center rounded-2xl border border-[var(--line)] bg-abyss text-fog">
              <Icon name="image" size={28} />
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-cyan/0 via-cyan to-cyan/0 rtl:bg-gradient-to-l" />
            <div className="grid size-20 place-items-center rounded-2xl border border-cyan/40 bg-cyan/10 text-cyan">
              <Icon name="cad" size={30} className="animate-[spin_12s_linear_infinite]" />
            </div>
          </div>
          <h3 className="flex items-center gap-2 text-xl font-semibold text-chalk">
            <Icon name="image" size={20} className="text-cyan" />
            {c.modeImage}
          </h3>
          <p className="mt-2 leading-relaxed text-mist">{c.modeImageBody}</p>
        </article>
      </div>
    </Band>
  );
}

function Features({ c }: { c: (typeof COPY)["ar"] }) {
  return (
    <Band>
      <h2 className="font-display text-[clamp(1.8rem,3.6vw,3rem)] font-bold text-chalk">{c.featuresTitle}</h2>
      <div className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-3">
        {c.features.map((f) => (
          <div key={f.t} className="bg-void p-7 transition-colors hover:bg-abyss">
            <Icon name={f.icon as IconName} size={26} className="text-cyan" />
            <h3 className="mt-4 text-lg font-semibold text-chalk">{f.t}</h3>
            <p className="mt-1.5 leading-relaxed text-mist">{f.b}</p>
          </div>
        ))}
      </div>
    </Band>
  );
}

function Pricing({ c, info, studio }: { c: (typeof COPY)["ar"]; info: Info | null; studio: string }) {
  const pkgs = info?.packages?.length ? info.packages : DEFAULT_PACKAGES;
  const per = pkgs.map((p) => p.price / p.credits);
  const best = pkgs.length > 1 ? per.indexOf(Math.min(...per)) : -1;
  return (
    <Band alt id="pricing">
      <h2 className="font-display text-[clamp(1.8rem,3.6vw,3rem)] font-bold text-chalk">{c.pricingTitle}</h2>
      <p className="mt-3 max-w-2xl text-mist">{c.pricingLead}</p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="ai3d-pricing">
        {pkgs.map((p, i) => (
          <div
            key={i}
            className={cn(
              "relative flex flex-col rounded-3xl border p-7 transition-transform hover:-translate-y-1",
              i === best ? "border-cyan/60 bg-gradient-to-b from-cyan/10 to-void shadow-[0_0_60px_-20px_rgba(60,196,255,0.6)]" : "border-[var(--line)] bg-void",
            )}
          >
            {i === best && <span className="absolute -top-3 start-7 rounded-full bg-cyan px-3 py-0.5 text-xs font-semibold text-void">{c.best}</span>}
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-fog">{c.credit(p.credits)}</p>
            <p className="mt-3 font-display text-4xl font-bold text-chalk">{c.egp(p.price)}</p>
            <p className="mt-1 text-sm text-mist">{c.perModel(c.egp(Math.round(per[i])))}</p>
            <Link href={`${studio}?buy=${i}`} className={cn("btn mt-7", i === best && "btn-primary")}>
              {i === best && <span aria-hidden className="btn-sheen" />}
              <span>{c.buy}</span>
            </Link>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-fog">{c.payWith}</p>
    </Band>
  );
}

function Gallery({ c, items }: { c: (typeof COPY)["ar"]; items: GalleryItem[] }) {
  const [open, setOpen] = useState<GalleryItem | null>(null);
  return (
    <Band>
      <h2 className="font-display text-[clamp(1.8rem,3.6vw,3rem)] font-bold text-chalk">{c.galleryTitle}</h2>
      {items.length === 0 ? (
        <p className="mt-6 rounded-3xl border border-dashed border-[var(--line)] p-10 text-center text-fog">{c.galleryEmpty}</p>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((g) => (
            <button key={g.id} type="button" onClick={() => setOpen(g)} className="group overflow-hidden rounded-3xl border border-[var(--line)] bg-abyss text-start transition-colors hover:border-cyan/50">
              <div className="aspect-square overflow-hidden bg-void">
                {g.thumb ? (
                   
                  <img src={modelUrl(g.thumb)!} alt={g.prompt ?? ""} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="grid h-full place-items-center text-cyan">
                    <Icon name="cad" size={40} />
                  </div>
                )}
              </div>
              {g.prompt && (
                <p className="line-clamp-2 p-3 text-sm text-mist" dir="auto">
                  {g.prompt}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
      {open && (
        <div role="dialog" aria-modal className="fixed inset-0 z-[80] grid place-items-center bg-void/85 p-4 backdrop-blur" onClick={() => setOpen(null)}>
          <div className="relative h-[min(80vh,40rem)] w-full max-w-3xl overflow-hidden rounded-3xl border border-[var(--line)] bg-abyss" onClick={(e) => e.stopPropagation()}>
            <ModelViewer url={modelUrl(open.glb)!} />
            <button type="button" onClick={() => setOpen(null)} className="btn btn-icon absolute end-3 top-3" aria-label={c.close}>
              <Icon name="close" size={16} />
            </button>
            {open.prompt && (
              <p className="absolute inset-x-3 bottom-3 rounded-xl bg-void/80 p-3 text-sm text-mist" dir="auto">
                {open.prompt}
              </p>
            )}
          </div>
        </div>
      )}
    </Band>
  );
}

function Faq({ c }: { c: (typeof COPY)["ar"] }) {
  return (
    <Band alt>
      <h2 className="font-display text-[clamp(1.8rem,3.6vw,3rem)] font-bold text-chalk">{c.faqTitle}</h2>
      <div className="mt-8 grid gap-3 lg:grid-cols-2">
        {c.faq.map((f) => (
          <details key={f.q} className="group rounded-2xl border border-[var(--line)] bg-void p-5 open:border-cyan/40">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-chalk">
              {f.q}
              <Icon name="plus" size={16} className="shrink-0 text-cyan transition-transform group-open:rotate-45" />
            </summary>
            <p className="mt-3 leading-relaxed text-mist">{f.a}</p>
          </details>
        ))}
      </div>
    </Band>
  );
}

export function Ai3dLanding({ lang, studio }: { lang: Lang; studio: string }) {
  const c = COPY[lang];
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    getInfo().then(setInfo, () => {});
  }, []);
  return (
    <>
      <Hero c={c} lang={lang} studio={studio} info={info} />
      <How c={c} />
      <Modes c={c} />
      <Features c={c} />
      <Pricing c={c} info={info} studio={studio} />
      <Gallery c={c} items={info?.gallery ?? []} />
      <Faq c={c} />
      <Band>
        <div className="relative overflow-hidden rounded-[2rem] border border-cyan/30 bg-gradient-to-br from-volt/30 via-abyss to-void p-10 text-center lg:p-16">
          <div aria-hidden className="grid-lines mask-radial absolute inset-0 opacity-30" />
          <h2 className="relative font-display text-[clamp(1.8rem,4vw,3.4rem)] font-bold text-chalk">{c.ctaTitle}</h2>
          <p className="relative mt-3 text-mist">{c.ctaBody}</p>
          <Link href={studio} className="btn btn-primary btn-lg relative mt-8 inline-flex">
            <span aria-hidden className="btn-sheen" />
            <span>{c.openStudio}</span>
            <Icon name="arrow" size={16} className="btn-arrow" />
          </Link>
        </div>
      </Band>
    </>
  );
}
