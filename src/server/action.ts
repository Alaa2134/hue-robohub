import "server-only";
import { unstable_rethrow } from "next/navigation";
import { updateTag } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "./auth/errors";
import { getActor, type Actor } from "./auth/guard";
import { log } from "./observability/logger";
import { requestContext, type RequestContext } from "./observability/request";
import type { Tag } from "@/lib/cache-tags";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; fieldErrors?: Record<string, string>; requestId?: string };

export function zodFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = issue.path.join(".") || "_";
    out[k] ??= issue.message;
  }
  return out;
}

/**
 * Uniform server-action runner: resolves the actor + request context, converts expected errors into
 * presentable results, and logs unexpected ones with a request id (never leaking internals to the client).
 */
export async function runAction<T>(
  fn: (ctx: { actor: Actor | null; req: RequestContext }) => Promise<T>,
): Promise<ActionResult<T>> {
  const req = await requestContext();
  try {
    const actor = await getActor();
    const data = await fn({ actor, req });
    return { ok: true, data };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AppError) return { ok: false, error: err.message, code: err.code, fieldErrors: err.fieldErrors };
    if (err instanceof ZodError) {
      return { ok: false, error: "Please check the highlighted fields.", code: "VALIDATION", fieldErrors: zodFieldErrors(err) };
    }
    log.error("action.unhandled", { requestId: req.requestId, err });
    return { ok: false, error: "Something went wrong. Please try again.", code: "INTERNAL", requestId: req.requestId };
  }
}

/** Expire public caches immediately so published changes are visible on the next request. */
export function publish(...tags: Tag[]) {
  for (const t of new Set(tags)) updateTag(t);
}
