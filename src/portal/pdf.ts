"use client";
/**
 * PDFs made on the device, without the print dialog (which the store apps don't have): each page is
 * a rendered element (certificate, sheet of student cards) turned into a JPEG and placed full-page in
 * a minimal PDF. The file then downloads (website) or opens the share sheet (apps), see download().
 */
import { nodesToPdf } from "@/lib/pdf-lite";
import { download } from "./core";

/** Render each element as one A4 page and save or share the PDF. */
export async function saveNodesAsPdf(nodes: HTMLElement[], name: string, o: { landscape?: boolean; widthPx?: number; pageMm?: { w: number; h: number } } = {}) {
  download(await nodesToPdf(nodes, o), name);
}
