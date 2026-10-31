/** BullMQ workers for the three queues (used by the worker process and by the integration tests). */
import { Worker } from "bullmq";
import { QUEUES, redisConnection, type CleanupJob, type Config, type Db, type IngestJob, type RenderJob, type Storage } from "@studio/server";
import { ingest } from "./ingest.ts";
import { render } from "./render.ts";

export function startWorkers({ config, db, storage, work, log = console }: { config: Config; db: Db; storage: Storage; work: string; log?: Pick<Console, "log" | "error"> }) {
  const tools = { ffmpeg: config.FFMPEG_PATH, ffprobe: config.FFPROBE_PATH };
  const connection = redisConnection(config);
  const workers = [
    new Worker<IngestJob>(QUEUES.ingest, async (job) => ingest({ db, storage, tools, work }, job.data.assetId), { connection, concurrency: config.INGEST_CONCURRENCY }),
    new Worker<RenderJob>(QUEUES.render, async (job) => render({ db, storage, tools, work, maxSeconds: config.MAX_RENDER_SECONDS }, job.data.renderId), {
      connection,
      concurrency: config.RENDER_CONCURRENCY,
      lockDuration: 120_000,
    }),
    new Worker<CleanupJob>(QUEUES.cleanup, async (job) => storage.remove(job.data.keys), { connection, concurrency: 1 }),
  ];
  for (const w of workers) {
    w.on("failed", (job, err) => log.error(`[${w.name}] job ${job?.id} failed: ${err.message}`));
    w.on("completed", (job) => log.log(`[${w.name}] job ${job.id} done`));
  }
  return { workers, close: () => Promise.all(workers.map((w) => w.close())) };
}
