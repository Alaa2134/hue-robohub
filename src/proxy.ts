import { NextResponse, type NextRequest } from "next/server";
import { privateCsp, publicCsp } from "@/lib/security-headers";

const PRIVATE_PREFIXES = ["/command", "/login", "/setup", "/forgot-password", "/reset-password", "/403", "/mfa"];
const PASSTHROUGH = /^\/(api|app|media|uploads|_next|_vercel)(\/|$)|^\/(favicon\.ico|robots\.txt|sitemap\.xml|manifest\.webmanifest|sw\.js|brand\/|icons\/|images\/|og\/|opengraph-image|twitter-image)/;

const dev = process.env.NODE_ENV !== "production";
const mediaBase = process.env.PUBLIC_MEDIA_BASE_URL || undefined;

function withRequestId(req: NextRequest) {
  const headers = new Headers(req.headers);
  const id = req.headers.get("x-request-id")?.slice(0, 64) || crypto.randomUUID();
  headers.set("x-request-id", id);
  return { headers, id };
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const { headers, id } = withRequestId(req);

  if (PASSTHROUGH.test(pathname)) {
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("x-request-id", id);
    return res;
  }

  // Private application: strict per-request nonce CSP and an optimistic auth redirect.
  if (PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const nonce = btoa(crypto.randomUUID());
    const csp = privateCsp(nonce, dev, mediaBase);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
    if (pathname.startsWith("/command") && !pathname.startsWith("/command/manifest")) {
      const hasSession = req.cookies.has("__Host-rh_session") || req.cookies.has("rh_session");
      if (!hasSession) {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
        return NextResponse.redirect(url);
      }
    }
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("content-security-policy", csp);
    res.headers.set("x-request-id", id);
    res.headers.set("cache-control", "private, no-store");
    return res;
  }

  // Public site: English at the root, Arabic under /ar. /en/* is redirected to the canonical root URL.
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }

  let res: NextResponse;
  if (process.env.MAINTENANCE_MODE === "1" || process.env.MAINTENANCE_MODE === "true") {
    const url = req.nextUrl.clone();
    url.pathname = "/en/maintenance";
    res = NextResponse.rewrite(url, { request: { headers } });
  } else if (pathname === "/ar" || pathname.startsWith("/ar/")) {
    res = NextResponse.next({ request: { headers } });
  } else {
    const url = req.nextUrl.clone();
    url.pathname = `/en${pathname === "/" ? "" : pathname}`;
    res = NextResponse.rewrite(url, { request: { headers } });
  }
  res.headers.set("content-security-policy", publicCsp(dev, mediaBase));
  res.headers.set("x-request-id", id);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
