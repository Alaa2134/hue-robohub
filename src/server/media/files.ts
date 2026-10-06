import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db, schema } from "../db";
import { env } from "../env";
import { AppError } from "../auth/errors";
import { enqueue } from "../jobs/queue";
import { MAX_DOCUMENT_BYTES, safeFilename, sniff } from "../security/file-signature";
import { storage } from "../storage";

/** Private documents (CVs, CAD, reports). Never publicly addressable; served via short-lived signed URLs. */
export async function ingestDocument(input: { buffer: Buffer; filename: string; folder?: string; uploadedBy?: string | null }) {
  if (input.buffer.length > MAX_DOCUMENT_BYTES) throw new AppError("BAD_REQUEST", "File is larger than 40 MB.");
  const sniffed = sniff(input.buffer);
  if (!sniffed) throw new AppError("VALIDATION", "Unsupported file type. Allowed: PDF, images, Office documents, ZIP, STEP, STL.");
  const id = randomUUID();
  const key = `files/${id}.${sniffed.ext}`;
  const filename = safeFilename(input.filename);
  // Office files are zip containers; keep the user's extension only when it is one we expect for zips.
  const mime =
    sniffed.mime === "application/zip"
      ? /\.docx$/i.test(filename)
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : /\.xlsx$/i.test(filename)
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : /\.pptx$/i.test(filename)
            ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            : "application/zip"
      : sniffed.mime;
  await storage().put("private", key, input.buffer, mime);
  const scanning = !!env().CLAMAV_HOST;
  const [row] = await db
    .insert(schema.mediaAssets)
    .values({
      id,
      kind: sniffed.kind === "image" ? "image" : "document",
      visibility: "private",
      originalKey: key,
      filename,
      mime,
      bytes: input.buffer.length,
      sha256: createHash("sha256").update(input.buffer).digest("hex"),
      folder: input.folder ?? "general",
      scanStatus: scanning ? "pending" : "skipped",
      uploadedBy: input.uploadedBy ?? null,
    })
    .returning();
  if (scanning) await enqueue("scan_file", { assetId: id });
  return row!;
}
