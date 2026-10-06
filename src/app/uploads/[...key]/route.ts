import { env } from "@/server/env";
import { storage } from "@/server/storage";

/** Serves public uploads in local-storage mode (development / single server). S3/R2 deployments serve them from the bucket CDN. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (env().STORAGE_DRIVER !== "local") return new Response("Not found", { status: 404 });
  const key = (await params).key.join("/");
  if (!/^img\/[0-9a-f-]{36}\/[\w.-]+\.(avif|webp|jpg)$/i.test(key)) return new Response("Not found", { status: 404 });
  const file = await storage().stream("public", key);
  if (!file) return new Response("Not found", { status: 404 });
  const type = key.endsWith(".avif") ? "image/avif" : key.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new Response(file.body, { headers: { "Content-Type": type, "Content-Length": String(file.size), "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
