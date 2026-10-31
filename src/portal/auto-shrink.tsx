"use client";
/**
 * The site's photos shrink by themselves: whenever someone who manages the site has the app open,
 * heavy photos are quietly re-encoded on their device (squeezed until light, see prepareImage), saved
 * under a new name, their content item pointed at the new copy, and only then the old file removed.
 * One photo at a time, when the device is idle, at most a batch per visit; nobody presses anything.
 */
import { useEffect } from "react";
import { publicImageUrl } from "@/lib/site-content";
import { can, fmt, must, prepareImage, removeObjects, rpc, sb, uploadImage, type StaffRow } from "./core";
import { toast } from "./ui";

export type Heavy = { id: string; path: string; size: number };

/** Photos heavier than this are worth shrinking. */
export const HEAVY = 180_000;
const PER_VISIT = 25;

/** One photo made light. Returns the bytes saved (0 when it was left as it was). */
export async function shrinkOne(x: Heavy): Promise<number> {
  const res = await fetch(publicImageUrl("site", x.path));
  if (!res.ok) throw new Error(String(res.status));
  const blob = await res.blob();
  const light = await prepareImage(blob);
  // Not worth it (already about as light as it gets): leave it.
  if (light.main.size > x.size * 0.8) return 0;
  const up = await uploadImage("site", x.path.split("/").slice(0, -1).join("/") || "shrunk", blob);
  const rows = await sb().from("site_content").update({ image_path: up.path }).eq("id", x.id).eq("image_path", x.path).select("id").then(must);
  if (!rows?.length) {
    // The item changed meanwhile (or someone else shrank it first): drop the new copy, keep theirs.
    await removeObjects([up.path], "site").catch(() => undefined);
    return 0;
  }
  await removeObjects([x.path], "site").catch(() => undefined);
  return Math.max(0, x.size - up.after);
}

const idle = () =>
  new Promise<void>((ok) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    if (w.requestIdleCallback) w.requestIdleCallback(() => ok(), { timeout: 4000 });
    else setTimeout(ok, 400);
  });

/** One run at a time on this device (the background one or the one in view). */
export const shrinking = { now: false };

/** Mounted once in the team app: shrinks a batch of heavy site photos in the background. */
export function AutoShrink({ me, here }: { me: StaffRow; here: string }) {
  // Not on the photo screen, where the same job runs in view with its own progress bar.
  const allowed = can(me, "site") && here !== "photo-frame";
  useEffect(() => {
    if (!allowed || shrinking.now) return;
    let live = true;
    // Give the app a moment to settle first (and skip short visits).
    const start = setTimeout(async () => {
      if (!live || shrinking.now) return;
      shrinking.now = true;
      let saved = 0,
        done = 0;
      try {
        const list = ((await rpc<Heavy[]>("staff_heavy_site_images", { p_min: HEAVY })) ?? []).slice(0, PER_VISIT);
        for (const x of list) {
          if (!live || document.hidden) break;
          await idle();
          try {
            const s = await shrinkOne(x);
            if (s) (saved += s), done++;
          } catch {
            /* this one stays as it is; the next visit tries again */
          }
        }
      } catch {
        /* no access or offline: nothing to do */
      } finally {
        shrinking.now = false;
      }
      if (done && live) toast(`صغّرت ${done} صورة من صور الموقع لوحدي ووفّرت ${fmt.size(saved)} ✨`, "ok");
    }, 8000);
    return () => {
      live = false;
      clearTimeout(start);
    };
  }, [allowed]);
  return null;
}
