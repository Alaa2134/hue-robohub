"use client";
/**
 * Baqloz (بقلظ), the BuildX guide, on the page: a small fixed "stage" that walks between spots along
 * the screen edges (never parked on text or controls when a clear spot exists), runs a scene for
 * every section of every page (config/mascotJourney.ts), talks in speech bubbles and out loud
 * (lib/mascot/voice.ts), invites the visitor on a tour of the whole site the first time they arrive
 * and walks them through it page by page, opens his chat when clicked, and reacts to the visitor: he looks at the cursor and at big buttons, talks about
 * the cards you rest the cursor on, helps with forms, celebrates a click on Join, keeps count of the
 * pages you've explored, sits down and falls asleep when left alone, and has a couple of easter eggs.
 * The visitor can pick him up (mouse or finger), swing him around and throw him: he bounces off the
 * screen edges, lands flat on his belly with a complaint, and gets back up. And games (menu → Play):
 * throw him into a hoop, hide-and-seek on the page, a quiz, badges to collect and a daily streak.
 * At the end of a page he suggests where to go next. He dresses for the time and the occasion
 * (lib/mascot/wardrobe.ts) and keeps himself busy when nobody needs him (push-ups, reading, coding…);
 * click him then and he tells you what you interrupted.
 *
 * Only the mascot's own body takes clicks; everything else on the stage lets them through.
 */
import { gsap } from "gsap";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ui, useUi } from "@/components/site/ui-state";
import { ACTIVITIES, GAME, GUIDE_NAME, GUIDE_VOICE, LINES, PAGES, PHYSICS, SITE_TOUR, TEA, type Activity, greeting, type Line, type Scene, type SceneAction, type Text } from "@/config/mascotJourney";
import { mascot, useMascot, type MascotMode } from "@/hooks/useMascotState";
import { useMascotReactions, type Brief } from "@/hooks/useMascotReactions";
import { useScrollScenes } from "@/hooks/useScrollScenes";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { BASE_PATH } from "@/lib/deploy";
import { ONE_SHOT, type ClipName } from "@/lib/mascot/clip-names";
import { confetti, playSound, type Sound } from "@/lib/mascot/fx";
import type { BrainReply } from "@/lib/mascot/brain";
import type { GuideAction } from "@/lib/mascot/guide";
import { BADGES, play, visitToday } from "@/lib/mascot/games";
import { OCCASION_LINES, wardrobe } from "@/lib/mascot/wardrobe";
import { activated, hush, loadVoice, speak as speakAloud, speaking, unlock } from "@/lib/mascot/voice";
import { BODY, center, discoverSections, findSpot, overlap, pointClip, routeKey, scenesFor, scrollToSection, stageSize, visibleTarget, type Spot } from "@/lib/mascotScenes";
import { MascotGuide } from "./MascotGuide";
import type { Quality } from "./Mascot3D";
import { MascotLoader } from "./MascotLoader";
import { goTo } from "./MascotNavigation";
import { MascotSpeech } from "./MascotSpeech";

const Mascot3D = dynamic(() => import("./Mascot3D"), { ssr: false });

/** If WebGL fails after all (no context, driver error), fall back to the still guide. */
class Fallback extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const MODEL = `${BASE_PATH}/mascot/buildx-mascot.glb`;
const POSTER = `${BASE_PATH}/mascot/poster.webp`;
const POSTER_WAVE = `${BASE_PATH}/mascot/poster-wave.webp`;
const OUTFIT_EMOJI: Record<string, string> = { Nightcap: "😴", Scarf: "🧣", Sunglasses: "😎", PartyHat: "🥳", Lantern: "🏮", TeaCup: "☕", Book: "" };
const ACTIVITY_EMOJI: Record<string, string> = { pushups: "💪", stretch: "🧘", read: "📚", code: "💻", think: "💡", dance: "🕺", tea: "" };
/** How much detail this device can afford: fur layers and pixel density (the canvas is small). */
function quality(phone: boolean): Quality {
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (cores <= 4 || memory < 4) return "low";
  if (phone) return cores >= 8 ? "high" : "low";
  return cores >= 8 && memory >= 8 ? "ultra" : "high";
}
/** Swings around his head while held or flying (the stage sets --tilt). */
const SWING = { transform: "rotate(var(--tilt, 0deg))", transformOrigin: "50% 26%" } as const;
const CHEERFUL: ReadonlySet<ClipName> = new Set(["Wave", "Happy", "Celebrate", "Dance", "Jump"]);
const CTA = ".btn-primary, a[href$='/join'], a[href$='/join/'], [data-mascot-cta]";

const storage = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      // Private mode: the setting lasts for this visit only.
    }
  },
};

/** Lines are said once per visit; the tour repeats them on purpose. */
function firstTime(id: string) {
  try {
    const seen = new Set<string>(JSON.parse(sessionStorage.getItem("bx-guide-seen") ?? "[]"));
    if (seen.has(id)) return false;
    seen.add(id);
    sessionStorage.setItem("bx-guide-seen", JSON.stringify([...seen]));
    return true;
  } catch {
    return true;
  }
}

/** A once-per-visit flag. */
function once(key: string) {
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const SITE_TOUR_ACTION: SceneAction = { kind: "sitetour", label: LINES.letsGo };
const NOT_NOW: SceneAction = { kind: "dismiss", label: LINES.notNow };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isPhoneWidth = () => window.innerWidth < 768;

function insetBottom() {
  const bar = document.querySelector<HTMLElement>("nav.fixed.bottom-0");
  return bar && getComputedStyle(bar).display !== "none" ? window.innerHeight - bar.getBoundingClientRect().top : 0;
}

export default function MascotController({ locale, mode }: { locale: Locale; mode: MascotMode }) {
  const pathname = usePathname();
  const router = useRouter();
  // The language it speaks (Egyptian Arabic everywhere by default); links still follow the page's language.
  const voice: Locale = GUIDE_VOICE === "ar" ? "ar" : locale;
  const { menu: siteMenu, search } = useUi();
  const hidden = useMascot((s) => s.hidden);
  const flop = useMascot((s) => s.flop);
  const outfit = useMascot((s) => s.outfit);
  const [doing, setDoing] = useState<string | null>(null);
  const guideOpen = useMascot((s) => s.menu);
  const ready = useMascot((s) => s.ready);
  const clip = useMascot((s) => s.clip);
  const sound = useMascot((s) => s.sound);

  const stage = useRef<HTMLDivElement>(null);
  const hit = useRef<HTMLButtonElement>(null);
  const pos = useRef<Spot>({ x: -1000, y: 0 });
  const [size, setSize] = useState(() => stageSize(window.innerWidth, window.innerHeight));
  const sizeRef = useRef(size);
  const [phone, setPhone] = useState(isPhoneWidth);
  const [placed, setPlaced] = useState(false);
  const [peek, setPeek] = useState(false);
  const [onRight, setOnRight] = useState(true);
  const [progress, setProgress] = useState(0);
  const [failed3d, setFailed3d] = useState(false);
  const [keyboard, setKeyboard] = useState(false);

  const seq = useRef(0);
  const tween = useRef<gsap.core.Tween | null>(null);
  const moving = useRef(false);
  const lastMove = useRef(0);
  const touring = useRef(false);
  const nextStep = useRef<(() => void) | null>(null);
  /** On the site tour: the page the tour is on (a visitor who goes elsewhere ends it). */
  const tourPath = useRef<string | null>(null);
  const sceneTarget = useRef<Element | null>(null);
  const ctaTarget = useRef<Element | null>(null);
  const cursor = useRef<{ x: number; y: number } | null>(null);
  const resting = useRef<"" | "Sit" | "Sleep">("");
  const soundOn = useRef(false);
  const returning = useRef(false);
  /** How important the line on screen is: 2 a scene, 1 a reaction (hover, form tip), 0 small talk. */
  const prio = useRef(0);
  /** The configured scene in progress (walking there or talking); stale once anything else takes over. */
  const activeScene = useRef(0);
  const sceneBusy = () => activeScene.current !== 0 && activeScene.current === seq.current;
  /** A found section that had to wait for a scene to finish. */
  const pending = useRef<Scene | null>(null);
  const [focusAsk, setFocusAsk] = useState(false);
  /** Ends whatever he's busy with (set below, once the activity code exists). */
  const stopRef = useRef<() => void>(() => undefined);
  /** Starts something to keep him busy; true when it did (set below too). */
  const busyRef = useRef<() => boolean>(() => false);
  /** Picked up, flying or lying on his belly: nothing else moves him or makes him talk meanwhile. */
  const physical = useRef(false);
  /** Swing while held and spin while flying, in degrees (around his head). */
  const tilt = useRef(0);
  const [explored, setExplored] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("bx-guide-pages") ?? "[]") as string[];
    } catch {
      return [];
    }
  });

  const scenes = useMemo(() => scenesFor(pathname), [pathname]);
  const path = routeKey(pathname);
  const here = useRef({ path, pathname });
  useEffect(() => {
    here.current = { path, pathname };
  }, [path, pathname]);
  /** A game on the page: the hoop (score, ends at) or hide-and-seek (started at). */
  const [game, setGame] = useState<{ kind: "hoop" | "seek"; score: number; started: number; ends: number } | null>(null);
  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  const [hoop, setHoop] = useState<{ x: number; y: number; w: number } | null>(null);
  const hoopRef = useRef(hoop);
  useEffect(() => {
    hoopRef.current = hoop;
  }, [hoop]);
  /** Hide-and-seek: where he's hiding (page coordinates), and the hint under the timer. */
  const [hideSpot, setHideSpot] = useState<{ top: number; left: number; side: "left" | "right"; size: number } | null>(null);
  const [hint, setHint] = useState<Text | null>(null);
  const [clock, setClock] = useState(0);
  const visible = !hidden && !siteMenu && !search && !keyboard && !hideSpot;

  const sfx = useCallback((s: Sound) => soundOn.current && activated() && playSound(s), []);
  /** Say a line out loud when his voice is on (and the browser lets the page speak yet). */
  const voiceLine = useCallback((text: string) => (soundOn.current && activated() ? speakAloud(text) : null), []);

  // Saved preferences.
  useEffect(() => {
    const h = storage.get("bx-guide-hidden") === "1";
    // His voice is on unless the visitor turned it off (the browser keeps it quiet until a first click).
    const snd = storage.get("bx-guide-sound") !== "0";
    soundOn.current = snd;
    returning.current = storage.get("bx-guide-visited") === "1";
    // The list of his recorded lines (small), so the first line can play the moment sound is allowed.
    void loadVoice();
    storage.set("bx-guide-visited", "1");
    mascot.set({ mode, hidden: h, sound: snd });
  }, [mode]);
  useEffect(() => {
    soundOn.current = sound;
  }, [sound]);
  // The visitor's first tap, click or key: from now on the browser lets him talk, so he says the line
  // that's on screen (unless the tap itself made him say something else).
  useEffect(() => {
    let done = false;
    const first = () => {
      if (done) return;
      done = true;
      unlock();
      const id = mascot.get().speech?.id;
      if (!soundOn.current || id === undefined) return;
      setTimeout(() => {
        const now = mascot.get().speech;
        if (soundOn.current && now && now.id === id && !speaking()) void speakAloud(now[voice]);
      }, 200);
    };
    const events = ["pointerup", "click", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, first, { capture: true, passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, first, { capture: true }));
  }, [voice]);

  // ── Position ──
  const apply = useCallback(() => {
    const el = stage.current;
    if (!el) return;
    el.style.transform = `translate3d(${Math.round(pos.current.x)}px, ${Math.round(pos.current.y)}px, 0)`;
    // Only his body swings (the bubble stays level and readable).
    el.style.setProperty("--tilt", `${tilt.current.toFixed(1)}deg`);
    mascot.patch({ box: { x: pos.current.x, y: pos.current.y, w: sizeRef.current.w, h: sizeRef.current.h } });
  }, []);

  const moveTo = useCallback(
    (to: Spot, o: { instant?: boolean } = {}) =>
      new Promise<void>((done) => {
        tween.current?.kill();
        // In the visitor's hands (or flat on the floor): he can't walk anywhere just now.
        if (physical.current) return done();
        const from = pos.current;
        const dx = to.x - from.x;
        const dist = Math.hypot(dx, to.y - from.y);
        setOnRight(to.x + sizeRef.current.w / 2 > window.innerWidth / 2);
        lastMove.current = performance.now();
        if (o.instant || reducedMotion() || dist < 6) {
          pos.current = { ...to };
          apply();
          done();
          return;
        }
        const run = dist > window.innerWidth * 0.55;
        const speed = run ? 620 : isPhoneWidth() ? 240 : 360;
        moving.current = true;
        mascot.set({ facing: Math.abs(dx) > 30 ? Math.sign(dx) : 0 });
        mascot.play(run ? "Run" : "Walk");
        tween.current = gsap.to(pos.current, {
          x: to.x,
          y: to.y,
          duration: Math.min(2.8, Math.max(0.55, dist / speed)),
          ease: "power1.inOut",
          onUpdate: apply,
          onComplete: () => {
            moving.current = false;
            mascot.set({ facing: 0 });
            mascot.play("Idle");
            done();
          },
          onInterrupt: () => {
            moving.current = false;
            done();
          },
        });
      }),
    [apply],
  );

  /** Find a clear spot (or peek from the bottom edge when there's none) and walk there. */
  const place = useCallback(
    async (o: { side?: "start" | "end"; near?: Element | null; enter?: boolean; roam?: boolean } = {}) => {
      const s = sizeRef.current;
      // roam: a stroll, so he doesn't prefer staying where he is.
      const spot = findSpot({ size: s, side: o.side, near: o.near, current: pos.current.x > -500 && !o.roam ? pos.current : null, self: stage.current });
      let to: Spot = spot;
      // Phones: he's small and always stands in full view above the tab bar (peeking behind it hid all
      // but the top of his head, so he looked stuck). Desktop: peeks when there's no clear spot.
      const tight = !isPhoneWidth() && spot.clear < 0.5;
      setPeek(tight);
      if (tight) to = { x: spot.x, y: window.innerHeight - insetBottom() - s.h * 0.5 };
      // Walk in from the nearest edge the first time (or after walking off for a page change).
      if (o.enter || pos.current.x < -500 || pos.current.x > window.innerWidth) {
        const fromRight = to.x + s.w / 2 > window.innerWidth / 2;
        pos.current = { x: fromRight ? window.innerWidth + 10 : -s.w - 10, y: to.y };
        apply();
      }
      setPlaced(true);
      await moveTo(to);
    },
    [apply, moveTo],
  );

  // ── Speech ──
  const speak = useCallback(
    async (lines: Line[], id: number) => {
      for (const line of lines) {
        if (seq.current !== id) break;
        prio.current = 2;
        mascot.say(line);
        const said = voiceLine(line[voice]);
        if (!said) sfx("pop");
        await Promise.all([sleep(line.actions?.length ? (isPhoneWidth() ? 9000 : 14000) : 2400 + line[voice].length * 45), said]);
      }
      if (seq.current === id) {
        prio.current = 0;
        mascot.say(null);
      }
    },
    [voice, sfx, voiceLine],
  );

  /** A short line on the side (hover, form tip, small talk) that never cuts off something more important. */
  const brief = useCallback<Brief>(
    (line, o) => {
      const s = mascot.get();
      if (s.hidden || s.menu || touring.current || resting.current || physical.current || gameRef.current) return false;
      if ((s.speech && prio.current > o.prio) || (sceneBusy() && o.prio < 2)) return false;
      if (o.interrupt && sceneBusy()) {
        seq.current++;
        activeScene.current = 0;
      }
      stopRef.current();
      prio.current = o.prio;
      const id = mascot.say(line);
      // Reactions are said out loud too; small talk only shows.
      if (!(o.prio >= 1 && voiceLine(line[voice]))) sfx("pop");
      if (o.look) {
        ctaTarget.current = o.look;
        mascot.set({ look: center(o.look) });
      }
      if (o.goggles) mascot.set({ goggles: true });
      if (o.clip) mascot.play(o.clip, "Idle");
      setTimeout(() => {
        if (mascot.get().speech?.id !== id) return;
        mascot.say(null);
        prio.current = 0;
        if (o.look && ctaTarget.current === o.look) ctaTarget.current = null;
        if (o.clip && !ONE_SHOT.has(o.clip) && mascot.get().clip === o.clip) mascot.play("Idle");
      }, o.ms ?? 2600 + line[voice].length * 45);
      return true;
    },
    [voice, sfx, voiceLine],
  );

  const runScene = useCallback(
    async (scene: Scene, o: { force?: boolean; actions?: SceneAction[] } = {}) => {
      stopRef.current();
      const id = ++seq.current;
      if (!scene.id.startsWith("auto-")) activeScene.current = id;
      const target = visibleTarget(scene.point);
      sceneTarget.current = target;
      const section = scene.selector === "main" ? null : document.querySelector(scene.selector);
      mascot.set({ props: scene.props ?? [], goggles: !!scene.goggles, drone: !!scene.drone, look: target ? center(target) : null });
      await place({ side: scene.side, near: target ?? section, enter: false });
      if (seq.current !== id) return;
      // Sections animate in (fade and slide); look again once they've settled.
      setTimeout(() => {
        if (seq.current === id && !moving.current && !mascot.get().menu && overlap(pos.current, sizeRef.current, stage.current) > 0.12) void place({ side: scene.side, near: target ?? section });
      }, 1200);
      const box = { ...pos.current, ...sizeRef.current };
      const c: ClipName = scene.clip === "Point" ? pointClip(box, target) : scene.clip;
      mascot.play(c, "Idle");
      let say: Line[] | undefined = scene.id === "hero" && returning.current && scene.say ? [LINES.welcomeBack, ...scene.say.slice(1)] : scene.say;
      let fresh = !!say && (o.force || firstTime(`${path}#${scene.id}`));
      if (scene.enter && !o.force) {
        // First page of the visit: say hello for the time of day. A page seen before: a wink.
        if (once("bx-guide-greeted")) {
          const g: Text = greeting(new Date().getHours());
          say = say?.length ? [{ ...say[0], ar: `${g.ar} ${say[0].ar}`, en: `${g.en} ${say[0].en}` }, ...say.slice(1)] : [g];
          // Wherever the visit starts, he offers to show them the whole site.
          if (!say.some((l) => l.actions?.some((a) => a.kind === "sitetour"))) say = [...say, { ...LINES.invite, actions: [SITE_TOUR_ACTION, NOT_NOW] }];
          fresh = true;
        } else if (!fresh && Math.random() < 0.5) {
          say = [LINES.backAgain];
          fresh = true;
        }
      }
      const lines = fresh ? say : null;
      if (lines) {
        const withActions = o.actions ? lines.map((l, i) => (i === lines.length - 1 ? { ...l, actions: [...(l.actions ?? []), ...o.actions!] } : l)) : lines;
        await speak(withActions, id);
      } else if (c === "PointLeft" || c === "PointRight") await sleep(2600);
      if (seq.current === id && (c === "PointLeft" || c === "PointRight")) mascot.play("Idle");
      if (seq.current !== id) return;
      activeScene.current = 0;
      // A section that came into view meanwhile gets its turn now, if it's still on screen.
      const next = pending.current;
      pending.current = null;
      const el = next && document.querySelector(next.selector);
      if (next && el && next !== scene) {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.7 && r.bottom > window.innerHeight * 0.3) setTimeout(() => seq.current === id && void runSceneRef.current?.(next), 600);
      }
    },
    [place, speak, path],
  );
  const runSceneRef = useRef<typeof runScene | null>(null);
  useEffect(() => {
    runSceneRef.current = runScene;
  });

  const onScene = useCallback(
    (scene: Scene) => {
      if (touring.current || physical.current || gameRef.current || mascot.get().menu || mascot.get().hidden) return;
      // Sections found on the page wait for a configured scene to finish.
      if (scene.id.startsWith("auto-") && sceneBusy()) {
        pending.current = scene;
        return;
      }
      void runScene(scene);
    },
    [runScene],
  );
  const discover = useCallback((configured: Scene[]) => discoverSections(configured), []);

  // ── Moments ──
  const celebrate = useCallback(
    (from?: { x: number; y: number }) => {
      const id = ++seq.current;
      mascot.play("Celebrate", "Happy");
      mascot.say(LINES.joined);
      sfx("tada");
      const b = mascot.get().box;
      confetti(from ?? { x: b.x + b.w / 2, y: b.y + b.h * 0.3 });
      setTimeout(() => {
        if (seq.current !== id) return;
        mascot.say(null);
        mascot.play("Idle");
      }, 3200);
    },
    [sfx],
  );

  /**
   * One line on a tour, said out loud when his voice is on, with Next / End tour under it. It moves on
   * by itself once it has been said (or had time to be read); Next skips ahead. While the visitor is
   * holding him (or he's picking himself up after a throw) the tour waits.
   */
  const tourLine = useCallback(
    async (line: Text, actions: SceneAction[]) => {
      prio.current = 2;
      mascot.say({ ...line, actions });
      const said = voiceLine(line[voice]);
      let skipped = false;
      const skip = new Promise<void>(
        (r) =>
          (nextStep.current = () => {
            skipped = true;
            r();
          }),
      );
      await Promise.race([Promise.all([sleep(2200 + line[voice].length * 50), said]), skip]);
      nextStep.current = null;
      if (skipped) hush();
      while (physical.current && touring.current) await sleep(250);
      return skipped;
    },
    [voice, voiceLine],
  );

  /**
   * On a tour: scroll the page down section by section (at most `max`), walk up to each one, point at
   * it and explain it in his own (scripted) words. Returns false when the visitor ended the tour.
   */
  const walkSections = useCallback(
    async (max: number, actions: SceneAction[]) => {
      if (max <= 0) return touring.current;
      const configured = scenesFor(here.current.pathname);
      const top = (sel: string) => (document.querySelector(sel)?.getBoundingClientRect().top ?? 0) + window.scrollY;
      const steps = [...configured, ...discoverSections(configured)]
        .filter((sc) => sc.selector !== "main" && sc.id !== "hero" && (sc.tour ?? sc.say)?.length && document.querySelector(sc.selector))
        .sort((a, b) => top(a.selector) - top(b.selector))
        .slice(0, max);
      for (const step of steps) {
        if (!touring.current) return false;
        if (!scrollToSection(step.selector)) continue;
        await sleep(reducedMotion() ? 250 : 1300);
        while (physical.current && touring.current) await sleep(250);
        if (!touring.current) return false;
        const id = ++seq.current;
        const section = document.querySelector(step.selector);
        const target = visibleTarget(step.point) ?? section?.querySelector("h2, h3") ?? section;
        sceneTarget.current = target;
        mascot.set({ props: step.props ?? [], goggles: !!step.goggles, drone: !!step.drone, look: target ? center(target) : null });
        await place({ side: step.side, near: target });
        if (!touring.current) return false;
        if (seq.current !== id) continue;
        const c: ClipName = step.clip === "Point" ? pointClip({ ...pos.current, ...sizeRef.current }, target) : step.clip;
        mascot.play(c, "Idle");
        for (const line of step.tour ?? step.say ?? []) {
          await tourLine(line, actions);
          if (!touring.current) return false;
        }
        if (c === "PointLeft" || c === "PointRight") mascot.play("Idle");
      }
      return touring.current;
    },
    [place, tourLine],
  );

  /** "Tour this page" from his menu: down the page, section by section. */
  const tour = useCallback(async () => {
    if (touring.current) return;
    touring.current = true;
    const done = await walkSections(14, [
      { kind: "next", label: LINES.next },
      { kind: "stop", label: LINES.stop },
    ]);
    touring.current = false;
    nextStep.current = null;
    sceneTarget.current = null;
    if (done) {
      const id = ++seq.current;
      mascot.set({ props: [], goggles: false, drone: false });
      mascot.play("Wave", "Idle");
      await speak([LINES.tourDone], id);
    }
  }, [walkSections, speak]);

  /**
   * The site tour: page by page through SITE_TOUR. On each page he says what it's for, then scrolls
   * down it explaining its sections, and walks on to the next page by himself (Next skips ahead,
   * End tour stops).
   */
  const siteTour = useCallback(async () => {
    if (touring.current) return;
    touring.current = true;
    storage.set("bx-guide-toured", "1");
    activeScene.current = 0;
    pending.current = null;
    mascot.set({ menu: false });
    let id = ++seq.current;
    mascot.play("Happy", "Idle");
    await speak([LINES.tourStart], id);
    const arrived = async (p: string) => {
      for (let i = 0; i < 120 && touring.current; i++) {
        if (here.current.path === p) return true;
        await sleep(100);
      }
      return here.current.path === p;
    };
    const acts: SceneAction[] = [
      { kind: "next", label: LINES.next },
      { kind: "stop", label: LINES.stop },
    ];
    for (let i = 0; i < SITE_TOUR.length && touring.current; i++) {
      const stop = SITE_TOUR[i];
      tourPath.current = stop.href;
      if (here.current.path !== stop.href) {
        // Walk off, change page, walk back in.
        seq.current++;
        mascot.say(null);
        const s = sizeRef.current;
        if (!reducedMotion() && !physical.current) void moveTo({ x: pos.current.x + s.w / 2 > window.innerWidth / 2 ? window.innerWidth + 20 : -s.w - 20, y: pos.current.y });
        goTo({ href: stop.href }, { locale, pathname: here.current.pathname, router });
        if (!(await arrived(stop.href))) break;
        await sleep(reducedMotion() ? 300 : 800);
      }
      if (!touring.current) break;
      if (!(stop.section && scrollToSection(stop.section))) window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
      await sleep(reducedMotion() ? 200 : 700);
      while (physical.current && touring.current) await sleep(250);
      if (!touring.current) break;
      id = ++seq.current;
      const target = (stop.point && visibleTarget(stop.point)) || document.querySelector("main h1");
      sceneTarget.current = target;
      mascot.set({ props: stop.props ?? [], goggles: !!stop.goggles, drone: false, look: target ? center(target) : null });
      await place({ near: target });
      if (!touring.current) break;
      const c: ClipName = stop.clip === "Point" ? pointClip({ ...pos.current, ...sizeRef.current }, target) : (stop.clip ?? "Idle");
      mascot.play(c, "Idle");
      for (const line of stop.say) {
        await tourLine(line, acts);
        if (!touring.current) break;
      }
      if (c === "PointLeft" || c === "PointRight") mascot.play("Idle");
      // Then down the page, section by section.
      if (touring.current && !(await walkSections(stop.sections ?? 3, acts))) break;
    }
    const finished = touring.current;
    touring.current = false;
    tourPath.current = null;
    nextStep.current = null;
    sceneTarget.current = null;
    if (finished) {
      id = ++seq.current;
      mascot.set({ props: [], goggles: false, drone: false });
      mascot.play("Celebrate", "Happy");
      sfx("tada");
      play.award("tourist");
      await speak([{ ...LINES.tourEnd, actions: [{ kind: "menu", label: LINES.askMe }] }], id);
      if (seq.current === id) mascot.play("Idle");
    }
  }, [speak, moveTo, place, locale, router, sfx, tourLine, walkSections]);

  /** Ends whichever tour is on. */
  const endTour = useCallback(() => {
    touring.current = false;
    tourPath.current = null;
    nextStep.current?.();
  }, []);

  const go = useCallback(
    (target: { href: string; section?: string }) => {
      mascot.set({ menu: false });
      sfx("click");
      goTo(target, { locale, pathname, router });
    },
    [locale, pathname, router, sfx],
  );

  const openMenu = useCallback((ask: boolean) => {
    seq.current++;
    mascot.say(null);
    hush();
    setFocusAsk(ask);
    mascot.set({ menu: true });
    mascot.play("Listening");
  }, []);

  /** The menu's quick actions and the answers that come with one. */
  const doAction = useCallback(
    (a: GuideAction) => {
      sfx("click");
      mascot.set({ menu: false });
      hush();
      if (a === "tour") void siteTour();
      else if (a === "pagetour") void tour();
      else if (a === "search") ui.set({ search: true, menu: false });
      else if (a === "lang") document.querySelector<HTMLAnchorElement>("header a[hreflang]")?.click();
      else window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
    },
    [sfx, siteTour, tour],
  );

  /** An answer in the chat: he reacts to it (and says it, when his voice is on, from the chat itself). */
  const onReply = useCallback((r: BrainReply) => {
    mascot.play(r.action || r.href ? "Happy" : r.topic ? "Think" : "Listening", "Listening");
  }, []);
  const onSpeak = useCallback((text: string) => void speakAloud(text), []);

  /** "On this page": scroll to the section and talk about it. */
  const onToc = useCallback(
    (selector: string) => {
      mascot.set({ menu: false });
      sfx("click");
      const el = document.querySelector(selector);
      if (!el) return;
      scrollToSection(selector);
      const scene = [...scenes, ...discoverSections(scenes)].find((s) => {
        const target = s.selector === "main" ? null : document.querySelector(s.selector);
        return target && (target === el || el.contains(target) || target.contains(el));
      });
      if (scene) setTimeout(() => void runScene(scene, { force: true }), reducedMotion() ? 200 : 1200);
    },
    [scenes, runScene, sfx],
  );

  const onAction = useCallback(
    (a: SceneAction) => {
      sfx("click");
      if (a.kind === "menu") openMenu(true);
      else if (a.kind === "tour") void tour();
      else if (a.kind === "sitetour") void siteTour();
      else if (a.kind === "next") nextStep.current?.();
      else if (a.kind === "stop") {
        endTour();
        seq.current++;
        mascot.say(null);
        hush();
      } else if (a.kind === "dismiss") {
        seq.current++;
        mascot.say(null);
        hush();
        mascot.play("Idle");
      } else if (a.kind === "go") {
        if (a.celebrate) celebrate();
        go({ href: a.href, section: a.section });
      }
    },
    [tour, siteTour, endTour, celebrate, go, sfx, openMenu],
  );

  // ── Page changes: clear the old page's scene; the new page's scenes walk it in. ──
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    // The site tour changes pages itself; it carries on (unless the visitor went somewhere else).
    if (tourPath.current === routeKey(pathname)) return;
    seq.current++;
    if (touring.current) endTour();
    hush();
    sceneTarget.current = null;
    mascot.set({ menu: false, speech: null, props: [], goggles: false, drone: false, look: null });
  }, [pathname, endTour]);
  // After the reset above (effects run in order), so the new page's first scene isn't cancelled.
  useScrollScenes(scenes, onScene, pathname, !hidden, discover);
  useMascotReactions({ brief, busy: () => moving.current || touring.current || physical.current || !!resting.current || mascot.get().menu || mascot.get().hidden }, pathname, !hidden && placed);

  // ── Exploring: count the site's pages he's seen; celebrate when it's all of them. ──
  useEffect(() => {
    const page = PAGES.find((p) => p.href === path);
    if (!page) return;
    setExplored((list) => {
      if (list.includes(page.id)) return list;
      const next = [...list, page.id];
      storage.set("bx-guide-pages", JSON.stringify(next));
      if (next.length >= PAGES.length && storage.get("bx-guide-explored") !== "1") {
        storage.set("bx-guide-explored", "1");
        play.award("explorer");
        setTimeout(() => {
          const id = ++seq.current;
          mascot.play("Celebrate", "Happy");
          sfx("tada");
          const b = mascot.get().box;
          confetti({ x: b.x + b.w / 2, y: b.y + b.h * 0.3 });
          void speak([LINES.explored], id).then(() => seq.current === id && mascot.play("Idle"));
        }, 6000);
      }
      return next;
    });
  }, [path, sfx, speak]);

  // Walk off when following a link to another page (navigation isn't held up).
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith(`${BASE_PATH}/app`)) return;
      const join = /\/join\/?$/.test(url.pathname);
      if (join && !stage.current?.contains(a)) {
        const r = a.getBoundingClientRect();
        celebrate({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        return;
      }
      if (url.pathname === location.pathname || reducedMotion() || mascot.get().hidden) return;
      const s = sizeRef.current;
      const right = pos.current.x + s.w / 2 > window.innerWidth / 2;
      sfx("whoosh");
      void moveTo({ x: right ? window.innerWidth + 20 : -s.w - 20, y: pos.current.y });
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [celebrate, moveTo, sfx]);

  // ── Looking around: at big buttons under the cursor, the scene's target, or the cursor itself. ──
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    let raf = 0;
    let last = { x: 0, y: 0, t: 0 };
    let speed = 0;
    let fastSince = 0;
    let lastFast = 0;
    let lastNotice = 0;
    // The cursor (or finger) holds his attention for a few seconds after it last moved; then he
    // looks back at you.
    let lastPoint = 0;
    let idle = 0;
    const lookNow = () => {
      raf = 0;
      if (mascot.get().eyesClosed) return;
      const t = ctaTarget.current ?? sceneTarget.current;
      if (t && t.isConnected) {
        const r = t.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) return mascot.set({ look: center(t) });
      }
      const c = cursor.current;
      mascot.set({ look: c && performance.now() - lastPoint < (fine ? 6000 : 1800) ? c : null });
    };
    const queue = () => !raf && (raf = requestAnimationFrame(lookNow));
    const point = (x: number, y: number) => {
      cursor.current = { x, y };
      lastPoint = performance.now();
      clearTimeout(idle);
      idle = window.setTimeout(queue, fine ? 6100 : 1900);
      queue();
    };
    // Fingers: he watches where you touch and drag (but not his own body: that's being picked up).
    const touch = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || stage.current?.contains(e.target as Node)) return;
      point(e.clientX, e.clientY);
    };
    const leave = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.relatedTarget) return;
      cursor.current = null;
      queue();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return touch(e);
      if (!fine) return;
      const now = performance.now();
      const dt = Math.max(8, now - last.t);
      speed = speed * 0.75 + (Math.hypot(e.clientX - last.x, e.clientY - last.y) / dt) * 1000 * 0.25;
      last = { x: e.clientX, y: e.clientY, t: now };
      point(e.clientX, e.clientY);
      const s = mascot.get();
      if (!s.box.w || s.menu || s.speech || moving.current || touring.current || resting.current || physical.current) return;
      const b = s.box;
      // Notices a cursor that comes close.
      const near = Math.hypot(e.clientX - (b.x + b.w / 2), e.clientY - (b.y + b.h * 0.5)) < b.h * 0.75;
      if (near && now - lastNotice > 25000 && s.clip === "Idle") {
        lastNotice = now;
        mascot.play("Wave", "Idle");
      }
      // Fast hands: a hop, a line, and it follows to the cursor's side.
      if (speed > 3400) {
        if (!fastSince) fastSince = now;
        else if (now - fastSince > 220 && now - lastFast > 30000) {
          lastFast = now;
          fastSince = 0;
          const id = ++seq.current;
          mascot.play("Jump", "Idle");
          void speak([LINES.zoom], id);
          const cursorRight = e.clientX > window.innerWidth / 2;
          if (cursorRight !== b.x + b.w / 2 > window.innerWidth / 2) setTimeout(() => seq.current === id && void place({ side: cursorRight === (document.documentElement.dir !== "rtl") ? "end" : "start" }), 700);
        }
      } else fastSince = 0;
    };
    const over = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(CTA);
      if (!el || stage.current?.contains(el)) return;
      ctaTarget.current = el;
      queue();
    };
    const out = (e: PointerEvent) => {
      if (ctaTarget.current && !ctaTarget.current.contains(e.relatedTarget as Node | null)) {
        ctaTarget.current = null;
        queue();
      }
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerdown", touch, { passive: true });
    document.addEventListener("pointerover", over, { passive: true });
    document.addEventListener("pointerout", out, { passive: true });
    document.addEventListener("pointerout", leave, { passive: true });
    window.addEventListener("scroll", queue, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(idle);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerdown", touch);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      window.removeEventListener("scroll", queue);
    };
  }, [place, speak]);

  // ── After scrolling stops, step aside if content slid under it. ──
  useEffect(() => {
    let timer = 0;
    const settle = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const s = mascot.get();
        if (moving.current || touring.current || physical.current || s.menu || s.hidden || !placed) return;
        if (performance.now() - lastMove.current < 2500) return;
        if (overlap(pos.current, sizeRef.current, stage.current) > 0.12 || peek) void place({ side: onRight === (document.documentElement.dir !== "rtl") ? "end" : "start" });
      }, 500);
    };
    window.addEventListener("scroll", settle, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", settle);
    };
  }, [place, placed, peek, onRight]);

  // ── Left alone: sits down after 25 s, sleeps after a minute; wakes up on any activity. ──
  useEffect(() => {
    let sit = 0;
    let doze = 0;
    const arm = () => {
      clearTimeout(sit);
      clearTimeout(doze);
      sit = window.setTimeout(() => {
        const s = mascot.get();
        if (s.menu || s.speech || moving.current || touring.current || physical.current || activity.current) return arm();
        // Half the time he finds something to do instead (push-ups, a book…), then sits later.
        if (Math.random() < 0.5 && busyRef.current()) return arm();
        resting.current = "Sit";
        mascot.play("Sit");
      }, 25000);
      doze = window.setTimeout(() => {
        if (resting.current !== "Sit") return;
        resting.current = "Sleep";
        mascot.play("Sleep");
        const id = ++seq.current;
        void speak([LINES.sleepy], id);
      }, 60000);
    };
    const wake = () => {
      const was = resting.current;
      if (was) {
        resting.current = "";
        seq.current++;
        mascot.play("Jump", "Idle");
        if (was === "Sleep") void speak([LINES.awake], seq.current);
        else mascot.say(null);
      }
      arm();
    };
    let lastWake = 0;
    const onInput = () => {
      const now = performance.now();
      if (now - lastWake < 400 && !resting.current) return;
      lastWake = now;
      wake();
    };
    arm();
    const events = ["pointermove", "pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    return () => {
      clearTimeout(sit);
      clearTimeout(doze);
      events.forEach((e) => window.removeEventListener(e, onInput));
    };
  }, [speak]);

  // ── Wardrobe: dressed for the visitor's time, day, season and occasion (checked every 5 minutes). ──
  const baseOutfit = useRef<ReturnType<typeof wardrobe>["outfit"]>([]);
  const activity = useRef<{ def: Activity; id: number; timer: number } | null>(null);
  const dress = useCallback(() => {
    const extra = activity.current?.def.hold ? [activity.current.def.hold] : [];
    mascot.set({ outfit: [...baseOutfit.current, ...extra] });
  }, []);
  useEffect(() => {
    const update = () => {
      baseOutfit.current = wardrobe().outfit;
      dress();
    };
    update();
    const t = window.setInterval(update, 5 * 60_000);
    return () => clearInterval(t);
  }, [dress]);
  // Once a visit he mentions it ("Ramadan Kareem 🌙", "it's cold, scarf on 🧣"…).
  useEffect(() => {
    if (!placed) return;
    const { occasion } = wardrobe();
    if (!occasion) return;
    // Tries every few seconds until the bubble is free (the tour invite waits for an answer first).
    let t = 0;
    const attempt = () => {
      try {
        if (sessionStorage.getItem("bx-guide-occasion")) return;
      } catch {}
      if (brief(OCCASION_LINES[occasion], { prio: 1, clip: "Happy", ms: 5200 })) once("bx-guide-occasion");
      else t = window.setTimeout(attempt, 3000);
    };
    t = window.setTimeout(attempt, 6500);
    return () => clearTimeout(t);
  }, [placed, brief]);

  // ── Keeping busy: push-ups, stretching, reading, coding, his tea… for a few seconds at a time. ──
  const stopActivity = useCallback(() => {
    const a = activity.current;
    if (!a) return;
    clearTimeout(a.timer);
    activity.current = null;
    setDoing(null);
    dress();
    if (seq.current === a.id) {
      mascot.set({ props: [], facing: 0 });
      mascot.play("Idle");
    }
  }, [dress]);
  useEffect(() => {
    stopRef.current = stopActivity;
  }, [stopActivity]);
  const startActivity = useCallback(
    (def: Activity) => {
      const id = ++seq.current;
      activity.current = { def, id, timer: window.setTimeout(() => activity.current?.id === id && stopActivity(), def.clip === "PushUp" ? 9600 : 11000) };
      setDoing(def.id);
      dress();
      mascot.set({ props: def.props ?? [], facing: def.side ? (pos.current.x + sizeRef.current.w / 2 > window.innerWidth / 2 ? -1 : 1) : 0, look: null });
      mascot.play(def.clip);
    },
    [dress, stopActivity],
  );
  /** Picks something to do for the hour (his tea counts double in the morning). */
  const keepBusy = useCallback(() => {
    const s = mascot.get();
    if (activity.current || s.eyesClosed || s.hidden || s.menu || s.speech || physical.current || gameRef.current) return false;
    const h = new Date().getHours();
    startActivity(pick([...ACTIVITIES.filter((a) => !a.when || a.when(h)), ...(s.outfit.includes("TeaCup") ? [TEA, TEA] : [])]));
    return true;
  }, [startActivity]);
  useEffect(() => {
    busyRef.current = keepBusy;
  }, [keepBusy]);

  // ── Strolling: when nothing's going on he doesn't stand frozen. Every so often he walks to another
  // clear spot (the other side, or along the bottom on phones) or does a little something.
  useEffect(() => {
    if (!placed) return;
    let n = 0;
    const tick = () => {
      const s = mascot.get();
      if (s.hidden || s.menu || s.speech || moving.current || touring.current || physical.current || gameRef.current || resting.current || document.hidden) return;
      if (activity.current || performance.now() - lastMove.current < 12000) return;
      n++;
      if (n % 3 === 2 && keepBusy()) return;
      if (n % 3 === 1 && !reducedMotion()) {
        const right = pos.current.x + sizeRef.current.w / 2 > window.innerWidth / 2;
        const side = right === (document.documentElement.dir !== "rtl") ? "start" : "end";
        void place({ side: Math.random() < 0.7 ? side : undefined, roam: true });
      } else mascot.play(pick(["LookAround", "Wave", "Jump", "LookAround"] as const), "Idle");
    };
    const t = window.setInterval(tick, isPhoneWidth() ? 14000 : 20000);
    return () => clearInterval(t);
  }, [placed, place, keepBusy]);

  // ── Phones: step out of the way while typing (the keyboard covers half the screen). ──
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && t.matches("input, textarea, select, [contenteditable]") && !stage.current?.contains(t) && !t.closest("[data-mascot-menu]");
    const focusIn = (e: FocusEvent) => isPhoneWidth() && isField(e.target) && setKeyboard(true);
    const focusOut = (e: FocusEvent) => isField(e.target) && setKeyboard(false);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    return () => {
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
    };
  }, []);

  // ── Resize: new size and a fresh spot. ──
  useEffect(() => {
    let timer = 0;
    const resize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const s = stageSize(window.innerWidth, window.innerHeight);
        sizeRef.current = s;
        setSize(s);
        setPhone(isPhoneWidth());
        if (placed) void place();
      }, 250);
    };
    window.addEventListener("resize", resize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", resize);
    };
  }, [place, placed]);

  // The site's own menu or search takes over the screen: close the guide.
  useEffect(() => {
    if (siteMenu || search) mascot.set({ menu: false });
  }, [siteMenu, search]);

  // ── Picking him up and throwing him (mouse or finger). ──
  const drag = useRef<{ id: number; dx: number; dy: number; sx: number; sy: number; moved: boolean; samples: { x: number; y: number; t: number }[]; turns: number; dir: number; dizzy: boolean } | null>(null);
  const noClickUntil = useRef(0);
  const throwGen = useRef(0);
  const throws = useRef(0);
  const flight = useRef(0);
  const heldTimer = useRef(0);

  /** A quick line while he's being handled (said out loud too). */
  const quip = useCallback(
    (line: Text, ms?: number) => {
      prio.current = 1;
      const sid = mascot.say(line);
      if (!voiceLine(line[voice])) sfx("pop");
      setTimeout(
        () => {
          if (mascot.get().speech?.id !== sid) return;
          mascot.say(null);
          prio.current = 0;
        },
        ms ?? 1800 + line[voice].length * 45,
      );
    },
    [voice, voiceLine, sfx],
  );

  /** Speed of the pointer over the last ~0.1 s, in px/s. */
  const velocity = (samples: { x: number; y: number; t: number }[]) => {
    const a = samples[0];
    const b = samples[samples.length - 1];
    const dt = (b.t - a.t) / 1000;
    return dt > 0.008 ? { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt } : { x: 0, y: 0 };
  };

  const grab = useCallback(() => {
    stopRef.current();
    const gen = ++throwGen.current;
    physical.current = true;
    seq.current++;
    activeScene.current = 0;
    tween.current?.kill();
    moving.current = false;
    cancelAnimationFrame(flight.current);
    resting.current = "";
    hush();
    setPeek(false);
    document.body.style.userSelect = "none";
    mascot.set({ held: true, flop: 0, facing: 0, menu: false, props: [], drone: false, mood: "surprised" });
    mascot.play("Jump", "LookDown");
    sfx("boing");
    quip(pick(PHYSICS.grab));
    clearTimeout(heldTimer.current);
    heldTimer.current = window.setTimeout(() => throwGen.current === gen && mascot.get().held && quip(pick(PHYSICS.held)), 4500);
  }, [quip, sfx]);

  /** Back on his feet: off to a clear spot, and the guide carries on. */
  const standUp = useCallback(
    (gen: number, line: Text) => {
      if (throwGen.current !== gen) return;
      mascot.set({ flop: 0, mood: "neutral" });
      mascot.play("Jump", "Idle");
      sfx("boing");
      setTimeout(() => {
        if (throwGen.current !== gen) return;
        physical.current = false;
        quip(line);
        setTimeout(() => throwGen.current === gen && !physical.current && overlap(pos.current, sizeRef.current, stage.current) > 0.12 && void place(), 1600);
      }, 650);
    },
    [place, quip, sfx],
  );

  /** Let go: he flies with the hand's speed, bounces off the edges and lands at the bottom. */
  const release = useCallback(
    (v: { x: number; y: number }) => {
      clearTimeout(heldTimer.current);
      document.body.style.userSelect = "";
      mascot.set({ held: false });
      const gen = throwGen.current;
      const s = sizeRef.current;
      const floor = window.innerHeight - insetBottom() - s.h;
      const fromY = pos.current.y;
      const thrown = Math.hypot(v.x, v.y) > 900;
      let vx = clamp(v.x, -4200, 4200);
      let vy = clamp(v.y, -4200, 4200);
      let hitWall = false;
      let last = performance.now();
      const minX = -s.w * BODY.x * 0.6;
      const maxX = window.innerWidth - s.w + s.w * BODY.x * 0.6;
      const land = () => {
        tilt.current = 0;
        if (gameRef.current?.kind === "hoop" || performance.now() - hoopEnded.current < 4000) {
          // In the hoop game (or the shot that was flying when it ended): straight back on his feet.
          pos.current.y = floor;
          apply();
          setOnRight(pos.current.x + s.w / 2 > window.innerWidth / 2);
          mascot.play("Jump", "Idle");
          physical.current = false;
          return;
        }
        pos.current.y = floor;
        apply();
        setOnRight(pos.current.x + s.w / 2 > window.innerWidth / 2);
        const fell = floor - fromY > window.innerHeight * 0.3;
        if (thrown || fell) {
          // Splat: flat on his belly, a complaint, then up again.
          throws.current++;
          if (play.update((p) => ({ throws: p.throws + 1 })).throws >= 5) play.award("thrower");
          const side = Math.abs(vx) > 60 ? Math.sign(vx) : pos.current.x + s.w / 2 > window.innerWidth / 2 ? 1 : -1;
          mascot.set({ flop: side, facing: 0, look: null, mood: "sad" });
          mascot.play("Idle");
          sfx("thud");
          quip(throws.current % 3 === 0 ? pick(PHYSICS.again) : pick(PHYSICS.flop), 2600);
          setTimeout(() => standUp(gen, pick(PHYSICS.up)), 2700);
        } else {
          mascot.play("Jump", "Idle");
          mascot.set({ mood: "happy" });
          setTimeout(() => mascot.get().mood === "happy" && mascot.set({ mood: "neutral" }), 2500);
          physical.current = false;
          quip(pick(PHYSICS.gentle));
        }
      };
      const step = (now: number) => {
        if (throwGen.current !== gen) return;
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        vy += 2600 * dt;
        const prevY = pos.current.y;
        pos.current.x += vx * dt;
        pos.current.y += vy * dt;
        // Through the hoop: his middle crosses the rim going down, inside its width.
        const h = hoopRef.current;
        if (h && vy > 0 && gameRef.current?.kind === "hoop") {
          const mid = s.h * 0.5;
          const cx = pos.current.x + s.w / 2;
          if (prevY + mid < h.y && pos.current.y + mid >= h.y && Math.abs(cx - h.x) < h.w * 0.5) scoredRef.current?.();
        }
        if (pos.current.x < minX || pos.current.x > maxX) {
          pos.current.x = clamp(pos.current.x, minX, maxX);
          if (Math.abs(vx) > 700 && !hitWall) {
            hitWall = true;
            sfx("thud");
            quip(pick(PHYSICS.wall), 1300);
          }
          vx = -vx * 0.45;
        }
        if (pos.current.y < -s.h * 0.4) {
          pos.current.y = -s.h * 0.4;
          vy = Math.abs(vy) * 0.3;
        }
        tilt.current = clamp(tilt.current * 0.9 + vx * 0.004, -45, 45);
        if (pos.current.y >= floor) return land();
        apply();
        flight.current = requestAnimationFrame(step);
      };
      if (reducedMotion()) {
        pos.current.y = Math.min(pos.current.y, floor);
        return land();
      }
      flight.current = requestAnimationFrame(step);
    },
    [apply, quip, sfx, standUp],
  );

  const onGrab = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !e.isPrimary || mascot.get().hidden) return;
    drag.current = { id: e.pointerId, dx: e.clientX - pos.current.x, dy: e.clientY - pos.current.y, sx: e.clientX, sy: e.clientY, moved: false, samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }], turns: 0, dir: 0, dizzy: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };
  const onDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) return;
      d.moved = true;
      grab();
    }
    const now = performance.now();
    d.samples = [...d.samples.filter((p) => now - p.t < 110), { x: e.clientX, y: e.clientY, t: now }];
    const v = velocity(d.samples);
    // Shaken hard from side to side: he gets dizzy.
    const dir = Math.abs(v.x) > 1500 ? Math.sign(v.x) : 0;
    if (dir && dir !== d.dir) {
      if (d.dir) d.turns++;
      d.dir = dir;
      if (d.turns >= 5 && !d.dizzy) {
        d.dizzy = true;
        quip(pick(PHYSICS.shaken));
      }
    }
    pos.current = { x: e.clientX - d.dx, y: e.clientY - d.dy };
    // Dangles from where he's held, swinging against the movement.
    tilt.current = clamp(-v.x * 0.012, -38, 38);
    apply();
  };
  const onDrop = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    noClickUntil.current = performance.now() + 400;
    const now = performance.now();
    const recent = d.samples.filter((p) => now - p.t < 110);
    release(e.type === "pointercancel" || recent.length < 2 ? { x: 0, y: 0 } : velocity(recent));
  };
  useEffect(
    () => () => {
      cancelAnimationFrame(flight.current);
      clearTimeout(heldTimer.current);
      document.body.style.userSelect = "";
    },
    [],
  );

  // ── Games (menu → Play) ──
  const fill = (x: Text, v: string | number): Text => ({ ar: x.ar.replace(/\{[np]\}/, String(v)), en: x.en.replace(/\{[np]\}/, String(v)) });

  const placeHoop = useCallback(() => {
    const s = sizeRef.current;
    const w = Math.round(s.w * 1.15);
    const vw = window.innerWidth;
    const right = pos.current.x + s.w / 2 > vw / 2;
    const x = clamp(vw * (right ? 0.14 + Math.random() * 0.28 : 0.58 + Math.random() * 0.28), w / 2 + 8, vw - w / 2 - 8);
    const y = window.innerHeight * (0.3 + Math.random() * 0.2);
    setHoop({ x, y, w });
  }, []);

  const scoredRef = useRef<(() => void) | null>(null);
  const hoopEnded = useRef(-Infinity);
  scoredRef.current = () => {
    const h = hoopRef.current;
    const g = gameRef.current;
    if (!h || !g) return;
    hoopRef.current = null;
    setGame({ ...g, score: g.score + 1 });
    gameRef.current = { ...g, score: g.score + 1 };
    sfx("tada");
    confetti({ x: h.x, y: h.y }, 60);
    quip(pick(GAME.goal), 1600);
    setTimeout(() => gameRef.current?.kind === "hoop" && placeHoop(), 700);
  };

  const endGame = useCallback(
    (how: "time" | "stop") => {
      const g = gameRef.current;
      if (!g) return;
      setGame(null);
      gameRef.current = null;
      setHoop(null);
      setHint(null);
      if (g.kind === "hoop") hoopEnded.current = performance.now();
      if (g.kind === "hoop" && how === "time") {
        const best = play.get().hoopBest;
        play.update((p) => ({ hoopBest: Math.max(p.hoopBest, g.score) }));
        if (g.score >= 5) play.award("hooper");
        mascot.play(g.score ? "Celebrate" : "Wave", "Idle");
        quip(g.score > best && g.score > 0 ? fill(GAME.hoopBest, g.score) : fill(GAME.hoopEnd, g.score), 3600);
      }
    },
    [quip],
  );

  const startHoop = useCallback(() => {
    seq.current++;
    touring.current = false;
    nextStep.current?.();
    mascot.set({ menu: false, props: [], goggles: false, drone: false });
    const now = Date.now();
    const g = { kind: "hoop" as const, score: 0, started: now, ends: now + 45_000 };
    setGame(g);
    gameRef.current = g;
    placeHoop();
    mascot.play("Happy", "Idle");
    quip(GAME.hoopStart, 3200);
  }, [placeHoop, quip]);

  /** Hide-and-seek: he walks off and hides at the edge of a section somewhere else on the page. */
  const startSeek = useCallback(async () => {
    const id = ++seq.current;
    touring.current = false;
    nextStep.current?.();
    mascot.set({ menu: false, props: [], goggles: false, drone: false });
    mascot.play("Happy", "Idle");
    quip(GAME.seekStart, 1800);
    await sleep(1600);
    if (seq.current !== id) return;
    const s = sizeRef.current;
    await moveTo({ x: pos.current.x + s.w / 2 > window.innerWidth / 2 ? window.innerWidth + 20 : -s.w - 20, y: pos.current.y });
    if (seq.current !== id) return;
    const vh = window.innerHeight;
    const sections = [...document.querySelectorAll<HTMLElement>("main section, main > div > section, footer")].filter((el) => el.getBoundingClientRect().height > 160);
    const away = sections.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom < 0 || r.top > vh;
    });
    const pool = away.length ? away : sections;
    const el = pool[Math.floor(Math.random() * pool.length)];
    const r = el?.getBoundingClientRect();
    const size = isPhoneWidth() ? 64 : 84;
    const docH = document.documentElement.scrollHeight;
    const top = r ? clamp(r.top + window.scrollY + 40 + Math.random() * Math.max(10, r.height - size - 80), 80, docH - size - 10) : Math.max(80, docH * Math.random() - size);
    const side = Math.random() < 0.5 ? "left" : "right";
    const now = Date.now();
    const g = { kind: "seek" as const, score: 0, started: now, ends: 0 };
    setGame(g);
    gameRef.current = g;
    setHint(GAME.seekHud);
    setHideSpot({ top, left: side === "left" ? 0 : document.documentElement.clientWidth - size, side, size });
  }, [moveTo, quip]);

  const foundHim = useCallback(
    (gaveUp = false) => {
      const g = gameRef.current;
      const spot = hideSpot;
      if (!g || g.kind !== "seek" || !spot) return;
      const secs = Math.max(1, Math.round((Date.now() - g.started) / 1000));
      endGame("stop");
      setHideSpot(null);
      // Pops out right where he was hiding.
      const s = sizeRef.current;
      const y = spot.top - window.scrollY;
      pos.current = { x: clamp(spot.side === "left" ? 0 : window.innerWidth - s.w, 0, window.innerWidth - s.w), y: clamp(y - s.h * 0.4, 0, window.innerHeight - s.h) };
      apply();
      setOnRight(spot.side === "right");
      if (gaveUp) {
        mascot.play("Wave", "Idle");
        quip(GAME.gaveUp, 3200);
      } else {
        mascot.play("Celebrate", "Happy");
        sfx("tada");
        confetti({ x: pos.current.x + s.w / 2, y: pos.current.y + s.h * 0.3 });
        const best = play.get().seekBest;
        play.update((p) => ({ seekBest: p.seekBest ? Math.min(p.seekBest, secs) : secs }));
        play.award("seeker");
        if (secs < 15) play.award("quick");
        quip(best && secs < best ? fill(GAME.hoopBest, `${secs}s`) : fill(GAME.found, secs), 3600);
      }
      setTimeout(() => !gameRef.current && !physical.current && overlap(pos.current, sizeRef.current, stage.current) > 0.12 && void place(), 3800);
    },
    [hideSpot, endGame, apply, quip, sfx, place],
  );

  const seekHint = useCallback(() => {
    const el = document.querySelector("[data-mascot-hiding]");
    if (!el) return;
    const r = el.getBoundingClientRect();
    setHint(r.bottom < 0 ? GAME.up : r.top > window.innerHeight ? GAME.down : GAME.here);
  }, []);

  const giveUp = useCallback(() => {
    const el = document.querySelector("[data-mascot-hiding]");
    el?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    setTimeout(() => foundHim(true), reducedMotion() ? 100 : 900);
  }, [foundHim]);

  // The game clock: the hoop runs out after 45 s; hide-and-seek counts up.
  useEffect(() => {
    if (!game) return;
    const tick = () => {
      const g = gameRef.current;
      if (!g) return;
      setClock(g.kind === "hoop" ? Math.max(0, Math.ceil((g.ends - Date.now()) / 1000)) : Math.floor((Date.now() - g.started) / 1000));
      if (g.kind === "hoop" && Date.now() >= g.ends && !physical.current) endGame("time");
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => clearInterval(t);
  }, [game, endGame]);

  // Leaving the page ends a game.
  useEffect(() => {
    if (!gameRef.current) return;
    setHideSpot(null);
    endGame("stop");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  /** The quiz (in his menu): he reacts to each answer. */
  const onQuiz = useCallback(
    (r: "right" | "wrong" | "done", score?: number) => {
      if (r === "right") {
        mascot.play("Jump", "Listening");
        sfx("pop");
      } else if (r === "wrong") {
        mascot.play("Think");
        setTimeout(() => mascot.get().clip === "Think" && mascot.play("Listening"), 1400);
      } else {
        mascot.play((score ?? 0) >= 6 ? "Celebrate" : "Happy", "Listening");
        if ((score ?? 0) >= 7) {
          sfx("tada");
          const b = mascot.get().box;
          confetti({ x: b.x + b.w / 2, y: b.y + b.h * 0.3 }, 80);
        }
      }
    },
    [sfx],
  );

  const onGame = useCallback((g: "hoop" | "seek") => (g === "hoop" ? startHoop() : void startSeek()), [startHoop, startSeek]);

  // A new badge: he celebrates it.
  useEffect(
    () =>
      play.onBadge((id) => {
        const b = BADGES.find((x) => x.id === id);
        if (!b) return;
        setTimeout(() => {
          sfx("tada");
          const box = mascot.get().box;
          if (box.w) confetti({ x: box.x + box.w / 2, y: box.y + box.h * 0.3 }, 50);
          quip(fill(GAME.badge, `${b.name[voice]} ${b.icon}`), 3400);
        }, 900);
      }),
    [quip, sfx, voice],
  );

  // Days in a row: counted once a day; from the second day he says so.
  useEffect(() => {
    if (!placed) return;
    const { streak, fresh } = visitToday();
    if (!fresh || streak < 2) return;
    const t = window.setTimeout(() => brief(fill(GAME.streak, streak), { prio: 1, clip: "Happy", ms: 5000 }), 9000);
    return () => clearTimeout(t);
  }, [placed, brief]);

  // The end of a page: he suggests the next one to see (a page not explored yet, else the next tour
  // stop). Once per page per visit; if he's busy talking it waits for a quiet moment.
  useEffect(() => {
    let timer = 0;
    const check = () => {
      const doc = document.documentElement;
      if (window.scrollY + window.innerHeight < doc.scrollHeight - 220 || doc.scrollHeight < window.innerHeight * 1.6) return;
      if (gameRef.current || touring.current || physical.current) return;
      const cur = here.current.path;
      let shown = false;
      try {
        shown = !!sessionStorage.getItem(`bx-guide-next:${cur}`);
      } catch {}
      if (shown) return;
      const unseen = PAGES.find((p) => p.href !== cur && !explored.includes(p.id) && p.id !== "join");
      const at = SITE_TOUR.findIndex((st) => st.href === cur);
      const href = unseen?.href ?? SITE_TOUR[(at + 1) % SITE_TOUR.length]?.href;
      const page = PAGES.find((p) => p.href === href);
      if (!page || page.href === cur) return;
      const said = brief(
        { ...fill(GAME.nextPage, page.label[voice]), actions: [{ kind: "go", href: page.href, section: page.section, label: GAME.letsGo }, NOT_NOW] },
        { prio: 1, clip: "PointLeft", ms: 9000 },
      );
      if (said) once(`bx-guide-next:${cur}`);
    };
    const onScroll = () => {
      clearTimeout(timer);
      timer = window.setTimeout(check, 700);
    };
    // Also every few seconds while at the bottom (he may have been busy when they got there).
    const poll = window.setInterval(check, 3000);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener("scroll", onScroll);
    };
  }, [explored, brief, voice]);

  // ── Clicking the mascot: open the guide; five quick clicks: a dance. ──
  const clicks = useRef<number[]>([]);
  const onMascotClick = () => {
    const now = performance.now();
    // The end of a drag isn't a click; nor is a click while he's flat on the floor.
    if (now < noClickUntil.current || physical.current) return;
    // Busy with something: he says what you interrupted (a bit grumpy), then opens his menu.
    const busyWith = activity.current;
    if (busyWith && busyWith.id === seq.current) {
      stopActivity();
      const id = seq.current;
      mascot.set({ mood: "angry" });
      mascot.play("Jump", "Idle");
      sfx("boing");
      quip(pick(busyWith.def.interrupted), 2200);
      setTimeout(() => {
        mascot.set({ mood: "neutral" });
        if (seq.current === id && !physical.current) openMenu(false);
      }, 2000);
      return;
    }
    clicks.current = [...clicks.current.filter((t) => now - t < 2500), now];
    if (clicks.current.length >= 5) {
      clicks.current = [];
      const id = ++seq.current;
      mascot.set({ menu: false });
      mascot.play("Dance");
      void speak([LINES.dance], id).then(() => seq.current === id && mascot.play("Idle"));
      return;
    }
    if (resting.current) return;
    sfx("click");
    if (mascot.get().menu) {
      mascot.set({ menu: false });
      mascot.play("Idle");
    } else openMenu(false);
  };
  const closeGuide = useCallback(() => {
    mascot.set({ menu: false });
    mascot.play("Idle");
    hit.current?.focus();
  }, []);
  const hide = useCallback(() => {
    seq.current++;
    endTour();
    hush();
    storage.set("bx-guide-hidden", "1");
    mascot.set({ hidden: true, menu: false, speech: null });
  }, [endTour]);
  const show = () => {
    storage.set("bx-guide-hidden", null);
    mascot.set({ hidden: false });
    void place({ enter: true }).then(() => mascot.play("Wave", "Idle"));
  };
  const toggleSound = useCallback(() => {
    const on = !mascot.get().sound;
    storage.set("bx-guide-sound", on ? "1" : "0");
    soundOn.current = on;
    mascot.set({ sound: on });
    if (on) void speakAloud(voice === "ar" ? "تمام، أنا بتكلم أهو 😄" : "Okay, I'm talking now 😄");
    else hush();
  }, [voice]);

  const three = mode === "3d" && !failed3d;
  const name = GUIDE_NAME[voice];
  const label = voice === "ar" ? `${name}، مرشد BuildX: افتح القائمة` : `${name}, the BuildX guide: open the menu`;
  const box = { ...pos.current, ...size, phone };

  return (
    <>
      <div
        ref={stage}
        data-mascot
        data-activity={doing ?? undefined}
        data-outfit={outfit.join(" ") || undefined}
        className={cn("pointer-events-none fixed left-0 top-0 z-30 transition-opacity duration-500", visible && placed ? "opacity-100" : "opacity-0")}
        style={{ width: size.w, height: size.h, visibility: visible && placed ? "visible" : "hidden", transform: "translate3d(-1000px, 0, 0)" }}
      >
        {three ? (
          <>
            {!ready && <img src={POSTER} alt="" draggable={false} className="absolute inset-0 size-full select-none" />}
            <div className={cn("absolute inset-0 transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")} style={SWING}>
              <Fallback onError={() => setFailed3d(true)}>
                <Mascot3D url={MODEL} quality={quality(phone)} fps={phone ? 30 : 60} paused={!visible} onProgress={setProgress} onError={() => setFailed3d(true)} />
              </Fallback>
            </div>
            {!ready && <MascotLoader locale={voice} progress={progress} />}
          </>
        ) : (
          <>
            <img
              src={CHEERFUL.has(clip) ? POSTER_WAVE : POSTER}
            alt=""
            draggable={false}
            className="mascot-still absolute inset-0 size-full select-none transition-transform duration-300"
              style={flop ? { transform: `translateY(30%) rotate(${flop * 82}deg) scale(0.8)` } : SWING}
            />
            {/* The still guide can't wear his outfit, so a small badge shows it (and what he's busy with). */}
            {(outfit.length > 0 || doing) && (
              <span aria-hidden className="pointer-events-none absolute end-[14%] top-[16%] flex gap-0.5 text-[clamp(0.9rem,2.4vw,1.25rem)] drop-shadow">
                {[...outfit.map((o) => OUTFIT_EMOJI[o]), doing ? ACTIVITY_EMOJI[doing] : ""].filter(Boolean).slice(0, 3).join("")}
              </span>
            )}
          </>
        )}
        <button
          ref={hit}
          type="button"
          onClick={onMascotClick}
          onPointerDown={onGrab}
          onPointerMove={onDrag}
          onPointerUp={onDrop}
          onPointerCancel={onDrop}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={guideOpen}
          className="peer pointer-events-auto absolute cursor-grab touch-none rounded-[42%] active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
          style={{ left: `${BODY.x * 100}%`, top: `${BODY.y * 100}%`, width: `${BODY.w * 100}%`, height: `${(peek ? 0.5 - BODY.y : BODY.h) * 100}%` }}
        />
        {/* Name tag on hover / keyboard focus. */}
        <span
          aria-hidden
          lang={voice}
          className="pointer-events-none absolute inset-x-0 bottom-[1%] mx-auto w-max rounded-full border border-cyan/30 bg-[rgb(9_22_54/0.92)] px-2.5 py-0.5 text-xs font-semibold text-ice opacity-0 transition-opacity duration-300 peer-hover:opacity-100 peer-focus-visible:opacity-100"
        >
          {name}
        </span>
        <MascotSpeech
          locale={voice}
          side={onRight ? "left" : "right"}
          above={peek}
          compact={phone}
          onAction={onAction}
          onListen={(text) => void speakAloud(text)}
          onClose={() => {
            seq.current++;
            endTour();
            mascot.say(null);
            hush();
          }}
        />
      </div>

      {guideOpen && visible && (
        <div data-mascot-menu>
          <MascotGuide
            locale={voice}
            path={path}
            anchor={box}
            explored={explored}
            focusAsk={focusAsk}
            onGo={go}
            onToc={onToc}
            onAction={doAction}
            onReply={onReply}
            onSpeak={onSpeak}
            onClose={closeGuide}
            onHide={hide}
            onSound={toggleSound}
            onGame={onGame}
            onQuiz={onQuiz}
          />
        </div>
      )}

      {hoop && (
        <div aria-hidden className="pointer-events-none fixed left-0 top-0 z-[29]" style={{ transform: `translate3d(${Math.round(hoop.x - hoop.w / 2)}px, ${Math.round(hoop.y - hoop.w * 0.75)}px, 0)`, width: hoop.w, height: hoop.w * 1.25 }} data-mascot-hoop>
          <div className="absolute inset-x-[14%] top-0 h-[46%] rounded-md border-2 border-white/70 bg-white/10 backdrop-blur-[2px]">
            <div className="absolute inset-x-[30%] bottom-[12%] h-[38%] border-2 border-white/60" />
          </div>
          <div className="absolute inset-x-0 top-[60%] h-2.5 -translate-y-1/2 rounded-full border-[3px] border-orange-500 bg-orange-500/20 shadow-[0_0_12px_rgb(249_115_22/0.6)]" />
          <div className="absolute inset-x-[8%] top-[62%] h-[30%] [clip-path:polygon(0_0,100%_0,82%_100%,18%_100%)] [background:repeating-linear-gradient(45deg,rgb(255_255_255/0.55)_0_2px,transparent_2px_10px),repeating-linear-gradient(-45deg,rgb(255_255_255/0.55)_0_2px,transparent_2px_10px)]" />
        </div>
      )}

      {game && (
        <div lang={voice} dir={voice === "ar" ? "rtl" : "ltr"} role="status" className="fixed inset-x-0 top-[calc(4.6rem+env(safe-area-inset-top))] z-40 mx-auto flex w-max max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-full border border-[var(--line-2)] bg-[rgb(9_22_54/0.94)] px-4 py-2 text-sm text-chalk shadow-lg backdrop-blur" data-mascot-game>
          {game.kind === "hoop" ? (
            <>
              <span>🏀 {game.score}</span>
              <span className="tabular-nums text-mist">⏱ {clock}</span>
            </>
          ) : (
            <>
              <span className="truncate">{(hint ?? GAME.seekHud)[voice]}</span>
              <span className="tabular-nums text-mist">⏱ {clock}</span>
              <button type="button" onClick={seekHint} className="rounded-full border border-cyan/40 px-2.5 py-0.5 text-xs text-cyan hover:bg-cyan/10">
                {GAME.hint[voice]}
              </button>
              <button type="button" onClick={giveUp} className="rounded-full px-2 py-0.5 text-xs text-fog hover:text-chalk">
                {GAME.giveUp[voice]}
              </button>
            </>
          )}
          {game.kind === "hoop" && (
            <button type="button" onClick={() => endGame("time")} className="rounded-full px-2 py-0.5 text-xs text-fog hover:text-chalk">
              {GAME.end[voice]}
            </button>
          )}
        </div>
      )}

      {hideSpot &&
        createPortal(
          <button
            type="button"
            data-mascot-hiding
            onClick={() => foundHim(false)}
            aria-label={GAME.foundMe[voice]}
            className="mascot-peek absolute z-30 cursor-pointer overflow-hidden"
            style={{ top: hideSpot.top, left: hideSpot.left, width: hideSpot.size, height: hideSpot.size }}
          >
            <img
              src={POSTER}
              alt=""
              draggable={false}
              className="pointer-events-none size-full select-none object-contain"
              style={{ transform: `translateX(${hideSpot.side === "left" ? "-38%" : "38%"}) rotate(${hideSpot.side === "left" ? 18 : -18}deg)` }}
            />
          </button>,
          document.body,
        )}

      {hidden && !siteMenu && !search && (
        <button
          type="button"
          onClick={show}
          lang={voice}
          dir={voice === "ar" ? "rtl" : "ltr"}
          className="mascot-pill fixed bottom-[calc(5.4rem+env(safe-area-inset-bottom))] end-3 z-30 flex items-center gap-2 rounded-full border border-[var(--line-2)] bg-[rgb(9_22_54/0.9)] py-1 pe-3.5 ps-1 text-xs font-medium text-mist shadow-lg backdrop-blur transition hover:text-chalk lg:bottom-5 lg:end-5"
        >
          <img src={POSTER} alt="" className="size-8 rounded-full bg-white/5 object-cover object-top" />
          {voice === "ar" ? `رجّع ${name}` : `Show ${name}`}
        </button>
      )}
    </>
  );
}
