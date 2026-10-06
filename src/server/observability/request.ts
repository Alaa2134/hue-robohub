import "server-only";
import { headers } from "next/headers";

export type RequestContext = { requestId: string; ip: string | null; userAgent: string | null; origin: string | null };

/** Request metadata. `x-request-id` is assigned by the proxy for every request and echoed to clients. */
export async function requestContext(): Promise<RequestContext> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return {
    requestId: h.get("x-request-id") ?? crypto.randomUUID(),
    ip: (fwd ? fwd.split(",")[0]!.trim() : h.get("x-real-ip")) || null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    origin: h.get("origin"),
  };
}

export function requestContextFrom(req: Request): RequestContext {
  const fwd = req.headers.get("x-forwarded-for");
  return {
    requestId: req.headers.get("x-request-id") ?? crypto.randomUUID(),
    ip: (fwd ? fwd.split(",")[0]!.trim() : req.headers.get("x-real-ip")) || null,
    userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    origin: req.headers.get("origin"),
  };
}
