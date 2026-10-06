"use server";

import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "../db";
import { runAction, type ActionResult } from "../action";
import { AppError } from "../auth/errors";
import { audit } from "../audit";
import { hashIp } from "../security/crypto";
import { looksLikeSpam, verifyFormToken, verifyTurnstile } from "../security/forms";
import { limit } from "../security/rate-limit";
import { notifyRoles } from "../notifications";
import { applicationSchema, contactSchema } from "@/lib/schemas/public";
import { getSiteConfig } from "../queries/public";

function guard(form: FormData, name: string) {
  // Honeypot: real users never fill this hidden field.
  if (String(form.get("website") ?? "").length > 0) throw new AppError("BAD_REQUEST", "Submission rejected.");
  if (!verifyFormToken(name, String(form.get("_t") ?? ""))) {
    throw new AppError("BAD_REQUEST", "This form expired or was submitted too quickly. Please reload and try again.");
  }
}

export async function submitApplication(_prev: unknown, form: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async ({ req }) => {
    guard(form, "join");
    const rl = await limit("publicForm", `join:${req.ip ?? "unknown"}`);
    if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many submissions from your network. Please try again later.");
    if (!(await verifyTurnstile(form.get("cf-turnstile-response") as string | null, req.ip))) {
      throw new AppError("BAD_REQUEST", "Verification failed. Please try again.");
    }
    const config = await getSiteConfig();
    if (!config["site.recruitment"].open) throw new AppError("FORBIDDEN", "Applications are currently closed.");

    const input = applicationSchema.parse(Object.fromEntries(form));
    if (looksLikeSpam(input.motivation, input.experience)) throw new AppError("BAD_REQUEST", "Submission rejected.");

    // One open application per email per 30 days.
    const recent = await db
      .select({ id: schema.applications.id })
      .from(schema.applications)
      .where(and(eq(schema.applications.email, input.email), gte(schema.applications.createdAt, new Date(Date.now() - 30 * 86400_000))))
      .limit(1);
    if (recent.length) throw new AppError("CONFLICT", "We already have a recent application from this email. A lead will be in touch.");

    const { consent: _c, ...values } = input;
    void _c;
    const [row] = await db
      .insert(schema.applications)
      .values({ ...values, ipHash: hashIp(req.ip) })
      .returning({ id: schema.applications.id });
    await audit({ userId: null, label: "public" }, { action: "application.submitted", targetType: "application", targetId: row!.id }, req);
    await notifyRoles(["owner", "admin", "lead"], {
      kind: "application",
      title: "New application",
      body: `${input.fullName} · Year ${input.academicYear}`,
      href: `/command/applications/${row!.id}`,
    });
    return { id: row!.id };
  });
}

export async function submitContact(_prev: unknown, form: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async ({ req }) => {
    guard(form, "contact");
    const rl = await limit("publicForm", `contact:${req.ip ?? "unknown"}`);
    if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many messages from your network. Please try again later.");
    if (!(await verifyTurnstile(form.get("cf-turnstile-response") as string | null, req.ip))) {
      throw new AppError("BAD_REQUEST", "Verification failed. Please try again.");
    }
    const input = contactSchema.parse(Object.fromEntries(form));
    if (looksLikeSpam(input.message)) throw new AppError("BAD_REQUEST", "Submission rejected.");
    const [row] = await db
      .insert(schema.contactMessages)
      .values({ ...input, ipHash: hashIp(req.ip) })
      .returning({ id: schema.contactMessages.id });
    await notifyRoles(["owner", "admin"], { kind: "message", title: `New message: ${input.topic}`, body: input.name, href: "/command/messages" });
    return { id: row!.id };
  });
}
