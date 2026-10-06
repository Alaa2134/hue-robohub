import "server-only";
import { redis } from "../cache/redis";

export type RateLimitResult = { ok: boolean; remaining: number; resetMs: number; limit: number };

type Bucket = { count: number; resetAt: number };
const memory = new Map<string, Bucket>();
let lastSweep = Date.now();

function memoryHit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [k, b] of memory) if (b.resetAt <= now) memory.delete(k);
    lastSweep = now;
  }
  let b = memory.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    memory.set(key, b);
  }
  b.count++;
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), resetMs: b.resetAt - now, limit };
}

const LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {c, ttl}`;

/**
 * Fixed-window limiter. Uses Redis (atomic Lua) when configured so limits hold across all instances;
 * falls back to process memory otherwise. Fails open on Redis errors so an outage can't lock everyone out
 * — brute-force protection on accounts is additionally enforced in the database (lockout).
 */
export async function rateLimit(name: string, id: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const key = `rl:${name}:${id}`;
  const r = redis();
  if (!r) return memoryHit(key, limit, windowMs);
  try {
    const [count, ttl] = (await r.eval(LUA, 1, key, String(windowMs))) as [number, number];
    return { ok: count <= limit, remaining: Math.max(0, limit - count), resetMs: Math.max(0, ttl), limit };
  } catch {
    return memoryHit(key, limit, windowMs);
  }
}

export async function resetRateLimit(name: string, id: string) {
  const key = `rl:${name}:${id}`;
  memory.delete(key);
  try {
    await redis()?.del(key);
  } catch {
    /* ignore */
  }
}

/** Named policies so limits are reviewed in one place. */
export const LIMITS = {
  loginIp: [20, 15 * 60_000],
  loginAccount: [8, 15 * 60_000],
  publicForm: [5, 60 * 60_000],
  passwordReset: [5, 60 * 60_000],
  upload: [60, 10 * 60_000],
  search: [60, 60_000],
  checkin: [30, 60_000],
  ai: [20, 60 * 60_000],
} as const satisfies Record<string, readonly [number, number]>;

export async function limit(policy: keyof typeof LIMITS, id: string) {
  const [n, w] = LIMITS[policy];
  return rateLimit(policy, id, n, w);
}
