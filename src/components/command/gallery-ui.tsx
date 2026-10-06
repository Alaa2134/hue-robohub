"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/brand/icons";
import { prepareImage } from "@/lib/client-image";
import { cn } from "@/lib/cn";
import { deleteGalleryItem, setAlbumCover, updateGalleryItem, uploadGalleryPhoto } from "@/server/actions/gallery";

type Job = { name: string; state: "waiting" | "resizing" | "uploading" | "done" | "error"; error?: string };

/** Multi-photo uploader: resizes in the browser, then uploads one photo per request, 2 at a time. */
export function GalleryUploader({ albumId }: { albumId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drag, setDrag] = useState(false);
  const busy = jobs.some((j) => j.state !== "done" && j.state !== "error");

  const run = async (files: File[]) => {
    const list = files.filter((f) => /^image\/(jpeg|png|webp|avif)$/.test(f.type)).slice(0, 200);
    if (!list.length) return;
    const offset = jobs.length;
    setJobs((j) => [...j, ...list.map((f) => ({ name: f.name, state: "waiting" as const }))]);
    const set = (i: number, patch: Partial<Job>) => setJobs((j) => j.map((x, k) => (k === offset + i ? { ...x, ...patch } : x)));
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const i = next++;
        try {
          set(i, { state: "resizing" });
          const file = await prepareImage(list[i]!);
          set(i, { state: "uploading" });
          const fd = new FormData();
          fd.set("albumId", albumId);
          fd.set("file", file);
          const r = await uploadGalleryPhoto(fd);
          set(i, r.ok ? { state: "done" } : { state: "error", error: r.error });
        } catch {
          set(i, { state: "error", error: "Upload failed" });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    router.refresh();
  };

  const done = jobs.filter((j) => j.state === "done").length;
  return (
    <div className="flex flex-col gap-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void run(Array.from(e.dataTransfer.files));
        }}
        className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center text-sm transition-colors", drag ? "border-cyan bg-cyan/[0.06] text-chalk" : "border-[var(--line-2)] bg-deep/50 text-fog hover:border-cyan/50 hover:text-mist")}
      >
        <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(e) => void run(Array.from(e.target.files ?? []))} />
        <Icon name="image" size={22} />
        <span className="font-medium text-chalk">Drop photos here or click to choose</span>
        <span className="text-xs">Select many at once — phone photos are resized automatically and published to this album.</span>
      </label>
      {jobs.length > 0 && (
        <div className="rounded-xl border border-[var(--line)] bg-deep/40 p-3 text-xs">
          <p className="mb-2 font-mono text-fog">
            {busy ? `Uploading… ${done}/${jobs.length}` : `${done}/${jobs.length} uploaded`}
          </p>
          <ul className="max-h-40 space-y-1 overflow-auto">
            {jobs.map((j, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate text-mist">{j.name}</span>
                <span className={j.state === "done" ? "text-ok" : j.state === "error" ? "text-danger" : "text-fog"}>{j.state === "error" ? j.error : j.state}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export type GalleryTile = { id: string; assetId: string; thumb: string | null; caption: string | null; featured: boolean; published: boolean };

export function GalleryGrid({ albumId, coverId, items }: { albumId: string; coverId: string | null; items: GalleryTile[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });
  if (!items.length) return <p className="text-sm text-fog">No photos yet — upload some above.</p>;
  return (
    <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", pending && "opacity-80")}>
      {items.map((it) => (
        <li key={it.id} className={cn("group relative overflow-hidden rounded-xl border bg-deep", it.published ? "border-[var(--line)]" : "border-dashed border-warn/50")}>
          <div className="relative aspect-[4/3]">
            {it.thumb && <img src={it.thumb} alt="" loading="lazy" className={cn("absolute inset-0 size-full object-cover", !it.published && "opacity-40")} />}
            <div className="absolute start-2 top-2 flex gap-1.5">
              {coverId === it.assetId && <span className="rounded-full bg-gold/90 px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase text-void">Cover</span>}
              {it.featured && <span className="rounded-full bg-cyan/90 px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase text-void">Featured</span>}
              {!it.published && <span className="rounded-full bg-warn/90 px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase text-void">Hidden</span>}
            </div>
          </div>
          <div className="flex flex-col gap-2 p-2.5">
            <input
              defaultValue={it.caption ?? ""}
              placeholder="Caption…"
              maxLength={300}
              aria-label="Caption"
              onBlur={(e) => e.target.value !== (it.caption ?? "") && act(() => updateGalleryItem(it.id, { caption: e.target.value }))}
              className="h-8 w-full rounded-md border border-[var(--line)] bg-transparent px-2 text-xs text-mist outline-none placeholder:text-steel focus:border-cyan/60"
            />
            <div className="flex flex-wrap gap-1.5 text-[0.68rem]">
              {coverId !== it.assetId && (
                <button type="button" className="rounded-md border border-[var(--line-2)] px-2 py-1 text-fog hover:text-chalk" onClick={() => act(() => setAlbumCover(albumId, it.assetId))}>
                  Set cover
                </button>
              )}
              <button type="button" className="rounded-md border border-[var(--line-2)] px-2 py-1 text-fog hover:text-chalk" onClick={() => act(() => updateGalleryItem(it.id, { featured: !it.featured }))}>
                {it.featured ? "Unfeature" : "Feature"}
              </button>
              <button type="button" className="rounded-md border border-[var(--line-2)] px-2 py-1 text-fog hover:text-chalk" onClick={() => act(() => updateGalleryItem(it.id, { published: !it.published }))}>
                {it.published ? "Hide" : "Show"}
              </button>
              <button type="button" className="ms-auto rounded-md px-2 py-1 text-danger hover:bg-danger/10" onClick={() => confirm("Delete this photo?") && act(() => deleteGalleryItem(it.id))}>
                Delete
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
