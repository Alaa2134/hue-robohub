/**
 * Photos (and the words that go with them) to the phone's gallery or straight into WhatsApp,
 * Instagram, Facebook… through the system share sheet. Where the browser can't share files
 * (most desktops), each photo is saved as its own file and the words are copied, ready to paste.
 *
 * Browsers only open the share sheet right after a tap, so prepare the files first and call
 * shareOrSave from the tap itself.
 */

export type ShareResult = "shared" | "saved" | "cancelled";

type Nav = Navigator & { canShare?: (d: ShareData) => boolean };

export const canShareFiles = (files: File[]) => {
  if (typeof navigator === "undefined" || !files.length) return false;
  const nav = navigator as Nav;
  return typeof nav.share === "function" && !!nav.canShare?.({ files });
};

/** Save a blob as a file (a download link the browser keeps). */
export function saveFile(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 10_000);
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Open the share sheet with the photos and the words; or save the photos and copy the words. */
export async function shareOrSave(files: File[], text = "", title = ""): Promise<ShareResult> {
  if (canShareFiles(files)) {
    try {
      await navigator.share({ files, ...(text ? { text } : {}), ...(title ? { title } : {}) });
      // Some apps drop the text when photos come with it: it's on the clipboard too.
      if (text) void copy(text);
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Not allowed (the tap was too long ago) or failed: fall back to saving.
    }
  }
  files.forEach((f, i) => setTimeout(() => saveFile(f, f.name), i * 250));
  if (text) await copy(text);
  return "saved";
}

/** A photo from a URL as a File, named after the event (for sharing or saving). */
export async function fileFromUrl(url: string, name: string): Promise<File> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`photo ${res.status}`);
  const blob = await res.blob();
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${name}.${ext}`, { type: blob.type || "image/jpeg" });
}

/** As a JPEG (WebP photos don't go everywhere: Instagram and some WhatsApp versions refuse them). */
export async function asJpeg(file: File): Promise<File> {
  if (file.type === "image/jpeg") return file;
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.9));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
}

/** Just words: the share sheet, or copied where there's none. */
export async function shareText(text: string): Promise<ShareResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  await copy(text);
  return "saved";
}

/** Share sheets take a limited number of files at once (WhatsApp: 30). */
export const SHARE_BATCH = 30;
export const batches = <T>(list: T[], size = SHARE_BATCH): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
