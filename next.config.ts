import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  serverExternalPackages: ["sharp", "@node-rs/argon2", "postgres", "ioredis"],
  experimental: {
    // Photos are resized in the browser first (src/lib/client-image.ts); stay under Vercel's 4.5 MB request cap.
    serverActions: { bodySizeLimit: "4mb" },
  },
  images: { unoptimized: true },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/media/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
        ],
      },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/command" }] },
    ];
  },
};

export default config;
