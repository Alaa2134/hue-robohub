"use client";
/**
 * Baqloz (بقلظ), the BuildX guide, on the page: a small fixed "stage" that walks between spots along
 * the screen edges (never parked on text or controls when a clear spot exists), runs a scene for
 * every section of every page (config/mascotJourney.ts), talks in speech bubbles, opens his menu
 * when clicked, and reacts to the visitor: he looks at the cursor and at big buttons, talks about
 * the cards you rest the cursor on, helps with forms, celebrates a click on Join, keeps count of the
 * pages you've explored, sits down and falls asleep when left alone, and has a couple of easter eggs.
 *
 * Only the mascot's own body takes clicks; everything else on the stage lets them through.
 */
import { gsap } from "gsap";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ui, useUi } from "@/components/site/ui-state";
import { GUIDE_NAME, GUIDE_VOICE, LINES, PAGES, greeting, type Line, type Scene, type SceneAction, type Text } from "@/config/mascotJourney";
import { mascot, useMascot, type MascotMode } from "@/hooks/useMascotState";
import { useMascotReactions, type Brief } from "@/hooks/useMascotReactions";
import { useScrollScenes } from "@/hooks/useScrollScenes";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { BASE_PATH } from "@/lib/deploy";
import { ONE_SHOT, type ClipName } from "@/lib/mascot/clip-names";
import { confetti, playSound, type Sound } from "@/lib/mascot/fx";
import type { GuideAction } from "@/lib/mascot/guide";
import { BODY, center, discoverSections, findSpot, overlap, pointClip, routeKey, scenesFor, scrollToSection, stageSize, visibleTarget, type Spot } from "@/lib/mascotScenes";
import { MascotGuide } from "./MascotGuide";
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
  const [explored, setExplored] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("bx-guide-pages") ?? "[]") as string[];
    } catch {
      return [];
    }
  });

  const scenes = useMemo(() => scenesFor(pathname), [pathname]);
  const path = routeKey(pathname);
  const visible = !hidden && !siteMenu && !search && !keyboard;

  const sfx = useCallback((s: Sound) => soundOn.current && playSound(s), []);

  // Saved preferences.
  useEffect(() => {
    const h = storage.get("bx-guide-hidden") === "1";
    const snd = storage.get("bx-guide-sound") === "1";
    soundOn.current = snd;
    returning.current = storage.get("bx-guide-visited") === "1";
    storage.set("bx-guide-visited", "1");
    mascot.set({ mode, hidden: h, sound: snd });
  }, [mode]);
  useEffect(() => {
    soundOn.current = sound;
  }, [sound]);

  // ── Position ──
  const apply = useCallback(() => {
    const el = stage.current;
    if (!el) return;
    el.style.transform = `translate3d(${Math.round(pos.current.x)}px, ${Math.round(pos.current.y)}px, 0)`;
    mascot.patch({ box: { x: pos.current.x, y: pos.current.y, w: sizeRef.current.w, h: sizeRef.current.h } });
  }, []);

  const moveTo = useCallback(
    (to: Spot, o: { instant?: boolean } = {}) =>
      new Promise<void>((done) => {
        tween.current?.kill();
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
    async (o: { side?: "start" | "end"; near?: Element | null; enter?: boolean } = {}) => {
      const s = sizeRef.current;
      const spot = findSpot({ size: s, side: o.side, near: o.near, current: pos.current.x > -500 ? pos.current : null, self: stage.current });
      let to: Spot = spot;
      const tight = spot.clear < (isPhoneWidth() ? 0.7 : 0.5);
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
        sfx("pop");
        await sleep(line.actions?.length ? (isPhoneWidth() ? 7000 : 12000) : 2400 + line[voice].length * 45);
      }
      if (seq.current === id) {
        prio.current = 0;
        mascot.say(null);
      }
    },
    [voice, sfx],
  );

  /** A short line on the side (hover, form tip, small talk) that never cuts off something more important. */
  const brief = useCallback<Brief>(
    (line, o) => {
      const s = mascot.get();
      if (s.hidden || s.menu || touring.current || resting.current) return false;
      if ((s.speech && prio.current > o.prio) || (sceneBusy() && o.prio < 2)) return false;
      if (o.interrupt && sceneBusy()) {
        seq.current++;
        activeScene.current = 0;
      }
      prio.current = o.prio;
      const id = mascot.say(line);
      sfx("pop");
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
    [voice, sfx],
  );

  const runScene = useCallback(
    async (scene: Scene, o: { force?: boolean; actions?: SceneAction[] } = {}) => {
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
      if (touring.current || mascot.get().menu || mascot.get().hidden) return;
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

  const tour = useCallback(async () => {
    const steps = [...scenes, ...discoverSections(scenes)]
      .filter((s) => s.selector !== "main" && s.id !== "hero" && document.querySelector(s.selector))
      .sort((a, b) => document.querySelector(a.selector)!.getBoundingClientRect().top - document.querySelector(b.selector)!.getBoundingClientRect().top);
    if (!steps.length) return;
    touring.current = true;
    const next: SceneAction = { kind: "next", label: LINES.next };
    const stop: SceneAction = { kind: "stop", label: LINES.stop };
    for (let i = 0; i < steps.length && touring.current; i++) {
      scrollToSection(steps[i].selector);
      await sleep(reducedMotion() ? 250 : 1350);
      if (!touring.current) break;
      const waiting = new Promise<void>((r) => (nextStep.current = r));
      void runScene(steps[i], { force: true, actions: i < steps.length - 1 ? [next, stop] : [stop] });
      await Promise.race([waiting, sleep(14000)]);
    }
    const wasTouring = touring.current;
    touring.current = false;
    nextStep.current = null;
    if (wasTouring) {
      const id = ++seq.current;
      mascot.play("Wave", "Idle");
      await speak([LINES.tourDone], id);
    }
  }, [scenes, runScene, speak]);

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
    setFocusAsk(ask);
    mascot.set({ menu: true });
    mascot.play("Listening");
  }, []);

  /** The menu's quick actions and the answers that come with one. */
  const doAction = useCallback(
    (a: GuideAction) => {
      sfx("click");
      mascot.set({ menu: false });
      if (a === "search") ui.set({ search: true, menu: false });
      else if (a === "lang") document.querySelector<HTMLAnchorElement>("header a[hreflang]")?.click();
      else window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
    },
    [sfx],
  );

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
      else if (a.kind === "next") nextStep.current?.();
      else if (a.kind === "stop") {
        touring.current = false;
        nextStep.current?.();
        seq.current++;
        mascot.say(null);
      } else if (a.kind === "dismiss") {
        seq.current++;
        mascot.say(null);
        mascot.play("Idle");
      } else if (a.kind === "go") {
        if (a.celebrate) celebrate();
        go({ href: a.href, section: a.section });
      }
    },
    [tour, celebrate, go, sfx, openMenu],
  );

  // ── Page changes: clear the old page's scene; the new page's scenes walk it in. ──
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    seq.current++;
    touring.current = false;
    sceneTarget.current = null;
    mascot.set({ menu: false, speech: null, props: [], goggles: false, drone: false, look: null });
  }, [pathname]);
  // After the reset above (effects run in order), so the new page's first scene isn't cancelled.
  useScrollScenes(scenes, onScene, pathname, !hidden, discover);
  useMascotReactions({ brief, busy: () => moving.current || touring.current || !!resting.current || mascot.get().menu || mascot.get().hidden }, pathname, !hidden && placed);

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
    const lookNow = () => {
      raf = 0;
      if (mascot.get().eyesClosed) return;
      const t = ctaTarget.current ?? sceneTarget.current;
      if (t && t.isConnected) {
        const r = t.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) return mascot.set({ look: center(t) });
      }
      const b = mascot.get().box;
      const c = cursor.current;
      if (c && Math.hypot(c.x - (b.x + b.w / 2), c.y - (b.y + b.h * 0.4)) < Math.max(520, window.innerWidth * 0.4)) mascot.set({ look: c });
      else mascot.set({ look: null });
    };
    const queue = () => !raf && (raf = requestAnimationFrame(lookNow));
    const move = (e: PointerEvent) => {
      if (!fine || e.pointerType !== "mouse") return;
      const now = performance.now();
      const dt = Math.max(8, now - last.t);
      speed = speed * 0.75 + (Math.hypot(e.clientX - last.x, e.clientY - last.y) / dt) * 1000 * 0.25;
      last = { x: e.clientX, y: e.clientY, t: now };
      cursor.current = { x: e.clientX, y: e.clientY };
      queue();
      const s = mascot.get();
      if (!s.box.w || s.menu || s.speech || moving.current || touring.current || resting.current) return;
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
    document.addEventListener("pointerover", over, { passive: true });
    document.addEventListener("pointerout", out, { passive: true });
    window.addEventListener("scroll", queue, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", move);
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
        if (moving.current || touring.current || s.menu || s.hidden || !placed) return;
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
        if (s.menu || s.speech || moving.current || touring.current) return arm();
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
    const activity = () => {
      const now = performance.now();
      if (now - lastWake < 400 && !resting.current) return;
      lastWake = now;
      wake();
    };
    arm();
    const events = ["pointermove", "pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    return () => {
      clearTimeout(sit);
      clearTimeout(doze);
      events.forEach((e) => window.removeEventListener(e, activity));
    };
  }, [speak]);

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

  // ── Clicking the mascot: open the guide; five quick clicks: a dance. ──
  const clicks = useRef<number[]>([]);
  const onMascotClick = () => {
    const now = performance.now();
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
    touring.current = false;
    storage.set("bx-guide-hidden", "1");
    mascot.set({ hidden: true, menu: false, speech: null });
  }, []);
  const show = () => {
    storage.set("bx-guide-hidden", null);
    mascot.set({ hidden: false });
    void place({ enter: true }).then(() => mascot.play("Wave", "Idle"));
  };
  const toggleSound = useCallback(() => {
    const on = !mascot.get().sound;
    storage.set("bx-guide-sound", on ? "1" : null);
    soundOn.current = on;
    mascot.set({ sound: on });
    if (on) playSound("pop");
  }, []);

  const three = mode === "3d" && !failed3d;
  const name = GUIDE_NAME[voice];
  const label = voice === "ar" ? `${name}، مرشد BuildX: افتح القائمة` : `${name}, the BuildX guide: open the menu`;
  const box = { ...pos.current, ...size, phone };

  return (
    <>
      <div
        ref={stage}
        data-mascot
        className={cn("pointer-events-none fixed left-0 top-0 z-30 transition-opacity duration-500", visible && placed ? "opacity-100" : "opacity-0")}
        style={{ width: size.w, height: size.h, visibility: visible && placed ? "visible" : "hidden", transform: "translate3d(-1000px, 0, 0)" }}
      >
        {three ? (
          <>
            {!ready && <img src={POSTER} alt="" draggable={false} className="absolute inset-0 size-full select-none" />}
            <div className={cn("absolute inset-0 transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")}>
              <Fallback onError={() => setFailed3d(true)}>
                <Mascot3D url={MODEL} quality={phone || (navigator.hardwareConcurrency ?? 8) <= 4 ? "low" : "high"} paused={!visible} onProgress={setProgress} onError={() => setFailed3d(true)} />
              </Fallback>
            </div>
            {!ready && <MascotLoader locale={voice} progress={progress} />}
          </>
        ) : (
          <img src={CHEERFUL.has(clip) ? POSTER_WAVE : POSTER} alt="" draggable={false} className="mascot-still absolute inset-0 size-full select-none" />
        )}
        <button
          ref={hit}
          type="button"
          onClick={onMascotClick}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={guideOpen}
          className="peer pointer-events-auto absolute cursor-pointer rounded-[42%] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
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
          onClose={() => {
            seq.current++;
            touring.current = false;
            nextStep.current?.();
            mascot.say(null);
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
            onAnswer={() => mascot.play("Happy")}
            onClose={closeGuide}
            onHide={hide}
            onSound={toggleSound}
          />
        </div>
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
