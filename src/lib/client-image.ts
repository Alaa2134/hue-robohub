/**
 * Browser-side photo preparation before upload. Large phone photos are scaled to `maxEdge` and
 * re-encoded as JPEG so the request fits serverless body limits (Vercel: 4.5 MB) and uploads fast on
 * mobile data. Re-encoding also drops EXIF metadata such as GPS location. Orientation is baked in
 * because <img> decoding applies EXIF rotation, so crops measured on the preview stay valid.
 */
export async function prepareImage(file: File, { maxEdge = 2560, maxBytes = 3_500_000 } = {}): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    if (file.size <= maxBytes && long <= maxEdge) return file;
    let scale = Math.min(1, maxEdge / long);
    let quality = 0.9;
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.fillStyle = "#0b1324"; // transparent PNGs flatten onto the site's deep navy
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
      if (blob && blob.size <= maxBytes) return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
      quality = Math.max(0.65, quality - 0.08);
      scale *= 0.85;
    }
    return file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
