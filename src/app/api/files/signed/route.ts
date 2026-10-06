import { verifyUrlSignature } from "@/server/security/crypto";
import { storage } from "@/server/storage";

/** Short-lived signed downloads for private files in local-storage mode. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get("key") ?? "";
  const exp = Number(u.searchParams.get("exp") ?? 0);
  const sig = u.searchParams.get("sig") ?? "";
  if (!key || !exp || exp < Date.now() / 1000 || !verifyUrlSignature(key, exp, sig)) return new Response("Link expired", { status: 403 });
  const file = await storage().stream("private", key);
  if (!file) return new Response("Not found", { status: 404 });
  const dlParam = u.searchParams.get("dl");
  const dl = (dlParam ?? key.split("/").pop() ?? "file").replace(/[^\w.\- ]/g, "_");
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const imageType = ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" } as Record<string, string>)[ext];
  return new Response(file.body, {
    headers: {
      "Content-Type": imageType && !dlParam ? imageType : "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": imageType && !dlParam ? "inline" : `attachment; filename="${dl}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
