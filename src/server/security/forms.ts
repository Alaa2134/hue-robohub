import "server-only";
import { env } from "../env";
import { hmac, safeEqual } from "./crypto";
import { log } from "../observability/logger";

/**
 * Anti-abuse for public forms (layered, none of them sufficient alone):
 *  1. Honeypot field that humans never see.
 *  2. Signed render timestamp — submissions faster than a human can type are rejected, tokens expire.
 *  3. Per-IP rate limits (see LIMITS).
 *  4. Cloudflare Turnstile when configured.
 *  5. Content heuristics (link stuffing, repeated characters).
 */

export function issueFormToken(form: string): string {
  const ts = Date.now().toString(36);
  return `${ts}.${hmac(`form:${form}:${ts}`).slice(0, 22)}`;
}

export function verifyFormToken(form: string, token: string | null | undefined, minMs = 2500, maxMs = 6 * 3600_000): boolean {
  if (!token) return false;
  const [ts, sig] = token.split(".");
  if (!ts || !sig) return false;
  if (!safeEqual(hmac(`form:${form}:${ts}`).slice(0, 22), sig)) return false;
  const age = Date.now() - parseInt(ts, 36);
  return age >= minMs && age <= maxMs;
}

export async function verifyTurnstile(token: string | null | undefined, ip: string | null): Promise<boolean> {
  const secret = env().TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured → other layers apply
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success: boolean };
    return !!data.success;
  } catch (err) {
    log.warn("turnstile.verify_failed", { err });
    return false;
  }
}

export function looksLikeSpam(...texts: string[]): boolean {
  const all = texts.join(" ");
  const links = (all.match(/https?:\/\//gi) ?? []).length;
  if (links > 4) return true;
  if (/(.)\1{14,}/.test(all)) return true;
  if (/\b(viagra|casino|crypto ?airdrop|seo services|backlinks)\b/i.test(all)) return true;
  return false;
}
