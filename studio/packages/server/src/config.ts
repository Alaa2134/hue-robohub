/**
 * Settings from the environment (see .env.example). Secrets stay on the server: the browser only
 * ever gets the public Supabase URL and anon key from GET /config.
 */
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");
const num = (d: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v === "" ? d : Number(v)))
    .pipe(z.number().finite());

const Env = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: num(8787),
  PUBLIC_API_URL: z.string().default("http://localhost:8787"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/studio"),
  DATABASE_SSL: bool,
  REDIS_URL: z.string().default("redis://localhost:6379"),

  /** supabase: Supabase Auth sessions. local: built-in users (development and self-hosting only). */
  STUDIO_AUTH: z.enum(["supabase", "local"]).default("local"),
  /** supabase: private Supabase Storage bucket. local: files on this server's disk. */
  STUDIO_STORAGE: z.enum(["supabase", "local"]).default("local"),
  STUDIO_LOCAL_DIR: z.string().default("./data"),
  STUDIO_BUCKET: z.string().default("studio"),
  SUPABASE_URL: z.string().default(""),
  SUPABASE_ANON_KEY: z.string().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
  /** Only for projects still on the legacy shared JWT secret; otherwise tokens are checked against the project's JWKS. */
  SUPABASE_JWT_SECRET: z.string().default(""),

  /** Signs local-auth sessions, upload tickets and local file links. Required outside development. */
  STUDIO_SECRET: z.string().default(""),
  /** local auth: "email:password:role,…" (role admin|editor). */
  STUDIO_LOCAL_USERS: z.string().default(""),
  /** These emails become admins the first time they sign in. */
  STUDIO_ADMIN_EMAILS: z.string().default(""),

  // Limits.
  MAX_UPLOAD_MB: num(4096),
  PROJECT_STORAGE_MB: num(20480),
  MONTHLY_RENDER_MINUTES: num(300),
  MAX_RENDER_SECONDS: num(900),
  ALLOW_4K: bool,
  RENDER_CONCURRENCY: num(1),
  INGEST_CONCURRENCY: num(2),
  WORK_DIR: z.string().default(""),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),

  /** AI (off unless a key is set; every AI call shows its estimated cost first). */
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  AI_MONTHLY_USD: num(5),
});

export type Config = z.infer<typeof Env> & { corsOrigins: string[]; adminEmails: Set<string>; production: boolean };

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const c = Env.parse(env);
  const production = c.NODE_ENV === "production";
  if (production && c.STUDIO_SECRET.length < 32) throw new Error("STUDIO_SECRET must be set (32+ characters) in production.");
  if (production && c.STUDIO_AUTH === "local" && !env.STUDIO_ALLOW_LOCAL_AUTH) throw new Error("Local sign-in is for development; use STUDIO_AUTH=supabase in production.");
  if (c.STUDIO_AUTH === "supabase" && (!c.SUPABASE_URL || !c.SUPABASE_ANON_KEY)) throw new Error("STUDIO_AUTH=supabase needs SUPABASE_URL and SUPABASE_ANON_KEY.");
  if (c.STUDIO_STORAGE === "supabase" && (!c.SUPABASE_URL || !c.SUPABASE_SERVICE_ROLE_KEY)) throw new Error("STUDIO_STORAGE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return {
    ...c,
    STUDIO_SECRET: c.STUDIO_SECRET || "dev-only-secret-change-me-dev-only-secret",
    corsOrigins: c.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    adminEmails: new Set(c.STUDIO_ADMIN_EMAILS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)),
    production,
  };
}
