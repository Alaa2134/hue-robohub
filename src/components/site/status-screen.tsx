import type { ReactNode } from "react";
import { Picture } from "@/components/media/picture";
import type { LibraryEntry } from "@/lib/media-library";

/** Shared full-height system screen for 404 / 403 / 500 / offline / maintenance. */
export function StatusScreen({ code, title, body, reference, children, bg }: { code: string; title: string; body: string; reference?: string; children?: ReactNode; bg?: LibraryEntry | null }) {
  return (
    <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden pt-20">
      {bg && (
        <div aria-hidden className="absolute inset-0 -z-10">
          <Picture image={bg} sizes="100vw" decorative className="h-full w-full opacity-30 saturate-[0.6]" />
          <div className="absolute inset-0 bg-gradient-to-r from-void via-void/85 to-void/40 rtl:bg-gradient-to-l" />
          <div className="scanlines absolute inset-0 opacity-60" />
        </div>
      )}
      <div className="mx-auto w-full max-w-[1680px] px-5 py-20 sm:px-8">
        <p className="t-eyebrow mb-6 flex items-center gap-3 text-danger">
          <span className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-danger/60" />
            <span className="relative size-2 rounded-full bg-danger" />
          </span>
          ERR · {code}
        </p>
        <p aria-hidden className="t-display text-chrome text-[clamp(6rem,22vw,17rem)] leading-[0.8]" dir="ltr">
          {code}
        </p>
        <h1 className="t-headline mt-6 text-[clamp(1.8rem,4vw,3.2rem)] text-chalk">{title}</h1>
        <p className="mt-4 max-w-lg text-pretty text-lg text-mist">{body}</p>
        {reference && <p className="mt-4 font-mono text-xs text-fog">REF {reference}</p>}
        {children && <div className="mt-10 flex flex-wrap gap-3">{children}</div>}
      </div>
    </section>
  );
}
