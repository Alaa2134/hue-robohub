"use client";
/**
 * Privacy-friendly page-view counts and browser error reports for the dashboard. Only runs on the real
 * domain (never in tests or local builds), sends no cookies or identifiers, and honours Do Not Track.
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

function rpc(fn: string, body: object) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

export function Telemetry({ host, locale }: { host: string; locale: string }) {
  const path = usePathname();

  // One view per page; the first one also carries where the visitor came from.
  useEffect(() => {
    if (location.hostname !== host || navigator.doNotTrack === "1") return;
    const external = document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : null;
    rpc("track_view", { p_path: path, p_referrer: external, p_locale: locale });
  }, [path, host, locale]);

  // Uncaught errors (at most five per page load) so broken pages show up in the dashboard.
  useEffect(() => {
    if (location.hostname !== host) return;
    let sent = 0;
    const seen = new Set<string>();
    const report = (message: string, source?: string) => {
      const key = `${message}|${source ?? ""}`;
      if (!message || seen.has(key) || sent >= 5) return;
      seen.add(key);
      sent++;
      rpc("log_client_error", { p: { message: message.slice(0, 500), source: source?.slice(0, 300), path: location.pathname } });
    };
    const onError = (e: ErrorEvent) => report(e.message, e.filename ? `${e.filename.replace(location.origin, "")}:${e.lineno}:${e.colno}` : undefined);
    const onRejection = (e: PromiseRejectionEvent) => report(e.reason instanceof Error ? e.reason.message : String(e.reason), "unhandledrejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [host]);

  return null;
}
