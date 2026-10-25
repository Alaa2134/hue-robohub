"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { stripLocale } from "@/i18n/config";

/** Render children everywhere except on the given (locale-agnostic) paths. */
export function HideOn({ paths, children }: { paths: string[]; children: ReactNode }) {
  const { path } = stripLocale(usePathname());
  // The static site serves pages with a trailing slash (/ar/form/), the paths are written without one.
  const bare = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return paths.includes(bare) ? null : <>{children}</>;
}
