/** Test media made with FFmpeg's own generators (no real people, no downloads). */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export function makeFixtures(dir: string, ffmpeg = "ffmpeg") {
  mkdirSync(dir, { recursive: true });
  const run = (args: string[]) => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
  const videos: string[] = [];
  const sources = ["testsrc2", "smptehdbars", "mandelbrot", "rgbtestsrc", "testsrc"];
  sources.forEach((src, i) => {
    const f = path.join(dir, `video-${i + 1}.mp4`);
    if (!existsSync(f)) {
      const size = i % 2 ? "1280x720" : "720x1280";
      run(["-f", "lavfi", "-i", `${src}=size=${size}:rate=30`, "-f", "lavfi", "-i", `sine=frequency=${300 + i * 110}:sample_rate=48000`, "-t", "6", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", f]);
    }
    videos.push(f);
  });
  const images: string[] = [];
  for (let i = 0; i < 10; i++) {
    const f = path.join(dir, `image-${i + 1}.${i % 3 === 0 ? "png" : "jpg"}`);
    if (!existsSync(f)) {
      const hue = (i * 36) % 360;
      run(["-f", "lavfi", "-i", `gradients=size=${i % 2 ? "1600x1200" : "1080x1350"}:seed=${i + 1}:duration=1`, "-vf", `hue=h=${hue}`, "-frames:v", "1", f]);
    }
    images.push(f);
  }
  const music = path.join(dir, "music.m4a");
  if (!existsSync(music)) run(["-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:beep_factor=4", "-t", "40", "-c:a", "aac", music]);
  return { videos, images, music };
}
