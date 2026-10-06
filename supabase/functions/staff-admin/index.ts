// Staff accounts for the RoboHub App (first-run setup, add staff, reset a password, remove).
// Runs with the service role, so every action re-checks who is calling. Request bodies carry
// passwords: never log them.
import { createClient } from "npm:@supabase/supabase-js@2";

/** The project's secret key (new key system), falling back to the legacy service_role key. */
function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    if (keys.default) return keys.default;
  } catch {
    /* not set */
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type Role = "owner" | "admin" | "lead";
type Body = Record<string, unknown>;
type Caller = { id: string; email: string; role: Role };

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const isEmail = (v: unknown): v is string => typeof v === "string" && v.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isPassword = (v: unknown): v is string => typeof v === "string" && v.length >= 10 && v.length <= 72;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const email = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

async function caller(req: Request): Promise<Caller | null> {
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return null;
  const { data: row } = await admin.from("staff").select("role, active, email").eq("user_id", data.user.id).maybeSingle();
  if (!row?.active) return null;
  return { id: data.user.id, email: row.email, role: row.role };
}

async function audit(me: Caller, action: string, entityId: string, detail: Record<string, unknown> = {}) {
  await admin.from("audit_log").insert({ actor: me.id, actor_email: me.email, action, entity: "staff", entity_id: entityId, detail });
}

/** Creates the Auth user, or reuses an existing one that has no staff row yet. */
async function upsertUser(mail: string, password: string, name: string) {
  const created = await admin.auth.admin.createUser({ email: mail, password, email_confirm: true, user_metadata: { full_name: name } });
  if (created.data.user) return { id: created.data.user.id, fresh: true };
  const { data: existing } = await admin.rpc("auth_user_id", { p_email: mail });
  if (!existing) return { error: created.error?.message ?? "create_failed" };
  const updated = await admin.auth.admin.updateUserById(existing, { password, email_confirm: true });
  if (updated.error) return { error: updated.error.message };
  return { id: existing as string, fresh: false };
}

async function bootstrap(b: Body) {
  const code = text(b.code, 64);
  const mail = email(b.email);
  if (!code || !isEmail(mail) || !isPassword(b.password)) return reply({ error: "invalid" }, 400);
  const { data: ok, error } = await admin.rpc("bootstrap_check", { p_code: code });
  if (error) throw error;
  if (!ok) return reply({ error: "bad_code" }, 403);
  const name = text(b.name, 120);
  const user = await upsertUser(mail, b.password, name);
  if (!user.id) return reply({ error: "create_failed", message: user.error }, 400);
  const { data: done, error: finishError } = await admin.rpc("bootstrap_finish", { p_code: code, p_user: user.id, p_email: mail, p_name: name });
  if (finishError || !done) {
    if (user.fresh) await admin.auth.admin.deleteUser(user.id);
    if (finishError) throw finishError;
    return reply({ error: "bad_code" }, 403);
  }
  return reply({ ok: true });
}

async function createStaff(me: Caller, b: Body) {
  const mail = email(b.email);
  const role: Role = b.role === "admin" ? "admin" : "lead";
  if (!isEmail(mail) || !isPassword(b.password)) return reply({ error: "invalid" }, 400);
  if (me.role === "admin" && role !== "lead") return reply({ error: "forbidden" }, 403);
  const { data: existing } = await admin.rpc("auth_user_id", { p_email: mail });
  if (existing) {
    const { data: row } = await admin.from("staff").select("user_id").eq("user_id", existing).maybeSingle();
    if (row) return reply({ error: "exists" }, 409);
  }
  const name = text(b.name, 120);
  const user = await upsertUser(mail, b.password, name);
  if (!user.id) return reply({ error: "create_failed", message: user.error }, 400);
  const { error } = await admin.from("staff").insert({ user_id: user.id, email: mail, full_name: name, role });
  if (error) {
    if (user.fresh) await admin.auth.admin.deleteUser(user.id);
    return reply({ error: "create_failed", message: error.message }, 400);
  }
  await audit(me, "staff_create", user.id, { email: mail, role });
  return reply({ ok: true, id: user.id });
}

async function setPassword(me: Caller, b: Body) {
  const target = text(b.userId, 64);
  if (!target || !isPassword(b.password)) return reply({ error: "invalid" }, 400);
  const { data: row } = await admin.from("staff").select("role").eq("user_id", target).maybeSingle();
  if (!row) return reply({ error: "not_found" }, 404);
  if (target !== me.id && (row.role === "owner" || (me.role === "admin" && row.role !== "lead"))) return reply({ error: "forbidden" }, 403);
  const { error } = await admin.auth.admin.updateUserById(target, { password: b.password });
  if (error) return reply({ error: "update_failed", message: error.message }, 400);
  await audit(me, "staff_password", target);
  return reply({ ok: true });
}

async function removeStaff(me: Caller, b: Body) {
  const target = text(b.userId, 64);
  if (me.role !== "owner") return reply({ error: "forbidden" }, 403);
  if (!target || target === me.id) return reply({ error: "invalid" }, 400);
  const { data: row } = await admin.from("staff").select("email, role").eq("user_id", target).maybeSingle();
  if (!row) return reply({ error: "not_found" }, 404);
  const { error } = await admin.auth.admin.deleteUser(target);
  if (error) return reply({ error: "delete_failed", message: error.message }, 400);
  await audit(me, "staff_delete", target, { email: row.email, role: row.role });
  return reply({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "method" }, 405);
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "invalid" }, 400);
  }
  const action = body?.action;
  try {
    if (action === "bootstrap") return await bootstrap(body);
    const me = await caller(req);
    if (!me) return reply({ error: "unauthorized" }, 401);
    if (me.role === "lead") return reply({ error: "forbidden" }, 403);
    if (action === "create") return await createStaff(me, body);
    if (action === "set_password") return await setPassword(me, body);
    if (action === "delete") return await removeStaff(me, body);
    return reply({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("staff-admin", String(action), e instanceof Error ? e.message : "error");
    return reply({ error: "server" }, 500);
  }
});
