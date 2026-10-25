// Copies a finished 3D AI model (and its picture) from the provider into our own storage, so the
// customer's links never expire. The database calls this with the job and a one-time token it wrote;
// only the database knows the token, and it is used up on the first call.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const MAX = 100 * 1024 * 1024;

async function fetchFile(url: string): Promise<{ bytes: Uint8Array; type: string }> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("not_https");
  const r = await fetch(u, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`download_${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.byteLength > MAX) throw new Error("too_big");
  return { bytes, type: (r.headers.get("content-type") ?? "").split(";")[0].trim() };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let input: { id?: string; token?: string };
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid" }, 400);
  }
  if (!input.id || !input.token || !/^[0-9a-f-]{36}$/.test(input.id)) return json({ error: "invalid" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const c = await admin.rpc("ai3d_keep_claim", { p_id: input.id, p_token: input.token });
  if (c.error) return json({ error: "server" }, 500);
  const job = c.data as { glb?: string; thumb?: string } | null;
  if (!job?.glb) return json({ error: "forbidden" }, 403);

  const bucket = admin.storage.from("ai3d-models");
  try {
    const glb = await fetchFile(job.glb);
    const glbPath = `${input.id}/${crypto.randomUUID()}.glb`;
    const up = await bucket.upload(glbPath, glb.bytes, { contentType: "model/gltf-binary", upsert: false });
    if (up.error) throw new Error(`upload_${up.error.message}`);

    let thumbPath: string | null = null;
    if (job.thumb) {
      try {
        const t = await fetchFile(job.thumb);
        const ext = t.type === "image/jpeg" ? "jpg" : t.type === "image/webp" ? "webp" : "png";
        thumbPath = `${input.id}/${crypto.randomUUID()}.${ext}`;
        const tu = await bucket.upload(thumbPath, t.bytes, { contentType: `image/${ext === "jpg" ? "jpeg" : ext}`, upsert: false });
        if (tu.error) thumbPath = null;
      } catch {
        thumbPath = null;
      }
    }
    await admin.rpc("ai3d_keep_done", { p_id: input.id, p_glb: glbPath, p_thumb: thumbPath, p_error: null });
    return json({ ok: true });
  } catch (e) {
    await admin.rpc("ai3d_keep_done", { p_id: input.id, p_glb: null, p_thumb: null, p_error: String(e instanceof Error ? e.message : e).slice(0, 200) });
    return json({ ok: false });
  }
});
