/* Structured JSON logging. One line per event; safe for any log pipeline (Vercel, Loki, CloudWatch, Datadog). */

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env.LOG_LEVEL as Level) ?? "info"] ?? 20;

const REDACT = /pass(word)?|secret|token|authorization|cookie|totp|api[_-]?key|hash/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT.test(k) ? "[redacted]" : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < threshold) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(scrub(fields) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => emit("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => emit("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => emit("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => emit("error", msg, f),
};
