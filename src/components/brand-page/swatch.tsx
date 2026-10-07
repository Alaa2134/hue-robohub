"use client";
import { useState } from "react";

/** Colour swatch with copy-to-clipboard. */
export function Swatch({ name, hex, note, copy, copied }: { name: string; hex: string; note?: string; copy: string; copied: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(hex).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1400);
        });
      }}
      className="frame group flex w-full flex-col overflow-hidden text-start"
      aria-label={`${copy} ${name} ${hex}`}
    >
      <span className="block h-24 w-full" style={{ background: hex }} />
      <span className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 p-4">
        <span>
          <span className="block text-sm text-chalk">{name}</span>
          {note && <span className="block text-xs text-fog">{note}</span>}
        </span>
        <span className="font-mono text-xs text-mist" dir="ltr">
          {ok ? copied : hex.toUpperCase()}
        </span>
      </span>
    </button>
  );
}
