/**
 * Site appearance chosen by the visitor: the theme (background and text), the main color, and the
 * icon style. Kept on their device (localStorage) and applied before the first paint by a tiny inline
 * script, as data attributes on <html> that src/app/globals.css styles. Nothing is sent anywhere.
 */

export const THEMES = ["auto", "navy", "midnight", "light"] as const;
export const ACCENTS = ["blue", "cyan", "violet", "emerald", "orange", "rose", "gold"] as const;
export const ICON_STYLES = ["engineered", "rounded", "bold", "thin", "glow", "duotone"] as const;

export type Theme = (typeof THEMES)[number];
export type Accent = (typeof ACCENTS)[number];
export type IconStyle = (typeof ICON_STYLES)[number];
export type Appearance = { theme: Theme; accent: Accent; icons: IconStyle };

export const DEFAULT_APPEARANCE: Appearance = { theme: "navy", accent: "blue", icons: "engineered" };
export const APPEARANCE_KEY = "bx-appearance";

/** Swatches for the picker (the real colors live in globals.css). */
export const THEME_SWATCH: Record<Theme, [string, string, string]> = {
  auto: ["#050e26", "#f5f7fb", "#2f7bff"],
  navy: ["#050e26", "#0f2049", "#e6edf9"],
  midnight: ["#000000", "#0e1117", "#e8ebf1"],
  light: ["#f5f7fb", "#ffffff", "#18233a"],
};
export const ACCENT_SWATCH: Record<Accent, [string, string]> = {
  blue: ["#2f7bff", "#3cc4ff"],
  cyan: ["#0fb5d6", "#5ef0d8"],
  violet: ["#7c5cff", "#c08cff"],
  emerald: ["#14b87a", "#6ff0b8"],
  orange: ["#ff7a1a", "#ffc04d"],
  rose: ["#ff3b5c", "#ff8fb0"],
  gold: ["#d9a03a", "#ffd98a"],
};

export function parseAppearance(raw: string | null | undefined): Appearance {
  try {
    const v = JSON.parse(raw ?? "") as Partial<Appearance>;
    return {
      theme: THEMES.includes(v.theme as Theme) ? (v.theme as Theme) : DEFAULT_APPEARANCE.theme,
      accent: ACCENTS.includes(v.accent as Accent) ? (v.accent as Accent) : DEFAULT_APPEARANCE.accent,
      icons: ICON_STYLES.includes(v.icons as IconStyle) ? (v.icons as IconStyle) : DEFAULT_APPEARANCE.icons,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** "auto" follows the device (light when it asks for light, otherwise navy). */
export const resolveTheme = (t: Theme, prefersLight: boolean): Exclude<Theme, "auto"> => (t === "auto" ? (prefersLight ? "light" : "navy") : t);

/** Put an appearance on <html> (used by the inline boot script's logic and by the picker). */
export function applyAppearance(a: Appearance, root: HTMLElement = document.documentElement) {
  const prefersLight = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches;
  const theme = resolveTheme(a.theme, prefersLight);
  const set = (k: string, v: string, def: string) => (v === def ? root.removeAttribute(k) : root.setAttribute(k, v));
  set("data-theme", theme, "navy");
  set("data-accent", a.accent, "blue");
  set("data-icons", a.icons, "engineered");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f5f7fb" : theme === "midnight" ? "#000000" : "#050e26");
}

/**
 * Inline <head> script: the same as applyAppearance, before anything is drawn (no flash of the
 * default look). Plain ES5, no imports; unknown or broken values are ignored.
 */
export const APPEARANCE_BOOT = `(function(){try{var a=JSON.parse(localStorage.getItem("${APPEARANCE_KEY}")||"{}"),r=document.documentElement,T=${JSON.stringify(THEMES)},A=${JSON.stringify(ACCENTS)},I=${JSON.stringify(ICON_STYLES)};var t=T.indexOf(a.theme)>=0?a.theme:"navy";if(t==="auto")t=window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches?"light":"navy";if(t!=="navy")r.setAttribute("data-theme",t);if(A.indexOf(a.accent)>0)r.setAttribute("data-accent",a.accent);if(I.indexOf(a.icons)>0)r.setAttribute("data-icons",a.icons)}catch(e){}})();`;
