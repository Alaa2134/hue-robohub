import "server-only";
import Redis from "ioredis";
import { env } from "../env";
import { log } from "../observability/logger";

const g = globalThis as unknown as { __rhRedis?: Redis | null };

/** Shared Redis client, or null when REDIS_URL is not configured (single-instance / dev mode). */
export function redis(): Redis | null {
  if (g.__rhRedis !== undefined) return g.__rhRedis;
  const url = env().REDIS_URL;
  if (!url) {
    if (env().NODE_ENV === "production") {
      log.warn("redis.not_configured", { note: "rate limits are per-instance; set REDIS_URL when scaling out" });
    }
    g.__rhRedis = null;
    return null;
  }
  const client = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
  client.on("error", (err) => log.error("redis.error", { err: err.message }));
  g.__rhRedis = client;
  return client;
}
