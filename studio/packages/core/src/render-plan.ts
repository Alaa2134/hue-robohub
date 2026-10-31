/**
 * Timeline → one FFmpeg command (inputs, filter graph, H.264/AAC output). Pure: the worker only
 * resolves files and runs it. Every visual clip becomes a layer that's fitted, moved, faded and laid
 * over the ones below at its time; every clip with sound is trimmed, faded, delayed to its time and
 * mixed. Frame-accurate: the output runs at the project's fps from a solid background of the exact
 * length, and each layer is retimed onto it.
 */
import { round3, type AssetInfo, type Clip, type MediaClip, type Timeline } from "./edl.ts";
import { duration as timelineDuration, end } from "./timeline.ts";
import { titleMotionExpr } from "./titles.ts";

export type Quality = "draft" | "standard" | "high";

export type RenderInput = {
  timeline: Timeline;
  /** Probed info for every asset the timeline uses. */
  assets: Map<string, AssetInfo>;
  /** Local file for every asset id, and for every text clip id (a transparent full-frame PNG of the title). */
  files: Map<string, string>;
  output: { path: string; width: number; height: number; fps: 24 | 25 | 30 | 60; quality: Quality; maxSeconds?: number };
};

export type RenderPlan = { args: string[]; duration: number; frames: number; layers: number; sounds: number };

const ENC: Record<Quality, { preset: string; crf: number; audio: string }> = {
  draft: { preset: "veryfast", crf: 26, audio: "128k" },
  standard: { preset: "faster", crf: 20, audio: "192k" },
  high: { preset: "medium", crf: 17, audio: "256k" },
};

const f3 = (n: number) => String(round3(n));
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const hex = (c: string) => `0x${c.replace("#", "")}`;

/** atempo only takes 0.5–2 per stage; chain stages for 0.25–4. */
function atempo(speed: number): string[] {
  const out: string[] = [];
  let s = speed;
  while (s > 2) (out.push("atempo=2"), (s /= 2));
  while (s < 0.5) (out.push("atempo=0.5"), (s /= 0.5));
  if (Math.abs(s - 1) > 1e-3) out.push(`atempo=${s.toFixed(4)}`);
  return out;
}

type Layer = { clip: Clip; trackIndex: number; tail: number; dipOut: number };

export function planRender(input: RenderInput): RenderPlan {
  const { timeline, assets, files, output } = input;
  const W = even(output.width);
  const H = even(output.height);
  const FPS = output.fps;
  // Positions are fractions of the frame, sizes scale with it: render size may differ from the project's.
  const total = round3(Math.min(timelineDuration(timeline), output.maxSeconds ?? Infinity));
  if (total < 0.04) throw new Error("The timeline is empty.");
  const frames = Math.round(total * FPS);
  const DUR = frames / FPS;

  const args: string[] = ["-hide_banner", "-nostdin", "-y"];
  const graph: string[] = [];
  let inputs = 0;
  const addInput = (a: string[]) => {
    args.push(...a);
    return inputs++;
  };

  // Base: the background, exactly the output length.
  graph.push(`color=c=${hex(timeline.settings.background)}:s=${W}x${H}:r=${FPS}:d=${f3(DUR)},format=yuv420p,setsar=1[base]`);

  // Visual layers, bottom track first, then by time.
  const layers: Layer[] = [];
  timeline.tracks.forEach((track, ti) => {
    if (track.kind !== "video" || track.hidden) return;
    const clips = [...track.clips].sort((a, b) => a.start - b.start).filter((c) => c.start < DUR);
    clips.forEach((clip, k) => {
      const next = clips[k + 1];
      // A crossfade into the next clip needs this one to keep playing under it.
      let tail = 0;
      if (next?.type === "media" && next.transitionIn?.kind === "crossfade" && Math.abs(next.start - end(clip)) < 0.02) {
        tail = next.transitionIn.duration;
        if (clip.type === "media") {
          const a = assets.get(clip.assetId);
          if (a?.kind === "video" && a.duration != null) tail = Math.max(0, Math.min(tail, (a.duration - clip.in) / clip.speed - clip.duration));
        }
      }
      // A dip into the next clip takes this one down to black first.
      const dipOut = next?.type === "media" && next.transitionIn?.kind === "dip" && Math.abs(next.start - end(clip)) < 0.02 ? next.transitionIn.duration : 0;
      layers.push({ clip, trackIndex: ti, tail: round3(tail), dipOut });
    });
  });

  let last = "base";
  let n = 0;
  for (const L of layers) {
    const c = L.clip;
    const file = files.get(c.type === "media" ? c.assetId : c.id);
    if (!file) throw new Error(`Missing file for ${c.type === "media" ? `asset ${c.assetId}` : `title ${c.id}`}.`);
    const len = round3(Math.min(c.duration + L.tail, DUR - c.start + L.tail));
    const asset = c.type === "media" ? assets.get(c.assetId) : null;
    if (c.type === "media" && !asset) throw new Error(`Unknown asset ${c.assetId}.`);
    const still = c.type === "text" || asset?.kind === "image";
    const idx = still
      ? addInput(["-loop", "1", "-framerate", String(FPS), "-t", f3(len), "-i", file])
      : addInput(["-ss", f3((c as MediaClip).in), "-t", f3(len * (c as MediaClip).speed), "-i", file]);

    const f: string[] = [];
    if (!still) f.push(`setpts=(PTS-STARTPTS)/${(c as MediaClip).speed}`);
    f.push(`fps=${FPS}`);
    const tr = c.transform;
    const lw = even(W * tr.scale);
    const lh = even(H * tr.scale);
    let pre = ""; // a sub-graph before the chain (the blurred background fit)
    if (c.type === "text") {
      // Titles are drawn at full frame size by the worker; only scale with the layer.
      if (tr.scale !== 1) f.push(`scale=${lw}:${lh}`);
    } else {
      const m = (c as MediaClip).motion;
      const fit = (c as MediaClip).fit;
      if (m) {
        // Ken Burns: fill a frame slightly bigger, then zoom/pan across it frame by frame.
        const big = Math.min(2, 4096 / Math.max(W, H));
        const BW = even(W * big);
        const BH = even(H * big);
        const N = Math.max(1, Math.round(len * FPS) - 1);
        const p = `min(on/${N},1)`;
        const z = `(${m.from.scale}+(${m.to.scale - m.from.scale})*${p})`;
        const dx = `(${m.from.x}+(${m.to.x - m.from.x})*${p})`;
        const dy = `(${m.from.y}+(${m.to.y - m.from.y})*${p})`;
        f.push(`scale=${BW}:${BH}:force_original_aspect_ratio=increase`, `crop=${BW}:${BH}`, "setsar=1");
        f.push(
          `zoompan=z='${z}':x='max(0,min(iw-iw/zoom,(iw-iw/zoom)/2+${dx}*iw/2))':y='max(0,min(ih-ih/zoom,(ih-ih/zoom)/2+${dy}*ih/2))':d=1:s=${W}x${H}:fps=${FPS}`,
        );
        if (tr.scale !== 1) f.push(`scale=${lw}:${lh}`);
      } else if (fit === "contain") {
        f.push(`scale=${lw}:${lh}:force_original_aspect_ratio=decrease`);
      } else if (fit === "blur") {
        pre = `[${idx}:v]${f.join(",")},split=2[bg${n}][fg${n}];[bg${n}]scale=${lw}:${lh}:force_original_aspect_ratio=increase,crop=${lw}:${lh},boxblur=24:6,eq=brightness=-0.08[bgb${n}];[fg${n}]scale=${lw}:${lh}:force_original_aspect_ratio=decrease[fgs${n}];[bgb${n}][fgs${n}]overlay=(W-w)/2:(H-h)/2`;
        f.length = 0;
      } else {
        f.push(`scale=${lw}:${lh}:force_original_aspect_ratio=increase`, `crop=${lw}:${lh}`);
      }
    }
    const tail: string[] = ["setsar=1"];
    // Color correction (eq: brightness/contrast/saturation; colorbalance: warm ↔ cool).
    const col = c.type === "media" ? c.color : null;
    if (col) {
      if (col.brightness !== 0 || col.contrast !== 1 || col.saturation !== 1) tail.push(`eq=brightness=${col.brightness.toFixed(3)}:contrast=${col.contrast.toFixed(3)}:saturation=${col.saturation.toFixed(3)}`);
      if (col.temperature !== 0) {
        const k = col.temperature;
        tail.push(`colorbalance=rs=${(0.06 * k).toFixed(3)}:bs=${(-0.06 * k).toFixed(3)}:rm=${(0.1 * k).toFixed(3)}:gm=${(0.02 * k).toFixed(3)}:bm=${(-0.1 * k).toFixed(3)}:rh=${(0.05 * k).toFixed(3)}:bh=${(-0.05 * k).toFixed(3)}`);
      }
    }
    if (tr.rotation) tail.push(`rotate=${((tr.rotation * Math.PI) / 180).toFixed(5)}:c=none:ow=rotw(${((tr.rotation * Math.PI) / 180).toFixed(5)}):oh=roth(${((tr.rotation * Math.PI) / 180).toFixed(5)})`);
    tail.push("format=yuva420p");
    if (tr.opacity < 1) tail.push(`colorchannelmixer=aa=${tr.opacity.toFixed(3)}`);
    const t = c.type === "media" ? c.transitionIn : null;
    const fadeIn = Math.max(c.fadeIn, t && t.kind !== "none" && t.kind !== "fade" && t.kind !== "dip" ? t.duration : 0);
    const visible = round3(Math.min(c.duration, DUR - c.start));
    if (t && (t.kind === "fade" || t.kind === "dip") && t.duration > 0) tail.push(`fade=t=in:st=0:d=${f3(Math.min(t.duration, visible))}`);
    if (fadeIn > 0 && t?.kind !== "slide-left" && t?.kind !== "slide-up") tail.push(`fade=t=in:st=0:d=${f3(Math.min(fadeIn, visible))}:alpha=1`);
    const fadeOut = c.fadeOut;
    if (fadeOut > 0) tail.push(`fade=t=out:st=${f3(Math.max(0, visible - fadeOut))}:d=${f3(Math.min(fadeOut, visible))}:alpha=1`);
    if (L.dipOut > 0) tail.push(`fade=t=out:st=${f3(Math.max(0, visible - L.dipOut))}:d=${f3(Math.min(L.dipOut, visible))}`);
    tail.push(`setpts=PTS-STARTPTS+${f3(c.start)}/TB`);
    const chain = pre ? `${pre},${tail.join(",")}[l${n}]` : `[${idx}:v]${[...f, ...tail].join(",")}[l${n}]`;
    graph.push(chain);

    // Where it sits: centered, plus the offset; slides animate in from the edge.
    // (a title's position is already drawn into its full-frame image)
    let x = `(W-w)/2+${f3(tr.x * (W / 2))}`;
    let y = `(H-h)/2+${f3(tr.y * (H / 2))}`;
    if (c.type === "text") {
      // Its in/out movement (the same curve as the preview's titleMotion()).
      const m = titleMotionExpr(c, W, H);
      x = m.x === "0" ? "(W-w)/2" : `(W-w)/2+${m.x}`;
      y = m.y === "0" ? "(H-h)/2" : `(H-h)/2+${m.y}`;
    }
    if (t?.kind === "slide-left" && t.duration > 0) x = `${x}+W*max(0,1-(t-${f3(c.start)})/${f3(t.duration)})`;
    if (t?.kind === "slide-up" && t.duration > 0) y = `${y}+H*max(0,1-(t-${f3(c.start)})/${f3(t.duration)})`;
    const until = round3(Math.min(DUR, c.start + c.duration + L.tail));
    graph.push(`[${last}][l${n}]overlay=x='${x}':y='${y}':eof_action=pass:enable='between(t,${f3(c.start)},${f3(until - 0.0005)})'[o${n}]`);
    last = `o${n}`;
    n++;
  }

  graph.push(`[${last}]format=yuv420p[vout]`);

  // Sound.
  const sounds: string[] = [];
  const ducked: string[] = [];
  let s = 0;
  timeline.tracks.forEach((track) => {
    if (track.muted) return;
    for (const c of track.clips) {
      if (c.type !== "media" || c.volume <= 0 || c.start >= DUR) continue;
      const a = assets.get(c.assetId);
      if (!a || !(a.kind === "audio" || (a.kind === "video" && a.hasAudio))) continue;
      const len = round3(Math.min(c.duration, DUR - c.start));
      const file = files.get(c.assetId);
      if (!file) throw new Error(`Missing file for asset ${c.assetId}.`);
      const idx = addInput(["-ss", f3(c.in), "-t", f3(len * c.speed), "-i", file]);
      const chain = [
        "aresample=48000",
        "aformat=sample_fmts=fltp:channel_layouts=stereo",
        "asetpts=PTS-STARTPTS",
        ...atempo(c.speed),
        `volume=${c.volume.toFixed(3)}`,
        ...(c.fadeIn > 0 ? [`afade=t=in:st=0:d=${f3(Math.min(c.fadeIn, len))}`] : []),
        ...(c.fadeOut > 0 ? [`afade=t=out:st=${f3(Math.max(0, len - c.fadeOut))}:d=${f3(Math.min(c.fadeOut, len))}`] : []),
        `adelay=${Math.round(c.start * 1000)}:all=1`,
      ];
      graph.push(`[${idx}:a]${chain.join(",")}[s${s}]`);
      (c.duck ? ducked : sounds).push(`[s${s}]`);
      s++;
    }
  });
  const mix = (ins: string[], out: string, extra = "") => graph.push(`${ins.join("")}${ins.length > 1 ? `amix=inputs=${ins.length}:normalize=0:dropout_transition=0` : "anull"}${extra}[${out}]`);
  const finish = ",alimiter=limit=0.95,apad,atrim=0:" + f3(DUR);
  if (ducked.length && sounds.length) {
    // The other sound drives a compressor on the music (sidechain): the music dips while people talk.
    mix(sounds, "voice0");
    graph.push("[voice0]asplit=2[voice][sc]");
    mix(ducked, "music0");
    graph.push("[music0][sc]sidechaincompress=threshold=0.04:ratio=8:attack=40:release=600:makeup=1[music]");
    mix(["[voice]", "[music]"], "aout", finish);
  } else if (sounds.length || ducked.length) {
    mix([...sounds, ...ducked], "aout", finish);
  } else {
    const idx = addInput(["-f", "lavfi", "-t", f3(DUR), "-i", "anullsrc=r=48000:cl=stereo"]);
    graph.push(`[${idx}:a]atrim=0:${f3(DUR)}[aout]`);
  }

  const enc = ENC[output.quality];
  args.push(
    "-filter_complex",
    graph.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    enc.preset,
    "-crf",
    String(enc.crf),
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(FPS),
    "-g",
    String(FPS * 2),
    "-c:a",
    "aac",
    "-b:a",
    enc.audio,
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    f3(DUR),
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    output.path,
  );
  return { args, duration: DUR, frames, layers: layers.length, sounds: sounds.length + ducked.length };
}

/** Rough render time and cost before starting (CPU seconds per output second by size and quality). */
export function estimateRender(seconds: number, width: number, height: number, fps: number, quality: Quality, layers: number) {
  const mp = (width * height) / 1e6;
  const q = quality === "draft" ? 0.5 : quality === "standard" ? 1 : 2;
  const cpuSeconds = round3(seconds * (fps / 30) * mp * q * (0.6 + layers * 0.03));
  return { cpuSeconds, wallSeconds: Math.ceil(cpuSeconds / 2) };
}
