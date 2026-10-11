/**
 * The app in English. The screens are written in Arabic; with English on (per device), every text
 * the app shows is swapped for its English from i18n/en.json (kept complete by
 * scripts/i18n-extract.mjs) as it appears on screen, and the page turns left-to-right. Dates and
 * numbers come out in English from the head script (APP_LANG in lib/inline-scripts).
 *
 * Left in Arabic on purpose: what people typed (inputs, text areas, names, posts), and anything
 * inside an element marked dir="rtl" (printed certificates, cards, reports, and the site preview).
 */
import { APP_LANG_KEY } from "@/lib/inline-scripts";

export type Lang = "ar" | "en";
const AR = /[\u0600-\u06FF]/;
const AR_DIGITS = /[\u0660-\u0669]/g;
const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const SKIP = "textarea,input,script,style,[contenteditable],[translate=no],[dir=rtl]";

export function appLang(): Lang {
  try {
    return localStorage.getItem(APP_LANG_KEY) === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

/** Switches the app's language on this device (the app reloads in it). */
export function setAppLang(lang: Lang) {
  try {
    localStorage.setItem(APP_LANG_KEY, lang);
  } catch {
    /* stays as it is */
  }
  location.reload();
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const escape = (s: string) => s.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/[{}]/g, "\\$&");

type Pattern = { re: RegExp; en: string };

/** A translator over the dictionary: whole texts first, then texts with values in them, then Arabic phrases inside a text. */
export function makeTranslator(dict: Record<string, string>) {
  const exact = new Map<string, string>();
  const patterns: Pattern[] = [];
  for (const [ar, en] of Object.entries(dict)) {
    if (!en || en === ar) continue;
    if (/\{\d+\}/.test(ar)) {
      const src = escape(ar).replace(/\\\{(\d+)\\\}/g, (_, i: string) => `(?<g${i}>[\\s\\S]+?)`);
      try {
        patterns.push({ re: new RegExp(`^${src}$`), en });
      } catch {
        /* a text the pattern can't express stays as it is */
      }
    } else exact.set(ar, en);
  }
  // Longer texts first, so "{0} من {1} حاضرين" wins over "{0} من {1}".
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
  const latin = (s: string) => s.replace(AR_DIGITS, (d) => String(d.charCodeAt(0) - 0x660));

  const core = (text: string, depth: number): string | null => {
    const hit = exact.get(text);
    if (hit !== undefined) return hit;
    for (const p of patterns) {
      const m = p.re.exec(text);
      if (!m?.groups) continue;
      const groups = m.groups;
      return p.en.replace(/\{(\d+)\}/g, (_, i: string) => {
        const v = groups[`g${i}`] ?? "";
        return depth < 2 && AR.test(v) ? (core(norm(v), depth + 1) ?? v) : v;
      });
    }
    // Arabic phrases between numbers, names in Latin letters, symbols…
    let changed = false;
    const out = text.replace(/[\u0600-\u06FF][\u0600-\u06FF\s«»،؟؛:!.\-–—/()]*[\u0600-\u06FF»؟.!:)]|[\u0600-\u06FF]/g, (run) => {
      const r = exact.get(norm(run));
      if (r === undefined) return run;
      changed = true;
      return r;
    });
    return changed ? out : null;
  };

  return (text: string): string | null => {
    if (!AR.test(text)) return null;
    const lead = /^\s*/.exec(text)?.[0] ?? "";
    const trail = /\s*$/.exec(text)?.[0] ?? "";
    const r = core(norm(text), 0);
    return r === null ? null : lead + latin(r) + trail;
  };
}

/**
 * Turns the running app English: translates what's on screen now and everything that shows up or
 * changes later, plus alert/confirm/prompt messages and the tab title. Call once, after the app has
 * started (so React's first render is left as it rendered).
 */
export async function startEnglish() {
  const dict = (await import("./i18n/en.json")).default as Record<string, string>;
  const tr = makeTranslator(dict);
  const mine = new WeakMap<Node, string>();
  const skip = (el: Element | null) => !el || !!el.closest(SKIP);

  const text = (n: Text) => {
    const v = n.nodeValue ?? "";
    if (mine.get(n) === v || skip(n.parentElement)) return;
    const r = tr(v);
    if (r !== null && r !== v) {
      mine.set(n, r);
      n.nodeValue = r;
    }
  };
  const attrs = (el: Element) => {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !AR.test(v)) continue;
      if (a !== "placeholder" && skip(el)) continue;
      const r = tr(v);
      if (r !== null && r !== v) el.setAttribute(a, r);
    }
  };
  const walk = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) return text(root as Text);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    if (el.closest("[dir=rtl],[translate=no]")) return;
    attrs(el);
    el.querySelectorAll("[placeholder],[title],[aria-label],[alt]").forEach(attrs);
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) text(n as Text);
  };

  walk(document.documentElement);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") text(m.target as Text);
      else if (m.type === "attributes") attrs(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });

  const say = (m: unknown) => (typeof m === "string" ? (tr(m) ?? m) : m);
  const { alert, confirm, prompt } = window;
  window.alert = (m?: unknown) => alert.call(window, say(m));
  window.confirm = (m?: string) => confirm.call(window, say(m) as string);
  window.prompt = (m?: string, d?: string) => prompt.call(window, say(m) as string, d);
  document.documentElement.classList.remove("bx-en-pending");
}
