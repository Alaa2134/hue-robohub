#!/usr/bin/env node
/**
 * Local Postgres + Redis for development and tests, without Docker (uses the installed binaries).
 *   node scripts/services.mjs start|stop      → postgres://postgres@localhost:55432/studio, redis://localhost:56379
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.join(os.tmpdir(), "buildx-studio-services");
const pgData = path.join(root, "pg");
const PG_PORT = 55432;
const REDIS_PORT = 56379;
const pgBin = (() => {
  const base = "/usr/lib/postgresql";
  if (existsSync(base)) {
    const v = readdirSync(base).sort().at(-1);
    if (v) return path.join(base, v, "bin");
  }
  return "";
})();
const bin = (n) => (pgBin ? path.join(pgBin, n) : n);
const asPg = (cmd, args) => {
  // initdb/postgres refuse to run as root; use the postgres user when we are root.
  if (process.getuid?.() === 0) return execFileSync("su", ["postgres", "-s", "/bin/sh", "-c", [cmd, ...args].map((a) => `'${a}'`).join(" ")], { stdio: "pipe" });
  return execFileSync(cmd, args, { stdio: "pipe" });
};

export function start() {
  mkdirSync(root, { recursive: true });
  if (process.getuid?.() === 0) execFileSync("chown", ["-R", "postgres:postgres", root]);
  if (!existsSync(path.join(pgData, "PG_VERSION"))) asPg(bin("initdb"), ["-D", pgData, "-U", "postgres", "--auth=trust", "-E", "UTF8"]);
  const st = spawnSync(process.getuid?.() === 0 ? "su" : bin("pg_ctl"), process.getuid?.() === 0 ? ["postgres", "-s", "/bin/sh", "-c", `${bin("pg_ctl")} -D ${pgData} status`] : ["-D", pgData, "status"]);
  if (st.status !== 0) asPg(bin("pg_ctl"), ["-D", pgData, "-o", `-p ${PG_PORT} -k ${root}`, "-l", path.join(root, "pg.log"), "-w", "start"]);
  try {
    execFileSync("psql", ["-h", "localhost", "-p", String(PG_PORT), "-U", "postgres", "-c", "create database studio"], { stdio: "pipe" });
  } catch {
    /* exists */
  }
  const ping = spawnSync("redis-cli", ["-p", String(REDIS_PORT), "ping"]);
  if (String(ping.stdout).trim() !== "PONG") execFileSync("redis-server", ["--port", String(REDIS_PORT), "--daemonize", "yes", "--save", "", "--appendonly", "no", "--dir", root]);
  return { DATABASE_URL: `postgres://postgres@localhost:${PG_PORT}/studio`, REDIS_URL: `redis://localhost:${REDIS_PORT}` };
}

export function stop() {
  spawnSync("redis-cli", ["-p", String(REDIS_PORT), "shutdown", "nosave"]);
  try {
    asPg(bin("pg_ctl"), ["-D", pgData, "-m", "fast", "stop"]);
  } catch {
    /* not running */
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2] ?? "start";
  if (cmd === "stop") stop();
  else console.log(JSON.stringify(start()));
}
