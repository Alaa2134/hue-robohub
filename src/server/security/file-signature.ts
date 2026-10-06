/**
 * Content sniffing by magic bytes. The client-declared MIME type and file extension are never trusted.
 */
export type Sniffed = { mime: string; ext: string; kind: "image" | "document" };

const startsWith = (b: Buffer, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

export function sniff(buf: Buffer): Sniffed | null {
  if (buf.length < 12) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg", kind: "image" };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png", kind: "image" };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8))
    return { mime: "image/webp", ext: "webp", kind: "image" };
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return { mime: "image/avif", ext: "avif", kind: "image" };
    if (brand === "heic" || brand === "heix" || brand === "mif1") return { mime: "image/heic", ext: "heic", kind: "image" };
  }
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", ext: "pdf", kind: "document" };
  // OOXML / zip containers (docx, xlsx, pptx) and STEP/STL CAD files commonly shared by the team.
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return { mime: "application/zip", ext: "zip", kind: "document" };
  const head = buf.subarray(0, 80).toString("latin1");
  if (head.startsWith("ISO-10303-21")) return { mime: "model/step", ext: "step", kind: "document" };
  if (head.startsWith("solid ")) return { mime: "model/stl", ext: "stl", kind: "document" };
  return null;
}

export const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic"]);

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 40 * 1024 * 1024;

/** Strip path components and anything outside a conservative charset. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || "file";
}
