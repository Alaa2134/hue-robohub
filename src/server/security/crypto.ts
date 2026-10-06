import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appSecret, env } from "../env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmac(input: string, key = appSecret()): string {
  return createHmac("sha256", key).update(input).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Hash an IP with the app secret so abuse signals can be correlated without storing raw IPs. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return hmac(`ip:${ip}`).slice(0, 32);
}

function encryptionKey(): Buffer {
  const raw = env().APP_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes (base64)");
    return key;
  }
  // Derived fallback keeps dev/test working; production deployments should set a dedicated key.
  return createHash("sha256").update(`enc:${appSecret()}`).digest();
}

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext) */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, ct] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Time-limited signature for URLs (used by the local storage driver for private files). */
export function signUrlPayload(payload: string, expiresAtSec: number): string {
  return hmac(`${payload}:${expiresAtSec}`);
}

export function verifyUrlSignature(payload: string, expiresAtSec: number, sig: string): boolean {
  if (!Number.isFinite(expiresAtSec) || expiresAtSec * 1000 < Date.now()) return false;
  return safeEqual(signUrlPayload(payload, expiresAtSec), sig);
}
