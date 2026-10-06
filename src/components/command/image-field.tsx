"use client";
import { useRef, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { prepareImage } from "@/lib/client-image";
import { cn } from "@/lib/cn";

/** Single image input with preview, drop zone, browser-side resize and remove. */
export function ImageField({ name, label, currentUrl, aspect = "16/9", hint }: { name: string; label: string; currentUrl?: string | null; aspect?: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async (f?: File | null) => {
    if (!f || !/^image\/(jpeg|png|webp|avif)$/.test(f.type)) return;
    setBusy(true);
    const ready = await prepareImage(f);
    setBusy(false);
    if (input.current) {
      const dt = new DataTransfer();
      dt.items.add(ready);
      input.current.files = dt.files;
    }
    setRemoved(false);
    setPreview(URL.createObjectURL(ready));
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[0.78rem] font-medium text-frost">{label}</span>
      <input ref={input} id={name} type="file" name={name} accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      {removed && <input type="hidden" name={`${name}_remove`} value="1" />}
      <label
        htmlFor={name}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void pick(e.dataTransfer.files?.[0]);
        }}
        className={cn("relative flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-[var(--line-2)] bg-deep/60 text-sm text-fog transition-colors hover:border-cyan/50 hover:text-mist")}
        style={{ aspectRatio: aspect }}
      >
        {busy ? (
          "Preparing image…"
        ) : preview && !removed ? (
          <img src={preview} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 p-4 text-center">
            <Icon name="image" size={20} />
            Drop an image or click to upload
          </span>
        )}
      </label>
      <div className="flex items-center gap-3 text-xs">
        {hint && <span className="text-fog">{hint}</span>}
        {preview && !removed && (
          <button
            type="button"
            className="ms-auto text-danger hover:underline"
            onClick={() => {
              setRemoved(true);
              setPreview(null);
              if (input.current) input.current.value = "";
            }}
          >
            Remove image
          </button>
        )}
      </div>
    </div>
  );
}
