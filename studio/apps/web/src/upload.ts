/** Resumable uploads (TUS): a dropped connection picks up where it stopped instead of starting over. */
import * as tus from "tus-js-client";
import { api, token, type UploadTarget } from "./api.ts";

export type UploadState = { id: string; name: string; size: number; sent: number; status: "uploading" | "processing" | "error"; error?: string; assetId?: string };

export function uploadFile(projectId: string, file: File, onState: (s: Partial<UploadState>) => void): { cancel: () => void; done: Promise<string> } {
  let up: tus.Upload | null = null;
  let stopped = false;
  const done = (async () => {
    const t = await api<{ assetId: string; upload: UploadTarget }>("POST", `/projects/${projectId}/uploads`, { name: file.name, size: file.size, type: file.type });
    onState({ assetId: t.assetId });
    const headers = { ...t.upload.headers };
    await new Promise<void>((resolve, reject) => {
      up = new tus.Upload(file, {
        endpoint: t.upload.endpoint,
        headers,
        metadata: t.upload.metadata,
        chunkSize: t.upload.chunkSize,
        retryDelays: [0, 1500, 4000, 8000, 15000, 30000],
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        // Supabase checks the person's own session on every chunk (it may refresh during a long upload).
        onBeforeRequest: async (req) => {
          if (t.upload.auth === "session") req.setHeader("authorization", `Bearer ${await token()}`);
        },
        onProgress: (sent) => onState({ sent }),
        onError: (e) => reject(e),
        onSuccess: () => resolve(),
      });
      if (stopped) return reject(new Error("cancelled"));
      up.findPreviousUploads().then((prev) => {
        if (prev.length) up!.resumeFromPreviousUpload(prev[0]);
        up!.start();
      });
    });
    onState({ status: "processing", sent: file.size });
    await api("POST", `/projects/${projectId}/assets/${t.assetId}/complete`);
    return t.assetId;
  })();
  done.catch((e: Error) => onState({ status: "error", error: e.message }));
  return {
    cancel: () => {
      stopped = true;
      void (up as tus.Upload | null)?.abort(true);
    },
    done,
  };
}
