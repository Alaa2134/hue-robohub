"use client";
/**
 * Camera barcode scanner for ID cards. Uses the browser's native BarcodeDetector where it exists
 * (Android Chrome) and the self-hosted ZXing WebAssembly reader everywhere else (iPhone, desktop).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { APP_PATH } from "./core";
import { Button, Icon, IconButton, Spinner } from "./ui";

const FORMATS = ["code_128", "code_39", "code_93", "codabar", "ean_13", "ean_8", "itf", "upc_a", "upc_e", "qr_code", "data_matrix", "pdf417"];

type Detected = { rawValue: string; format: string };
type Detector = { detect(source: CanvasImageSource): Promise<Detected[]> };
type NativeDetector = { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };

let detectorPromise: Promise<Detector> | null = null;

export function getDetector(): Promise<Detector> {
  detectorPromise ??= (async () => {
    const Native = (globalThis as { BarcodeDetector?: NativeDetector }).BarcodeDetector;
    if (Native) {
      try {
        const supported = await Native.getSupportedFormats();
        const formats = FORMATS.filter((f) => supported.includes(f));
        if (formats.includes("code_128") && formats.includes("qr_code")) return new Native({ formats });
      } catch {
        /* fall back to WebAssembly */
      }
    }
    const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
    prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `${APP_PATH}zxing_reader.wasm` : prefix + path) },
    });
    return new BarcodeDetector({ formats: FORMATS as never[] }) as unknown as Detector;
  })();
  detectorPromise.catch(() => {
    detectorPromise = null;
  });
  return detectorPromise;
}

type CamState = "off" | "starting" | "on" | "denied" | "error";

export function Scanner({ onDetect, paused = false, autoStart = true, className }: { onDetect: (raw: string) => void; paused?: boolean; autoStart?: boolean; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CamState>("off");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [ready, setReady] = useState(false);
  const onDetectRef = useRef(onDetect);
  const pausedRef = useRef(paused);
  onDetectRef.current = onDetect;
  pausedRef.current = paused;

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setTorch(null);
    setState("off");
  }, []);

  const start = useCallback(async (face: "environment" | "user") => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error");
      return;
    }
    setState("starting");
    stream.current?.getTracks().forEach((t) => t.stop());
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: face }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      stream.current = s;
      const v = video.current;
      if (!v) return;
      v.srcObject = s;
      await v.play().catch(() => undefined);
      const track = s.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorch(caps.torch ? false : null);
      setState("on");
    } catch (e) {
      setState((e as DOMException)?.name === "NotAllowedError" ? "denied" : "error");
    }
  }, []);

  // Start straight away when the camera was allowed before (no surprise permission prompt).
  useEffect(() => {
    if (!autoStart) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await navigator.permissions?.query({ name: "camera" as PermissionName });
        if (!cancelled && p?.state === "granted") start("environment");
      } catch {
        /* Safari/Firefox: wait for a tap */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoStart, start]);

  useEffect(() => stop, [stop]);

  // Free the camera when the app goes to the background.
  useEffect(() => {
    const onVis = () => document.hidden && stream.current && stop();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [stop]);

  // Detection loop: crop the guide box (faster, and ignores codes elsewhere in the frame).
  useEffect(() => {
    if (state !== "on") return;
    let alive = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      let det: Detector;
      try {
        det = await getDetector();
      } catch {
        if (alive) setState("error");
        return;
      }
      if (alive) setReady(true);
      while (alive) {
        const v = video.current;
        if (!pausedRef.current && v && v.readyState >= 2 && v.videoWidth && ctx) {
          const sw = v.videoWidth * 0.86;
          const sh = v.videoHeight * 0.56;
          const scale = Math.min(1, 1280 / sw);
          canvas.width = Math.round(sw * scale);
          canvas.height = Math.round(sh * scale);
          ctx.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
          try {
            const found = await det.detect(canvas);
            const hit = found.find((c) => c.rawValue?.trim());
            if (hit && alive) onDetectRef.current(hit.rawValue.trim());
          } catch {
            /* an unreadable frame is normal */
          }
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    })();
    return () => {
      alive = false;
    };
  }, [state]);

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch == null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const flip = () => {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    start(next);
  };

  return (
    <div className={cn("relative overflow-hidden rounded-3xl border border-[var(--line-2)] bg-[#02050b]", className)}>
      <video ref={video} playsInline muted autoPlay className={cn("aspect-[4/3] w-full object-cover transition-opacity", state === "on" ? "opacity-100" : "opacity-0", facing === "user" && "-scale-x-100")} />
      {state === "on" && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-[7%] inset-y-[22%] rounded-2xl border-2 border-cyan/85 shadow-[0_0_0_100vmax_rgb(1_3_9/0.45)]">
            <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-gradient-to-l from-transparent via-[#ff4d5e] to-transparent" />
          </div>
          <p className="absolute inset-x-0 top-3 text-center text-[13px] font-medium text-white/90 drop-shadow">{ready ? (paused ? "متوقف مؤقتًا" : "وجّه الكاميرا إلى باركود الكارنيه") : "جارٍ تجهيز القارئ…"}</p>
        </div>
      )}
      {state !== "on" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          {state === "starting" ? (
            <>
              <Spinner size={28} />
              <p className="text-sm text-mist">جارٍ تشغيل الكاميرا…</p>
            </>
          ) : (
            <>
              <span className="flex size-14 items-center justify-center rounded-2xl bg-cyan/10 text-cyan">
                <Icon name={state === "off" ? "camera" : "alert"} size={28} />
              </span>
              <p className="max-w-xs text-sm leading-relaxed text-mist">
                {state === "off" && "امسح باركود كارنيه الطالب بالكاميرا، أو اكتب الرقم في الخانة بالأسفل."}
                {state === "denied" && "لم يُسمح باستخدام الكاميرا. اسمح بها من إعدادات المتصفح ثم حاول مرة أخرى."}
                {state === "error" && "تعذّر تشغيل الكاميرا على هذا الجهاز. اكتب الرقم أو استخدم قارئ باركود USB."}
              </p>
              <Button variant="primary" icon="camera" onClick={() => start(facing)}>
                {state === "off" ? "تشغيل الكاميرا" : "حاول مرة أخرى"}
              </Button>
            </>
          )}
        </div>
      )}
      {state === "on" && (
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between">
          <IconButton icon="close" label="إيقاف الكاميرا" onClick={stop} className="bg-black/50 text-white backdrop-blur" />
          <div className="flex gap-2">
            {torch != null && <IconButton icon="bolt" label="الفلاش" onClick={toggleTorch} className={cn("backdrop-blur", torch ? "bg-warn text-black" : "bg-black/50 text-white")} />}
            <IconButton icon="refresh" label="تبديل الكاميرا" onClick={flip} className="bg-black/50 text-white backdrop-blur" />
          </div>
        </div>
      )}
    </div>
  );
}
