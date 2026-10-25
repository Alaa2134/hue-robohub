import "../../globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { portalFontVariables } from "@/lib/fonts";
import { FRAME_GUARD, HTTPS_UPGRADE } from "@/lib/inline-scripts";
import { LAB_LANG } from "@/lab/lang-script";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SUPABASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zrtfupdnfxxnguznphis.supabase.co").replace(/\/+$/, "");
const dev = process.env.NODE_ENV !== "production";

/**
 * Static hosting can't send headers, so the policy ships as a meta tag. The compiler and simulator
 * run as WebAssembly in workers from our own origin ('wasm-unsafe-eval', worker-src); nothing else is
 * loaded from anywhere but Supabase.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${SUPABASE}`,
  "media-src 'self' blob:",
  "font-src 'self'",
  `connect-src 'self' ${SUPABASE} ${SUPABASE.replace(/^http/, "ws")}${dev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "script-src-attr 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export const metadata: Metadata = {
  title: { default: "BuildX Lab", template: "%s · BuildX Lab" },
  description: "Design circuits, write Arduino code, simulate it on a real AVR, and build in 3D — in the browser. BuildX HUE.",
  applicationName: "BuildX Lab",
  icons: {
    icon: [{ url: `${BASE}/brand/favicon.svg`, type: "image/svg+xml" }],
    apple: [{ url: `${BASE}/brand/apple-touch-icon.png`, sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
  referrer: "strict-origin-when-cross-origin",
};

export const viewport: Viewport = { themeColor: "#050e26", colorScheme: "dark", width: "device-width", initialScale: 1, viewportFit: "cover" };

/** BuildX Lab: a client-side app (the static site has no server), Arabic or English per visitor. */
export default function LabRoot({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" translate="no" className={portalFontVariables} suppressHydrationWarning>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        {/* Browser auto-translate rewrites the page under React and crashes it (insertBefore errors); the site has its own English. */}
        <meta name="google" content="notranslate" />
        <script dangerouslySetInnerHTML={{ __html: FRAME_GUARD + HTTPS_UPGRADE + LAB_LANG }} />
      </head>
      <body className="bg-void text-frost antialiased">{children}</body>
    </html>
  );
}
