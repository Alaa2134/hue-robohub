import localFont from "next/font/local";

/** Display: Saira (variable width + weight) — squared, engineered, motorsport-adjacent. */
export const fontDisplay = localFont({
  src: [{ path: "../fonts/saira-var.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-saira",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "50% 125%" }],
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

/** UI / body: Inter (variable). */
export const fontSans = localFont({
  src: [{ path: "../fonts/inter-var.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-inter",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Roboto", "sans-serif"],
});

/** Telemetry / data: JetBrains Mono (variable). */
export const fontMono = localFont({
  src: [{ path: "../fonts/jbmono-var.woff2", weight: "100 800", style: "normal" }],
  variable: "--font-jbmono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

/** Arabic display: Noto Kufi Arabic (geometric kufi pairs with Saira). */
export const fontArabicDisplay = localFont({
  src: [{ path: "../fonts/kufi-var.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-kufi",
  display: "swap",
  preload: false,
  fallback: ["Tahoma", "sans-serif"],
});

/** Arabic body: IBM Plex Sans Arabic. */
export const fontArabic = localFont({
  src: [
    { path: "../fonts/plex-arabic-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/plex-arabic-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/plex-arabic-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/plex-arabic-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-arabic",
  display: "swap",
  preload: false,
  fallback: ["Tahoma", "sans-serif"],
});

export const fontVariables = [fontDisplay.variable, fontSans.variable, fontMono.variable, fontArabicDisplay.variable, fontArabic.variable].join(" ");
