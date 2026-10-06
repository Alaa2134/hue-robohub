import "server-only";
import { db, schema } from "./db";
import { log } from "./observability/logger";
import type { RequestContext } from "./observability/request";
import type { Actor } from "./auth/guard";

export type AuditInput = {
  action: string;
  targetType?: string;
  targetId?: string | null;
  summary?: string;
  meta?: Record<string, unknown>;
};

/**
 * Append-only audit trail. Never pass secrets/passwords in `meta` — the logger scrubs common keys, but
 * callers are responsible for not collecting sensitive values in the first place.
 */
export async function audit(actor: Actor | { userId: null; label: string } | null, input: AuditInput, ctx?: RequestContext) {
  try {
    await db.insert(schema.auditLogs).values({
      actorId: actor && "role" in actor ? actor.userId : null,
      actorLabel: actor ? ("role" in actor ? `${actor.name} <${actor.email}>` : actor.label) : "anonymous",
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      summary: input.summary ?? null,
      meta: input.meta ?? null,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      requestId: ctx?.requestId ?? null,
    });
  } catch (err) {
    // Auditing must never take down the primary operation, but failures are loud.
    log.error("audit.write_failed", { action: input.action, err });
  }
}
