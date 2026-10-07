"use client";
/**
 * Starts the guide's scenes as their sections reach the middle of the screen (GSAP ScrollTrigger,
 * loaded with the guide). Scenes for the whole page ("main") start right away. Sections that load
 * later (live content) are picked up by refreshing the triggers after a moment.
 */
import { useEffect, useRef } from "react";
import type { Scene } from "@/config/mascotJourney";

export function useScrollScenes(scenes: Scene[], onScene: (scene: Scene) => void, key: string, enabled: boolean) {
  const handler = useRef(onScene);
  useEffect(() => {
    handler.current = onScene;
  });

  useEffect(() => {
    if (!enabled || !scenes.length) return;
    let alive = true;
    let kill = () => {};
    const timers: number[] = [];
    const page = scenes.filter((s) => s.selector === "main");
    const sections = scenes.filter((s) => s.selector !== "main");
    for (const s of page) handler.current(s);
    if (!sections.length) return;

    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (!alive) return;
      gsap.registerPlugin(ScrollTrigger);
      const triggers: ScrollTrigger[] = [];
      const made = new Set<string>();
      const build = () => {
        for (const s of sections) {
          if (made.has(s.id)) continue;
          const el = document.querySelector(s.selector);
          if (!el) continue;
          made.add(s.id);
          triggers.push(
            ScrollTrigger.create({
              trigger: el,
              start: "top 62%",
              end: "bottom 38%",
              onEnter: () => handler.current(s),
              onEnterBack: () => handler.current(s),
            }),
          );
        }
        // No ScrollTrigger.refresh() here: new triggers measure themselves, and a refresh resets the
        // scroll position for a moment, which cancels a smooth scroll that's under way.
      };
      build();
      // Live sections (partners, testimonials) can appear after the first paint.
      timers.push(window.setTimeout(build, 1500), window.setTimeout(build, 4000));
      // The first scene in view starts now, even without scrolling.
      const first = sections.find((s) => {
        const el = document.querySelector(s.selector);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight * 0.62 && r.bottom > window.innerHeight * 0.38;
      });
      if (first) handler.current(first);
      kill = () => triggers.forEach((t) => t.kill());
    })();

    return () => {
      alive = false;
      timers.forEach((t) => clearTimeout(t));
      kill();
    };
  }, [scenes, key, enabled]);
}
