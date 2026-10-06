import "server-only";
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Required in production for sessions, form tokens and encryption — enforced lazily by appSecret(). */
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters").optional(),
  APP_ENCRYPTION_KEY: z.string().optional(),
  MAINTENANCE_MODE: bool,
  /** Optional: without it the public site runs from its built-in content and the Command Center shows setup steps. */
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: z.string().optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_PUBLIC_BUCKET: z.string().default("robohub-public"),
  S3_PRIVATE_BUCKET: z.string().default("robohub-private"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
  PUBLIC_MEDIA_BASE_URL: z.string().optional(),
  MUX_TOKEN_ID: z.string().optional(),
  MUX_TOKEN_SECRET: z.string().optional(),
  CLOUDFLARE_STREAM_CUSTOMER_CODE: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("BuildX HUE <no-reply@localhost>"),
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().default(3310),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SENTRY_DSN: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment. Throws at first use if misconfigured — never silently. */
export function env(): Env {
  if (cached) return cached;
  const dev = process.env.NODE_ENV !== "production";
  const parsed = schema.safeParse({
    ...process.env,
    // On Vercel, fall back to the project's production domain so links (QR codes, sign-in links) are never localhost.
    APP_URL: process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined),
    APP_SECRET: process.env.APP_SECRET || (dev ? "dev-only-secret-dev-only-secret-dev-only" : undefined),
    DATABASE_URL: process.env.DATABASE_URL || (dev && process.env.VERCEL !== "1" ? "postgres://postgres@localhost:5432/robohub" : undefined),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.APP_SECRET?.startsWith("change-me")) {
    throw new Error("APP_SECRET still has its example value");
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";

/** True when a database is configured. Without one the site serves its built-in content (no live data). */
export function hasDatabase(): boolean {
  return !!env().DATABASE_URL;
}

/** The signing secret. Throws (rather than falling back) in production, so auth can never run unkeyed. */
export function appSecret(): string {
  const s = env().APP_SECRET;
  if (!s) throw new Error("APP_SECRET is not configured. Set a random 32+ character value in the environment.");
  return s;
}


/** Environment variables the private Command Center still needs (empty when ready). */
export function appConfigured(): string[] {
  const e = env();
  const missing: string[] = [];
  if (!e.DATABASE_URL) missing.push("DATABASE_URL");
  if (!e.APP_SECRET) missing.push("APP_SECRET");
  return missing;
}
