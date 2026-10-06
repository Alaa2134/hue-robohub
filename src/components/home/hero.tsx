import Link from "next/link";
import { COMMAND_URL } from "@/lib/deploy";
import { Icon } from "@/components/brand/icons";
import { Wordmark } from "@/components/brand/logo";
import { AmbientVideo, FilmLauncher, formatDuration, type Film } from "@/components/media/film";
import { Picture } from "@/components/media/picture";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import { artUrl, type LibraryEntry } from "@/lib/media-library";
import { pick, type HeroConfig } from "@/lib/site-config";
import { HeroCamera, LabClock, Scope } from "./hero-fx";

export type HeroStat = { value: number; label: string; pad?: number };

/**
 * First view. The render is laid out on a "stage" that reproduces object-fit: cover with the image's own
 * aspect ratio (container query units), so HUD overlays stay locked to the robot at every viewport.
 */
export function Hero({
  locale,
  t,
  hero,
  image,
  stats,
  film,
  ambient,
  thumbs,
}: {
  locale: Locale;
  t: Dictionary;
  hero: HeroConfig;
  image: LibraryEntry | null;
  stats: HeroStat[];
  film: Film | null;
  ambient: Film | null;
  thumbs: LibraryEntry[];
}) {
  const href = (p: string) => localePath(locale, p);
  const fx = image?.focal ?? [64, 42];
  const ar = image ? image.width / image.height : 16 / 9;
  const lines = hero.lines.map((l) => pick(l, locale));

  return (
    <section id="hero" aria-label="BuildX HUE" className="relative isolate h-[100svh] min-h-[40rem] overflow-hidden bg-void [container-type:size] lg:min-h-[46rem]">
      <HeroCamera className="absolute inset-0 -z-10">
        <div
          className="hero-stage absolute"
          style={{
            left: `${fx[0]}%`,
            top: `${fx[1]}%`,
            width: `max(100cqw, calc(100cqh * ${ar.toFixed(4)}))`,
            aspectRatio: `${image?.width ?? 16} / ${image?.height ?? 9}`,
            ["--fx" as string]: `${fx[0]}%`,
            ["--fy" as string]: `${fx[1]}%`,
          }}
        >
          {image && <Picture image={image} sizes="(max-width: 768px) 200vw, 100vw" priority className="absolute inset-0 h-full w-full" />}
          {ambient && <AmbientVideo film={ambient} className="absolute inset-0 h-full w-full object-cover" />}
          {/* Target lock on the robot visor */}
          <div aria-hidden className="hero-lock absolute hidden md:block" style={{ left: "66.4%", top: "31.5%" }}>
            <span className="hero-lock-ring" />
            <span className="hero-lock-label t-data">
              BUILDX <span className="text-cyan">● ONLINE</span>
            </span>
          </div>
        </div>
        {/* Grade: legibility gradients, grain, scanlines */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-void via-void/70 to-transparent sm:via-void/45 rtl:bg-gradient-to-l" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/20 to-void/50 sm:to-transparent" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-void to-transparent max-sm:h-[62%]" />
        <div aria-hidden className="grain absolute inset-0 overflow-hidden" />
        <div aria-hidden className="scanlines absolute inset-0 opacity-40 mix-blend-overlay" />
      </HeroCamera>

      <div className="relative mx-auto flex h-full max-w-[1680px] flex-col px-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[calc(3.75rem+env(safe-area-inset-top))] sm:px-8 lg:pb-8 lg:pt-[4.5rem]">
        <div className="flex flex-1 flex-col justify-end pb-6 sm:pb-10 lg:justify-center lg:pb-0 lg:pt-6">
          <p className="enter t-eyebrow mb-5 flex items-center gap-3 text-mist sm:mb-7" style={{ ["--d" as string]: "200ms" }}>
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-cyan/60" />
              <span className="relative size-2 rounded-full bg-cyan" />
            </span>
            <span className="truncate">{pick(hero.eyebrow, locale)}</span>
          </p>

          <h1 className="max-w-[54rem]">
            <span className="sr-only">BuildX HUE — </span>
            <span className="enter mb-5 block w-[min(100%,30rem)] sm:mb-7 lg:w-[34rem]" style={{ ["--d" as string]: "320ms" }} dir="ltr">
              <Wordmark className="h-auto w-full drop-shadow-[0_6px_30px_rgb(43_109_255/0.25)]" />
            </span>
            {lines.map((l, i) => (
              <span key={i} className="block overflow-hidden pb-[0.06em]">
                <span className="enter-mask t-display block text-[clamp(1.75rem,4.3vw,3.7rem)]" style={{ ["--d" as string]: `${520 + i * 130}ms` }}>
                  <span className={i === 0 ? "text-chalk" : i === 1 ? "text-chrome" : "text-volt"}>{l}</span>
                </span>
              </span>
            ))}
          </h1>

          <p className="enter mt-5 max-w-[34rem] text-pretty text-[0.98rem] leading-relaxed text-mist max-sm:hidden sm:mt-7 sm:text-[1.05rem]" style={{ ["--d" as string]: "980ms" }}>
            {pick(hero.subtitle, locale)}
          </p>

          <div className="enter mt-7 grid grid-cols-2 gap-2.5 sm:mt-9 sm:flex sm:flex-wrap sm:gap-3" style={{ ["--d" as string]: "1120ms" }}>
            <Link href={href(hero.primaryCta.href)} className="btn btn-primary btn-lg col-span-2 sm:col-span-1">
              <span aria-hidden className="btn-sheen" />
              <span>{pick(hero.primaryCta.label, locale)}</span>
              <Icon name="arrow" size={17} className="btn-arrow -me-1" />
            </Link>
            <Link href={href(hero.secondaryCta.href)} className={`btn btn-lg max-sm:!px-3${COMMAND_URL ? "" : " col-span-2 sm:col-span-1"}`}>
              <span>{pick(hero.secondaryCta.label, locale)}</span>
            </Link>
            {COMMAND_URL && (
              <Link href={COMMAND_URL} prefetch={false} className="btn btn-lg max-sm:!px-3">
                <Icon name="lock" size={16} />
                <span>{t.hero.cta3}</span>
              </Link>
            )}
          </div>
        </div>

        {/* Bottom rail: live stats · scroll cue · film */}
        <div className="enter relative grid items-end gap-5 border-t border-[var(--line)] pt-4 sm:pt-5 lg:grid-cols-[1fr_auto_1fr]" style={{ ["--d" as string]: "1300ms" }}>
          <dl className="rail -mx-5 gap-0 px-5 sm:mx-0 sm:px-0 lg:flex-wrap">
            {stats.map((s, i) => (
              <div key={s.label} className={`flex min-w-[7.5rem] flex-col gap-1 pe-6 ${i > 0 ? "border-s border-[var(--line)] ps-5 sm:ps-6" : ""}`}>
                <dd className="t-display text-[clamp(1.6rem,2.6vw,2.4rem)] leading-none text-chalk" dir="ltr">
                  {String(s.value).padStart(s.pad ?? 2, "0")}
                </dd>
                <dt className="t-eyebrow whitespace-nowrap text-[0.6rem] text-fog">{s.label}</dt>
              </div>
            ))}
          </dl>

          <a href="#why" className="group hidden flex-col items-center gap-2 pb-1 text-fog transition-colors hover:text-chalk lg:flex" aria-label={t.hero.scroll}>
            <span className="relative flex h-9 w-[22px] justify-center rounded-full border border-[var(--line-2)]">
              <span className="mt-2 h-2 w-[2px] animate-[float_1.8s_ease-in-out_infinite] rounded-full bg-cyan" />
            </span>
            <span className="t-eyebrow text-[0.56rem]">{t.hero.scroll}</span>
          </a>

          {film && (
            <div className="hidden items-center justify-end gap-4 lg:flex">
              <FilmLauncher film={film} className="group flex items-center gap-4 text-start" closeLabel={t.nav.close}>
                <span className="relative flex size-14 items-center justify-center rounded-full border border-[var(--line-2)] bg-void/40 text-chalk backdrop-blur-md transition-[transform,border-color] duration-500 group-hover:scale-105 group-hover:border-cyan">
                  <span aria-hidden className="absolute inset-0 animate-ping rounded-full border border-cyan/30 [animation-duration:2.6s]" />
                  <Icon name="play" size={20} className="translate-x-0.5" />
                </span>
                <span className="flex flex-col">
                  <span className="t-label text-chalk">{t.common.play}</span>
                  <span className="text-xs text-fog">
                    {film.title} · {formatDuration(film.durationSeconds)}
                  </span>
                </span>
              </FilmLauncher>
              <div className="frame flex gap-1 p-1">
                {thumbs.slice(0, 3).map((th) => (
                  <img key={th.name} src={artUrl(th, 480)} alt="" loading="lazy" className="h-12 w-20 rounded-[6px] object-cover opacity-80" />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Telemetry panel (wide screens) */}
      <aside aria-label={t.hero.telemetry} className="enter absolute end-8 top-[7.5rem] hidden w-[19rem] 2xl:block" style={{ ["--d" as string]: "1500ms" }}>
        <div className="frame glass !border-0 p-5 text-[0.7rem]" dir="ltr">
          <div className="flex items-center justify-between">
            <span className="t-eyebrow text-[0.6rem] text-mist">{t.hero.telemetry}</span>
            <span className="flex items-center gap-1.5 font-mono text-[0.6rem] text-ok">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-ok" />
              ONLINE
            </span>
          </div>
          <Scope className="mt-4 h-16 w-full" />
          <dl className="mt-4 space-y-2 font-mono text-fog">
            <div className="flex justify-between">
              <dt>LAB</dt>
              <dd className="text-mist">NEW DAMIETTA · EG</dd>
            </div>
            <div className="flex justify-between">
              <dt>LOCAL</dt>
              <dd className="text-mist">
                <LabClock /> EET
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>COORD</dt>
              <dd className="text-mist">31.43°N · 31.70°E</dd>
            </div>
            <div className="flex justify-between">
              <dt>MODE</dt>
              <dd className="text-cyan">BUILD · INNOVATE · COMPETE</dd>
            </div>
          </dl>
        </div>
      </aside>
    </section>
  );
}
