import "../../globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { portalFontVariables } from "@/lib/fonts";
import { FRAME_GUARD, HTTPS_UPGRADE } from "@/lib/inline-scripts";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SUPABASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zrtfupdnfxxnguznphis.supabase.co").replace(/\/+$/, "");
const dev = process.env.NODE_ENV !== "production";

/** Static hosting (GitHub Pages) can't send headers, so the policy ships as a meta tag. */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${SUPABASE}`,
  `media-src 'self' blob: ${SUPABASE}`,
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
  title: "BuildX App",
  description: "المحتوى والكويزات وتسجيل الحضور بالباركود لمجتمع BuildX HUE.",
  applicationName: "BuildX App",
  robots: { index: false, follow: false },
  manifest: `${BASE}/app/manifest.webmanifest`,
  icons: {
    icon: [{ url: `${BASE}/brand/favicon.svg`, type: "image/svg+xml" }],
    apple: [{ url: `${BASE}/brand/apple-touch-icon.png`, sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "BuildX HUE", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  referrer: "strict-origin-when-cross-origin",
};

export const viewport: Viewport = {
  themeColor: "#081634",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** BuildX App: Arabic, client-only PWA backed by Supabase (works on static hosting). */
export default function PortalRoot({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={portalFontVariables} suppressHydrationWarning>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <script dangerouslySetInnerHTML={{ __html: FRAME_GUARD + HTTPS_UPGRADE }} />
      </head>
      <body className="bg-abyss text-frost antialiased">{children}</body>
    </html>
  );
}
