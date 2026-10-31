/**
 * Who's calling. Supabase mode: the browser's Supabase session token, checked against the project's
 * signing keys (JWKS) or its legacy shared secret. Local mode: users from STUDIO_LOCAL_USERS with
 * tokens signed by this server. Either way the person must be a studio member (admins come from
 * STUDIO_ADMIN_EMAILS the first time they sign in; admins add editors).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from "jose";
import type { Config, Db } from "@studio/server";

export type Me = { userId: string; email: string; role: "admin" | "editor"; monthlyMinutes: number | null };

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
  ) {
    super(message);
  }
}

/** A stable id for a local user (same email → same id). */
export function localUserId(email: string): string {
  const h = createHash("sha1").update(`studio-local:${email.toLowerCase()}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function localUsers(config: Config): { email: string; password: string; role: "admin" | "editor" }[] {
  return config.STUDIO_LOCAL_USERS.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [email, password, role] = s.split(":");
      return { email: email.toLowerCase(), password, role: role === "admin" ? "admin" : "editor" } as const;
    })
    .filter((u) => u.email && u.password);
}

export function makeAuth(config: Config, db: Db) {
  const secret = new TextEncoder().encode(config.STUDIO_SECRET);
  const jwks = config.STUDIO_AUTH === "supabase" && !config.SUPABASE_JWT_SECRET ? createRemoteJWKSet(new URL(`${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)) : null;
  const legacy = config.SUPABASE_JWT_SECRET ? new TextEncoder().encode(config.SUPABASE_JWT_SECRET) : null;

  async function verify(token: string): Promise<{ sub: string; email: string }> {
    let p: JWTPayload;
    try {
      if (config.STUDIO_AUTH === "local") p = (await jwtVerify(token, secret, { issuer: "buildx-studio", audience: "studio" })).payload;
      else if (legacy) p = (await jwtVerify(token, legacy, { audience: "authenticated" })).payload;
      else p = (await jwtVerify(token, jwks!, { audience: "authenticated" })).payload;
    } catch {
      throw new HttpError(401, "انتهت الجلسة — سجّل الدخول تاني.", "unauthorized");
    }
    const email = String(p.email ?? "").toLowerCase();
    if (!p.sub || !email) throw new HttpError(401, "Session without an email.", "unauthorized");
    return { sub: p.sub, email };
  }

  async function me(authorization: string | undefined): Promise<Me> {
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) throw new HttpError(401, "سجّل الدخول الأول.", "unauthorized");
    const { sub, email } = await verify(token);
    let r = await db.query<{ email: string; user_id: string | null; role: "admin" | "editor"; active: boolean; monthly_render_minutes: number | null }>(
      "select * from studio.members where user_id = $1 or (user_id is null and email = $2) order by user_id nulls last limit 1",
      [sub, email],
    );
    let m = r.rows[0];
    if (!m && config.adminEmails.has(email)) {
      r = await db.query("insert into studio.members (email, user_id, role) values ($1, $2, 'admin') on conflict (email) do update set user_id = coalesce(studio.members.user_id, excluded.user_id) returning *", [email, sub]);
      m = r.rows[0];
    }
    if (!m || !m.active) throw new HttpError(403, "حسابك مش ضمن فريق الاستوديو. اطلب من الأدمن يضيفك.", "not_member");
    if (m.user_id && m.user_id !== sub) throw new HttpError(403, "This email belongs to another account.", "not_member");
    if (!m.user_id) await db.query("update studio.members set user_id = $2 where email = $1 and user_id is null", [m.email, sub]);
    return { userId: sub, email, role: m.role, monthlyMinutes: m.monthly_render_minutes };
  }

  async function localLogin(email: string, password: string): Promise<{ token: string; email: string }> {
    if (config.STUDIO_AUTH !== "local") throw new HttpError(404, "Not available.");
    const u = localUsers(config).find((x) => x.email === email.toLowerCase());
    const ok = !!u && u.password.length === password.length && timingSafeEqual(Buffer.from(u.password), Buffer.from(password));
    if (!u || !ok) throw new HttpError(401, "الإيميل أو الباسورد غلط.", "bad_login");
    const sub = localUserId(u.email);
    await db.query("insert into studio.members (email, user_id, role) values ($1, $2, $3) on conflict (email) do nothing", [u.email, sub, u.role]);
    const token = await new SignJWT({ email: u.email }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuer("buildx-studio").setAudience("studio").setIssuedAt().setExpirationTime("12h").sign(secret);
    return { token, email: u.email };
  }

  return { me, localLogin };
}
export type Auth = ReturnType<typeof makeAuth>;
