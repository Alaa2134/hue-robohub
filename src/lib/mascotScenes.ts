/**
 * Geometry and routing for the BuildX guide: which scenes a page has, where on screen the mascot can
 * stand without covering text or controls, which way to point, and how to get to a section or page.
 */
import { FORM_ROUTES, JOURNEY, QUIET_ROUTES, type Scene } from "@/config/mascotJourney";
import type { ClipName } from "@/lib/mascot/clip-names";

/** Path without locale prefix or trailing slash ("/" for home). */
export function routeKey(pathname: string): string {
  const p = pathname.replace(/^\/(ar|en)(?=\/|$)/, "").replace(/\/+$/, "");
  return p || "/";
}

export function scenesFor(pathname: string): Scene[] {
  const key = routeKey(pathname);
  return JOURNEY.find((r) => r.match.test(key))?.scenes ?? [];
}

export const isQuiet = (pathname: string) => QUIET_ROUTES.some((r) => r.test(routeKey(pathname)));
export const isFormPage = (pathname: string) => FORM_ROUTES.some((r) => r.test(routeKey(pathname)));

/** The mascot fills this part of its square-ish stage (the rest is room for props and the drone). */
export const BODY = { x: 0.21, y: 0.24, w: 0.58, h: 0.68 };

export type Box = { x: number; y: number; w: number; h: number };
export type Spot = { x: number; y: number };

export function stageSize(vw: number, vh: number): { w: number; h: number } {
  // Mascot height: desktop ~170–270px, phones ~80–115px.
  // The stage is larger than the mascot (room for props and the drone): the mascot itself is ~0.68 of it.
  const h = vw < 768 ? Math.round(Math.min(170, Math.max(118, vw * 0.4))) : Math.round(Math.min(400, Math.max(250, Math.min(vw * 0.19, vh * 0.38))));
  return { w: Math.round(h * 0.86), h };
}

export const isPhone = () => window.innerWidth < 768;

/** Fixed chrome the guide stays clear of: the header on top, the phone tab bar at the bottom. */
function insets() {
  const header = document.querySelector<HTMLElement>("body > header, header.fixed");
  const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 72;
  const bar = document.querySelector<HTMLElement>("nav.fixed.bottom-0");
  const bottom = bar && getComputedStyle(bar).display !== "none" ? window.innerHeight - bar.getBoundingClientRect().top : 0;
  return { top: top + 12, bottom: bottom + 12 };
}

const CONTENT =
  "a,button,input,textarea,select,label,summary,video,iframe,img,h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,figcaption,td,th,pre,code,[role=button],[role=tab],[role=status],[contenteditable]";

/** Is there something to read or press under this point (ignoring the guide itself)? */
function contentAt(x: number, y: number, self: Element | null): boolean {
  const stack = document.elementsFromPoint(x, y);
  const el = stack.find((e) => !self?.contains(e));
  if (!el) return false;
  const hit = el.closest(CONTENT);
  if (!hit || hit.closest("[aria-hidden='true']")) return false;
  if (hit instanceof HTMLImageElement && (hit.alt === "" || hit.getAttribute("role") === "presentation")) return false;
  // Content that is fading in still counts; only hidden, click-through layers (closed panels) don't.
  const cs = getComputedStyle(hit);
  if (cs.visibility === "hidden" || (Number(cs.opacity) < 0.15 && cs.pointerEvents === "none")) return false;
  return true;
}

/** Share of the mascot's body (0–1) that would sit on top of text or controls at this spot. */
export function overlap(spot: Spot, size: { w: number; h: number }, self: Element | null): number {
  let hits = 0;
  let n = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 5; j++) {
      const x = spot.x + size.w * (BODY.x + (BODY.w * (i + 0.5)) / 3);
      const y = spot.y + size.h * (BODY.y + (BODY.h * (j + 0.5)) / 5);
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      n++;
      if (contentAt(x, y, self)) hits++;
    }
  }
  return n ? hits / n : 1;
}

/**
 * Best place to stand: along the left and right edges, as clear of content as possible, near the
 * preferred side and height, and not too far from where it already is (so it doesn't wander).
 */
export function findSpot(o: { size: { w: number; h: number }; side?: "start" | "end"; near?: Element | null; current?: Spot | null; self: Element | null }): Spot & { clear: number } {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const { size } = o;
  const inset = insets();
  const rtl = document.documentElement.dir === "rtl";
  const m = vw < 768 ? 8 : Math.max(16, Math.min(40, vw * 0.02));
  const left = m - size.w * BODY.x * 0.6;
  const right = vw - size.w + size.w * BODY.x * 0.6 - m;
  const wantRight = o.side ? (o.side === "end") !== rtl : true;
  const minY = inset.top - size.h * BODY.y;
  const maxY = vh - inset.bottom - size.h;
  const phone = vw < 768;
  // Phones: only the bottom corners (limited movement). Desktop: anywhere down either edge.
  const ys: number[] = [];
  if (phone) ys.push(maxY);
  else for (let y = maxY; y >= minY; y -= 44) ys.push(y);
  let prefY = maxY - (maxY - minY) * 0.18;
  if (o.near) {
    const r = o.near.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh) prefY = Math.min(maxY, Math.max(minY, r.top + r.height / 2 - size.h * 0.55));
  }
  let best = { x: wantRight ? right : left, y: maxY, clear: 0 };
  let bestScore = Infinity;
  for (const x of [left, right]) {
    for (const y of ys) {
      const covered = overlap({ x, y }, size, o.self);
      let score = covered * 100 + (Math.abs(y - prefY) / vh) * 10 + ((x === right) !== wantRight ? 7 : 0);
      if (o.current) score += (Math.hypot(x - o.current.x, y - o.current.y) / vw) * 5;
      if (score < bestScore) {
        bestScore = score;
        best = { x, y, clear: 1 - covered };
      }
    }
  }
  return best;
}

/** First visible match of a selector (on screen if possible). */
export function visibleTarget(selector: string | undefined): Element | null {
  if (!selector) return null;
  const all = [...document.querySelectorAll(selector)];
  const vh = window.innerHeight;
  const shown = all.filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return shown.find((e) => {
    const r = e.getBoundingClientRect();
    return r.bottom > 80 && r.top < vh - 40;
  }) ?? shown[0] ?? null;
}

export function center(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Point towards an element: PointLeft/PointRight depending on which side of the mascot it is. */
export function pointClip(box: Box, target: Element | null): ClipName {
  if (!target) return "Idle";
  const c = center(target);
  return c.x < box.x + box.w / 2 ? "PointLeft" : "PointRight";
}

type Lenis = { scrollTo: (target: Element | number, o?: { offset?: number; duration?: number; immediate?: boolean }) => void };

/** Scroll a section into view (through the site's smooth scrolling when it's on). */
export function scrollToSection(selector: string): boolean {
  const el = document.querySelector(selector);
  if (!el) return false;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lenis = (window as unknown as { __lenis?: Lenis }).__lenis;
  if (lenis) lenis.scrollTo(el, { offset: -72, duration: 1.4, immediate: reduce });
  else el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  return true;
}
