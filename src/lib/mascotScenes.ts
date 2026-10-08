/**
 * Geometry and routing for the BuildX guide: which scenes a page has, where on screen the mascot can
 * stand without covering text or controls, which way to point, and how to get to a section or page.
 */
import { FORM_ROUTES, JOURNEY, QUIET_ROUTES, SECTION_FALLBACK, SECTION_RULES, type Scene } from "@/config/mascotJourney";
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
  // Phones: only the bottom row (limited movement). Desktop: anywhere down either edge.
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
  // Phones: along the whole bottom edge (corners first), so he walks between spots instead of only
  // swapping corners. Desktop: down both side edges.
  const xs = phone ? [left, right, left + (right - left) * 0.33, left + (right - left) * 0.67] : [left, right];
  for (const x of xs) {
    for (const y of ys) {
      const covered = overlap({ x, y }, size, o.self);
      const middle = x !== left && x !== right;
      let score = covered * 100 + (Math.abs(y - prefY) / vh) * 10 + ((x > (left + right) / 2) !== wantRight ? 7 : 0) + (middle ? 4 : 0);
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

const headingText = (h: HTMLElement) => {
  // The accessible text: animated headings repeat their words in an aria-hidden copy.
  const copy = h.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[aria-hidden='true']").forEach((n) => n.remove());
  const t = (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  return t.length > 48 ? `${t.slice(0, 46)}…` : t;
};

/** A section's own heading (not one belonging to a section inside it). */
function headingOf(sec: Element): HTMLElement | null {
  for (const h of sec.querySelectorAll<HTMLElement>("h1, h2")) {
    if (h.closest("section") !== sec) continue;
    if (headingText(h).length > 1) return h;
  }
  return null;
}

let autoId = 0;

/**
 * Every section on the page with its own heading that no configured scene covers gets a scene: a
 * line picked by its heading (SECTION_RULES) or a friendly fallback naming it. The page's own header
 * (its h1) is left to the page's arrival scene.
 */
export function discoverSections(configured: Scene[]): Scene[] {
  const main = document.querySelector("main");
  if (!main) return [];
  const taken = configured.filter((s) => s.selector !== "main").flatMap((s) => [...document.querySelectorAll(s.selector)]);
  const out: Scene[] = [];
  let n = 0;
  for (const sec of main.querySelectorAll<HTMLElement>("section")) {
    if (sec.closest("[data-mascot], [data-mascot-menu]")) continue;
    if (taken.some((t) => t === sec || t.contains(sec) || sec.contains(t))) continue;
    const h = headingOf(sec);
    if (!h || h.tagName === "H1") continue;
    if (sec.getBoundingClientRect().height < 140) continue;
    sec.dataset.guide ??= `s${++autoId}`;
    const text = headingText(h);
    const rule = SECTION_RULES.find((r) => r.match.test(text));
    const say = rule?.say ?? SECTION_FALLBACK[n++ % SECTION_FALLBACK.length];
    const fill = (s: string) => s.replace("{h}", text);
    const key = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40);
    out.push({
      id: `auto-${key}`,
      selector: `[data-guide="${sec.dataset.guide}"]`,
      clip: rule?.clip ?? (out.length % 2 ? "LookAround" : "Point"),
      point: `[data-guide="${sec.dataset.guide}"] :is(h1, h2)`,
      props: rule?.props,
      goggles: rule?.goggles,
      say: [{ ar: fill(say.ar), en: fill(say.en) }],
    });
  }
  return out;
}

/** The page's table of contents for the guide's menu: each section with a heading, in order. */
export function pageToc(): { label: string; selector: string }[] {
  const main = document.querySelector("main");
  if (!main) return [];
  const items: { label: string; selector: string }[] = [];
  for (const sec of main.querySelectorAll<HTMLElement>("section")) {
    const h = headingOf(sec);
    if (!h || sec.getBoundingClientRect().height < 80) continue;
    if (!sec.id && !sec.dataset.guide) sec.dataset.guide = `s${++autoId}`;
    items.push({ label: headingText(h), selector: sec.id ? `#${CSS.escape(sec.id)}` : `[data-guide="${sec.dataset.guide}"]` });
  }
  return items.slice(0, 10);
}
