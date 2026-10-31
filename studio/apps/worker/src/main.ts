/** The worker process: takes ingest, render and clean-up jobs from Redis and runs FFmpeg for them. */
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { connect, loadConfig, makeStorage, migrate } from "@studio/server";
import { loadFonts } from "./titles.ts";
import { startWorkers } from "./workers.ts";

const config = loadConfig();
const db = connect(config);
const storage = makeStorage(config);
const work = path.resolve(config.WORK_DIR || path.join(os.tmpdir(), "buildx-studio"));
mkdirSync(work, { recursive: true });
await migrate(db);
loadFonts();
const w = startWorkers({ config, db, storage, work });
console.log(`[worker] ready — storage ${storage.kind}, work dir ${work}, render concurrency ${config.RENDER_CONCURRENCY}`);

const stop = async () => {
  console.log("[worker] stopping…");
  await w.close();
  await db.end();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
