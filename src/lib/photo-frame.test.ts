import { describe, expect, it } from "vitest";
import { FRAME, applyTone, bestCrop, fitMode, measureTone, saliency, sharpen } from "./photo-frame";

/** A w×h grey image with a bright, busy patch (a "subject") at (sx, sy). */
function picture(w: number, h: number, sx: number, sy: number, size = 6) {
  const px = new Uint8ClampedArray(w * h * 4).fill(120);
  for (let y = sy; y < sy + size; y++)
    for (let x = sx; x < sx + size; x++) {
      const i = (y * w + x) * 4;
      const v = (x + y) % 2 ? 250 : 10;
      px[i] = px[i + 1] = px[i + 2] = v;
    }
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  return px;
}

describe("photo frame", () => {
  it("the frame window is wide (about 1.92:1)", () => {
    expect(FRAME.hole.w / FRAME.hole.h).toBeCloseTo(1.92, 1);
  });

  it("wide photos fill the window, square and portrait ones sit whole on a blur", () => {
    expect(fitMode(4000, 3000)).toBe("fill");
    expect(fitMode(1920, 1080)).toBe("fill");
    expect(fitMode(3000, 3000)).toBe("fit");
    expect(fitMode(3000, 4000)).toBe("fit");
  });

  it("the crop follows the subject: a 4:3 photo with the action at the bottom keeps the bottom", () => {
    const w = 64,
      h = 48;
    const crop = bestCrop(saliency(picture(w, h, 28, 38), w, h), w, h, FRAME.hole.w / FRAME.hole.h);
    expect(crop.x).toBe(0);
    expect(crop.w).toBe(1);
    expect(crop.h).toBeCloseTo(33 / 48, 2);
    // The window moves down to take the whole subject (rows 38–43), not the empty middle.
    expect(crop.y * h).toBeLessThanOrEqual(38);
    expect(crop.y * h + crop.h * h).toBeGreaterThanOrEqual(44);
  });

  it("a flat photo is cropped in the middle", () => {
    const w = 64,
      h = 48;
    const px = new Uint8ClampedArray(w * h * 4).fill(128);
    const crop = bestCrop(saliency(px, w, h), w, h, 1.92);
    expect(crop.y).toBeGreaterThan(0.1);
    expect(crop.y).toBeLessThan(0.25);
  });

  it("levels stretch a dull photo a little (never all the way) and keep it neutral", () => {
    const px = new Uint8ClampedArray(400 * 4);
    for (let i = 0; i < 400; i++) px.set([80 + (i % 100), 80 + (i % 100), 80 + (i % 100), 255], i * 4);
    const t = measureTone(px);
    expect(t.hi - t.lo).toBe(190);
    expect(t.gain).toEqual([1, 1, 1]);
    applyTone(px, t);
    expect(px[0]).toBeLessThan(80);
    expect(px[99 * 4]).toBeGreaterThan(179);
  });

  it("a blue cast is pulled back toward neutral, within limits", () => {
    const px = new Uint8ClampedArray(4 * 4);
    for (let i = 0; i < 4; i++) px.set([100, 110, 160, 255], i * 4);
    const t = measureTone(px);
    expect(t.gain[2]).toBeLessThan(1);
    expect(t.gain[2]).toBeGreaterThanOrEqual(0.92);
    expect(t.gain[0]).toBeLessThanOrEqual(1.08);
  });

  it("sharpening raises the contrast of an edge", () => {
    const w = 5,
      h = 3;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set([x < 2 ? 50 : 200, x < 2 ? 50 : 200, x < 2 ? 50 : 200, 255], (y * w + x) * 4);
    sharpen(px, w, h);
    expect(px[(1 * w + 1) * 4]).toBeLessThan(50);
    expect(px[(1 * w + 2) * 4]).toBeGreaterThan(200);
  });
});
