import type { Metadata } from "next";
import QRCode from "qrcode";
import { Icon, Icons, type IconName } from "@/components/brand/icons";
import { Mark } from "@/components/brand/logo";
import { IdCard, ShirtFlats } from "@/components/brand-page/applications";
import { Swatch } from "@/components/brand-page/swatch";
import { Picture } from "@/components/media/picture";
import { Reveal } from "@/components/motion/reveal";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { SectionHead } from "@/components/ui/section-head";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta, SITE_URL } from "@/lib/seo";

export const revalidate = 86400;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t, p } = await resolvePage(params);
  return pageMeta({ locale, path: "/brand", title: t.nav.brand, description: p.brand.heroBody, image: art("logo3d_wide", "hero")?.og });
}

const FILES: { file: string; label: string; dark?: boolean }[] = [
  { file: "logo-horizontal-color.svg", label: "Horizontal · colour" },
  { file: "logo-horizontal-white.svg", label: "Horizontal · white" },
  { file: "logo-horizontal-black.svg", label: "Horizontal · black", dark: false },
  { file: "logo-horizontal-silver.svg", label: "Horizontal · metallic" },
  { file: "logo-stacked-color.svg", label: "Stacked · colour" },
  { file: "logo-stacked-white.svg", label: "Stacked · white" },
  { file: "logo-stacked-black.svg", label: "Stacked · black", dark: false },
  { file: "mark-color.svg", label: "Mark · colour" },
  { file: "mark-white.svg", label: "Mark · white" },
  { file: "mark-black.svg", label: "Mark · black", dark: false },
  { file: "mark-silver.svg", label: "Mark · metallic" },
  { file: "wordmark-color.svg", label: "Wordmark · colour" },
  { file: "badge.svg", label: "App badge" },
  { file: "icon-512.png", label: "App icon · 512" },
  { file: "favicon.svg", label: "Favicon · SVG" },
  { file: "apple-touch-icon.png", label: "Apple touch icon" },
];

const CORE = [
  ["Navy", "#050E26", "Page background"],
  ["Deep", "#0B1B3F", "Surfaces"],
  ["Panel", "#0F2049", "Cards"],
  ["Mist", "#BFCCE4", "Body text"],
  ["Chalk", "#F3F7FD", "Headlines"],
  ["Volt", "#2F7BFF", "Primary · the X"],
  ["Sky", "#3CC4FF", "Highlights · HUE"],
  ["Gold", "#E8B45C", "Achievements"],
] as const;
const TEAMS = [
  ["Line Follower / Sprint", "#2F7BFF"],
  ["Sumo", "#FF3B4E"],
  ["IoT", "#2ED47A"],
  ["AI", "#9B6BFF"],
  ["Programming", "#38DCFF"],
  ["Green", "#7BD957"],
] as const;

export default async function Brand({ params }: Params) {
  const { locale, t, p, href } = await resolvePage(params);
  const qr = await QRCode.toString(`${SITE_URL}${locale === "ar" ? "/ar" : ""}/join`, { type: "svg", margin: 0, errorCorrectionLevel: "M", width: 120, color: { dark: "#081634", light: "#ffffff" } });
  const hero3d = art("logo3d_wide", "hero");
  const avatar = art("logo3d_square");

  return (
    <>
      <PageHero eyebrow={t.nav.brand} title="BuildX HUE" body={p.brand.heroBody} image={hero3d} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.brand }]} size="md" />

      <Band>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHead index="01" eyebrow={p.brand.markTitle} title="R + H" body={p.brand.markBody} size="md" className="!block" />
            <div className="mt-10 flex items-end gap-8" dir="ltr">
              {[64, 32, 24, 16].map((s) => (
                <div key={s} className="flex flex-col items-center gap-2">
                  <Mark className="w-auto" style={{ height: s } as React.CSSProperties} />
                  <span className="font-mono text-[0.62rem] text-fog">{s}px</span>
                </div>
              ))}
            </div>
          </div>
          <Reveal>
            <div className="frame relative flex aspect-square items-center justify-center overflow-hidden !rounded-[24px]" dir="ltr">
              <div aria-hidden className="grid-lines absolute inset-0 opacity-50" />
              <svg viewBox="-30 -30 178 160" className="relative w-[70%]" aria-hidden>
                <rect x="-24" y="-24" width="166" height="148" fill="none" stroke="rgb(56 220 255 / .35)" strokeDasharray="3 3" />
                <path fillRule="evenodd" fill="#F2F5F8" d="M0 16L16 0L46 0L56 10L56 49L46 59L38 59L58 100L38 100L20 62L18 62L18 100L0 100ZM18 18L38 18L38 41L18 41ZM64 0L82 0L82 100L64 100ZM100 0L118 0L118 84L102 100L100 100Z" />
                <path fill="#2B6DFF" d="M82 41L100 41L100 59L82 59Z" />
                <path d="M0 -12 L118 -12" stroke="rgb(56 220 255 / .6)" strokeWidth=".6" />
                <text x="59" y="-16" textAnchor="middle" fill="#38dcff" fontSize="5" fontFamily="monospace">118</text>
                <path d="M128 0 L128 100" stroke="rgb(56 220 255 / .6)" strokeWidth=".6" />
                <text x="134" y="52" fill="#38dcff" fontSize="5" fontFamily="monospace">100</text>
                <text x="-22" y="-16" fill="#38dcff" fontSize="4.5" fontFamily="monospace">x = 18</text>
              </svg>
              <p className="absolute bottom-4 start-5 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-fog">{p.brand.clearSpace}</p>
            </div>
          </Reveal>
        </div>
      </Band>

      <Band alt>
        <SectionHead index="02" eyebrow={p.brand.logos} title={p.brand.logos} size="md" />
        <ul className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4">
          {FILES.map((f) => (
            <li key={f.file}>
              <a href={`/brand/${f.file}`} download className="frame group flex h-full flex-col overflow-hidden">
                <span className={`flex h-32 items-center justify-center p-5 ${f.dark === false ? "bg-[#e9eef5]" : "bg-void/60"}`}>
                  <img src={`/brand/${f.file}`} alt={f.label} loading="lazy" className="max-h-full max-w-full object-contain" />
                </span>
                <span className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-4 py-3">
                  <span className="truncate text-xs text-mist">{f.label}</span>
                  <Icon name="arrow" size={14} className="rotate-90 text-fog group-hover:text-cyan" />
                </span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-10">
          <p className="t-eyebrow text-danger">{p.brand.misuse}</p>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4" dir="ltr">
            {p.brand.misuseItems.map((m, i) => (
              <li key={m} className="frame flex flex-col items-center gap-4 p-5">
                <span className="flex h-16 items-center justify-center">
                  <Mark className="h-12 w-auto" style={[{ transform: "scaleX(1.6)" }, { filter: "hue-rotate(140deg) saturate(3)" }, { filter: "drop-shadow(0 0 8px #ff3b4e) drop-shadow(0 0 2px #fff)" }, { opacity: 0.35 }][i] as React.CSSProperties} />
                </span>
                <span className="flex items-center gap-2 text-center text-xs text-mist" dir={locale === "ar" ? "rtl" : "ltr"}>
                  <Icon name="close" size={13} className="shrink-0 text-danger" />
                  {m}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Band>

      <Band>
        <SectionHead index="03" eyebrow={p.brand.colours} title={p.brand.colours} size="md" />
        <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-4">
          {CORE.map(([n, hex, note]) => (
            <Swatch key={n} name={n} hex={hex} note={note} copy={p.brand.copy} copied={p.brand.copied} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          {TEAMS.map(([n, hex]) => (
            <Swatch key={n} name={n} hex={hex} note={t.teams.eyebrow} copy={p.brand.copy} copied={p.brand.copied} />
          ))}
        </div>
      </Band>

      <Band alt>
        <SectionHead index="04" eyebrow={p.brand.type} title={p.brand.type} size="md" />
        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          {[
            { name: "Saira (Expanded)", role: "Display", sample: <span className="t-display text-5xl text-chalk">Build real machines.</span> },
            { name: "Inter", role: "Body / UI", sample: <span className="text-2xl text-frost">Engineering starts when theory meets hardware.</span> },
            { name: "JetBrains Mono", role: "Telemetry / data", sample: <span className="t-data text-2xl text-cyan">BX-01 · 31.43°N 31.70°E</span> },
            { name: "Noto Kufi Arabic · IBM Plex Sans Arabic", role: "العربية", sample: <span dir="rtl" className="font-[family-name:var(--font-kufi)] text-4xl font-bold text-chalk">ابنِ. تعلّم. نافس.</span> },
          ].map((f) => (
            <div key={f.name} className="frame flex flex-col gap-6 p-7">
              <div className="flex items-center justify-between">
                <span className="text-sm text-chalk">{f.name}</span>
                <span className="t-eyebrow text-[0.56rem] text-fog">{f.role}</span>
              </div>
              {f.sample}
            </div>
          ))}
        </div>
      </Band>

      <Band>
        <SectionHead index="05" eyebrow={p.brand.icons} title={p.brand.icons} size="md" />
        <ul className="mt-12 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
          {(Object.keys(Icons) as IconName[]).map((n) => (
            <li key={n} className="flex flex-col items-center gap-2 rounded-xl border border-[var(--line)] bg-panel/40 px-2 py-4">
              <Icon name={n} size={22} className="text-frost" />
              <span className="w-full truncate text-center font-mono text-[0.55rem] text-fog">{n}</span>
            </li>
          ))}
        </ul>
      </Band>

      <Band alt>
        <SectionHead index="06" eyebrow={p.brand.applications} title={p.brand.applications} size="md" />
        <div className="mt-12 grid gap-10 xl:grid-cols-2">
          <div>
            <p className="t-eyebrow text-fog">{p.brand.idCard}</p>
            <div className="mt-6">
              <IdCard qrSvg={qr} />
            </div>
            <p className="mt-4 text-center text-xs text-fog">{p.brand.idCardNote}</p>
          </div>
          <div>
            <p className="t-eyebrow text-fog">{p.brand.shirt}</p>
            <div className="mt-6">
              <ShirtFlats />
            </div>
          </div>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-[1fr_2fr]">
          <div className="frame flex flex-col items-center gap-4 p-6">
            <p className="t-eyebrow self-start text-fog">{p.brand.avatar}</p>
            <div className="relative size-40 overflow-hidden rounded-full border border-[var(--line-2)]">
              {avatar ? <Picture image={avatar} sizes="10rem" className="absolute inset-0 h-full w-full" /> : <div className="flex h-full items-center justify-center bg-void"><Mark className="h-16 w-auto" /></div>}
            </div>
          </div>
          {hero3d && (
            <div className="frame relative min-h-56 overflow-hidden">
              <Picture image={hero3d} sizes="(min-width:768px) 60vw, 100vw" className="absolute inset-0 h-full w-full" />
            </div>
          )}
        </div>
      </Band>
    </>
  );
}
