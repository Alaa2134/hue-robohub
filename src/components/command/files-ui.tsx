"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { deleteFile, fileLink, uploadFile } from "@/server/actions/files";

const LIMIT = 4 * 1024 * 1024; // serverless request cap on the free tier

export function FileUploader({ folders }: { folders: readonly string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState(folders[0]!);
  const [status, setStatus] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async (files: File[]) => {
    setBusy(true);
    const out: string[] = [];
    for (const f of files.slice(0, 20)) {
      if (f.size > LIMIT) {
        out.push(`${f.name}: larger than 4 MB — share big CAD files as a Drive/GitHub link instead.`);
        continue;
      }
      const fd = new FormData();
      fd.set("file", f);
      fd.set("folder", folder);
      const r = await uploadFile(fd);
      out.push(r.ok ? `${f.name}: uploaded` : `${f.name}: ${r.error}`);
      setStatus([...out]);
    }
    setStatus(out);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder" className="h-10 rounded-lg border border-[var(--line-2)] bg-deep/70 px-3 text-sm text-mist">
          {folders.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <label className={cn("btn btn-primary btn-sm cursor-pointer", busy && "pointer-events-none opacity-70")}>
          <span aria-hidden className="btn-sheen" />
          <Icon name="plus" size={14} />
          <span>{busy ? "Uploading…" : "Upload files"}</span>
          <input ref={input} type="file" multiple className="sr-only" accept=".pdf,.docx,.xlsx,.pptx,.zip,.step,.stp,.stl,image/*" onChange={(e) => void run(Array.from(e.target.files ?? []))} />
        </label>
        <span className="text-xs text-fog">PDF, Office, ZIP, STEP/STL, images · up to 4 MB each</span>
      </div>
      {status.length > 0 && (
        <ul className="rounded-lg border border-[var(--line)] bg-deep/40 p-3 text-xs text-mist">
          {status.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FileActions({ id, name, canDelete }: { id: string; name: string; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <span className="relative z-10 flex justify-end gap-2">
      <button
        type="button"
        disabled={pending}
        className="btn btn-sm"
        onClick={() =>
          start(async () => {
            const r = await fileLink(id);
            if (r.ok) window.location.href = r.data.url;
            else alert(r.error);
          })
        }
      >
        <span>Download</span>
      </button>
      {canDelete && (
        <button type="button" disabled={pending} aria-label={`Delete ${name}`} className="btn btn-sm text-danger" onClick={() => confirm(`Delete ${name}?`) && start(async () => (await deleteFile(id), router.refresh()))}>
          <Icon name="close" size={13} />
        </button>
      )}
    </span>
  );
}
