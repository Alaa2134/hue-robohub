/**
 * Background worker. Run as a separate, horizontally scalable process: `npm run worker`.
 * Jobs are claimed with SKIP LOCKED so any number of workers can run concurrently.
 */
import net from "node:net";
import { hostname } from "node:os";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { env } from "@/server/env";
import { claimJobs, completeJob, enqueue, failJob, type ClaimedJob } from "@/server/jobs/queue";
import { log } from "@/server/observability/logger";
import { purgeExpiredSessions } from "@/server/auth/session";
import { sendEmail } from "@/server/email";
import { storage } from "@/server/storage";
import { notifyRoles } from "@/server/notifications";

const workerId = `${hostname()}:${process.pid}`;
let running = true;

async function clamScan(buf: Buffer): Promise<"clean" | "infected"> {
  const { CLAMAV_HOST, CLAMAV_PORT } = env();
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: CLAMAV_HOST!, port: CLAMAV_PORT }, () => {
      sock.write("zINSTREAM\0");
      for (let i = 0; i < buf.length; i += 64 * 1024) {
        const chunk = buf.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
    let reply = "";
    sock.setTimeout(60_000, () => sock.destroy(new Error("clamav timeout")));
    sock.on("data", (d) => (reply += d.toString()));
    sock.on("end", () => resolve(/FOUND/.test(reply) ? "infected" : "clean"));
    sock.on("error", reject);
  });
}

const handlers: Record<string, (job: ClaimedJob) => Promise<void>> = {
  async scan_file(job) {
    const assetId = String(job.payload.assetId);
    const [asset] = await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, assetId)).limit(1);
    if (!asset) return;
    const result = await clamScan(await storage().get("private", asset.originalKey));
    await db.update(schema.mediaAssets).set({ scanStatus: result }).where(eq(schema.mediaAssets.id, assetId));
    if (result === "infected") {
      log.warn("upload.infected", { assetId });
      await notifyRoles(["owner", "admin"], { kind: "security", title: "Infected upload quarantined", body: asset.filename, href: "/command/files" });
    }
  },
  async send_email(job) {
    const p = job.payload as { to: string; subject: string; text: string };
    await sendEmail(p);
  },
  async purge_sessions() {
    await purgeExpiredSessions();
  },
  async event_reminders() {
    // Remind about internal events starting in the next 24h, once per event.
    const now = new Date();
    const soon = new Date(now.getTime() + 24 * 3600_000);
    const upcoming = await db
      .select()
      .from(schema.events)
      .where(and(gte(schema.events.startsAt, now), lte(schema.events.startsAt, soon), isNull(schema.events.reminderSentAt)));
    for (const ev of upcoming) {
      await notifyRoles(["owner", "admin", "lead", "member", "trainee"], {
        kind: "event_reminder",
        title: `Tomorrow: ${ev.title}`,
        body: `${ev.type} · ${ev.location ?? "TBA"}`,
        href: "/command/calendar",
      });
      await db.update(schema.events).set({ reminderSentAt: now }).where(eq(schema.events.id, ev.id));
    }
  },
};

async function tick() {
  const jobs = await claimJobs(workerId);
  for (const job of jobs) {
    const started = Date.now();
    try {
      const h = handlers[job.type];
      if (!h) throw new Error(`no handler for ${job.type}`);
      await h(job);
      await completeJob(job.id);
      log.info("job.done", { id: job.id, type: job.type, ms: Date.now() - started });
    } catch (err) {
      await failJob(job, err instanceof Error ? err.message : String(err));
      log.error("job.failed", { id: job.id, type: job.type, attempt: job.attempts, err });
    }
  }
  return jobs.length;
}

async function schedulePeriodic() {
  const minute = Math.floor(Date.now() / 60_000);
  await enqueue("event_reminders", {}, { dedupeKey: `event_reminders:${Math.floor(minute / 15)}` });
  await enqueue("purge_sessions", {}, { dedupeKey: `purge_sessions:${Math.floor(minute / 60)}` });
}

async function main() {
  log.info("worker.start", { workerId });
  let lastPeriodic = 0;
  while (running) {
    try {
      if (Date.now() - lastPeriodic > 60_000) {
        await schedulePeriodic();
        lastPeriodic = Date.now();
      }
      const n = await tick();
      if (n === 0) await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      log.error("worker.loop_error", { err });
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  log.info("worker.stop", { workerId });
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (running = false));
void main();
