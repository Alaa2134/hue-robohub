import "server-only";
import { env } from "./env";
import { log } from "./observability/logger";

export type Email = { to: string; subject: string; text: string; html?: string };

/** Provider-agnostic email. Uses Resend's HTTP API when configured; otherwise logs (dev) and reports not-sent. */
export async function sendEmail(mail: Email): Promise<boolean> {
  const key = env().RESEND_API_KEY;
  if (!key) {
    if (env().NODE_ENV !== "production") log.info("email.dev_outbox", { to: mail.to, subject: mail.subject, text: mail.text.replace(/token=[\w-]+/g, "token=[redacted]") });
    else log.warn("email.not_configured", { subject: mail.subject });
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env().EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) {
    log.error("email.send_failed", { status: res.status, subject: mail.subject });
    return false;
  }
  return true;
}
