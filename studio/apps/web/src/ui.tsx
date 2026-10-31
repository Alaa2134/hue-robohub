/** Small shared pieces: icons, toasts, dialogs. */
import { useEffect, useState, type ReactNode } from "react";

const P: Record<string, string> = {
  play: "M7 5l12 7-12 7z",
  pause: "M7 5h4v14H7zM13 5h4v14h-4z",
  prev: "M6 6h2v12H6zM20 6v12l-10-6z",
  next: "M16 6h2v12h-2zM4 6l10 6-10 6z",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3",
  cut: "M6 9a3 3 0 100-6 3 3 0 000 6zm0 12a3 3 0 100-6 3 3 0 000 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12",
  copy: "M8 8h12v12H8zM4 16V4h12",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  plus: "M12 5v14M5 12h14",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
  image: "M4 5h16v14H4zM8 10a2 2 0 100-4 2 2 0 000 4zM20 16l-5-5-9 8",
  music: "M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z",
  text: "M5 6V4h14v2M12 4v16M9 20h6",
  back: "M15 5l-7 7 7 7",
  x: "M6 6l12 12M18 6L6 18",
  wand: "M15 4V2M15 10V8M19 6h2M9 6h2M18 9l1.5 1.5M12 9L3 18l3 3 9-9z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  eyeoff: "M3 3l18 18M10.6 6.1A10 10 0 0112 6c6 0 10 6 10 6a17 17 0 01-3 3.6M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 004.4-1",
  mute: "M11 5L6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6",
  sound: "M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 018 0v4",
  team: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M17 11a3 3 0 100-6M22 21v-1a5 5 0 00-4-4.9",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  zoomin: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5M11 8v6M8 11h6",
  zoomout: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5M8 11h6",
  magnet: "M6 3v8a6 6 0 0012 0V3h-4v8a2 2 0 01-4 0V3z",
};

export function Icon({ name, size = 18, className = "" }: { name: keyof typeof P | string; size?: number; className?: string }) {
  const fill = name === "play" || name === "pause" || name === "prev" || name === "next";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={P[name] ?? ""} />
    </svg>
  );
}

type Toast = { id: number; text: string; tone: "ok" | "bad" | "info" };
let push: ((t: Omit<Toast, "id">) => void) | null = null;
export const toast = (text: string, tone: Toast["tone"] = "info") => push?.({ text, tone });

export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    push = (t) => {
      const id = ++n;
      setList((l) => [...l.slice(-3), { ...t, id }]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.tone === "bad" ? 7000 : 3500);
    };
    return () => {
      push = null;
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`pointer-events-auto max-w-[90vw] rounded-xl border px-4 py-2 text-sm shadow-xl ${t.tone === "bad" ? "border-bad/40 bg-[#2a1218] text-[#ffc2c8]" : t.tone === "ok" ? "border-ok/40 bg-[#0f2a20] text-[#bff5dd]" : "border-line bg-panel2"}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`card max-h-[90vh] w-full overflow-auto p-5 ${wide ? "max-w-3xl" : "max-w-md"}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn btn-icon btn-sm" onClick={onClose} aria-label="إغلاق">
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useHash(): string {
  const [h, setH] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const f = () => setH(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return h;
}
export const go = (path: string) => {
  location.hash = path;
};
