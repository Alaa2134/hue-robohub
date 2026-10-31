/** Background jobs (Redis + BullMQ): file processing after upload, renders, storage clean-up. */
import { Queue, type ConnectionOptions } from "bullmq";
import type { Config } from "./config.ts";

export const QUEUES = { ingest: "studio-ingest", render: "studio-render", cleanup: "studio-cleanup" } as const;

export type IngestJob = { assetId: string };
export type RenderJob = { renderId: string };
export type CleanupJob = { keys: string[] };

export function redisConnection(config: Config): ConnectionOptions {
  const u = new URL(config.REDIS_URL);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export function makeQueues(config: Config) {
  const connection = redisConnection(config);
  return {
    ingest: new Queue<IngestJob>(QUEUES.ingest, { connection, defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 500, removeOnFail: 1000 } }),
    // A failed render is retried from the app (a new attempt the user can see), not silently.
    render: new Queue<RenderJob>(QUEUES.render, { connection, defaultJobOptions: { attempts: 1, removeOnComplete: 500, removeOnFail: 1000 } }),
    cleanup: new Queue<CleanupJob>(QUEUES.cleanup, { connection, defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 30000 }, removeOnComplete: true } }),
  };
}
export type Queues = ReturnType<typeof makeQueues>;
