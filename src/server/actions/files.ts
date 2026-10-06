"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { runAction, type ActionResult } from "../action";
import { audit } from "../audit";
import { AppError } from "../auth/errors";
import { assertCan } from "../auth/guard";
import { db, schema as s } from "../db";
import { isUuid } from "../forms";
import { MAX_DOCUMENT_BYTES, safeFilename, sniff } from "../security/file-signature";
import { storage } from "../storage";

const FOLDERS = ["Datasheets", "CAD", "Reports", "Presentations", "Competition rules", "Templates", "Other"] as const;
const ZIP_EXT = new Set(["docx", "xlsx", "pptx", "zip"]);

/** Private document upload (PDF, Office, STEP/STL, images). One file per request; content is sniffed, never trusted by name. */
export async function uploadFile(form: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "files.manage");
    const file = form.get("file");
    const folder = String(form.get("folder") ?? "Other");
    if (!(file instanceof File) || !file.size) throw new AppError("BAD_REQUEST", "No file received.");
    if (!(FOLDERS as readonly string[]).includes(folder)) throw new AppError("BAD_REQUEST", "Pick a folder.");
    if (file.size > MAX_DOCUMENT_BYTES) throw new AppError("BAD_REQUEST", "File is too large.");
    const buf = Buffer.from(await file.arrayBuffer());
    const kind = sniff(buf);
    if (!kind) throw new AppError("VALIDATION", "Unsupported file. Use PDF, Word/Excel/PowerPoint, ZIP, STEP, STL or an image.");
    const name = safeFilename(file.name);
    const claimed = name.split(".").pop()?.toLowerCase() ?? "";
    const ext = kind.ext === "zip" && ZIP_EXT.has(claimed) ? claimed : kind.ext;
    const id = randomUUID();
    const key = `files/${id}.${ext}`;
    await storage().put("private", key, buf, kind.mime);
    await db.insert(s.mediaAssets).values({ id, kind: kind.kind === "image" ? "image" : "document", visibility: "private", originalKey: key, filename: name, mime: kind.mime, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), variants: [], folder: `files/${folder}`, uploadedBy: actor.userId });
    await audit(actor, { action: "file.uploaded", targetType: "file", targetId: id, summary: name, meta: { folder, bytes: buf.length } }, req);
    return { id };
  });
}

export async function deleteFile(id: string): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "files.manage");
    if (!isUuid(id)) throw new AppError("BAD_REQUEST", "Invalid file.");
    const [a] = await db.delete(s.mediaAssets).where(and(eq(s.mediaAssets.id, id), eq(s.mediaAssets.visibility, "private"))).returning();
    if (!a || !a.folder?.startsWith("files/")) throw new AppError("NOT_FOUND", "File not found.");
    await storage().delete("private", a.originalKey).catch(() => {});
    await audit(actor, { action: "file.deleted", targetType: "file", targetId: id, summary: a.filename }, req);
  });
}

/** Fresh 10-minute download link (checked against files.view every time). */
export async function fileLink(id: string): Promise<ActionResult<{ url: string }>> {
  return runAction(async ({ actor }) => {
    assertCan(actor, "files.view");
    if (!isUuid(id)) throw new AppError("BAD_REQUEST", "Invalid file.");
    const [a] = await db.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, id)).limit(1);
    if (!a || !a.folder?.startsWith("files/")) throw new AppError("NOT_FOUND", "File not found.");
    return { url: await storage().signedUrl(a.originalKey, 600, a.filename) };
  });
}
