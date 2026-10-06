import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "../db";

export type JobType = "scan_file" | "send_email" | "notify_role" | "event_reminders" | "purge_sessions";

/** Enqueue a background job. `dedupeKey` prevents duplicates while a job with the same key is pending. */
export async function enqueue(
  type: JobType,
  payload: Record<string, unknown>,
  opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {},
) {
  await db
    .insert(schema.jobs)
    .values({ type, payload, runAt: opts.runAt ?? new Date(), dedupeKey: opts.dedupeKey ?? null, maxAttempts: opts.maxAttempts ?? 5 })
    .onConflictDoNothing();
}

export type ClaimedJob = { id: number; type: JobType; payload: Record<string, unknown>; attempts: number; max_attempts: number };

/** Atomically claims ready jobs. Safe with any number of concurrent workers (FOR UPDATE SKIP LOCKED). */
export async function claimJobs(workerId: string, batch = 5): Promise<ClaimedJob[]> {
  const rows = await db.execute<ClaimedJob>(sql`
    update jobs set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1
    where id in (
      select id from jobs
      where (status = 'queued' and run_at <= now())
         or (status = 'running' and locked_at < now() - interval '10 minutes')
      order by run_at
      limit ${batch}
      for update skip locked
    )
    returning id, type, payload, attempts, max_attempts`);
  return [...rows];
}

export async function completeJob(id: number) {
  await db.execute(sql`update jobs set status = 'done', locked_at = null, last_error = null, dedupe_key = null where id = ${id}`);
}

export async function failJob(job: ClaimedJob, error: string) {
  const final = job.attempts >= job.max_attempts;
  // Exponential backoff: 30s, 2m, 8m, 32m …
  const delay = 30 * 4 ** (job.attempts - 1);
  await db.execute(sql`
    update jobs set
      status = ${final ? "failed" : "queued"}::job_status,
      locked_at = null,
      last_error = ${error.slice(0, 2000)},
      run_at = now() + (${delay} || ' seconds')::interval,
      dedupe_key = case when ${final} then null else dedupe_key end
    where id = ${job.id}`);
}
