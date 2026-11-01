"use client";
/**
 * How-to videos: real screen recordings of the app (scripts/record-guides.mjs, made-up data) with
 * captions, one for students and one for the team. Shown once on the first sign-in on a device, and
 * any time from «حسابي» (students) or «المزيد» (team). Chapters jump to each part.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { BASE_PATH, publicOrigin } from "./core";
import chapters from "./guides.json";
import { Button, Icon } from "./ui";

export type GuideKind = "student" | "team";
/** The chapter names the recordings use (here so the app's English list keeps them). */
export const CHAPTER_NAMES = [
  "تسجيل الدخول",
  "الشارات",
  "الرئيسية",
  "المحتوى",
  "الكويزات",
  "التاسكات",
  "النقاط والشارات",
  "حسابي",
  "خلاص",
  "الدخول",
  "الطلاب",
  "إضافة طالب للتطبيق",
  "الحضور",
] as const;
const SEEN = (k: GuideKind) => `bx-guide-seen-${k}`;
const src = (k: GuideKind, ext: "mp4" | "jpg") => `${publicOrigin()}${BASE_PATH}/guides/${k}.${ext}`;

/** The video with its chapters under it (tap one to jump there). */
export function GuidePlayer({ kind, autoPlay = false }: { kind: GuideKind; autoPlay?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
  const list = (chapters as Record<GuideKind, { t: number; title: string }[]>)[kind] ?? [];
  const current = list.reduce((c, ch, i) => (now >= ch.t - 0.2 ? i : c), 0);
  return (
    <div className="grid gap-3" data-testid={`guide-${kind}`}>
      <video
        ref={ref}
        src={src(kind, "mp4")}
        poster={src(kind, "jpg")}
        controls
        playsInline
        muted
        autoPlay={autoPlay}
        preload="metadata"
        onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
        className="mx-auto max-h-[60svh] w-auto max-w-full rounded-2xl border border-[var(--line)] bg-black"
      />
      <div className="flex flex-wrap justify-center gap-1.5" role="list" aria-label="أجزاء الفيديو">
        {list.map((ch, i) => (
          <button
            key={ch.t}
            type="button"
            role="listitem"
            onClick={() => {
              const v = ref.current;
              if (!v) return;
              v.currentTime = ch.t;
              v.play().catch(() => undefined);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition",
              i === current
                ? "border-volt bg-volt/15 text-chalk"
                : "border-[var(--line)] text-mist hover:text-chalk",
            )}
          >
            {ch.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function seen(kind: GuideKind) {
  try {
    return localStorage.getItem(SEEN(kind)) === "1";
  } catch {
    return true;
  }
}
function markSeen(kind: GuideKind) {
  try {
    localStorage.setItem(SEEN(kind), "1");
  } catch {
    /* shows again next time: harmless */
  }
}

/** First sign-in on this device: «شوف فيديو أقل من دقيقة» — once, skippable. */
export function FirstRunGuide({ kind }: { kind: GuideKind }) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => setOpen(!seen(kind)), [kind]);
  if (!open) return null;
  const close = () => {
    markSeen(kind);
    setOpen(false);
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="فيديو إزاي تستخدم التطبيق"
      className="fixed inset-0 z-[75] flex items-end justify-center bg-void/80 backdrop-blur-md sm:items-center sm:px-6"
      data-testid="first-guide"
    >
      <div className="frame grid max-h-[94svh] w-full max-w-md gap-4 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-volt/15 text-volt">
            <Icon name="play" size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-chalk">
              {kind === "student" ? "أهلاً بيك! 👋" : "أهلاً بيك في لوحة الفريق 👋"}
            </h2>
            <p className="text-sm text-mist">فيديو أقل من دقيقة بيوريك إزاي تعمل كل حاجة في التطبيق.</p>
          </div>
        </div>
        {playing ? (
          <GuidePlayer kind={kind} autoPlay />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group relative mx-auto block overflow-hidden rounded-2xl border border-[var(--line)]"
            data-testid="first-guide-play"
          >
            <img
              src={src(kind, "jpg")}
              alt=""
              className="max-h-[46svh] w-auto opacity-80 transition group-hover:opacity-100"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-volt text-white shadow-[0_10px_30px_rgba(47,123,255,.5)]">
                <Icon name="play" size={28} />
              </span>
            </span>
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={close} data-testid="first-guide-later">
            بعدين
          </Button>
          <Button variant="primary" onClick={close} data-testid="first-guide-done">
            تمام، فهمت
          </Button>
        </div>
        <p className="text-center text-xs text-fog">
          {kind === "student" ? "تلاقيه تاني في «حسابي»." : "تلاقيه تاني في «المزيد»."}
        </p>
      </div>
    </div>
  );
}

/** A row that opens the how-to video in place (Account / More). */
export function GuideRow({ kind }: { kind: GuideKind }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 rounded-2xl border border-[var(--line)] bg-panel/60">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-start"
        aria-expanded={open}
        data-testid="guide-row"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-volt/15 text-volt">
          <Icon name="play" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-chalk">فيديو: إزاي تستخدم التطبيق</span>
          <span className="block text-xs text-fog">أقل من دقيقة، مقسّم أجزاء</span>
        </span>
        <Icon
          name="chevron"
          size={16}
          className={cn("text-fog transition", open ? "-rotate-90" : "rotate-180")}
        />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <GuidePlayer kind={kind} autoPlay />
        </div>
      )}
    </div>
  );
}
