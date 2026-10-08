// Delivers one push message to every device it targets: browsers (web push with the VAPID key) and
// the BuildX HUE app on phones (FCM for Android, APNs for iPhone). Used by push-deliver and send-push.
// Keys come from the database (private.app_secrets) with the targets; a missing key just skips that kind.
import webpush from "npm:web-push@3.6.7";

export type Message = { id: string; title: string; body: string; url: string | null };
type WebSub = { endpoint: string; keys: { p256dh: string; auth: string } };
type Device = { token: string; platform: "android" | "ios" };
export type Targets = {
  message: Message;
  vapid: { public: string | null; private: string | null; subject: string | null };
  subs: WebSub[];
  native?: { fcm: string | null; apns: { key: string | null; key_id: string | null; team_id: string | null }; devices: Device[] };
};
export type Outcome = { targets: number; delivered: number; gone: string[]; goneNative: string[] };

/** The iPhone app's bundle ID (APNs topic). */
const BUNDLE_ID = "com.buildxhue.student";

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

function pemBytes(pem: string) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

async function signJwt(header: object, claims: object, pem: string, alg: "RS256" | "ES256") {
  const input = `${b64urlJson(header)}.${b64urlJson(claims)}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(pem),
    alg === "RS256" ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } : { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(alg === "RS256" ? "RSASSA-PKCS1-v1_5" : { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input));
  return `${input}.${b64url(sig)}`;
}

/** A Google OAuth access token for FCM from the service account. */
async function fcmAccess(sa: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    { alg: "RS256", typ: "JWT" },
    { iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
    sa.private_key,
    "RS256",
  );
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!r.ok) throw new Error(`fcm_auth_${r.status}`);
  return ((await r.json()) as { access_token: string }).access_token;
}

/** Runs the jobs at most `n` at a time. */
async function pool<T>(items: T[], n: number, job: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += n) await Promise.allSettled(items.slice(i, i + n).map(job));
}

export async function deliver(t: Targets, urgency: "high" | "normal" = "high"): Promise<Outcome> {
  const { message } = t;
  const url = message.url ?? "/app/";
  const out: Outcome = { targets: 0, delivered: 0, gone: [], goneNative: [] };

  // Browsers.
  if (t.vapid.private && t.vapid.public && t.subs.length) {
    webpush.setVapidDetails(t.vapid.subject || "https://buildxhue.com", t.vapid.public, t.vapid.private);
    const payload = JSON.stringify({ title: message.title, body: message.body, url });
    out.targets += t.subs.length;
    await pool(t.subs, 50, async (s) => {
      try {
        await webpush.sendNotification(s, payload, { TTL: 86400, urgency });
        out.delivered++;
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) out.gone.push(s.endpoint);
      }
    });
  }

  const native = t.native;
  if (!native?.devices.length) return out;
  // The app opens the screen after the "#" (it is a single-page app inside the phone).
  const route = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "/";

  // Android (FCM).
  const android = native.devices.filter((d) => d.platform === "android");
  if (native.fcm && android.length) {
    try {
      const sa = JSON.parse(native.fcm) as { project_id: string; client_email: string; private_key: string };
      const access = await fcmAccess(sa);
      out.targets += android.length;
      await pool(android, 50, async (d) => {
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token: d.token,
              notification: { title: message.title, body: message.body || undefined },
              data: { route },
              android: { priority: urgency === "high" ? "HIGH" : "NORMAL", notification: { sound: "default" } },
            },
          }),
        });
        if (r.ok) out.delivered++;
        else {
          const text = await r.text();
          if (r.status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT.*token/i.test(text)) out.goneNative.push(d.token);
        }
      });
    } catch (e) {
      console.error("fcm", (e as Error).message);
    }
  }

  // iPhone (APNs).
  const ios = native.devices.filter((d) => d.platform === "ios");
  const { key, key_id, team_id } = native.apns;
  if (key && key_id && team_id && ios.length) {
    try {
      const jwt = await signJwt({ alg: "ES256", kid: key_id }, { iss: team_id, iat: Math.floor(Date.now() / 1000) }, key, "ES256");
      out.targets += ios.length;
      await pool(ios, 20, async (d) => {
        const r = await fetch(`https://api.push.apple.com/3/device/${d.token}`, {
          method: "POST",
          headers: {
            authorization: `bearer ${jwt}`,
            "apns-topic": BUNDLE_ID,
            "apns-push-type": "alert",
            "apns-priority": urgency === "high" ? "10" : "5",
            "apns-expiration": String(Math.floor(Date.now() / 1000) + 86400),
          },
          body: JSON.stringify({ aps: { alert: { title: message.title, body: message.body || undefined }, sound: "default" }, route }),
        });
        if (r.ok) out.delivered++;
        else {
          const reason = ((await r.json().catch(() => ({}))) as { reason?: string }).reason ?? "";
          if (r.status === 410 || reason === "BadDeviceToken" || reason === "Unregistered") out.goneNative.push(d.token);
        }
      });
    } catch (e) {
      console.error("apns", (e as Error).message);
    }
  }
  return out;
}
