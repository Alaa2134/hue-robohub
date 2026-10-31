/**
 * Site appearance chosen by the visitor: the theme (background and text), the main color, and the
 * icon style. Kept on their device (localStorage) and applied before the first paint by a tiny inline
 * script, as data attributes on <html> that src/app/globals.css styles. Nothing is sent anywhere.
 */

export const THEMES = ["auto", "navy", "midnight", "ocean", "forest", "plum", "sand", "light", "paper", "contrast"] as const;
/** Themes with light paper and dark ink (the rest are dark). */
export const LIGHT_THEMES = ["light", "paper"] as const;
export const ACCENTS = ["blue", "cyan", "violet", "emerald", "orange", "rose", "gold"] as const;
export const ICON_STYLES = ["engineered", "rounded", "bold", "thin", "glow", "duotone", "tile", "circle", "emoji", "emoji-tile"] as const;
export const TEXT_SIZES = ["normal", "large", "xl"] as const;
export const MOTIONS = ["full", "reduced"] as const;

export type Theme = (typeof THEMES)[number];
export type Accent = (typeof ACCENTS)[number];
export type IconStyle = (typeof ICON_STYLES)[number];
export type TextSize = (typeof TEXT_SIZES)[number];
export type Motion = (typeof MOTIONS)[number];
export type Appearance = { theme: Theme; accent: Accent; icons: IconStyle; text: TextSize; motion: Motion };

export const DEFAULT_APPEARANCE: Appearance = { theme: "navy", accent: "blue", icons: "engineered", text: "normal", motion: "full" };
export const APPEARANCE_KEY = "bx-appearance";

/** Swatches for the picker (the real colors live in globals.css). */
export const THEME_SWATCH: Record<Theme, [string, string, string]> = {
  auto: ["#050e26", "#f5f7fb", "#2f7bff"],
  navy: ["#050e26", "#0f2049", "#e6edf9"],
  midnight: ["#000000", "#0e1117", "#e8ebf1"],
  ocean: ["#021a1f", "#08343e", "#e2f1f3"],
  forest: ["#06140d", "#12301f", "#e5f1e8"],
  plum: ["#120a24", "#28194c", "#ede8f8"],
  sand: ["#17110b", "#2e2219", "#f1e9de"],
  light: ["#f5f7fb", "#ffffff", "#18233a"],
  paper: ["#f8f4ec", "#fffdf8", "#2a241b"],
  contrast: ["#000000", "#0d0d0d", "#ffffff"],
};

/** The emoji each icon becomes in the emoji styles (UI controls like arrows and close keep their lines). */
export const ICON_EMOJI: Record<string, string> = {
  palette: "🎨", embedded: "🔌", robotics: "🤖", mechanical: "⚙️", software: "💻", competition: "🏁", ai: "🧠",
  lineFollower: "🛤️", sumo: "🥊", sprint: "🏎️", autonomous: "🛰️", innovation: "🌱", circuit: "🔋", sensor: "📡",
  motor: "🛞", wireless: "📶", cad: "📐", robot: "🤖", trophy: "🏆", play: "▶️", lock: "🔒", search: "🔍",
  grid: "🗂️", calendar: "📅", pin: "📍", users: "🧑‍🎓", globe: "🌍", eye: "👁️", rocket: "🚀", diamond: "💎",
  film: "🎬", bolt: "⚡", check: "✅", github: "🐙", home: "🏠", layers: "📚", flag: "🚩", image: "🖼️", mail: "✉️",
  book: "📖", news: "📰", handshake: "🤝", award: "🎖️", clock: "⏰", signal: "📈", target: "🎯", cpu: "🖥️",
  idea: "💡", wrench: "🔧", gauge: "⏱️", shield: "🛡️", qr: "🔳",
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
      text: TEXT_SIZES.includes(v.text as TextSize) ? (v.text as TextSize) : DEFAULT_APPEARANCE.text,
      motion: MOTIONS.includes(v.motion as Motion) ? (v.motion as Motion) : DEFAULT_APPEARANCE.motion,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** "auto" follows the device (light when it asks for light, otherwise navy). */
export const resolveTheme = (t: Theme, prefersLight: boolean): Exclude<Theme, "auto"> => (t === "auto" ? (prefersLight ? "light" : "navy") : t);

/** Put an appearance on <html> (the picker; the inline boot script does the same before the first paint). */
export function applyAppearance(a: Appearance, root: HTMLElement = document.documentElement) {
  const prefersLight = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches;
  const theme = resolveTheme(a.theme, prefersLight);
  const set = (k: string, v: string, def: string) => (v === def ? root.removeAttribute(k) : root.setAttribute(k, v));
  set("data-theme", theme, "navy");
  set("data-tone", (LIGHT_THEMES as readonly string[]).includes(theme) ? "light" : "dark", "dark");
  set("data-accent", a.accent, "blue");
  set("data-icons", a.icons, "engineered");
  set("data-text", a.text, "normal");
  set("data-motion", a.motion, "full");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_SWATCH[theme][0]);
}

/**
 * Inline <head> script: applyAppearance before anything is drawn (no flash of the default look).
 * "Less motion" also makes the page's scripts see prefers-reduced-motion (they already honour it).
 * Plain ES5, no imports; unknown or broken values are ignored.
 */
export const APPEARANCE_BOOT = `(function(){try{var a=JSON.parse(localStorage.getItem("${APPEARANCE_KEY}")||"{}"),r=document.documentElement,T=${JSON.stringify(THEMES)},L=${JSON.stringify(LIGHT_THEMES)},A=${JSON.stringify(ACCENTS)},I=${JSON.stringify(ICON_STYLES)},X=${JSON.stringify(TEXT_SIZES)};var t=T.indexOf(a.theme)>=0?a.theme:"navy";if(t==="auto")t=window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches?"light":"navy";if(t!=="navy")r.setAttribute("data-theme",t);if(L.indexOf(t)>=0)r.setAttribute("data-tone","light");if(A.indexOf(a.accent)>0)r.setAttribute("data-accent",a.accent);if(I.indexOf(a.icons)>0)r.setAttribute("data-icons",a.icons);if(X.indexOf(a.text)>0)r.setAttribute("data-text",a.text);if(a.motion==="reduced"){r.setAttribute("data-motion","reduced");var m=window.matchMedia;if(m)window.matchMedia=function(q){var x=m.call(window,q);if(/prefers-reduced-motion:\\s*reduce/.test(q))return{matches:true,media:q,onchange:null,addListener:function(){},removeListener:function(){},addEventListener:function(){},removeEventListener:function(){},dispatchEvent:function(){return false}};return x}}}catch(e){}})();`;
