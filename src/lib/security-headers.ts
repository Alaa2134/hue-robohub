/**
 * Content-Security-Policy builders.
 * - Public site: statically cached pages can't carry per-request nonces, so scripts are limited to
 *   'self' + inline bootstraps; everything else (objects, frames, base-uri, form targets) is locked down.
 * - Command Center & auth pages: dynamic, so they get a strict nonce + 'strict-dynamic' policy.
 */
const MEDIA_HOSTS = ["https://stream.mux.com", "https://image.mux.com", "https://*.cloudflarestream.com", "https://videodelivery.net", "https://i.ytimg.com"];

function common(dev: boolean, mediaBase?: string) {
  const media = [...MEDIA_HOSTS, ...(mediaBase ? [mediaBase] : [])].join(" ");
  return [
    "default-src 'self'",
    `img-src 'self' data: blob: ${media}`,
    `media-src 'self' blob: ${media}`,
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${media} https://challenges.cloudflare.com https://plausible.io${dev ? " ws: wss:" : ""}`,
    "frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ];
}

export function publicCsp(dev: boolean, mediaBase?: string) {
  return [
    ...common(dev, mediaBase),
    `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://plausible.io${dev ? " 'unsafe-eval'" : ""}`,
  ].join("; ");
}

export function privateCsp(nonce: string, dev: boolean, mediaBase?: string) {
  return [...common(dev, mediaBase), `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`].join("; ");
}
