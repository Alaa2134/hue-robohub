"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { stripLocale } from "@/i18n/config";

/** Render children everywhere except on the given (locale-agnostic) paths. */
export function HideOn({ paths, children }: { paths: string[]; children: ReactNode }) {
  const { path } = stripLocale(usePathname());
  return paths.includes(path) ? null : <>{children}</>;
}
