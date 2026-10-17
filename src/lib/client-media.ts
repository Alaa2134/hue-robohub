/**
 * Everything that goes into a form (a visitor's file, a form's background) is made small in the browser
 * first: photos are scaled and re-encoded as JPEG, videos are re-recorded at a lower size and bitrate.
 * Nothing is uploaded until this is done. PDFs can't be shrunk here, so they only get a size limit.
 */
import { prepareImage } from "./client-image";

export type MediaKind = "image" | "video" | "pdf";
export type Prepared = { file: File; kind: MediaKind; before: number; after: number };

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

export function kindOf(file: { type: string; name?: string }): MediaKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name ?? "")) return "pdf";
  return null;
}

/** Container + codec combinations to try, best compression first. */
const RECORDER_TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
export function recorderType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export class MediaError extends Error {
  constructor(public code: "type" | "too_long" | "too_big" | "unsupported" | "failed") {
    super(code);
  }
}

type VideoOpts = {
  /** Longest side after scaling. */
  maxEdge?: number;
  bitsPerSecond?: number;
  maxSeconds?: number;
  /** Drop the sound (backgrounds). */
  mute?: boolean;
  /** Videos already smaller than this are kept. */
  keepBelow?: number;
  onProgress?: (p: number) => void;
};

/** Re-records a video through a canvas at a smaller size. Takes as long as the video lasts. */
export async function compressVideo(file: File, o: VideoOpts = {}): Promise<File> {
  const { maxEdge = 1280, bitsPerSecond = 1_800_000, maxSeconds = 60, mute = false, keepBelow = 3_000_000, onProgress } = o;
  const type = recorderType();
  if (!type) throw new MediaError("unsupported");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new MediaError("failed"));
    });
    // Recordings made in a browser report an endless length until the end has been reached once.
    if (video.duration === Infinity) {
      await new Promise<void>((resolve) => {
        video.ontimeupdate = () => {
          video.ontimeupdate = null;
          resolve();
        };
        video.currentTime = 1e101;
      });
      video.currentTime = 0;
    }
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new MediaError("failed");
    if (duration > maxSeconds + 0.5) throw new MediaError("too_long");
    const w0 = video.videoWidth || 1280;
    const h0 = video.videoHeight || 720;
    if (file.size <= keepBelow && Math.max(w0, h0) <= maxEdge && (file.type === "video/mp4" || file.type === "video/webm")) {
      onProgress?.(1);
      return file;
    }
    const scale = Math.min(1, maxEdge / Math.max(w0, h0));
    const w = Math.max(2, Math.round((w0 * scale) / 2) * 2);
    const h = Math.max(2, Math.round((h0 * scale) / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new MediaError("failed");
    const stream = canvas.captureStream(30);
    // Sound: route the (silent-to-the-speakers) element into the recording.
    let audio: AudioContext | null = null;
    if (!mute) {
      try {
        audio = new AudioContext();
        const dest = audio.createMediaStreamDestination();
        audio.createMediaElementSource(video).connect(dest);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
        video.muted = false;
      } catch {
        audio = null;
      }
    }
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bitsPerSecond, audioBitsPerSecond: 96_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
    let raf = 0;
    const draw = () => {
      ctx.drawImage(video, 0, 0, w, h);
      onProgress?.(Math.min(0.99, video.currentTime / duration));
      raf = video.paused || video.ended ? 0 : requestAnimationFrame(draw);
    };
    const ended = new Promise<void>((resolve) => (video.onended = () => resolve()));
    rec.start(500);
    await video.play();
    draw();
    await ended;
    cancelAnimationFrame(raf);
    ctx.drawImage(video, 0, 0, w, h);
    rec.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());
    void audio?.close();
    const base = type.split(";")[0];
    const blob = new Blob(chunks, { type: base });
    if (!blob.size) throw new MediaError("failed");
    onProgress?.(1);
    // Never hand back something bigger than what came in.
    if (blob.size >= file.size && (file.type === "video/mp4" || file.type === "video/webm")) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "video"}.${base === "video/mp4" ? "mp4" : "webm"}`, { type: base });
  } finally {
    video.pause();
    video.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}

type PrepareOpts = {
  /** What the place accepts. */
  accept: MediaKind[];
  /** Background pictures can be larger and sharper than attachments. */
  profile: "attachment" | "background";
  onProgress?: (p: number) => void;
};

/** Compress whatever the person picked, or say why it can't be used. Throws MediaError. */
export async function prepareMedia(file: File, { accept, profile, onProgress }: PrepareOpts): Promise<Prepared> {
  const kind = kindOf(file);
  if (!kind || !accept.includes(kind)) throw new MediaError("type");
  if (kind === "pdf") {
    if (file.size > MAX_PDF_BYTES) throw new MediaError("too_big");
    return { file, kind, before: file.size, after: file.size };
  }
  if (kind === "image") {
    const out = await prepareImage(file, profile === "background" ? { maxEdge: 1920, maxBytes: 500_000 } : { maxEdge: 1600, maxBytes: 900_000 });
    return { file: out, kind, before: file.size, after: out.size };
  }
  const out =
    profile === "background"
      ? await compressVideo(file, { maxEdge: 1280, bitsPerSecond: 1_200_000, maxSeconds: 30, mute: true, keepBelow: 2_500_000, onProgress })
      : await compressVideo(file, { maxEdge: 960, bitsPerSecond: 1_500_000, maxSeconds: 90, onProgress });
  if (out.size > MAX_VIDEO_BYTES) throw new MediaError("too_big");
  return { file: out, kind, before: file.size, after: out.size };
}

/** The reason for a MediaError, in the visitor's language. */
export function mediaErrorText(e: unknown, locale: "ar" | "en" = "ar"): string {
  const code = e instanceof MediaError ? e.code : "failed";
  const ar: Record<string, string> = {
    type: "نوع الملف مش مقبول هنا",
    too_long: "الفيديو أطول من المسموح",
    too_big: "الملف كبير حتى بعد الضغط",
    unsupported: "المتصفح ده مش بيضغط الفيديو، جرّب متصفح تاني أو فيديو أصغر",
    failed: "ماقدرناش نجهّز الملف، جرّب ملف تاني",
  };
  const en: Record<string, string> = {
    type: "This kind of file isn't accepted here",
    too_long: "The video is longer than allowed",
    too_big: "The file is too large even after compression",
    unsupported: "This browser can't compress video, try another browser or a smaller video",
    failed: "We couldn't prepare the file, try another one",
  };
  return (locale === "en" ? en : ar)[code];
}
