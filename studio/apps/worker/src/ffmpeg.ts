/** Running FFmpeg/FFprobe: real progress from -progress, cancellation by killing the process. */
import { spawn } from "node:child_process";

export type Tools = { ffmpeg: string; ffprobe: string };

export class Cancelled extends Error {
  constructor() {
    super("Cancelled");
  }
}

export function runFfmpeg(
  tools: Tools,
  args: string[],
  opts: { onProgress?: (seconds: number) => void; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<{ wallMs: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const p = spawn(tools.ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    let buf = "";
    let killed: "cancel" | "timeout" | null = null;
    p.stdout.on("data", (d: Buffer) => {
      buf += d.toString();
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        const m = line.match(/^out_time_(?:us|ms)=(\d+)/);
        if (m && opts.onProgress) opts.onProgress(Number(m[1]) / 1e6);
      }
    });
    p.stderr.on("data", (d: Buffer) => {
      err = (err + d.toString()).slice(-6000);
    });
    const kill = (why: "cancel" | "timeout") => {
      killed = why;
      p.kill("SIGKILL");
    };
    const onAbort = () => kill("cancel");
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = opts.timeoutMs ? setTimeout(() => kill("timeout"), opts.timeoutMs) : null;
    p.on("error", (e) => reject(e));
    p.on("close", (code) => {
      opts.signal?.removeEventListener("abort", onAbort);
      if (timer) clearTimeout(timer);
      if (killed === "cancel") return reject(new Cancelled());
      if (killed === "timeout") return reject(new Error("FFmpeg took too long and was stopped."));
      if (code !== 0) return reject(new Error(`FFmpeg failed (${code}): ${lastLines(err)}`));
      resolve({ wallMs: Date.now() - started });
    });
  });
}

function lastLines(s: string): string {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-4)
    .join(" | ")
    .slice(0, 800);
}

export type Probe = {
  kind: "video" | "image" | "audio";
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
  codec: string | null;
  pixFmt: string | null;
  format: string;
};

type FfStream = {
  codec_type: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  pix_fmt?: string;
  duration?: string;
  nb_frames?: string;
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number }[];
  disposition?: { attached_pic?: number };
};

const IMAGE_FORMATS = /^(image2|png_pipe|jpeg_pipe|webp_pipe|bmp_pipe|tiff_pipe|gif|svg_pipe|qoi_pipe|jpegxl_pipe|avif)/;

export function probe(tools: Tools, file: string): Promise<Probe> {
  return new Promise((resolve, reject) => {
    const p = spawn(tools.ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Not a readable media file: ${err.trim().slice(0, 300) || `ffprobe exited ${code}`}`));
      try {
        const j = JSON.parse(out) as { streams?: FfStream[]; format?: { format_name?: string; duration?: string } };
        const streams = j.streams ?? [];
        const format = j.format?.format_name ?? "";
        const v = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
        const a = streams.find((s) => s.codec_type === "audio");
        const dur = Number(j.format?.duration ?? v?.duration ?? a?.duration);
        const rate = (r?: string) => {
          if (!r) return null;
          const [n, d] = r.split("/").map(Number);
          return d ? Math.round((n / d) * 1000) / 1000 : null;
        };
        const still = !!v && (IMAGE_FORMATS.test(format) || (v.nb_frames === "1" && !a) || (!Number.isFinite(dur) && !a));
        const kind: Probe["kind"] = v ? (still ? "image" : "video") : a ? "audio" : (() => { throw new Error("No picture or sound in this file."); })();
        let width = v?.width ?? null;
        let height = v?.height ?? null;
        const rot = Number(v?.side_data_list?.find((s) => s.rotation != null)?.rotation ?? v?.tags?.rotate ?? 0);
        // FFmpeg turns rotated phone videos upright when decoding; report the upright size.
        if (Math.abs(rot) % 180 === 90 && width && height) [width, height] = [height, width];
        resolve({
          kind,
          duration: kind === "image" || !Number.isFinite(dur) ? null : Math.round(dur * 1000) / 1000,
          width,
          height,
          fps: kind === "video" ? rate(v?.avg_frame_rate) ?? rate(v?.r_frame_rate) : null,
          hasAudio: !!a,
          codec: (kind === "audio" ? a?.codec_name : v?.codec_name) ?? null,
          pixFmt: v?.pix_fmt ?? null,
          format,
        });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  });
}

/** Loudness peaks for the timeline's waveform (20 per second, 0–1), from the decoded sound. */
export function waveform(tools: Tools, file: string, duration: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const rate = 8000;
    const per = Math.max(1, Math.ceil(duration * 20) > 20000 ? Math.ceil((rate * duration) / 20000) : rate / 20);
    const p = spawn(tools.ffmpeg, ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(rate), "-f", "s16le", "-"]);
    const peaks: number[] = [];
    let max = 0;
    let n = 0;
    let carry: Buffer | null = null;
    p.stdout.on("data", (d: Buffer) => {
      const b = carry ? Buffer.concat([carry, d]) : d;
      const even = b.length - (b.length % 2);
      for (let i = 0; i < even; i += 2) {
        const v = Math.abs(b.readInt16LE(i));
        if (v > max) max = v;
        if (++n >= per) {
          peaks.push(Math.round((max / 32768) * 100) / 100);
          max = 0;
          n = 0;
        }
      }
      carry = even < b.length ? b.subarray(even) : null;
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(peaks) : reject(new Error("Could not read the sound."))));
  });
}
