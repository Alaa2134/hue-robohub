"use client";
/**
 * Path routing inside /lab (history API). Static screens are real pages; a project URL such as
 * /lab/circuits/<id> reaches the app through the site's 404 page as /lab/?r=circuits/<id>, and the
 * app puts the clean URL back.
 */
import { useSyncExternalStore } from "react";

export const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const LAB_ROOT = `${BASE}/lab`;

const subs = new Set<() => void>();
const notify = () => subs.forEach((s) => s());
if (typeof window !== "undefined") window.addEventListener("popstate", notify);

/** "/circuits/abc" style path of the current screen ("" for the dashboard). */
export function currentPath(): string {
  if (typeof window === "undefined") return "";
  let p = location.pathname;
  if (p.startsWith(LAB_ROOT)) p = p.slice(LAB_ROOT.length);
  return p.replace(/\/+$/, "").replace(/^\/+/, "");
}

export function href(path: string, query?: Record<string, string>) {
  const clean = path.replace(/^\/+|\/+$/g, "");
  const q = query && Object.keys(query).length ? `?${new URLSearchParams(query)}` : "";
  return `${LAB_ROOT}/${clean ? `${clean}/` : ""}${q}`;
}

export function navigate(path: string, opts: { replace?: boolean; query?: Record<string, string> } = {}) {
  const url = href(path, opts.query);
  if (opts.replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  window.scrollTo({ top: 0 });
  notify();
}

/** Coming in through the 404 page: /lab/?r=circuits/<id>&share=… → /lab/circuits/<id>/?share=… */
export function restoreDeepLink() {
  const q = new URLSearchParams(location.search);
  const r = q.get("r");
  if (!r || !/^[\w/-]{1,200}$/.test(r)) return;
  q.delete("r");
  const rest = Object.fromEntries(q);
  history.replaceState(null, "", href(r, rest) + location.hash);
  notify();
}

export function useRoute() {
  const path = useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    () => currentPath() + location.search,
    () => "",
  );
  const [p, search = ""] = path.split("?");
  return { path: p, segments: p ? p.split("/") : [], query: new URLSearchParams(search) };
}
