"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";

export type Film = {
  id: string;
  title: string;
  description?: string;
  kicker?: string;
  hls: string | null;
  mp4?: string | null;
  youtubeId?: string | null;
  poster: string | null;
  durationSeconds: number | null;
};

export function formatDuration(s: number | null | undefined) {
  if (!s && s !== 0) return "";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Attach an adaptive stream: native HLS on Safari/iOS, hls.js (lazy-loaded) elsewhere, MP4 as last resort. */
async function attachSource(video: HTMLVideoElement, film: Film): Promise<() => void> {
  if (film.hls) {
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = film.hls;
      return () => {};
    }
    const { default: Hls } = await import("hls.js");
    if (Hls.isSupported()) {
      const hls = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 24, startLevel: -1 });
      hls.loadSource(film.hls);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
  }
  if (film.mp4) video.src = film.mp4;
  return () => {};
}

/** Silent ambient loop for backgrounds (hero/cards). Starts only when visible and when the user allows motion. */
export function AmbientVideo({ film, className, onReady }: { film: Film; className?: string; onReady?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "")) return;
    let cleanup = () => {};
    let started = false;
    const io = new IntersectionObserver(([e]) => {
      if (!e) return;
      if (e.isIntersecting) {
        if (!started) {
          started = true;
          attachSource(v, film).then((c) => (cleanup = c));
        }
        v.play().catch(() => {});
      } else v.pause();
    });
    io.observe(v);
    return () => {
      io.disconnect();
      cleanup();
    };
  }, [film]);
  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden
      tabIndex={-1}
      onPlaying={() => {
        setReady(true);
        onReady?.();
      }}
      className={cn("transition-opacity duration-[1600ms]", ready ? "opacity-100" : "opacity-0", className)}
    />
  );
}

/** Full player with custom transport controls. */
export function FilmPlayer({ film, autoPlay = true, className }: { film: Film; autoPlay?: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const v = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [t, setT] = useState(0);
  const [d, setD] = useState(film.durationSeconds ?? 0);
  const [buf, setBuf] = useState(0);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<number>(0);

  useEffect(() => {
    const el = v.current;
    if (!el || film.youtubeId) return;
    let cleanup = () => {};
    attachSource(el, film).then((c) => {
      cleanup = c;
      if (autoPlay) el.play().catch(() => setPlaying(false));
    });
    return () => cleanup();
  }, [film, autoPlay]);

  const toggle = useCallback(() => {
    const el = v.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }, []);

  const fullscreen = useCallback(() => {
    const el = v.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) return void document.exitFullscreen();
    if (box.current?.requestFullscreen) box.current.requestFullscreen().catch(() => el?.webkitEnterFullscreen?.());
    else el?.webkitEnterFullscreen?.();
  }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = v.current;
      if (!el || (e.target as HTMLElement)?.closest("input")) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "m") el.muted = !el.muted;
      else if (e.key === "f") fullscreen();
      else if (e.key === "ArrowRight") el.currentTime = Math.min(el.duration || 0, el.currentTime + 5);
      else if (e.key === "ArrowLeft") el.currentTime = Math.max(0, el.currentTime - 5);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [toggle, fullscreen]);

  const wake = () => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2400);
  };

  if (film.youtubeId) {
    return (
      <div className={cn("relative aspect-video w-full overflow-hidden bg-black", className)}>
        <iframe
          title={film.title}
          src={`https://www.youtube-nocookie.com/embed/${film.youtubeId}?autoplay=1&rel=0&modestbranding=1`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
    );
  }

  const pct = d ? (t / d) * 100 : 0;
  return (
    <div
      ref={box}
      onPointerMove={wake}
      onPointerDown={wake}
      className={cn("group/player relative aspect-video w-full overflow-hidden bg-black", idle && playing && "cursor-none", className)}
    >
      <video
        ref={v}
        playsInline
        poster={film.poster ?? undefined}
        preload="metadata"
        className="absolute inset-0 h-full w-full object-contain"
        onClick={toggle}
        onPlay={() => {
          setPlaying(true);
          wake();
        }}
        onPause={() => setPlaying(false)}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setD(e.currentTarget.duration)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length && e.currentTarget.duration) setBuf((b.end(b.length - 1) / e.currentTarget.duration) * 100);
        }}
      />
      {!playing && (
        <button type="button" onClick={toggle} aria-label="Play" className="absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="flex size-20 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-md transition-transform hover:scale-105">
            <Icon name="play" size={30} className="translate-x-0.5" />
          </span>
        </button>
      )}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-14 transition-opacity duration-500 sm:px-6 sm:pb-5",
          idle && playing ? "opacity-0" : "opacity-100",
        )}
        dir="ltr"
      >
        <div className="relative h-5">
          <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/15" />
          <div className="absolute start-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/25" style={{ width: `${buf}%` }} />
          <div className="absolute start-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gradient-to-r from-volt to-cyan" style={{ width: `${pct}%` }} />
          <input
            type="range"
            min={0}
            max={d || 0}
            step={0.1}
            value={t}
            aria-label="Seek"
            onChange={(e) => {
              if (v.current) v.current.currentTime = Number(e.target.value);
            }}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
        </div>
        <div className="mt-2 flex items-center gap-2 text-white">
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="flex size-10 items-center justify-center rounded-md hover:bg-white/10">
            <Icon name={playing ? "pause" : "play"} size={20} />
          </button>
          <button
            type="button"
            onClick={() => v.current && (v.current.muted = !v.current.muted)}
            aria-label={muted ? "Unmute" : "Mute"}
            className="flex size-10 items-center justify-center rounded-md hover:bg-white/10"
          >
            <Icon name={muted ? "mute" : "volume"} size={20} />
          </button>
          <span className="font-mono text-xs tabular-nums text-white/80">
            {formatDuration(t)} / {formatDuration(d)}
          </span>
          <span className="ms-auto hidden truncate font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/70 [font-stretch:112%] sm:block">{film.title}</span>
          <button type="button" onClick={fullscreen} aria-label="Fullscreen" className="flex size-10 items-center justify-center rounded-md hover:bg-white/10">
            <Icon name="expand" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Cinema-mode modal (portal) with focus containment and Escape to close. */
export function FilmModal({ film, onClose, closeLabel = "Close" }: { film: Film; onClose: () => void; closeLabel?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    document.documentElement.setAttribute("data-locked", "");
    const lenis = (window as unknown as { __lenis?: { stop(): void; start(): void } }).__lenis;
    lenis?.stop();
    panel.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => {
      window.removeEventListener("keydown", on);
      document.documentElement.removeAttribute("data-locked");
      lenis?.start();
      prev?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={film.title} className="fixed inset-0 z-[90] flex items-center justify-center p-0 sm:p-6 lg:p-12">
      <button type="button" tabIndex={-1} aria-label={closeLabel} onClick={onClose} className="absolute inset-0 animate-[enter_.5s_var(--ease-out-expo)_forwards] bg-void/92 opacity-0 backdrop-blur-xl" />
      <div ref={panel} className="relative w-full max-w-[min(100%,calc((100svh-9rem)*16/9))] animate-[enter_.7s_var(--ease-out-expo)_forwards] opacity-0">
        <div className="mb-3 flex items-end justify-between gap-4 px-4 sm:px-0">
          <div>
            {film.kicker && <p className="t-eyebrow text-cyan">{film.kicker}</p>}
            <p className="t-title mt-1 text-xl text-chalk sm:text-2xl">{film.title}</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-icon shrink-0" aria-label={closeLabel}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="frame overflow-hidden !rounded-none sm:!rounded-[14px]">
          <FilmPlayer film={film} />
        </div>
        {film.description && <p className="mt-4 max-w-2xl px-4 text-sm text-mist sm:px-0">{film.description}</p>}
      </div>
    </div>,
    document.body,
  );
}

/** Any element that opens a film in cinema mode. */
export function FilmLauncher({ film, children, className, label, closeLabel }: { film: Film; children: ReactNode; className?: string; label?: string; closeLabel?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-label={label ?? film.title} aria-haspopup="dialog">
        {children}
      </button>
      {open && <FilmModal film={film} onClose={close} closeLabel={closeLabel} />}
    </>
  );
}
