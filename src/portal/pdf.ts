"use client";
/**
 * PDFs made on the device, without the print dialog (which the store apps don't have): each page is
 * a rendered element (certificate, sheet of student cards) turned into a JPEG and placed full-page in
 * a minimal PDF. The file then downloads (website) or opens the share sheet (apps), see download().
 */
import { download } from "./core";

const A4 = { w: 595.28, h: 841.89 }; // points

type Jpeg = { bytes: Uint8Array; width: number; height: number };

async function capture(node: HTMLElement, widthPx: number): Promise<Jpeg> {
  const { toJpeg } = await import("html-to-image");
  const ratio = widthPx / node.offsetWidth;
  const opts = { quality: 0.92, pixelRatio: ratio, backgroundColor: "#ffffff", cacheBust: false };
  // WebKit sometimes paints images inside the snapshot only on the second pass.
  await toJpeg(node, opts).catch(() => undefined);
  const url = await toJpeg(node, opts);
  const bin = atob(url.slice(url.indexOf(",") + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, width: Math.round(node.offsetWidth * ratio), height: Math.round(node.offsetHeight * ratio) };
}

/** A PDF with one full-page JPEG per page. */
export function jpegsToPdf(pages: Jpeg[], landscape: boolean): Blob {
  const pw = landscape ? A4.h : A4.w;
  const ph = landscape ? A4.w : A4.h;
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (part: string | Uint8Array) => {
    const b = typeof part === "string" ? enc.encode(part) : part;
    chunks.push(b);
    size += b.length;
  };
  const obj = (n: number, body: () => void) => {
    offsets[n] = size;
    push(`${n} 0 obj\n`);
    body();
    push("\nendobj\n");
  };

  // 1 catalog, 2 page tree, then 3 objects per page: page, content, image.
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`));
  pages.forEach((p, i) => {
    const page = 3 + i * 3;
    // Fit the image into the page, centred, keeping its shape.
    const scale = Math.min(pw / p.width, ph / p.height);
    const w = p.width * scale;
    const h = p.height * scale;
    const content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${((pw - w) / 2).toFixed(2)} ${((ph - h) / 2).toFixed(2)} cm /Im0 Do Q`;
    obj(page, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`));
    obj(page + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(page + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);
      push(p.bytes);
      push("\nendstream");
    });
  });
  const count = 3 + pages.length * 3;
  const xref = size;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

/** Render each element as one A4 page and save or share the PDF. */
export async function saveNodesAsPdf(nodes: HTMLElement[], name: string, o: { landscape?: boolean; widthPx?: number } = {}) {
  const pages: Jpeg[] = [];
  for (const n of nodes) pages.push(await capture(n, o.widthPx ?? 2000));
  download(jpegsToPdf(pages, !!o.landscape), name);
}
