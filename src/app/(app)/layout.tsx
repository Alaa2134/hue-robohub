import "../globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "@/lib/fonts";
import { SITE_URL } from "@/lib/seo";
import { SetupRequired } from "@/components/command/setup-required";
import { appConfigured } from "@/server/env";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Command Center — BuildX HUE", template: "%s — Command Center" },
  robots: { index: false, follow: false, nocache: true },
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/command/manifest.webmanifest",
  appleWebApp: { capable: true, title: "RH Command", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  referrer: "same-origin",
};

export const viewport: Viewport = {
  themeColor: "#081634",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Private application root: no public chrome, never indexed, always dynamic (nonce CSP from the proxy). */
export const dynamic = "force-dynamic";

export default function AppRoot({ children }: { children: ReactNode }) {
  const missing = appConfigured();
  return (
    <html lang="en" dir="ltr" className={fontVariables} suppressHydrationWarning>
      <body className="bg-abyss">{missing.length ? <SetupRequired missing={missing} /> : children}</body>
    </html>
  );
}
